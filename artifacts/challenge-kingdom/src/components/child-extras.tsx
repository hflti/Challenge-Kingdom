import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Award, BookOpen, Box, Check, CircleCheck, CircleX, Gamepad2, Hash, KeyRound, ShoppingBag, Sparkles, Volume2, X } from "lucide-react";
import type { ChildContentConfig, LetterGameContent, NumberQuestionContent, StoreItemContent } from "../lib/child-content";

export type BoxOpening = { boxIndex: number; reward: number };
export type ChildRewardsState = { purchasedIds: string[]; openedBoxes: BoxOpening[]; lifetimePoints: number };
export const defaultChildRewards: ChildRewardsState = { purchasedIds: [], openedBoxes: [], lifetimePoints: 0 };

export function normalizeChildRewards(value: unknown): ChildRewardsState {
  if (!value || typeof value !== "object") return { ...defaultChildRewards };
  const item = value as Partial<ChildRewardsState>;
  return {
    purchasedIds: Array.isArray(item.purchasedIds) ? item.purchasedIds.filter((id): id is string => typeof id === "string") : [],
    openedBoxes: Array.isArray(item.openedBoxes) ? item.openedBoxes.filter((entry): entry is BoxOpening => Boolean(entry && typeof entry === "object" && Number.isInteger((entry as BoxOpening).boxIndex) && Number.isFinite((entry as BoxOpening).reward))) : [],
    lifetimePoints: typeof item.lifetimePoints === "number" ? Math.max(0, item.lifetimePoints) : 0,
  };
}

type Panel = "games" | "reading" | "store" | "badges";

function Avatar({ value, name }: { value: string; name: string }) {
  return value.startsWith("/api/") || value.startsWith("http") ? <img className="avatar-photo" src={value} alt={name} /> : <>{value}</>;
}

function rewardIcon(item: StoreItemContent) {
  return item.kind === "game" ? Gamepad2 : item.kind === "screen" ? Sparkles : item.kind === "money" ? Award : ShoppingBag;
}

export function ChildExtras({ content, points, completed, rewards, childName, childAvatar, onSpend, onOpenBox, onAwardPoints, onRequestUnlock, onFinishStory }: {
  content: ChildContentConfig;
  points: number;
  completed: number;
  rewards: ChildRewardsState;
  childName: string;
  childAvatar: string;
  onSpend: (cost: number, itemId: string) => boolean;
  onOpenBox: (opening: BoxOpening) => void;
  onAwardPoints: (amount: number) => void;
  onRequestUnlock: (onUnlocked: () => void) => void;
  onFinishStory: (code: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [gameKind, setGameKind] = useState<"letters" | "numbers">("letters");
  const [gameIndex, setGameIndex] = useState(0);
  const [gameMessage, setGameMessage] = useState("");
  const [numberAnswer, setNumberAnswer] = useState("");
  const [answered, setAnswered] = useState(false);
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  const [spokenWords, setSpokenWords] = useState(0);
  const [storyPaused, setStoryPaused] = useState(false);
  const [storyFinished, setStoryFinished] = useState(false);
  const [storyPauseCooldownRemaining, setStoryPauseCooldownRemaining] = useState(0);
  const [storyPauseEndsAt, setStoryPauseEndsAt] = useState<number | null>(null);
  const [storyPauseCooldownEndsAt, setStoryPauseCooldownEndsAt] = useState<number | null>(null);
  const [storyFinishOpen, setStoryFinishOpen] = useState(false);
  const [storyFinishCode, setStoryFinishCode] = useState("");
  const [storyFinishError, setStoryFinishError] = useState("");
  const [storyFinishSubmitting, setStoryFinishSubmitting] = useState(false);
  const [storyApproval, setStoryApproval] = useState<"pending" | "no" | "yes" | null>(null);
  const [boxNotice, setBoxNotice] = useState("");
  const readerRef = useRef<HTMLDivElement>(null);
  const readerPositionRef = useRef(0);

  const resetStory = () => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setStoryPaused(false);
    setStoryFinished(false);
    setStoryPauseCooldownRemaining(0);
    setStoryPauseEndsAt(null);
    setStoryPauseCooldownEndsAt(null);
    setStoryFinishOpen(false);
    setStoryFinishCode("");
    setStoryFinishError("");
    setStoryApproval(null);
  };

  const openPanel = (next: Panel) => {
    setPanel(next);
    setGameMessage("");
    setAnswered(false);
    setStoryIndex(null);
    setSpokenWords(0);
    resetStory();
  };

  const openProtected = (next: Panel) => onRequestUnlock(() => openPanel(next));

  const selectStory = (index: number) => {
    resetStory();
    setStoryIndex(index);
  };

  useEffect(() => {
    if (panel !== "reading" || storyIndex === null) return;
    const element = readerRef.current;
    if (!element) return;
    readerPositionRef.current = 0;
    element.scrollTop = 0;
  }, [panel, storyIndex]);

  useEffect(() => {
    if (panel !== "reading" || storyIndex === null || storyPaused || storyFinished || storyApproval === "pending" || storyApproval === "no") return;
    const element = readerRef.current;
    if (!element) return;
    let frame = 0;
    let last = performance.now();
    const animate = (now: number) => {
      const max = element.scrollHeight - element.clientHeight;
      readerPositionRef.current = Math.min(max, readerPositionRef.current + (now - last) * 0.018);
      element.scrollTop = readerPositionRef.current;
      last = now;
      if (readerPositionRef.current < max) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [panel, storyIndex, storyPaused, storyFinished, storyApproval]);

  useEffect(() => {
    if (!storyPauseEndsAt && !storyPauseCooldownEndsAt) return;
    const tick = () => {
      const now = Date.now();
      const pauseRemaining = storyPauseEndsAt ? Math.max(0, Math.ceil((storyPauseEndsAt - now) / 1000)) : 0;
      const cooldownRemaining = storyPauseCooldownEndsAt ? Math.max(0, Math.ceil((storyPauseCooldownEndsAt - now) / 1000)) : 0;
      setStoryPauseCooldownRemaining(cooldownRemaining);
      if (storyPauseEndsAt && pauseRemaining === 0) {
        setStoryPaused(false);
        setStoryPauseEndsAt(null);
      }
      if (storyPauseCooldownEndsAt && cooldownRemaining === 0) setStoryPauseCooldownEndsAt(null);
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [storyPauseCooldownEndsAt, storyPauseEndsAt]);

  const pauseStory = () => {
    if (storyIndex === null || storyPaused || storyFinished || storyPauseCooldownRemaining > 0) return;
    const now = Date.now();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setStoryPaused(true);
    setStoryPauseEndsAt(now + 15_000);
    setStoryPauseCooldownRemaining(30);
    setStoryPauseCooldownEndsAt(now + 30_000);
  };

  const openStoryFinish = () => {
    if (storyIndex === null || storyFinished) return;
    setStoryFinishOpen(true);
    setStoryFinishCode("");
    setStoryFinishError("");
  };

  const closeStoryFinish = () => {
    setStoryFinishOpen(false);
    setStoryFinishCode("");
    setStoryFinishError("");
  };

  const submitStoryFinish = async () => {
    if (storyFinishSubmitting || storyIndex === null || storyFinished) return;
    setStoryFinishSubmitting(true);
    setStoryFinishError("");
    const result = await onFinishStory(storyFinishCode.trim());
    setStoryFinishSubmitting(false);
    if (!result.ok) {
      setStoryFinishCode("");
      setStoryFinishError(result.error ?? "الرمز غير صحيح. حاول مرة أخرى.");
      return;
    }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setStoryPaused(false);
    setStoryFinishOpen(false);
    setStoryFinishCode("");
    setStoryApproval("pending");
  };

  const answerStoryApproval = (completedStory: boolean) => {
    if (storyApproval !== "pending") return;
    if (!completedStory) {
      setStoryApproval("no");
      return;
    }
    onAwardPoints(content.pointRewards.readingStory);
    setStoryFinished(true);
    setStoryApproval("yes");
  };

  const nextQuestion = () => {
    const length = gameKind === "letters" ? content.letterGames.length : content.numberQuestions.length;
    setGameIndex((current) => (current + 1) % Math.max(1, length));
    setGameMessage("");
    setNumberAnswer("");
    setAnswered(false);
  };

  const answerLetter = (game: LetterGameContent, answer: string) => {
    if (answered) return;
    const correct = answer === game.answer;
    setAnswered(correct);
    setGameMessage(correct ? "إجابة صحيحة! حصلت على نقطتين." : "حاول مرة أخرى.");
    if (correct) onAwardPoints(2);
  };

  const answerNumber = (game: NumberQuestionContent) => {
    if (answered) return;
    const correct = Number(numberAnswer) === game.answer;
    setAnswered(correct);
    setGameMessage(correct ? "إجابة صحيحة! حصلت على نقطتين." : "راجع المسألة وحاول مرة أخرى.");
    if (correct) onAwardPoints(2);
  };

  const speakWord = (word: string) => {
    if (spokenWords >= 20 || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.replace(/[\u064B-\u065F\u0670]/g, ""));
    utterance.lang = "ar-SA";
    utterance.rate = 0.75;
    speechSynthesis.speak(utterance);
    setSpokenWords((count) => count + 1);
  };

  const renderWord = (word: string, index: number) => (
    <button key={`${word}-${index}`} className="reader-word" onClick={() => speakWord(word)}>
      {Array.from(word).map((character, characterIndex) => /[\u064B-\u065F\u0670]/.test(character)
        ? <span className="reader-diacritic" key={characterIndex}>{character}</span>
        : <span className="reader-base-letter" key={characterIndex}>{character}</span>)}
    </button>
  );

  const modal = panel ? createPortal(
    <div className="child-extras-overlay" role="presentation">
      <section className="child-extras-modal" role="dialog" aria-modal="true">
        <button className="child-extras-close" aria-label="إغلاق" onClick={() => setPanel(null)}><X /></button>
        {panel === "games" && (() => {
          const letterGame = content.letterGames[gameIndex % Math.max(1, content.letterGames.length)];
          const numberGame = content.numberQuestions[gameIndex % Math.max(1, content.numberQuestions.length)];
          return <div>
            <div className="extras-modal-heading"><Gamepad2 size={25} /><div><div className="eyebrow">ألعاب تعليمية</div><h2>الحروف والأرقام</h2></div></div>
            <div className="game-mode-tabs"><button className={gameKind === "letters" ? "selected" : ""} onClick={() => { setGameKind("letters"); setGameIndex(0); setGameMessage(""); setAnswered(false); }}>لعبة الحروف</button><button className={gameKind === "numbers" ? "selected" : ""} onClick={() => { setGameKind("numbers"); setGameIndex(0); setGameMessage(""); setAnswered(false); }}>لعبة الأرقام</button></div>
            {gameKind === "letters" && letterGame ? <div className="letter-game-stage"><span className="game-stage-label">اختر الإجابة الصحيحة</span><h3>{letterGame.question}</h3><p>{letterGame.description}</p><div className="answer-option-grid">{letterGame.options.map((option) => <button key={option} onClick={() => answerLetter(letterGame, option)}>{option}</button>)}</div></div> : null}
            {gameKind === "numbers" && numberGame ? <div className="number-question"><span>حل المسألة</span><strong>{numberGame.prompt}</strong><div className="number-answer-row"><input inputMode="numeric" value={numberAnswer} onChange={(event) => setNumberAnswer(event.target.value.replace(/\D/g, ""))} /><button className="primary-button" onClick={() => answerNumber(numberGame)}>تحقق</button></div></div> : null}
            {gameMessage && <p className="game-message">{gameMessage}</p>}
            {answered && <button className="outline-button next-game-button" onClick={nextQuestion}>السؤال التالي</button>}
          </div>;
        })()}
        {panel === "reading" && <div>
          <div className="extras-modal-heading"><BookOpen size={25} /><div><div className="eyebrow">القراءة السريعة</div><h2>قصص المملكة</h2></div></div>
            {storyIndex === null ? <div className="story-grid">{content.readingStories.map((story, index) => <button key={story.id} onClick={() => selectStory(index)}><strong>{story.title}</strong><span>قصة عربية مشكولة للقراءة الهادئة.</span></button>)}</div> : <div className="reader-stage"><div className="reader-toolbar"><button className="outline-button" onClick={() => { resetStory(); setStoryIndex(null); }}>القصص</button><span><Volume2 size={14} /> {spokenWords}/20 كلمة منطوقة</span></div><h3>{content.readingStories[storyIndex]?.title}</h3><div className="reader-text" ref={readerRef}><div className="reader-flow">{content.readingStories[storyIndex]?.text.split(/\s+/).map(renderWord)}</div></div><div className="reader-controls"><button className="outline-button" data-testid="button-pause-story" onClick={pauseStory} disabled={storyFinished || storyPaused || storyPauseCooldownRemaining > 0}>{storyPaused ? "القصة متوقفة مؤقتاً" : storyPauseCooldownRemaining > 0 ? "الإيقاف المؤقت غير متاح الآن" : "إيقاف القصة 15 ثانية"}</button><button className="outline-button early-finish-button" data-testid="button-finish-story" onClick={openStoryFinish} disabled={storyFinished || storyApproval === "pending"}><KeyRound size={15} /> إنهاء القصة الآن</button></div>{storyFinishOpen && <form className="finish-code-box early-finish-code-box story-finish-code-box" onSubmit={(event) => { event.preventDefault(); void submitStoryFinish(); }}><strong>إنهاء القصة قبل النهاية</strong><label htmlFor="story-finish-code">أدخل رمز ولي الأمر للمتابعة</label><input id="story-finish-code" className="code-input" data-testid="input-finish-story-code" type="password" name="finish_story_code" autoComplete="new-password" maxLength={64} value={storyFinishCode} onChange={(event) => setStoryFinishCode(event.target.value)} aria-label="رمز ولي الأمر" autoFocus />{storyFinishError && <p className="gate-error" data-testid="status-finish-story-code-error">{storyFinishError}</p>}<div className="finish-code-actions"><button className="primary-button" type="submit" data-testid="button-verify-finish-story" disabled={storyFinishSubmitting}>{storyFinishSubmitting ? "جارٍ التحقق..." : "متابعة"}</button><button className="outline-button" type="button" data-testid="button-cancel-finish-story" onClick={closeStoryFinish}>العودة للقصة</button></div></form>}{storyApproval === "pending" && <div className="story-approval-panel" data-testid="panel-story-approval"><Award size={28} /><h3>هل تم إكمال القصة؟</h3><p>أكد الإنجاز مثل المهمة تماماً. تُمنح النقاط عند اختيار نعم فقط.</p><div className="story-approval-actions"><button className="primary-button" data-testid="button-story-completed-yes" onClick={() => answerStoryApproval(true)}><CircleCheck size={16} /> نعم، تم إكمالها</button><button className="outline-button" data-testid="button-story-completed-no" onClick={() => answerStoryApproval(false)}><CircleX size={16} /> لا، لم تكتمل</button></div></div>}{storyApproval === "no" && <div className="story-approval-panel rejected"><CircleX size={28} /><h3>لم تُعتمد القصة</h3><p>لم تُضف أي نقاط. يمكنك العودة وإكمال القراءة ثم المحاولة مجدداً.</p><button className="outline-button" onClick={() => setStoryApproval(null)}>العودة للقصة</button></div>}{storyFinished && <p className="story-finished-message">أحسنت! تم اعتماد القصة واحتساب مكافأتها.</p>}<p className="reader-note">تبدأ القصة من الأسفل وتتحرك بهدوء إلى الأعلى. اضغط أي كلمة لسماعها.</p></div>}
        </div>}
              {panel === "store" && <div><div className="extras-modal-heading"><ShoppingBag size={25} /><div><div className="eyebrow">متجر المكافآت</div><h2>ماذا تشتري بنقاطك؟</h2></div><strong className="store-balance">{points} نقطة</strong></div><div className="store-items-grid">{content.storeItems.map((item) => { const Icon = rewardIcon(item); const purchased = rewards.purchasedIds.includes(item.id); return <div className={`store-item ${purchased ? "purchased" : ""}`} key={item.id}><span className="store-child-avatar"><Avatar value={childAvatar} name={childName} /></span><span className="store-item-icon">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Icon size={19} />}</span><strong>{item.title}</strong><span className="store-cost">{item.cost} نقطة</span><button className={purchased ? "outline-button" : "primary-button gold"} disabled={purchased || points < item.cost} onClick={() => { if (onSpend(item.cost, item.id)) setBoxNotice(`تم طلب ${item.title}.`); }}>{purchased ? <><Check size={14} /> تم الطلب</> : "استبدال"}</button></div>; })}</div>{boxNotice && <p className="game-message">{boxNotice}</p>}</div>}
        {panel === "badges" && <div><div className="extras-modal-heading"><Award size={25} /><div><div className="eyebrow">مراحل الأوسمة الثلاث</div><h2>تقدم {childName}</h2></div></div><div className="badge-stages">{[{ title: "وسام البداية", target: 1, note: "إكمال المرحلة الأولى" }, { title: "وسام التقدم", target: 2, note: "إكمال المرحلة الثانية" }, { title: "وسام البطولة", target: 3, note: "إكمال المرحلة الثالثة" }].map((stage, index) => { const earned = completed >= stage.target; const current = !earned && completed + 1 === stage.target; return <article className={`badge-stage ${earned ? "earned" : current ? "current" : ""}`} key={stage.title}><span className="badge-stage-medal"><Award size={30} /></span><small>المرحلة {index + 1}</small><strong>{stage.title}</strong><p>{stage.note}</p><div className="badge-track"><i style={{ width: `${earned ? 100 : current ? Math.min(90, Math.max(12, rewards.lifetimePoints % 100)) : 0}%` }} /></div><em>{earned ? "تم الحصول عليه" : current ? "قيد التقدم" : "مرحلة قادمة"}</em></article>; })}</div><div className="mystery-boxes">{[1, 2, 3, 4, 5].map((boxIndex) => { const opened = rewards.openedBoxes.some((item) => item.boxIndex === boxIndex); const available = rewards.lifetimePoints >= boxIndex * 100; const reward = content.displayBoxRewards[(boxIndex - 1) % content.displayBoxRewards.length] ?? 10; return <button className={`mystery-box ${opened ? "opened" : available ? "available" : ""}`} disabled={!available || opened} key={boxIndex} onClick={() => onOpenBox({ boxIndex, reward })}><Box size={28} /><strong>{opened ? "مفتوح" : `صندوق ${boxIndex}`}</strong><span>{available ? "اضغط للفتح" : `${boxIndex * 100} نقطة`}</span></button>; })}</div></div>}
      </section>
    </div>,
    document.body,
  ) : null;

  return <>
    <section className="child-extras-grid">
      <button className="extra-feature-card protected-feature-card" onClick={() => openProtected("games")}><span className="extra-feature-icon"><Gamepad2 /></span><strong>ألعاب الحروف والأرقام</strong><span>تدريب قصير وممتع مخصص للعائلة.</span><em>افتح بالرمز</em></button>
      <button className="extra-feature-card reading-card protected-feature-card" onClick={() => openProtected("reading")}><span className="extra-feature-icon"><BookOpen /></span><strong>القراءة السريعة</strong><span>قصص مشكولة تتحرك من الأسفل للأعلى.</span><em>افتح بالرمز</em></button>
      <button className="extra-feature-card store-card protected-feature-card" onClick={() => openProtected("store")}><span className="extra-feature-icon"><ShoppingBag /></span><strong>متجر المكافآت</strong><span>استبدل نقاطك بمكافآت العائلة.</span><em>افتح بالرمز</em></button>
       <button className="extra-feature-card badges-card" onClick={() => openPanel("badges")}><span className="extra-feature-icon"><Award /></span><strong>الأوسمة والصناديق</strong><span>تابع تقدمك في مراحل الأوسمة الثلاث وافتح الصناديق.</span><em>عرض مباشر</em></button>
    </section>
    {modal}
  </>;
}
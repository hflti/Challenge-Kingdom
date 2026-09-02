import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Award, BookOpen, Box, Check, CircleCheck, CircleX, Gamepad2, Hash, KeyRound, Play, ShoppingBag, Sparkles, Volume2, X } from "lucide-react";
import type { ChildContentConfig, LetterGameContent, NumberQuestionContent, StoreItemContent } from "../lib/child-content";

export type BoxOpening = { boxIndex: number; reward: number };
export type ChildRewardsState = { purchasedIds: string[]; openedBoxes: BoxOpening[]; lifetimePoints: number; badgeCount: number; challengePoints: number };
export const defaultChildRewards: ChildRewardsState = { purchasedIds: [], openedBoxes: [], lifetimePoints: 0, badgeCount: 0, challengePoints: 0 };

export function normalizeChildRewards(value: unknown): ChildRewardsState {
  if (!value || typeof value !== "object") return { ...defaultChildRewards };
  const item = value as Partial<ChildRewardsState>;
  return {
    purchasedIds: Array.isArray(item.purchasedIds) ? item.purchasedIds.filter((id): id is string => typeof id === "string") : [],
    openedBoxes: Array.isArray(item.openedBoxes) ? item.openedBoxes.filter((entry): entry is BoxOpening => Boolean(entry && typeof entry === "object" && Number.isInteger((entry as BoxOpening).boxIndex) && Number.isFinite((entry as BoxOpening).reward))) : [],
    lifetimePoints: typeof item.lifetimePoints === "number" ? Math.max(0, item.lifetimePoints) : 0,
    badgeCount: typeof item.badgeCount === "number" ? Math.min(badgeCountLimit, Math.max(0, Math.floor(item.badgeCount))) : 0,
    challengePoints: typeof item.challengePoints === "number" ? Math.max(0, Math.floor(item.challengePoints)) : 0,
  };
}

type Panel = "games" | "reading" | "store" | "badges";
type GiftStage = "closed" | "revealed" | "shuffling" | "ready" | "won";
const badgeCountLimit = 6;
const badgePointsTarget = 60;
const winningGiftCount = 5;
const excludedGiftCount = 2;
const giftCardCount = winningGiftCount + excludedGiftCount;
const badgeStages = ["وسام البداية", "وسام المثابرة", "وسام التقدم", "وسام الإبداع", "وسام التفوق", "وسام البطولة"];

function Avatar({ value, name }: { value: string; name: string }) {
  return value.startsWith("/api/") || value.startsWith("http") ? <img className="avatar-photo" src={value} alt={name} /> : <>{value}</>;
}

function rewardIcon(item: StoreItemContent) {
  return item.kind === "game" ? Gamepad2 : item.kind === "screen" ? Sparkles : item.kind === "money" ? Award : ShoppingBag;
}

export function ChildExtras({ content, points, completed, rewards, childName, childAvatar, onSpend, onOpenBox, onOpenBadge, onSelectGift, onAwardPoints, onRequestUnlock, onFinishStory, onStartStory }: {
  content: ChildContentConfig;
  points: number;
  completed: number;
  rewards: ChildRewardsState;
  childName: string;
  childAvatar: string;
  onSpend: (cost: number, itemId: string) => boolean;
  onOpenBox: (opening: BoxOpening) => void;
  onOpenBadge: (stage: number) => void;
  onSelectGift: (reward: number, giftIndex: number) => void;
  onAwardPoints: (amount: number) => void;
  onRequestUnlock: (onUnlocked: () => void) => void;
  onFinishStory: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onStartStory: (story: ChildContentConfig["readingStories"][number], durationMinutes: number, rewardPoints: number) => void;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [gameKind, setGameKind] = useState<"letters" | "numbers">("letters");
  const [gameIndex, setGameIndex] = useState(0);
  const [gameMessage, setGameMessage] = useState("");
  const [numberAnswer, setNumberAnswer] = useState("");
  const [answered, setAnswered] = useState(false);
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  const [storyMinutes, setStoryMinutes] = useState("10");
  const [storyPoints, setStoryPoints] = useState(String(content.pointRewards.readingStory));
  const [storySetupError, setStorySetupError] = useState("");
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
  const [giftStage, setGiftStage] = useState<GiftStage>("closed");
  const [giftOrder, setGiftOrder] = useState(Array.from({ length: giftCardCount }, (_, index) => index));
  const readerRef = useRef<HTMLDivElement>(null);
  const readerPositionRef = useRef(0);
  const giftShuffleTimerRef = useRef<number | null>(null);
  const giftOrderRef = useRef(Array.from({ length: giftCardCount }, (_, index) => index));
  const giftRewards = [...content.majorBoxRewards, ...content.displayBoxRewards];

  const clearGiftShuffle = () => {
    if (giftShuffleTimerRef.current !== null) {
      window.clearInterval(giftShuffleTimerRef.current);
      giftShuffleTimerRef.current = null;
    }
  };

  const randomGiftOrder = () => {
    const next = Array.from({ length: giftCardCount }, (_, index) => index).sort(() => Math.random() - 0.5);
    if (next.every((value, index) => value === giftOrderRef.current[index])) {
      [next[0], next[1]] = [next[1], next[0]];
    }
    giftOrderRef.current = next;
    return next;
  };

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
    clearGiftShuffle();
    setPanel(next);
    setBoxNotice("");
    setGiftStage("closed");
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
    setStoryMinutes("10");
    setStoryPoints(String(content.pointRewards.readingStory));
    setStorySetupError("");
  };

  const startStoryChallenge = () => {
    if (storyIndex === null) return;
    const minutes = Number(storyMinutes);
    const rewardPoints = Number(storyPoints);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
      setStorySetupError("اختر مدة بين دقيقة واحدة وساعتين.");
      return;
    }
    if (!Number.isInteger(rewardPoints) || rewardPoints < 1 || rewardPoints > 50) {
      setStorySetupError("اختر مكافأة بين نقطة واحدة و50 نقطة.");
      return;
    }
    onStartStory(content.readingStories[storyIndex], minutes, rewardPoints);
    setPanel(null);
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

  useEffect(() => {
    if (rewards.badgeCount >= badgeCountLimit) {
      setGiftStage("closed");
      setGiftOrder(randomGiftOrder());
    } else if (giftStage !== "won") {
      clearGiftShuffle();
      setGiftStage("closed");
    }
    return clearGiftShuffle;
  }, [rewards.badgeCount]);

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

  const revealGifts = () => {
    if (rewards.badgeCount < badgeCountLimit || content.majorBoxRewards.length !== winningGiftCount || content.displayBoxRewards.length !== excludedGiftCount) return;
    clearGiftShuffle();
    setGiftOrder(randomGiftOrder());
    setGiftStage("revealed");
  };

  const startGiftShuffle = () => {
    if (giftStage !== "revealed") return;
    clearGiftShuffle();
    setGiftStage("shuffling");
    let ticks = 0;
    giftShuffleTimerRef.current = window.setInterval(() => {
      setGiftOrder(randomGiftOrder());
      ticks += 1;
      if (ticks >= 18) {
        clearGiftShuffle();
        setGiftStage("ready");
      }
    }, 65);
  };

  const chooseRandomGift = (boxIndex: number) => {
    if (giftStage !== "ready" || content.majorBoxRewards.length !== winningGiftCount || content.displayBoxRewards.length !== excludedGiftCount) return;
    const reward = content.majorBoxRewards[Math.floor(Math.random() * content.majorBoxRewards.length)];
    setBoxNotice(`مبارك! هديتك هي ${reward.toLocaleString("en-US")} ريال.`);
    setGiftOrder(randomGiftOrder());
    setGiftStage("won");
    onSelectGift(reward, boxIndex);
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
        <button className="child-extras-close" aria-label="إغلاق" onClick={() => { clearGiftShuffle(); setPanel(null); }}><X /></button>
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
            {storyIndex === null ? <div className="story-grid">{content.readingStories.map((story, index) => <button key={story.id} onClick={() => selectStory(index)}><strong>{story.title}</strong><span>اختر الوقت والنقاط ثم ابدأها كتحدٍ كامل.</span></button>)}</div> : <div className="story-challenge-setup"><BookOpen size={34} /><div className="eyebrow" style={{ justifyContent: "center" }}>تجهيز تحدّي القراءة</div><h3>{content.readingStories[storyIndex]?.title}</h3><p>ستظهر القصة داخل ميدان التحدي مع المؤقت والإيقاف والتمديد والإنهاء والخصومات نفسها.</p><div className="story-setup-fields"><label><span>مدة التحدي بالدقائق</span><input data-testid="input-story-duration" type="number" min="1" max="120" step="1" value={storyMinutes} onChange={(event) => { setStoryMinutes(event.target.value); setStorySetupError(""); }} /></label><label><span>نقاط التحدي</span><input data-testid="input-story-points" type="number" min="1" max="50" step="1" value={storyPoints} onChange={(event) => { setStoryPoints(event.target.value); setStorySetupError(""); }} /></label></div>{storySetupError && <p className="form-error">{storySetupError}</p>}<div className="story-setup-actions"><button className="primary-button gold" data-testid="button-start-story-challenge" onClick={startStoryChallenge}><Play size={16} /> بدء تحدّي القصة</button><button className="outline-button" onClick={() => setStoryIndex(null)}>اختيار قصة أخرى</button></div></div>}
        </div>}
              {panel === "store" && <div><div className="extras-modal-heading"><ShoppingBag size={25} /><div><div className="eyebrow">متجر المكافآت</div><h2>ماذا تشتري بنقاطك؟</h2></div><strong className="store-balance">{points} نقطة</strong></div><div className="store-items-grid">{content.storeItems.map((item) => { const Icon = rewardIcon(item); const purchased = rewards.purchasedIds.includes(item.id); return <div className={`store-item ${purchased ? "purchased" : ""}`} key={item.id}><span className="store-child-avatar"><Avatar value={childAvatar} name={childName} /></span><span className="store-item-icon">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Icon size={19} />}</span><strong>{item.title}</strong><span className="store-cost">{item.cost} نقطة</span><button className={purchased ? "outline-button" : "primary-button gold"} disabled={purchased || points < item.cost} onClick={() => { if (onSpend(item.cost, item.id)) setBoxNotice(`تم طلب ${item.title}.`); }}>{purchased ? <><Check size={14} /> تم الطلب</> : "استبدال"}</button></div>; })}</div>{boxNotice && <p className="game-message">{boxNotice}</p>}</div>}
         {panel === "badges" && <div><div className="extras-modal-heading"><Award size={25} /><div><div className="eyebrow">مراحل الأوسمة الستة</div><h2>تقدم {childName}</h2></div></div>{boxNotice && <p className="game-message gift-result-message">{boxNotice}</p>}<div className="badge-progress-summary"><strong>{rewards.badgeCount >= badgeCountLimit ? "اكتملت المراحل الستة" : `المرحلة ${rewards.badgeCount + 1} • ${rewards.challengePoints.toLocaleString("ar-SA")} / ${badgePointsTarget} نقطة`}</strong><span>كل {badgePointsTarget} نقطة من التحديات تفتح وساماً واحداً وتُخصم عند فتحه.</span><div className="badge-track"><i style={{ width: `${rewards.badgeCount >= badgeCountLimit ? 100 : Math.min(100, (rewards.challengePoints / badgePointsTarget) * 100)}%` }} /></div></div><div className="badge-stages">{badgeStages.map((title, index) => { const opened = rewards.badgeCount > index; const enoughChallengePoints = rewards.challengePoints >= badgePointsTarget; const enoughBalance = points >= badgePointsTarget; const available = rewards.badgeCount === index && enoughChallengePoints && enoughBalance; const current = !opened && rewards.badgeCount === index; const stagePoints = opened ? badgePointsTarget : current ? Math.min(badgePointsTarget, rewards.challengePoints) : 0; return <article className={`badge-stage ${opened ? "earned" : available ? "current" : ""}`} key={title}><span className="badge-stage-medal"><Award size={30} /></span><small>المرحلة {index + 1}</small><strong>{title}</strong><p>الوصول للمرة {index + 1} إلى {badgePointsTarget} نقطة في التحديات</p><div className="badge-track"><i style={{ width: `${(stagePoints / badgePointsTarget) * 100}%` }} /></div><em>{stagePoints.toLocaleString("ar-SA")} / {badgePointsTarget} نقطة</em>{available && <button className="primary-button gold badge-open-button" data-testid={`button-open-badge-${index + 1}`} onClick={() => onOpenBadge(index + 1)}><Award size={15} /> فتح الوسام وخصم {badgePointsTarget} نقطة</button>}{current && enoughChallengePoints && !enoughBalance && <span className="badge-balance-warning">رصيدك الحالي لا يكفي لخصم {badgePointsTarget} نقطة.</span>}</article>; })}</div>{(rewards.badgeCount >= badgeCountLimit || giftStage === "won") && <div className="gift-choice-panel"><div className="eyebrow" style={{ justifyContent: "center" }}>صندوق الهدايا مفتوح</div><h3>{giftStage === "closed" ? "شاهد الهدايا أولاً" : giftStage === "revealed" ? "راجع الخيارات ثم ابدأ" : giftStage === "shuffling" ? "جاري خلط الهدايا..." : giftStage === "ready" ? "اختر صندوقك الآن" : "تم كشف نتيجة الجولة"}</h3>{giftStage === "closed" && <button className="primary-button gold gift-view-button" data-testid="button-view-gifts" onClick={revealGifts}><Box size={18} /> رؤية الهدايا</button>}{giftStage === "revealed" && <><div className="gift-choice-grid gift-revealed-grid">{giftOrder.map((giftIndex) => <article className="mystery-box gift-revealed-card" key={giftIndex}><Box size={28} /><strong>{giftRewards[giftIndex].toLocaleString("en-US")} ريال</strong></article>)}</div><button className="primary-button gold gift-start-button" data-testid="button-start-gift-shuffle" onClick={startGiftShuffle}><Play size={17} /> بدء</button></>}{(giftStage === "shuffling" || giftStage === "ready") && <div className={`gift-choice-grid gift-shuffle-grid ${giftStage === "shuffling" ? "is-shuffling" : "is-ready"}`}>{giftOrder.map((_, position) => <button className="mystery-box gift-shuffle-card" key={position} data-testid={giftStage === "ready" ? `button-gift-box-${position + 1}` : undefined} disabled={giftStage !== "ready"} onClick={() => chooseRandomGift(position)}><Box size={34} /><strong>بطاقة {position + 1}</strong></button>)}</div>}{giftStage === "won" && <div className="gift-choice-grid gift-won-grid">{giftOrder.map((giftIndex) => <article className="mystery-box gift-won-card" key={giftIndex}><Box size={28} /><strong>{giftRewards[giftIndex].toLocaleString("en-US")} ريال</strong></article>)}</div>}</div>}</div>}
      </section>
    </div>,
    document.body,
  ) : null;

  return <>
    <section className="child-extras-grid">
      <button className="extra-feature-card protected-feature-card" onClick={() => openProtected("games")}><span className="extra-feature-icon"><Gamepad2 /></span><strong>ألعاب الحروف والأرقام</strong><span>تدريب قصير وممتع مخصص للعائلة.</span><em>افتح بالرمز</em></button>
      <button className="extra-feature-card reading-card protected-feature-card" onClick={() => openProtected("reading")}><span className="extra-feature-icon"><BookOpen /></span><strong>القراءة السريعة</strong><span>قصص مشكولة تتحرك من الأسفل للأعلى.</span><em>افتح بالرمز</em></button>
      <button className="extra-feature-card store-card protected-feature-card" onClick={() => openProtected("store")}><span className="extra-feature-icon"><ShoppingBag /></span><strong>متجر المكافآت</strong><span>استبدل نقاطك بمكافآت العائلة.</span><em>افتح بالرمز</em></button>
       <button className="extra-feature-card badges-card" onClick={() => openPanel("badges")}><span className="extra-feature-icon"><Award /></span><strong>الأوسمة والصناديق</strong><span>تابع تقدمك في مراحل الأوسمة الستة وافتح صندوق الهدايا.</span><em>عرض مباشر</em></button>
    </section>
    {modal}
  </>;
}
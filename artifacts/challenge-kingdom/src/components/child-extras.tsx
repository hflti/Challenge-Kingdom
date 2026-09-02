import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Award, BookOpen, Box, Check, Gamepad2, Hash, ShoppingBag, Sparkles, Volume2, X } from "lucide-react";
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

export function ChildExtras({ content, points, rewards, childName, childAvatar, onSpend, onOpenBox, onAwardPoints, onRequestUnlock }: {
  content: ChildContentConfig;
  points: number;
  rewards: ChildRewardsState;
  childName: string;
  childAvatar: string;
  onSpend: (cost: number, itemId: string) => boolean;
  onOpenBox: (opening: BoxOpening) => void;
  onAwardPoints: (amount: number) => void;
  onRequestUnlock: (onUnlocked: () => void) => void;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [gameKind, setGameKind] = useState<"letters" | "numbers">("letters");
  const [gameIndex, setGameIndex] = useState(0);
  const [gameMessage, setGameMessage] = useState("");
  const [numberAnswer, setNumberAnswer] = useState("");
  const [answered, setAnswered] = useState(false);
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  const [spokenWords, setSpokenWords] = useState(0);
  const [boxNotice, setBoxNotice] = useState("");
  const readerRef = useRef<HTMLDivElement>(null);

  const openProtected = (next: Panel) => onRequestUnlock(() => {
    setPanel(next);
    setGameMessage("");
    setAnswered(false);
    setStoryIndex(null);
    setSpokenWords(0);
  });

  useEffect(() => {
    if (panel !== "reading" || storyIndex === null) return;
    const element = readerRef.current;
    if (!element) return;
    element.scrollTop = 0;
    let frame = 0;
    let last = performance.now();
    let position = 0;
    const animate = (now: number) => {
      const max = element.scrollHeight - element.clientHeight;
      position = Math.min(max, position + (now - last) * 0.018);
      element.scrollTop = position;
      last = now;
      if (position < max) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [panel, storyIndex]);

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
          {storyIndex === null ? <div className="story-grid">{content.readingStories.map((story, index) => <button key={story.id} onClick={() => setStoryIndex(index)}><strong>{story.title}</strong><span>قصة عربية مشكولة للقراءة الهادئة.</span></button>)}</div> : <div className="reader-stage"><div className="reader-toolbar"><button className="outline-button" onClick={() => setStoryIndex(null)}>القصص</button><span><Volume2 size={14} /> {spokenWords}/20 كلمة منطوقة</span></div><h3>{content.readingStories[storyIndex]?.title}</h3><div className="reader-text" ref={readerRef}><div className="reader-flow">{content.readingStories[storyIndex]?.text.split(/\s+/).map(renderWord)}</div></div><p className="reader-note">تبدأ القصة من الأسفل وتتحرك بهدوء إلى الأعلى. اضغط أي كلمة لسماعها.</p></div>}
        </div>}
        {panel === "store" && <div><div className="extras-modal-heading"><ShoppingBag size={25} /><div><div className="eyebrow">متجر المكافآت</div><h2>ماذا تشتري بنقاطك؟</h2></div><strong className="store-balance">{points} نقطة</strong></div><div className="store-items-grid">{content.storeItems.map((item) => { const Icon = rewardIcon(item); const purchased = rewards.purchasedIds.includes(item.id); return <div className={`store-item ${purchased ? "purchased" : ""}`} key={item.id}><span className="store-child-avatar"><Avatar value={childAvatar} name={childName} /></span><span className="store-item-icon"><Icon size={19} /></span><strong>{item.title}</strong><span className="store-cost">{item.cost} نقطة</span><button className={purchased ? "outline-button" : "primary-button gold"} disabled={purchased || points < item.cost} onClick={() => { if (onSpend(item.cost, item.id)) setBoxNotice(`تم طلب ${item.title}.`); }}>{purchased ? <><Check size={14} /> تم الطلب</> : "استبدال"}</button></div>; })}</div>{boxNotice && <p className="game-message">{boxNotice}</p>}</div>}
        {panel === "badges" && <div><div className="extras-modal-heading"><Award size={25} /><div><div className="eyebrow">الأوسمة والصناديق</div><h2>كنوز {childName}</h2></div></div><div className="badge-progress"><div className="badge-count"><strong>{Math.floor(rewards.lifetimePoints / 50)}</strong><span>وساماً</span></div><div><strong>كل 50 نقطة تفتح وساماً</strong><p>اجمع النقاط بإنجاز المهام والألعاب.</p><div className="badge-track"><i style={{ width: `${rewards.lifetimePoints % 50 * 2}%` }} /></div></div></div><div className="mystery-boxes">{[1, 2, 3, 4, 5].map((boxIndex) => { const opened = rewards.openedBoxes.some((item) => item.boxIndex === boxIndex); const available = rewards.lifetimePoints >= boxIndex * 100; const reward = content.displayBoxRewards[(boxIndex - 1) % content.displayBoxRewards.length] ?? 10; return <button className={`mystery-box ${opened ? "opened" : available ? "available" : ""}`} disabled={!available || opened} key={boxIndex} onClick={() => onOpenBox({ boxIndex, reward })}><Box size={28} /><strong>{opened ? "مفتوح" : `صندوق ${boxIndex}`}</strong><span>{available ? "اضغط للفتح" : `${boxIndex * 100} نقطة`}</span></button>; })}</div></div>}
      </section>
    </div>,
    document.body,
  ) : null;

  return <>
    <section className="child-extras-grid">
      <button className="extra-feature-card protected-feature-card" onClick={() => openProtected("games")}><span className="extra-feature-icon"><Gamepad2 /></span><strong>ألعاب الحروف والأرقام</strong><span>تدريب قصير وممتع مخصص للعائلة.</span><em>افتح بالرمز</em></button>
      <button className="extra-feature-card reading-card protected-feature-card" onClick={() => openProtected("reading")}><span className="extra-feature-icon"><BookOpen /></span><strong>القراءة السريعة</strong><span>قصص مشكولة تتحرك من الأسفل للأعلى.</span><em>افتح بالرمز</em></button>
      <button className="extra-feature-card store-card protected-feature-card" onClick={() => openProtected("store")}><span className="extra-feature-icon"><ShoppingBag /></span><strong>متجر المكافآت</strong><span>استبدل نقاطك بمكافآت العائلة.</span><em>افتح بالرمز</em></button>
      <button className="extra-feature-card badges-card protected-feature-card" onClick={() => openProtected("badges")}><span className="extra-feature-icon"><Award /></span><strong>الأوسمة والصناديق</strong><span>تابع كنوزك وافتح الصناديق.</span><em>افتح بالرمز</em></button>
    </section>
    {modal}
  </>;
}
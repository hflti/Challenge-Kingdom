import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Calculator,
  Check,
  CircleHelp,
  Gift,
  Gamepad2,
  Languages,
  LockKeyhole,
  Medal,
  Pause,
  Play,
  ShoppingBag,
  Sparkles,
  Star,
  Volume2,
} from "lucide-react";
import { defaultChildContent, type ChildContentConfig, type StoreItemContent } from "../lib/child-content";

export type BoxOpening = {
  boxIndex: number;
  majorReward: number;
  selectedMajorIndex: number;
};

export type ChildRewardsState = {
  purchasedIds: string[];
  openedBoxes: BoxOpening[];
  lifetimePoints: number;
};

export const defaultChildRewards: ChildRewardsState = {
  purchasedIds: [],
  openedBoxes: [],
  lifetimePoints: 0,
};

export function normalizeChildRewards(value: unknown): ChildRewardsState {
  if (!value || typeof value !== "object") return defaultChildRewards;
  const candidate = value as Partial<ChildRewardsState>;
  return {
    purchasedIds: Array.isArray(candidate.purchasedIds)
      ? candidate.purchasedIds.filter((item): item is string => typeof item === "string")
      : [],
    openedBoxes: Array.isArray(candidate.openedBoxes)
      ? candidate.openedBoxes.filter((item): item is BoxOpening => Boolean(
        item && typeof item === "object"
        && Number.isInteger((item as BoxOpening).boxIndex)
        && Number.isInteger((item as BoxOpening).majorReward)
        && Number.isInteger((item as BoxOpening).selectedMajorIndex),
      ))
      : [],
    lifetimePoints: typeof candidate.lifetimePoints === "number" && Number.isFinite(candidate.lifetimePoints)
      ? Math.max(0, Math.floor(candidate.lifetimePoints))
      : 0,
  };
}

type ChildExtrasProps = {
  content?: ChildContentConfig;
  points: number;
  rewards: ChildRewardsState;
  onSpend: (cost: number, itemId: string) => boolean;
  onOpenBox: (opening: BoxOpening) => void;
  onAwardPoints: (amount: number) => void;
};

function rewardIcon(item: StoreItemContent) {
  if (item.kind === "money") return Star;
  if (item.kind === "game" || item.kind === "screen") return Gamepad2;
  return Gift;
}

export function ChildExtras({ content = defaultChildContent, points, rewards, onSpend, onOpenBox, onAwardPoints }: ChildExtrasProps) {
  const [activePanel, setActivePanel] = useState<"letters" | "numbers" | "reading" | "store" | "badges" | null>(null);
  const [letterIndex, setLetterIndex] = useState(0);
  const [letterDone, setLetterDone] = useState<number[]>([]);
  const [letterMessage, setLetterMessage] = useState("");
  const [numberRound, setNumberRound] = useState(0);
  const [numberIndex, setNumberIndex] = useState(0);
  const [numberAnswer, setNumberAnswer] = useState("");
  const [numberMessage, setNumberMessage] = useState("");
  const [readingIndex, setReadingIndex] = useState(0);
  const [readingOpen, setReadingOpen] = useState(false);
  const [readingPausedUntil, setReadingPausedUntil] = useState(0);
  const [, setReaderTick] = useState(0);
  const [spokenWords, setSpokenWords] = useState(0);
  const [boxNotice, setBoxNotice] = useState("");
  const readingRef = useRef<HTMLDivElement>(null);
  const lifetimePoints = Math.max(points, rewards.lifetimePoints);
  const badgeCount = Math.floor(lifetimePoints / 120);
  const unlockedBoxes = Math.min(5, Math.floor(badgeCount / 3));
  const currentLetterGame = content.letterGames[letterIndex] ?? content.letterGames[0];
  const currentNumberQuestion = content.numberQuestions[numberIndex] ?? content.numberQuestions[0];
  const readingStory = content.readingStories[readingIndex] ?? content.readingStories[0];
  const pauseRemaining = Math.max(0, Math.ceil((readingPausedUntil - Date.now()) / 1000));

  useEffect(() => {
    if (!readingOpen || readingPausedUntil > Date.now()) return;
    const timer = window.setInterval(() => {
      if (readingRef.current) readingRef.current.scrollTop += 1;
      setReadingPausedUntil((value) => value);
    }, 120);
    return () => window.clearInterval(timer);
  }, [readingOpen, readingPausedUntil]);

  useEffect(() => {
    if (!readingOpen || readingPausedUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      setReaderTick((value) => value + 1);
      if (readingPausedUntil <= Date.now()) setReadingPausedUntil(0);
    }, 250);
    return () => window.clearInterval(timer);
  }, [readingOpen, readingPausedUntil]);

  const chooseLetter = (answer: string) => {
    if (answer !== currentLetterGame.answer) {
      setLetterMessage("جرّب مرة أخرى، أنت قريب!");
      return;
    }
    if (letterDone.includes(letterIndex)) {
      setLetterMessage("أنجزت هذه اللعبة من قبل. اختر لعبة أخرى.");
      return;
    }
    setLetterDone((current) => [...current, letterIndex]);
    setLetterMessage("إجابة صحيحة! حصلت على نجمة.");
    onAwardPoints(2);
  };

  const answerNumber = () => {
    if (Number(numberAnswer) !== currentNumberQuestion.answer) {
      setNumberMessage("ليست الإجابة الصحيحة، راجع العملية بهدوء.");
      return;
    }
    if (numberIndex >= 4) {
      onAwardPoints(5);
      setNumberMessage("أحسنت! أنهيت جولة كهف الأرقام وحصلت على 5 نقاط.");
      setNumberIndex(0);
      setNumberRound((value) => value + 1);
    } else {
      setNumberIndex((value) => value + 1);
      setNumberMessage("صحيح! المسألة التالية تنتظرك.");
    }
    setNumberAnswer("");
  };

  const openReading = (index: number) => {
    setReadingIndex(index);
    setReadingOpen(true);
    setSpokenWords(0);
    setReadingPausedUntil(0);
  };

  const speakWord = (word: string) => {
    if (spokenWords >= 20 || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(word.replace(/[،.؟]/g, ""));
    utterance.lang = "ar-SA";
    utterance.rate = 0.75;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpokenWords((value) => value + 1);
  };

  const purchase = (itemId: string, cost: number) => {
    if (rewards.purchasedIds.includes(itemId)) return;
    if (!onSpend(cost, itemId)) setBoxNotice("تحتاج إلى نقاط أكثر لشراء هذه المكافأة.");
    else setBoxNotice("تم حفظ المكافأة في سجل ولي الأمر.");
  };

  const openBox = (boxIndex: number) => {
    if (boxIndex >= unlockedBoxes || rewards.openedBoxes.some((item) => item.boxIndex === boxIndex)) return;
    const selectedMajorIndex = Math.floor(Math.random() * content.majorBoxRewards.length);
    const majorReward = content.majorBoxRewards[selectedMajorIndex];
    onOpenBox({ boxIndex, majorReward, selectedMajorIndex });
    setBoxNotice(`فتحت الصندوق وفزت بـ ${majorReward} ريال! الصندوق مختار عشوائياً من الجوائز الكبرى.`);
  };

  const renderReaderText = useMemo(() => readingStory.text.split(" "), [readingStory.text]);

  return (
    <section className="child-extras section-block" data-testid="panel-child-extras">
      <div className="section-heading">
        <div><h2>ساحة البطل</h2><p>ألعاب تعليمية ومكافآت إضافية بجانب تحديات المملكة.</p></div>
        <span className="eyebrow"><Sparkles size={14} /> ميزات ملف الطفل</span>
      </div>
      <div className="child-extras-grid">
        <button className="extra-feature-card letters-card" data-testid="button-open-letter-games" onClick={() => setActivePanel("letters")}>
          <span className="extra-feature-icon"><Languages size={23} /></span><strong>درب الحروف</strong><span>6 ألعاب عربية وإنجليزية للتهجئة والمطابقة والترتيب.</span><em>ابدأ اللعب <Play size={13} /></em>
        </button>
        <button className="extra-feature-card numbers-card" data-testid="button-open-number-cave" onClick={() => setActivePanel("numbers")}>
          <span className="extra-feature-icon"><Calculator size={23} /></span><strong>كهف الأرقام</strong><span>عمليات وألغاز متدرجة مناسبة لعمر 8–12 سنة.</span><em>5 مسائل في الجولة <Play size={13} /></em>
        </button>
        <button className="extra-feature-card reading-card" data-testid="button-open-reading-speed" onClick={() => setActivePanel("reading")}>
          <span className="extra-feature-icon"><BookOpen size={23} /></span><strong>القراءة السريعة</strong><span>6 قصص مشكولة مع تمرير هادئ ونطق الكلمات.</span><em>افتح القصص <Play size={13} /></em>
        </button>
        <button className="extra-feature-card store-card" data-testid="button-open-reward-store" onClick={() => setActivePanel("store")}>
          <span className="extra-feature-icon"><ShoppingBag size={23} /></span><strong>متجر المكافآت</strong><span>حوّل نقاطك إلى مكافآت يراجعها ولي الأمر.</span><em>{points} نقطة متاحة <Gift size={13} /></em>
        </button>
        <button className="extra-feature-card badges-card" data-testid="button-open-badges" onClick={() => setActivePanel("badges")}>
          <span className="extra-feature-icon"><Medal size={23} /></span><strong>أوسمتي وصناديقي</strong><span>{badgeCount} وسام • {unlockedBoxes} من 5 صناديق مفتوحة</span><em>تقدم البطل <Star size={13} /></em>
        </button>
      </div>

      {activePanel && createPortal(
        <div className="child-extras-overlay" role="dialog" aria-modal="true">
          <div className="child-extras-modal">
            <button className="icon-button child-extras-close" aria-label="إغلاق" onClick={() => setActivePanel(null)}>×</button>
            {activePanel === "letters" && (
              <div data-testid="panel-letter-games">
                <div className="extras-modal-heading"><Languages size={25} /><div><div className="eyebrow">درب الحروف • 6 ألعاب</div><h2>اكتشف قوة الكلمات</h2></div></div>
                <div className="game-picker">{content.letterGames.map((game, index) => <button key={game.id} className={index === letterIndex ? "selected" : ""} onClick={() => { setLetterIndex(index); setLetterMessage(""); }}><span>{index + 1}</span>{game.title}{letterDone.includes(index) && <Check size={14} />}</button>)}</div>
                <div className="letter-game-stage"><span className="game-stage-label">اللعبة {letterIndex + 1} من 6</span><h3>{currentLetterGame.question}</h3><p>{currentLetterGame.description}</p><div className="answer-option-grid">{currentLetterGame.options.map((option) => <button key={option} onClick={() => chooseLetter(option)}>{option}</button>)}</div>{letterMessage && <p className="game-message">{letterMessage}</p>}</div>
              </div>
            )}
            {activePanel === "numbers" && (
              <div data-testid="panel-number-cave">
                <div className="extras-modal-heading"><Calculator size={25} /><div><div className="eyebrow">كهف الأرقام • الجولة {numberRound + 1}</div><h2>حل المسألة</h2></div></div>
                <div className="number-question"><span>المسألة {numberIndex + 1} من 5</span><strong>{currentNumberQuestion.prompt}</strong><div className="number-answer-row"><input data-testid="input-number-answer" inputMode="numeric" type="number" value={numberAnswer} onChange={(event) => setNumberAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") answerNumber(); }} placeholder="اكتب الإجابة" autoFocus /><button className="primary-button gold" onClick={answerNumber}><Check size={16} /> تحقق</button></div>{numberMessage && <p className="game-message">{numberMessage}</p>}</div>
              </div>
            )}
            {activePanel === "reading" && (
              <div data-testid="panel-reading-speed">
                <div className="extras-modal-heading"><BookOpen size={25} /><div><div className="eyebrow">القراءة السريعة • 6 نوافذ</div><h2>اقرأ بهدوء وسرعة</h2></div></div>
                {!readingOpen ? <div className="story-grid">{content.readingStories.map((story, index) => <button key={story.id} onClick={() => openReading(index)}><BookOpen size={18} /><strong>{story.title}</strong><span>قصة مشكولة بالكامل</span></button>)}</div> : <div className="reader-stage"><div className="reader-toolbar"><button className="outline-button" onClick={() => setReadingOpen(false)}>كل القصص</button><span>نطق الكلمات: {spokenWords} / 20</span><button className="primary-button gold" onClick={() => setReadingPausedUntil(Date.now() + 10000)} disabled={pauseRemaining > 0}>{pauseRemaining > 0 ? `متوقف ${pauseRemaining} ث` : <><Pause size={15} /> إيقاف 10 ثوانٍ</>}</button></div><h3>{readingStory.title}</h3><div className="reader-text" ref={readingRef}>{renderReaderText.map((word, index) => <button key={`${word}-${index}`} onClick={() => speakWord(word)} disabled={spokenWords >= 20}>{word}</button>)}</div><p className="reader-note"><Volume2 size={14} /> اضغط على أي كلمة لسماع نطقها الصحيح. بقي لك {20 - spokenWords} كلمة.</p></div>}
              </div>
            )}
            {activePanel === "store" && (
              <div data-testid="panel-reward-store">
                <div className="extras-modal-heading"><ShoppingBag size={25} /><div><div className="eyebrow">متجر المكافآت</div><h2>ماذا تشتري بنقاطك؟</h2></div><strong className="store-balance">{points} نقطة</strong></div>
                <div className="store-items-grid">{content.storeItems.map((item) => { const Icon = rewardIcon(item); const purchased = rewards.purchasedIds.includes(item.id); return <div className={`store-item ${purchased ? "purchased" : ""}`} key={item.id}><span className="store-item-icon"><Icon size={19} /></span><strong>{item.title}</strong><span className="store-cost">{item.cost} نقطة</span><button className={purchased ? "outline-button" : "primary-button gold"} disabled={purchased || points < item.cost} onClick={() => purchase(item.id, item.cost)}>{purchased ? <><Check size={14} /> تم الطلب</> : "استبدال"}</button></div>; })}</div>{boxNotice && <p className="game-message">{boxNotice}</p>}
              </div>
            )}
            {activePanel === "badges" && (
              <div data-testid="panel-badges">
                <div className="extras-modal-heading"><Medal size={25} /><div><div className="eyebrow">رحلة الأوسمة</div><h2>كل 120 نقطة وسام جديد</h2></div></div>
                <div className="badge-progress"><div className="badge-count"><Medal size={31} /><strong>{badgeCount}</strong><span>أوسمة</span></div><div><strong>{lifetimePoints} / {Math.max(120, (badgeCount + 1) * 120)} نقطة مكتسبة</strong><p>عند جمع 3 أوسمة يفتح صندوق هدية عشوائي من أصل 5. شراء المكافآت لا يسحب الأوسمة السابقة.</p><div className="badge-track"><i style={{ width: `${Math.min(100, (lifetimePoints % 120) / 1.2)}%` }} /></div></div></div>
                <div className="mystery-boxes">{Array.from({ length: 5 }, (_, index) => { const opening = rewards.openedBoxes.find((item) => item.boxIndex === index); const available = index < unlockedBoxes; return <button key={index} className={`mystery-box ${available ? "available" : ""} ${opening ? "opened" : ""}`} disabled={!available || Boolean(opening)} onClick={() => openBox(index)}>{opening ? <><Gift size={25} /><strong>{opening.majorReward} ريال</strong><span>جائزتك الكبرى</span></> : <><Gift size={25} /><strong>{available ? "افتحني" : <LockKeyhole size={18} />}</strong><span>الصندوق {index + 1}</span></>}</button>; })}</div>
                {rewards.openedBoxes.length > 0 && <div className="box-reveal-note"><CircleHelp size={16} /><span>الجوائز الكبرى المتاحة عشوائياً: {content.majorBoxRewards.join(" أو ")} ريال. الصناديق الأخرى تعرض {content.displayBoxRewards.join(" و")} ريالاً للتحفيز فقط، ولا تدخل في السحب.</span></div>}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
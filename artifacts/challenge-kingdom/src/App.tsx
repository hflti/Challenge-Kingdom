import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BellRing,
  BookOpen,
  Check,
  ChartNoAxesColumnIncreasing,
  ChevronLeft,
  CircleHelp,
  CircleCheck,
  CircleX,
  Clock3,
  Compass,
  Crown,
  House,
  KeyRound,
  LockKeyhole,
  Map,
  Pause,
  PenLine,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  TimerReset,
  Trophy,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

type ProfileId = "ayham" | "kinan";
type Screen = "choose" | "home" | "quest" | "gate" | "reward";
type Tab = "quest" | "parent";

type Profile = {
  id: ProfileId;
  name: string;
  grade: string;
  title: string;
  quote: string;
  initials: string;
  color: string;
  icon: LucideIcon;
  level: number;
  xp: number;
  streak: number;
};

type Mission = {
  id: string;
  title: string;
  description: string;
  duration: number;
  icon: LucideIcon;
  featured?: boolean;
};

const profiles: Profile[] = [
  {
    id: "ayham",
    name: "أيهم",
    grade: "الفارس • الصف الرابع",
    title: "فارس نجمة الشمال",
    quote: "أجمع المعرفة مثلما يجمع الفارس كنوزه.",
    initials: "أ",
    color: "#ea4b5e",
    icon: Shield,
    level: 7,
    xp: 1280,
    streak: 4,
  },
  {
    id: "kinan",
    name: "كنان",
    grade: "المستكشف • الصف الثالث",
    title: "مستكشف الجزر السبع",
    quote: "كل صفحة جديدة جزيرة لم أزرها بعد.",
    initials: "ك",
    color: "#e58a46",
    icon: Compass,
    level: 5,
    xp: 910,
    streak: 3,
  },
];

const missions: Mission[] = [
  {
    id: "deep-focus",
    title: "غوصة التركيز",
    description: "حل الواجب الأصعب بهدوء، واترك الملل خارج القلعة.",
    duration: 8 * 60,
    icon: Swords,
    featured: true,
  },
  {
    id: "reading-trail",
    title: "درب الحروف",
    description: "اقرأ صفحتين بصوت واضح واستخرج ثلاث كلمات جديدة.",
    duration: 10 * 60,
    icon: BookOpen,
  },
  {
    id: "number-cave",
    title: "كهف الأرقام",
    description: "أنجز خمس مسائل حسابية من دون استعجال.",
    duration: 12 * 60,
    icon: Compass,
  },
];

type SavedState = {
  selectedId: ProfileId | null;
  completed: Record<ProfileId, number>;
  points: Record<ProfileId, number>;
  customMissions: Record<ProfileId, SavedMission[]>;
};

type SavedMission = {
  id: string;
  title: string;
  description: string;
  duration: number;
};

const storageKey = "challenge-kingdom-state-v1";
const mapStages = ["بوابة البيت", "غابة القراءة", "ميدان التحدي", "قلعة الحكمة"];
const totalStages = mapStages.length;
const mapTotalPoints = 120;
const mapFinishPoints = 100;

function readSavedState(): SavedState {
  const fallback: SavedState = {
    selectedId: null,
    completed: { ayham: 0, kinan: 0 },
    points: { ayham: 0, kinan: 0 },
    customMissions: { ayham: [], kinan: [] },
  };
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<SavedState>;
    return {
      ...fallback,
      ...parsed,
      completed: { ...fallback.completed, ...(parsed.completed ?? {}) },
      points: { ...fallback.points, ...(parsed.points ?? {}) },
      customMissions: { ...fallback.customMissions, ...(parsed.customMissions ?? {}) },
    };
  } catch {
    return fallback;
  }
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} ${minutes === 1 ? "دقيقة" : "دقائق"}`;
}

function pointsForExtensions(extensionCount: number) {
  if (extensionCount === 0) return 10;
  if (extensionCount === 1) return 8;
  if (extensionCount <= 3) return 5;
  return 1;
}

function playSound(kind: "start" | "bell" | "success" | "failure") {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  const context = new AudioContextConstructor();
  const notes =
    kind === "start"
      ? [{ frequency: 392, delay: 0, length: 0.14 }, { frequency: 523, delay: 0.16, length: 0.2 }]
      : kind === "bell"
      ? [{ frequency: 880, delay: 0, length: 0.22 }, { frequency: 660, delay: 0.24, length: 0.34 }]
      : kind === "success"
        ? [
            { frequency: 523, delay: 0, length: 0.12 },
            { frequency: 659, delay: 0.13, length: 0.12 },
            { frequency: 784, delay: 0.26, length: 0.2 },
            { frequency: 1047, delay: 0.43, length: 0.28 },
          ]
        : [
            { frequency: 330, delay: 0, length: 0.24 },
            { frequency: 247, delay: 0.24, length: 0.38 },
          ];

  notes.forEach(({ frequency, delay, length }) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "failure" ? "triangle" : "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + length);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + length + 0.03);
  });
  window.setTimeout(() => void context.close(), 1200);
}

function getArabicDate() {
  return new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
}

function App() {
  const [saved, setSaved] = useState<SavedState>(() => readSavedState());
  const [screen, setScreen] = useState<Screen>(() => (readSavedState().selectedId ? "home" : "choose"));
  const [tab, setTab] = useState<Tab>("quest");
  const [selectedId, setSelectedId] = useState<ProfileId | null>(() => readSavedState().selectedId);
  const [mission, setMission] = useState<Mission | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [pauseUsed, setPauseUsed] = useState(false);
  const [pauseSeconds, setPauseSeconds] = useState(0);
  const [extensionCount, setExtensionCount] = useState(0);
  const [finishCodeOpen, setFinishCodeOpen] = useState(false);
  const [finishCode, setFinishCode] = useState("");
  const [finishCodeError, setFinishCodeError] = useState("");
  const [answerResult, setAnswerResult] = useState<"yes" | "no" | null>(null);
  const [pointResult, setPointResult] = useState<{ earned: number; bonus: number; total: number; extensions: number } | null>(null);

  const profile = useMemo(() => profiles.find((item) => item.id === selectedId) ?? null, [selectedId]);
  const completed = profile ? saved.completed[profile.id] : 0;
  const points = profile ? saved.points[profile.id] : 0;
  const profileMissions = useMemo(
    () => [
      ...missions,
      ...(selectedId ? (saved.customMissions[selectedId] ?? []).map((item) => ({ ...item, icon: PenLine })) : []),
    ],
    [saved.customMissions, selectedId],
  );

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ ...saved, selectedId }));
  }, [saved, selectedId]);

  useEffect(() => {
    if (!timerRunning || screen !== "quest") return;
    const tick = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          setTimerRunning(false);
          setTimeUp(true);
          playSound("bell");
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [timerRunning, screen]);

  useEffect(() => {
    if (pauseSeconds <= 0 || screen !== "quest") return;
    const pauseTick = window.setInterval(() => {
      setPauseSeconds((current) => {
        if (current <= 1) {
          setTimerRunning(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(pauseTick);
  }, [pauseSeconds, screen]);

  const chooseProfile = (id: ProfileId) => {
    setSelectedId(id);
    setTab("quest");
    setScreen("home");
    setMission(null);
    setTimerRunning(false);
    setTimeUp(false);
    setFinishCodeOpen(false);
    setPauseUsed(false);
    setPauseSeconds(0);
    setExtensionCount(0);
  };

  const startMission = (nextMission: Mission) => {
    if (points >= mapFinishPoints) return;
    setMission(nextMission);
    setSeconds(nextMission.duration);
    setTimerRunning(false);
    setTimeUp(false);
    setFinishCodeOpen(false);
    setFinishCode("");
    setFinishCodeError("");
    setAnswerResult(null);
    setPointResult(null);
    setPauseUsed(false);
    setPauseSeconds(0);
    setExtensionCount(0);
    playSound("start");
    setScreen("quest");
  };

  const extendMission = () => {
    if (!mission) return;
    setSeconds(mission.duration);
    setTimeUp(false);
    setFinishCodeOpen(false);
    setFinishCode("");
    setFinishCodeError("");
    setExtensionCount((count) => count + 1);
    setTimerRunning(true);
  };

  const pauseMission = () => {
    if (!mission || !timerRunning || pauseUsed || timeUp) return;
    setTimerRunning(false);
    setPauseUsed(true);
    setPauseSeconds(120);
  };

  const verifyFinishCode = () => {
    if (finishCode !== "1230") {
      setFinishCodeError("الرمز غير صحيح. حاول مرة أخرى.");
      return;
    }
    setFinishCodeError("");
    setAnswerResult(null);
    setScreen("gate");
  };

  const answerMission = (answer: "yes" | "no") => {
    if (!profile) return;
    if (answer === "yes") {
      playSound("success");
      setAnswerResult("yes");
      const earned = pointsForExtensions(extensionCount);
      const currentPoints = saved.points[profile.id];
      const rawTotal = currentPoints + earned;
      const bonus = rawTotal >= mapFinishPoints ? Math.max(0, mapTotalPoints - rawTotal) : 0;
      const total = Math.min(mapTotalPoints, rawTotal + bonus);
      setPointResult({ earned, bonus, total, extensions: extensionCount });
      setSaved((current) => ({
        ...current,
        completed: { ...current.completed, [profile.id]: Math.min(totalStages, current.completed[profile.id] + 1) },
        points: { ...current.points, [profile.id]: total },
      }));
      setScreen("reward");
      return;
    }
    playSound("failure");
    setAnswerResult("no");
  };

  const newChallenge = () => {
    setMission(null);
    setPointResult(null);
    setTimerRunning(false);
    setTimeUp(false);
    setFinishCodeOpen(false);
    setFinishCode("");
    setFinishCodeError("");
    setAnswerResult(null);
    setPauseUsed(false);
    setPauseSeconds(0);
    setExtensionCount(0);
    setScreen("home");
    setTab("quest");
  };

  const createMission = (title: string, durationMinutes: number) => {
    if (!profile) return;
    const newMission: SavedMission = {
      id: `custom-${Date.now()}`,
      title,
      description: "مهمة كتبتها أنت. أنجزها كاملة قبل أن يهرب الملل.",
      duration: durationMinutes * 60,
    };
    setSaved((current) => ({
      ...current,
      customMissions: {
        ...current.customMissions,
        [profile.id]: [...(current.customMissions[profile.id] ?? []), newMission],
      },
    }));
  };

  const deleteMission = (missionId: string) => {
    if (!profile) return;
    setSaved((current) => ({
      ...current,
      customMissions: {
        ...current.customMissions,
        [profile.id]: (current.customMissions[profile.id] ?? []).filter((item) => item.id !== missionId),
      },
    }));
  };

  const resetMap = (enteredCode: string) => {
    if (!profile || enteredCode !== "0321") return false;
    setSaved((current) => ({
      ...current,
      completed: { ...current.completed, [profile.id]: 0 },
      points: { ...current.points, [profile.id]: 0 },
    }));
    return true;
  };

  if (screen === "choose" || !selectedId) {
    return (
      <ProfileChooser onChoose={chooseProfile} />
    );
  }
  const activeProfile = profile ?? profiles[0];

  return (
    <div className="kingdom-app" dir="rtl">
      <div className="kingdom-shell">
        <aside className="kingdom-sidebar" aria-label="التنقل الرئيسي">
          <div className="brand-lockup">
            <div className="brand-mark"><Crown size={23} strokeWidth={2.5} /></div>
            <div>
              <div className="brand-name">مملكة التحديات</div>
              <div className="brand-kicker">حكاية كل مساء</div>
            </div>
          </div>
          <div className="side-section-label">رحلة اليوم</div>
          <nav className="side-nav">
            <button data-testid="nav-quest" className={tab === "quest" ? "active" : ""} onClick={() => { setTab("quest"); setScreen("home"); }}>
              <House size={17} /> <span>ساحة المغامرة</span>
            </button>
            <button data-testid="nav-parent" className={tab === "parent" ? "active" : ""} onClick={() => { setTab("parent"); setScreen("home"); }}>
              <ChartNoAxesColumnIncreasing size={17} /> <span>مرصد الوالدين</span>
            </button>
          </nav>
          <div className="side-profile" data-testid="display-sidebar-profile">
            <div className="mini-avatar" style={{ background: activeProfile.color }}>{activeProfile.initials}</div>
            <div className="side-profile-copy"><strong>{activeProfile.name}</strong><span>{activeProfile.title}</span></div>
            <button className="icon-button" data-testid="button-switch-sidebar-profile" aria-label="تبديل البطل" onClick={() => setScreen("choose")}><RefreshCcw size={15} /></button>
          </div>
        </aside>

        <main className="kingdom-main">
          <header className="topbar">
            <div className="breadcrumb">
              <Map size={15} />
              <span>خريطة المملكة</span>
              <ChevronLeft size={13} />
              <b>{tab === "parent" ? "مرصد الوالدين" : screen === "quest" ? "ميدان التحدي" : screen === "gate" ? "بوابة التحقق" : screen === "reward" ? "قاعة الكنوز" : "ساحة المغامرة"}</b>
            </div>
            <div className="top-actions">
              <span className="date-chip" data-testid="text-today-date">{getArabicDate()}</span>
              <button className="profile-switch" data-testid="button-switch-profile" onClick={() => setScreen("choose")}>
                <span className="mini-avatar" style={{ background: activeProfile.color }}>{activeProfile.initials}</span>
                <span>تبديل البطل</span>
                <ChevronLeft size={14} />
              </button>
            </div>
          </header>

          <div className="content">
            {tab === "parent" && screen === "home" ? (
              <ParentView saved={saved} onChooseProfile={() => setScreen("choose")} />
            ) : screen === "home" ? (
              <HomeView profile={activeProfile} completed={completed} points={points} missions={profileMissions} onStart={startMission} onCreateMission={createMission} onDeleteMission={deleteMission} onResetMap={resetMap} onParent={() => setTab("parent")} />
            ) : screen === "quest" && mission ? (
              <QuestView mission={mission} seconds={seconds} running={timerRunning} timeUp={timeUp} pauseUsed={pauseUsed} pauseSeconds={pauseSeconds} finishCodeOpen={finishCodeOpen} finishCode={finishCode} error={finishCodeError} onBack={newChallenge} onStartTimer={() => setTimerRunning(true)} onPause={pauseMission} onExtend={extendMission} onOpenFinishCode={() => { setFinishCodeOpen(true); setFinishCodeError(""); }} onCode={setFinishCode} onVerifyCode={verifyFinishCode} />
            ) : screen === "gate" ? (
              <GateView answerResult={answerResult} onAnswer={answerMission} onBack={newChallenge} />
            ) : (
              <RewardView result={pointResult} profileName={activeProfile.name} onNew={newChallenge} />
            )}
          </div>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="التنقل">
        <button data-testid="mobile-nav-quest" className={tab === "quest" ? "active" : ""} onClick={() => { setTab("quest"); setScreen("home"); }}><House size={18} /><span>المغامرة</span></button>
        <button data-testid="mobile-nav-parent" className={tab === "parent" ? "active" : ""} onClick={() => { setTab("parent"); setScreen("home"); }}><Users size={18} /><span>الوالدان</span></button>
        <button data-testid="mobile-nav-profile" onClick={() => setScreen("choose")}><UserRound size={18} /><span>الأبطال</span></button>
      </nav>
    </div>
  );
}

function ProfileChooser({ onChoose }: { onChoose: (id: ProfileId) => void }) {
  return (
    <div className="kingdom-app" dir="rtl">
      <div className="profile-choose">
        <header className="choose-top">
          <div className="choose-logo"><div className="brand-mark"><Crown size={21} /></div><span>مملكة التحديات</span></div>
          <span className="choose-date">{getArabicDate()}</span>
        </header>
        <section className="choose-intro">
          <div className="eyebrow" style={{ justifyContent: "center" }}>بوابة الأبطال</div>
          <h1 className="display-title" data-testid="heading-profile-selection">من سيبدأ الحكاية؟</h1>
          <p className="subtle">اختر اسمك لنعيد فتح خريطتك ونرى أي كنز ينتظرك اليوم.</p>
        </section>
        <div className="profile-grid">
          {profiles.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className="profile-card" data-testid={`button-profile-${item.id}`} onClick={() => onChoose(item.id)}>
                <div className="profile-avatar"><Icon size={47} strokeWidth={1.8} /></div>
                <h2>{item.name}</h2>
                <div className="grade">{item.grade}</div>
                <p className="quote">«{item.quote}»</p>
                <div className="profile-meta"><span className="meta-pill gold"><Star size={11} fill="currentColor" /> {item.title}</span><span className="meta-pill">المستوى {item.level}</span></div>
              </button>
            );
          })}
        </div>
        <footer className="choose-foot"><LockKeyhole size={12} style={{ verticalAlign: "middle", marginLeft: 4 }} /> مساحة عائلية محفوظة على هذا الجهاز</footer>
      </div>
    </div>
  );
}

function HomeView({
  profile,
  completed,
  points,
  missions: availableMissions,
  onStart,
  onCreateMission,
  onDeleteMission,
  onResetMap,
  onParent,
}: {
  profile: Profile;
  completed: number;
  points: number;
  missions: Mission[];
  onStart: (mission: Mission) => void;
  onCreateMission: (title: string, durationMinutes: number) => void;
  onDeleteMission: (missionId: string) => void;
  onResetMap: (code: string) => boolean;
  onParent: () => void;
}) {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskMinutes, setTaskMinutes] = useState("10");
  const [taskError, setTaskError] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetError, setResetError] = useState("");

  const submitMission = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = taskTitle.trim();
    const minutes = Number(taskMinutes);
    if (!title) {
      setTaskError("اكتب اسم المهمة أولاً.");
      return;
    }
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
      setTaskError("اختر مدة بين دقيقة واحدة وساعتين.");
      return;
    }
    onCreateMission(title, minutes);
    setTaskTitle("");
    setTaskMinutes("10");
    setTaskError("");
  };

  const submitMapReset = () => {
    if (onResetMap(resetCode)) {
      setResetCode("");
      setResetError("");
    } else {
      setResetError("رمز إعادة الخريطة غير صحيح.");
    }
  };

  return (
    <>
      <section className="home-grid">
        <div>
          <div className="hero-card">
            <div className="hero-copy">
              <div className="eyebrow">الفصل الثالث • المهمة اليومية</div>
              <h1 className="display-title">مرحباً يا {profile.name}</h1>
              <p className="subtle">الملل يقترب من أسوار المملكة. هل تفتح صفحة جديدة وتدافع عن كنز المعرفة؟</p>
               <button className="primary-button gold hero-cta" data-testid="button-start-featured" onClick={() => onStart(availableMissions[0])} disabled={points >= mapFinishPoints}>{points >= mapFinishPoints ? "اكتملت المرحلة" : <>ابدأ المهمة <ArrowLeft size={16} /></>}</button>
            </div>
            <div className="hero-figure" aria-hidden="true"><div className="cape" /><div className="hero-head" /><div className="hero-shield"><Shield size={19} /></div><Sparkles className="hero-spark one" size={19} /><Star className="hero-spark two" size={16} fill="currentColor" /></div>
          </div>
          <div className="stats-strip">
            <div className="stat-card" data-testid="stat-completed"><span className="stat-label">مهام مكتملة</span><span className="stat-value">{completed}</span><span className="stat-note">هذا الأسبوع</span></div>
            <div className="stat-card points-stat" data-testid="stat-points"><span className="stat-label">نقاط الخريطة</span><span className="stat-value">{points.toLocaleString("ar-SA")}<small> / {mapTotalPoints}</small></span><span className="stat-note">{points >= mapFinishPoints ? "اكتملت المرحلة الأخيرة" : "اجمع ١٠ نقاط في البداية"}</span></div>
            <div className="stat-card" data-testid="stat-streak"><span className="stat-label">سلسلة الأيام</span><span className="stat-value">{profile.streak}</span><span className="stat-note">أيام متتالية</span></div>
          </div>
        </div>
        <aside className="panel today-panel" data-testid="panel-today-progress">
          <div className="panel-top"><div><h2 className="panel-title">نبض المملكة</h2><p className="panel-subtitle">تقدمك في رحلة اليوم</p></div><div className="progress-ring"><strong>72٪</strong></div></div>
          <div className="goal-row"><span>هدف اليوم</span><span>٢ من ٣ محطات</span></div><div className="goal-track"><div className="goal-fill" /></div>
          <div className="tiny-list">
            <div className="tiny-row"><span className="check"><Check size={14} /></span><span>تجهيز حقيبة البطل</span><em>تم</em></div>
            <div className="tiny-row"><span className="check"><Check size={14} /></span><span>غذاء قبل المغامرة</span><em>تم</em></div>
            <div className="tiny-row pending"><span className="check"><Clock3 size={13} /></span><span>مهمة المعرفة</span><em>بانتظارك</em></div>
          </div>
          <button className="outline-button" data-testid="button-open-parent-view" onClick={onParent} style={{ width: "100%", marginTop: 20 }}>عرض ملخص الوالدين <ChartNoAxesColumnIncreasing size={15} /></button>
        </aside>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><h2>اختر مهمة كاملة</h2><p>كل مهمة تفتح جزءاً جديداً من الخريطة.</p></div><span className="eyebrow">محطات اليوم</span></div>
        <form className="mission-composer" onSubmit={submitMission} data-testid="form-create-mission">
          <div className="composer-copy">
            <div className="composer-icon"><PenLine size={18} /></div>
            <div><strong>اكتب مهمة اليوم</strong><span>المهمة يجب أن تكون كاملة: صفحة، تدريب، أو واجب واضح.</span></div>
          </div>
          <div className="composer-fields">
            <label><span>اسم المهمة</span><input data-testid="input-mission-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="مثال: حل صفحة الرياضيات كاملة" /></label>
            <label className="minutes-field"><span>الوقت بالدقائق</span><input data-testid="input-mission-duration" type="number" min="1" max="120" step="1" value={taskMinutes} onChange={(event) => setTaskMinutes(event.target.value)} /></label>
            <button className="primary-button" type="submit" data-testid="button-create-mission"><Plus size={16} /> إضافة المهمة</button>
          </div>
          {taskError && <p className="form-error" data-testid="status-create-mission-error">{taskError}</p>}
        </form>
        <div className="missions-grid">
             {availableMissions.map((item) => {
            const Icon = item.icon;
               const missionCard = <button key={item.id} className={`mission-card ${item.featured ? "featured" : ""}`} data-testid={`button-mission-${item.id}`} onClick={() => onStart(item)} disabled={points >= mapFinishPoints}>
                 <div className="mission-top"><span className="mission-icon"><Icon size={19} /></span><span className="mission-duration"><Clock3 size={12} style={{ verticalAlign: "middle", marginLeft: 3 }} /> {formatDuration(item.duration)}</span></div>
                 <h3>{item.title}</h3><p>{item.description}</p><ArrowLeft className="mission-arrow" size={18} />
               </button>;
               return item.id.startsWith("custom-") ? <div className="mission-card-wrap" key={item.id}>{missionCard}<button type="button" className="delete-mission" aria-label={`حذف مهمة ${item.title}`} data-testid={`button-delete-mission-${item.id}`} onClick={() => onDeleteMission(item.id)}><CircleX size={15} /> حذف</button></div> : missionCard;
          })}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><h2>خريطة {profile.name}</h2><p>الممرات التي عبرتها حتى الآن.</p></div><span className="eyebrow"><Map size={14} /> من دفتر الرحلة</span></div>
        <div className="map-card" data-testid="display-treasure-map">
           <span className="map-label"><Map size={14} /> وادي البداية إلى قلعة الحكمة</span><div className="map-path" />
          <div className="map-nodes">
            {mapStages.map((stage, index) => {
              const done = index < completed;
              const current = index === completed && completed < totalStages;
              return <div className={`map-node ${done ? "done" : current ? "current" : ""}`} key={stage}><div className="node-disc">{done ? <Check size={21} /> : current ? <Swords size={20} /> : <LockKeyhole size={18} />}</div><div className="node-text">{stage}</div><div className="node-caption">{done ? "عبرت بنجاح" : current ? "أنت هنا" : "قريباً"}</div></div>;
            })}
          </div>
            <div className="map-points-summary"><strong>{points} / {mapTotalPoints}</strong><span>نقطة في خريطة {profile.name}</span><div className="map-points-track"><i style={{ width: `${Math.min(100, (points / mapTotalPoints) * 100)}%` }} /></div></div>
            {points >= mapFinishPoints && <div className="map-complete">
              <div><strong>فاز {profile.name} بالمرحلة الأخيرة!</strong><span>أدخل رمز القائد لإعادة الرحلة إلى المرحلة الأولى.</span></div>
              <div className="map-reset-actions"><input data-testid="input-map-reset-code" className="code-input" type="password" autoComplete="off" inputMode="numeric" maxLength={4} value={resetCode} onChange={(event) => setResetCode(event.target.value.replace(/\D/g, ""))} aria-label="رمز إعادة الخريطة" /><button className="outline-button" type="button" data-testid="button-reset-map" onClick={submitMapReset}><RotateCcw size={15} /> إعادة الخريطة</button></div>
              {resetError && <p className="form-error" data-testid="status-map-reset-error">{resetError}</p>}
            </div>}
        </div>
      </section>
    </>
  );
}

function QuestView({
  mission,
  seconds,
  running,
  timeUp,
  pauseUsed,
  pauseSeconds,
  finishCodeOpen,
  finishCode,
  error,
  onBack,
  onStartTimer,
  onPause,
  onExtend,
  onOpenFinishCode,
  onCode,
  onVerifyCode,
}: {
  mission: Mission;
  seconds: number;
  running: boolean;
  timeUp: boolean;
  pauseUsed: boolean;
  pauseSeconds: number;
  finishCodeOpen: boolean;
  finishCode: string;
  error: string;
  onBack: () => void;
  onStartTimer: () => void;
  onPause: () => void;
  onExtend: () => void;
  onOpenFinishCode: () => void;
  onCode: (value: string) => void;
  onVerifyCode: () => void;
}) {
  const Icon = mission.icon;
  const progress = mission.duration ? ((mission.duration - seconds) / mission.duration) * 100 : 0;
  return (
    <>
      <div className="quest-header"><button className="back-button" data-testid="button-back-to-missions" aria-label="العودة للمهام" onClick={onBack}><ArrowLeft size={18} /></button><div><div className="eyebrow">ميدان التحدي</div><p className="subtle">أثبت أن تركيزك أقوى من الملل.</p></div></div>
      <div className="quest-layout">
        <section className="quest-card" data-testid="panel-active-quest">
          <div className="eyebrow"><Icon size={14} /> المهمة النشطة</div><h1 data-testid="text-active-mission">{mission.title}</h1><p className="quest-description">{mission.description}</p>
          <div className={`timer-shell ${running ? "running" : ""} ${pauseSeconds > 0 ? "paused" : ""}`} style={{ background: `conic-gradient(hsl(var(--accent)) 0 ${progress}%, rgba(249,240,214,.11) ${progress}% 100%)` }}><div className="timer-core"><span className="timer-number" data-testid="display-countdown">{formatTime(seconds)}</span><span className="timer-label">{pauseSeconds > 0 ? `استراحة ${formatTime(pauseSeconds)}` : seconds === 0 ? "اكتمل الوقت" : running ? "المعركة جارية" : "جاهز للانطلاق"}</span></div></div>
          <div className="quest-actions">
             {running ? <button className="primary-button gold" data-testid="button-pause-timer" onClick={onPause} disabled={pauseUsed}>{pauseUsed ? <><Pause size={16} /> تم استخدام الإيقاف</> : <><Pause size={16} /> إيقاف لمدة دقيقتين</>}</button> : <button className="primary-button gold" data-testid="button-start-timer" onClick={onStartTimer} disabled={seconds === 0 || pauseSeconds > 0}><Play size={16} /> {pauseSeconds > 0 ? "الاستراحة جارية" : "ابدأ العدّاد"}</button>}
          </div>
            {!timeUp ? <p className={`quest-note ${pauseSeconds > 0 ? "pause-note" : ""}`}><ShieldCheck size={13} style={{ verticalAlign: "middle", marginLeft: 4 }} /> {pauseSeconds > 0 ? "استراحة الدقيقتين جارية، وسيستأنف العدّاد تلقائياً." : pauseUsed ? "تم استخدام الإيقاف الوحيد، ولا يمكن إيقاف العدّاد مرة أخرى." : "يتوفر إيقاف واحد فقط لمدة دقيقتين."}</p> : (
             <div className="time-up-panel" data-testid="panel-time-up">
               <div className="time-up-heading"><BellRing size={20} /><strong>انتهى وقت المعركة!</strong><span>سمعنا الجرس. اختر الخطوة التالية.</span></div>
               {!finishCodeOpen ? (
                 <div className="time-up-actions">
                   <button className="primary-button gold" data-testid="button-extend-time" onClick={onExtend}><TimerReset size={16} /> تمديد الوقت نفسه</button>
                   <button className="outline-button" data-testid="button-open-finish-code" onClick={onOpenFinishCode}><KeyRound size={16} /> إنهاء المهمة</button>
                 </div>
               ) : (
                  <form className="finish-code-box" onSubmit={(event) => { event.preventDefault(); onVerifyCode(); }}>
                   <label htmlFor="finish-code">رمز إنهاء المهمة</label>
                     <input id="finish-code" className="code-input" data-testid="input-finish-code" type="password" autoComplete="off" inputMode="numeric" maxLength={4} value={finishCode} onChange={(event) => onCode(event.target.value.replace(/\D/g, ""))} aria-label="رمز إنهاء المهمة" autoFocus />
                   {error && <p className="gate-error" data-testid="status-finish-code-error">{error}</p>}
                    <button className="primary-button" type="submit" data-testid="button-verify-finish-code"><ShieldCheck size={16} /> متابعة</button>
                  </form>
               )}
             </div>
           )}
        </section>
        <aside className="battle-aside">
          <div className="monster-card"><h3>العدو: ملل</h3><p>يحب أن يهمس: «اترك الصفحة الآن». لا تمنحه هذه الفرصة.</p><div className="monster"><div className="monster-eyes"><span>•</span><span>•</span></div><div className="monster-mouth" /></div></div>
          <div className="rule-card"><h3>قواعد الميدان</h3><div className="rule"><ShieldCheck size={14} /><span>ضع أدواتك أمامك قبل بدء العدّاد.</span></div><div className="rule"><TimerReset size={14} /><span>إيقاف واحد فقط لمدة دقيقتين، ثم يستأنف العدّاد تلقائياً.</span></div><div className="rule"><Trophy size={14} /><span>النقاط تُحتسب بعد موافقة ولي الأمر.</span></div></div>
        </aside>
      </div>
    </>
  );
}

function GateView({ answerResult, onAnswer, onBack }: { answerResult: "yes" | "no" | null; onAnswer: (answer: "yes" | "no") => void; onBack: () => void }) {
  return (
    <section className="gate-card">
      <div className="gate-seal"><LockKeyhole size={34} /></div>
      <div className="eyebrow" style={{ justifyContent: "center" }}>محطة العائلة</div>
      {answerResult === "no" ? (
        <>
          <h1 data-testid="heading-parent-gate">تبقى المرحلة مكانها</h1>
          <p>لم يتم اعتماد الإنجاز هذه المرة. لا مشكلة، يمكنك العودة والمحاولة في تحدٍ جديد عندما تكون المهمة جاهزة.</p>
          <div className="answer-result failure-result"><CircleX size={25} /><strong>لا يوجد تقدم على الخريطة</strong><span>شغّلنا موسيقى الفشل حتى تعرف أن المرحلة لم تُفتح.</span></div>
          <button className="primary-button" data-testid="button-return-after-failure" onClick={onBack}><Map size={16} /> العودة إلى الخريطة</button>
        </>
      ) : (
        <>
          <h1 data-testid="heading-parent-gate">هل تم الإنجاز؟</h1>
          <p>بعد إدخال رمز القائد، يتأكد ولي الأمر من أن المهمة الكاملة أُنجزت فعلاً في الدفتر أو الكتاب.</p>
          <div className="answer-actions">
            <button className="primary-button gold" data-testid="button-answer-yes" onClick={() => onAnswer("yes")}><CircleCheck size={19} /> نعم، تم الإنجاز</button>
            <button className="outline-button" data-testid="button-answer-no" onClick={() => onAnswer("no")}><CircleX size={19} /> لا، ليس بعد</button>
          </div>
        </>
      )}
      {answerResult !== "no" && <button className="outline-button" data-testid="button-back-from-gate" onClick={onBack} style={{ marginTop: 17 }}><ArrowLeft size={15} /> العودة إلى الخريطة</button>}
    </section>
  );
}

function RewardView({ result, profileName, onNew }: { result: { earned: number; bonus: number; total: number; extensions: number } | null; profileName: string; onNew: () => void }) {
  const earned = result?.earned ?? 0;
  const bonus = result?.bonus ?? 0;
  return (
    <section className="reward-screen">
      <div className="eyebrow" style={{ justifyContent: "center" }}>قاعة الإنجاز</div>
      <h1 data-testid="heading-reward">أحسنت يا {profileName}!</h1>
      <p className="reward-sub">أنجزت التحدي وفتحت طريقاً جديداً في خريطتك.</p>
      <div className="points-reward-card" data-testid="panel-earned-points">
        <Sparkles size={38} />
        <span className="points-reward-label">النقاط المكتسبة</span>
        <strong className="points-reward-value">+{earned.toLocaleString("ar-SA")}</strong>
        <span className="points-reward-note">{result?.extensions === 0 ? "أنهيتها من المحاولة الأولى، أداء رائع!" : `أنهيتها بعد ${result?.extensions.toLocaleString("ar-SA")} تمديد، واستمر تركيزك حتى النهاية.`}</span>
        {bonus > 0 && <span className="finish-bonus">مكافأة الفوز: +{bonus.toLocaleString("ar-SA")} لتكتمل الخريطة إلى {mapTotalPoints} نقطة</span>}
        <div className="total-points-pill">مجموع الخريطة: {result?.total.toLocaleString("ar-SA")} / {mapTotalPoints}</div>
      </div>
      <div className="reward-buttons"><button className="primary-button" data-testid="button-new-challenge" onClick={onNew}><Swords size={16} /> العودة للمملكة</button></div>
    </section>
  );
}

function ParentView({ saved, onChooseProfile }: { saved: SavedState; onChooseProfile: () => void }) {
  const total = saved.completed.ayham + saved.completed.kinan;
  return (
    <section className="parent-view">
      <div className="parent-banner"><div><div className="eyebrow">مرصد الوالدين • {getArabicDate()}</div><h1>غرفة القيادة العائلية</h1><p>ملخص لطيف لما أنجزه الأبطال اليوم، من دون تحويل الرحلة إلى جدول درجات.</p></div><div className="parent-total" data-testid="display-family-total"><strong>{total}</strong><span>مهمة في دفتر العائلة</span></div></div>
      <div className="parent-grid">
        <div className="panel"><div className="panel-top"><div><h2 className="panel-title">نبض الأبطال</h2><p className="panel-subtitle">هذا الأسبوع حتى الآن</p></div><Trophy color="hsl(var(--accent))" /></div><div className="child-progress">
          <div className="child-progress-row"><div className="mini-avatar" style={{ background: profiles[0].color }}>أ</div><div className="child-progress-copy"><strong>أيهم</strong><span>{saved.completed.ayham} مهام مكتملة • {saved.points.ayham.toLocaleString("ar-SA")} / {mapTotalPoints} نقطة</span><div className="progress-small"><i style={{ width: `${Math.min(100, (saved.points.ayham / mapTotalPoints) * 100)}%` }} /></div></div></div>
          <div className="child-progress-row"><div className="mini-avatar" style={{ background: profiles[1].color }}>ك</div><div className="child-progress-copy"><strong>كنان</strong><span>{saved.completed.kinan} مهام مكتملة • {saved.points.kinan.toLocaleString("ar-SA")} / {mapTotalPoints} نقطة</span><div className="progress-small"><i style={{ width: `${Math.min(100, (saved.points.kinan / mapTotalPoints) * 100)}%` }} /></div></div></div>
        </div><button className="outline-button" data-testid="button-switch-from-parent" onClick={onChooseProfile} style={{ width: "100%", marginTop: 24 }}><Users size={15} /> تبديل ملف البطل</button></div>
        <div className="panel"><div className="panel-top"><div><h2 className="panel-title">سجل اليوم</h2><p className="panel-subtitle">محطات صغيرة تصنع عادة كبيرة.</p></div><ChartNoAxesColumnIncreasing color="hsl(var(--primary))" /></div><div className="timeline">
          <div className="timeline-item"><span className="timeline-icon"><Check size={14} /></span><div className="timeline-copy"><strong>تم تجهيز الرحلة</strong><p>الحقيبة جاهزة والأدوات في مكانها.</p></div></div>
          <div className="timeline-item"><span className="timeline-icon"><Star size={14} fill="currentColor" /></span><div className="timeline-copy"><strong>محطة الإفطار</strong><p>بدأ اليوم بطاقة هادئة.</p></div></div>
          {total > 0 ? <div className="timeline-item"><span className="timeline-icon"><Trophy size={14} /></span><div className="timeline-copy"><strong>كنز جديد في الدفتر</strong><p>آخر إنجاز عائلي: {total} مهام مكتملة.</p></div></div> : <div className="empty-reward" data-testid="empty-parent-activity"><CircleHelp size={17} /><div>لم يبدأ أي بطل مهمة بعد. الخريطة تنتظر أول خطوة.</div></div>}
        </div></div>
      </div>
    </section>
  );
}

export default App;
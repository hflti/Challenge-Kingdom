import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChartNoAxesColumnIncreasing,
  ChevronLeft,
  CircleHelp,
  Clock3,
  Compass,
  Crown,
  Gift,
  HeartHandshake,
  House,
  KeyRound,
  LockKeyhole,
  Map,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  ScrollText,
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

type Reward = {
  kind: string;
  title: string;
  description: string;
  icon: LucideIcon;
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
    duration: 30,
    icon: Swords,
    featured: true,
  },
  {
    id: "reading-trail",
    title: "درب الحروف",
    description: "اقرأ صفحتين بصوت واضح واستخرج ثلاث كلمات جديدة.",
    duration: 45,
    icon: BookOpen,
  },
  {
    id: "number-cave",
    title: "كهف الأرقام",
    description: "أنجز خمس مسائل حسابية من دون استعجال.",
    duration: 60,
    icon: Compass,
  },
];

const rewards: Reward[] = [
  {
    kind: "كنز من العالم الحقيقي",
    title: "اختيار الحلوى",
    description: "يختار البطل حلوى صغيرة من الدرج السري بعد العشاء.",
    icon: Gift,
  },
  {
    kind: "ترقية افتراضية",
    title: "درع الحماية",
    description: "أضيف درع لامع إلى خريطة بطلك. بقيت خطوة واحدة نحو القلعة.",
    icon: ShieldCheck,
  },
  {
    kind: "بطاقة عائلية",
    title: "ربع ساعة إضافية",
    description: "بطاقة تمنحك ربع ساعة إضافية من وقت اللعب هذا المساء.",
    icon: HeartHandshake,
  },
  {
    kind: "كنز من العالم الحقيقي",
    title: "اختيار قصة الليلة",
    description: "أنت تختار القصة التي ستقرأها العائلة قبل النوم.",
    icon: ScrollText,
  },
];

type SavedState = {
  selectedId: ProfileId | null;
  completed: Record<ProfileId, number>;
  xp: Record<ProfileId, number>;
  rewards: Record<ProfileId, string[]>;
};

const storageKey = "challenge-kingdom-state-v1";

function readSavedState(): SavedState {
  const fallback: SavedState = {
    selectedId: null,
    completed: { ayham: 2, kinan: 1 },
    xp: { ayham: 1280, kinan: 910 },
    rewards: { ayham: [], kinan: [] },
  };
  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback;
  } catch {
    return fallback;
  }
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
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
  const [guardianReady, setGuardianReady] = useState(false);
  const [code, setCode] = useState("");
  const [gateError, setGateError] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [activeReward, setActiveReward] = useState<Reward | null>(null);

  const profile = useMemo(() => profiles.find((item) => item.id === selectedId) ?? null, [selectedId]);
  const completed = profile ? saved.completed[profile.id] : 0;
  const xp = profile ? saved.xp[profile.id] : 0;

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ ...saved, selectedId }));
  }, [saved, selectedId]);

  useEffect(() => {
    if (!timerRunning || screen !== "quest") return;
    const tick = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [timerRunning, screen]);

  const chooseProfile = (id: ProfileId) => {
    setSelectedId(id);
    setTab("quest");
    setScreen("home");
    setMission(null);
    setTimerRunning(false);
  };

  const startMission = (nextMission: Mission) => {
    setMission(nextMission);
    setSeconds(nextMission.duration);
    setTimerRunning(false);
    setGuardianReady(false);
    setCode("");
    setGateError("");
    setScreen("quest");
  };

  const finishMission = () => {
    if (seconds > 0 || !mission) return;
    setTimerRunning(false);
    setScreen("gate");
    setGuardianReady(false);
    setCode("");
  };

  const approveReward = () => {
    if (!guardianReady) {
      setGuardianReady(true);
      return;
    }
    if (code.length > 0 && code !== "2468") {
      setGateError("الرمز غير صحيح. جرّبوا الرمز العائلي من جديد.");
      return;
    }
    setGateError("");
    setScreen("reward");
  };

  const revealReward = () => {
    const nextReward = rewards[Math.floor(Math.random() * rewards.length)];
    setActiveReward(nextReward);
    setRevealed(true);
    if (profile) {
      setSaved((current) => ({
        ...current,
        completed: { ...current.completed, [profile.id]: current.completed[profile.id] + 1 },
        xp: { ...current.xp, [profile.id]: current.xp[profile.id] + 120 },
        rewards: { ...current.rewards, [profile.id]: [...current.rewards[profile.id], nextReward.title] },
      }));
    }
  };

  const newChallenge = () => {
    setMission(null);
    setActiveReward(null);
    setRevealed(false);
    setScreen("home");
    setTab("quest");
  };

  const resetJourney = () => {
    const clean: SavedState = {
      selectedId: selectedId,
      completed: { ayham: 0, kinan: 0 },
      xp: { ayham: 0, kinan: 0 },
      rewards: { ayham: [], kinan: [] },
    };
    setSaved(clean);
    setScreen("home");
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
              <ParentView saved={saved} onReset={resetJourney} onChooseProfile={() => setScreen("choose")} />
            ) : screen === "home" ? (
              <HomeView profile={activeProfile} completed={completed} xp={xp} onStart={startMission} onParent={() => setTab("parent")} />
            ) : screen === "quest" && mission ? (
              <QuestView mission={mission} seconds={seconds} running={timerRunning} onBack={newChallenge} onToggle={() => setTimerRunning((value) => !value)} onFinish={finishMission} />
            ) : screen === "gate" ? (
              <GateView ready={guardianReady} code={code} error={gateError} onCode={setCode} onApprove={approveReward} onBack={() => { setScreen("quest"); setTimerRunning(false); }} />
            ) : (
              <RewardView revealed={revealed} reward={activeReward} onReveal={revealReward} onNew={newChallenge} />
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

function HomeView({ profile, completed, xp, onStart, onParent }: { profile: Profile; completed: number; xp: number; onStart: (mission: Mission) => void; onParent: () => void }) {
  return (
    <>
      <section className="home-grid">
        <div>
          <div className="hero-card">
            <div className="hero-copy">
              <div className="eyebrow">الفصل الثالث • المهمة اليومية</div>
              <h1 className="display-title">مرحباً يا {profile.name}</h1>
              <p className="subtle">الملل يقترب من أسوار المملكة. هل تفتح صفحة جديدة وتدافع عن كنز المعرفة؟</p>
              <button className="primary-button gold hero-cta" data-testid="button-start-featured" onClick={() => onStart(missions[0])}>ابدأ المهمة <ArrowLeft size={16} /></button>
            </div>
            <div className="hero-figure" aria-hidden="true"><div className="cape" /><div className="hero-head" /><div className="hero-shield"><Shield size={19} /></div><Sparkles className="hero-spark one" size={19} /><Star className="hero-spark two" size={16} fill="currentColor" /></div>
          </div>
          <div className="stats-strip">
            <div className="stat-card" data-testid="stat-completed"><span className="stat-label">مهام مكتملة</span><span className="stat-value">{completed}</span><span className="stat-note">هذا الأسبوع</span></div>
            <div className="stat-card" data-testid="stat-xp"><span className="stat-label">نقاط الشجاعة</span><span className="stat-value">{xp.toLocaleString("ar-SA")}</span><span className="stat-note">+120 اليوم</span></div>
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
        <div className="missions-grid">
          {missions.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={`mission-card ${item.featured ? "featured" : ""}`} data-testid={`button-mission-${item.id}`} onClick={() => onStart(item)}>
              <div className="mission-top"><span className="mission-icon"><Icon size={19} /></span><span className="mission-duration"><Clock3 size={12} style={{ verticalAlign: "middle", marginLeft: 3 }} /> {item.duration} ثانية</span></div>
              <h3>{item.title}</h3><p>{item.description}</p><ArrowLeft className="mission-arrow" size={18} />
            </button>;
          })}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><h2>خريطة {profile.name}</h2><p>الممرات التي عبرتها حتى الآن.</p></div><span className="eyebrow"><Map size={14} /> من دفتر الرحلة</span></div>
        <div className="map-card" data-testid="display-treasure-map">
          <span className="map-label"><Map size={14} /> وادي البداية إلى قلعة الحكمة</span><div className="map-path" />
          <div className="map-nodes">
            <div className="map-node done"><div className="node-disc"><Check size={21} /></div><div className="node-text">بوابة البيت</div><div className="node-caption">عبرت بنجاح</div></div>
            <div className="map-node done"><div className="node-disc"><Star size={20} fill="currentColor" /></div><div className="node-text">غابة القراءة</div><div className="node-caption">كنز صغير</div></div>
            <div className="map-node current"><div className="node-disc"><Swords size={20} /></div><div className="node-text">ميدان التحدي</div><div className="node-caption">أنت هنا</div></div>
            <div className="map-node"><div className="node-disc"><LockKeyhole size={18} /></div><div className="node-text">قلعة الحكمة</div><div className="node-caption">قريباً</div></div>
          </div>
        </div>
      </section>
    </>
  );
}

function QuestView({ mission, seconds, running, onBack, onToggle, onFinish }: { mission: Mission; seconds: number; running: boolean; onBack: () => void; onToggle: () => void; onFinish: () => void }) {
  const Icon = mission.icon;
  const progress = mission.duration ? ((mission.duration - seconds) / mission.duration) * 100 : 0;
  return (
    <>
      <div className="quest-header"><button className="back-button" data-testid="button-back-to-missions" aria-label="العودة للمهام" onClick={onBack}><ArrowLeft size={18} /></button><div><div className="eyebrow">ميدان التحدي</div><p className="subtle">أثبت أن تركيزك أقوى من الملل.</p></div></div>
      <div className="quest-layout">
        <section className="quest-card" data-testid="panel-active-quest">
          <div className="eyebrow"><Icon size={14} /> المهمة النشطة</div><h1 data-testid="text-active-mission">{mission.title}</h1><p className="quest-description">{mission.description}</p>
          <div className={`timer-shell ${running ? "running" : ""}`} style={{ background: `conic-gradient(hsl(var(--accent)) 0 ${progress}%, rgba(249,240,214,.11) ${progress}% 100%)` }}><div className="timer-core"><span className="timer-number" data-testid="display-countdown">{formatTime(seconds)}</span><span className="timer-label">{seconds === 0 ? "اكتمل الوقت" : running ? "المعركة جارية" : "جاهز للانطلاق"}</span></div></div>
          <div className="quest-actions">
            <button className="primary-button gold" data-testid={running ? "button-pause-timer" : "button-start-timer"} onClick={onToggle} disabled={seconds === 0}>{running ? <><Pause size={16} /> إيقاف مؤقت</> : <><Play size={16} /> ابدأ العدّاد</>}</button>
            <button className="outline-button" data-testid="button-finish-quest" onClick={onFinish} disabled={seconds > 0}><Check size={16} /> سلّم المهمة</button>
          </div>
          <p className="quest-note"><ShieldCheck size={13} style={{ verticalAlign: "middle", marginLeft: 4 }} /> لا يمكن التسليم قبل انتهاء الوقت — هذه قاعدة الفرسان.</p>
        </section>
        <aside className="battle-aside">
          <div className="monster-card"><h3>العدو: ملل</h3><p>يحب أن يهمس: «اترك الصفحة الآن». لا تمنحه هذه الفرصة.</p><div className="monster"><div className="monster-eyes"><span>•</span><span>•</span></div><div className="monster-mouth" /></div></div>
          <div className="rule-card"><h3>قواعد الميدان</h3><div className="rule"><ShieldCheck size={14} /><span>ضع أدواتك أمامك قبل بدء العدّاد.</span></div><div className="rule"><TimerReset size={14} /><span>يمكنك الإيقاف المؤقت عند الحاجة.</span></div><div className="rule"><Trophy size={14} /><span>الكنز يفتح بعد موافقة ولي الأمر.</span></div></div>
        </aside>
      </div>
    </>
  );
}

function GateView({ ready, code, error, onCode, onApprove, onBack }: { ready: boolean; code: string; error: string; onCode: (value: string) => void; onApprove: () => void; onBack: () => void }) {
  return (
    <section className="gate-card">
      <div className="gate-seal"><LockKeyhole size={34} /></div>
      <div className="eyebrow" style={{ justifyContent: "center" }}>محطة العائلة</div>
      <h1 data-testid="heading-parent-gate">بوابة ولي الأمر</h1>
      <p>أحسنت! انتهى وقت المهمة. الآن نحتاج لمسة ولي الأمر قبل أن نفتح الصندوق ونكشف الكنز.</p>
      {!ready ? (
        <button className="primary-button" data-testid="button-parent-mode" onClick={onApprove}><Users size={17} /> أنا ولي الأمر — فتح البوابة</button>
      ) : (
        <div className="gate-box">
          <label htmlFor="family-code">الرمز السري (اختياري)</label>
          <input id="family-code" className="code-input" data-testid="input-family-code" inputMode="numeric" maxLength={4} value={code} onChange={(event) => onCode(event.target.value.replace(/\D/g, ""))} placeholder="••••" aria-describedby={error ? "gate-error" : undefined} />
          {error && <p id="gate-error" className="gate-error" data-testid="status-gate-error">{error}</p>}
          <button className="primary-button gold" data-testid="button-approve-reward" onClick={onApprove} style={{ width: "100%", marginTop: 14 }}><ShieldCheck size={17} /> تأكيد ولي الأمر وفتح الكنز</button>
          <p className="subtle" style={{ fontSize: 10, marginTop: 11 }}>يمكن ترك الرمز فارغاً إذا كان ولي الأمر واقفاً بجانبك.</p>
        </div>
      )}
      <button className="outline-button" data-testid="button-back-from-gate" onClick={onBack} style={{ marginTop: 17 }}><ArrowLeft size={15} /> العودة للمهمة</button>
    </section>
  );
}

function RewardView({ revealed, reward, onReveal, onNew }: { revealed: boolean; reward: Reward | null; onReveal: () => void; onNew: () => void }) {
  const RewardIcon = reward?.icon ?? Gift;
  return (
    <section className="reward-screen">
      <div className="eyebrow" style={{ justifyContent: "center" }}>قاعة الكنوز</div>
      <h1 data-testid="heading-reward">فتّشوا الصندوق</h1>
      <p className="reward-sub">{revealed ? "هذا الكنز لك اليوم. احتفلوا به معاً." : "لحظة واحدة تفصل البطل عن مفاجأته."}</p>
      {!revealed ? (
        <>
          <div className="chest-wrap" aria-label="صندوق كنز مقفل"><div className="chest-glow" /><div className="chest" /><div className="chest-lid" /><div className="chest-lock" /></div>
          <button className="primary-button gold" data-testid="button-reveal-reward" onClick={onReveal}><KeyRound size={17} /> اكشف الكنز</button>
        </>
      ) : (
        <>
          <div className="reward-card" data-testid="panel-revealed-reward">
            <div className="reward-type">{reward?.kind}</div><RewardIcon size={39} color="hsl(var(--accent))" style={{ marginTop: 15 }} /><h2>{reward?.title}</h2><p>{reward?.description}</p><span className="reward-stamp"><Sparkles size={14} /> تمت إضافة الكنز إلى دفتر الرحلة</span>
          </div>
          <div className="reward-buttons"><button className="primary-button" data-testid="button-new-challenge" onClick={onNew}><Swords size={16} /> تحدٍ جديد</button><button className="outline-button" data-testid="button-view-parent-after-reward" onClick={onNew}><House size={15} /> العودة للمملكة</button></div>
        </>
      )}
    </section>
  );
}

function ParentView({ saved, onReset, onChooseProfile }: { saved: SavedState; onReset: () => void; onChooseProfile: () => void }) {
  const total = saved.completed.ayham + saved.completed.kinan;
  return (
    <section className="parent-view">
      <div className="parent-banner"><div><div className="eyebrow">مرصد الوالدين • {getArabicDate()}</div><h1>غرفة القيادة العائلية</h1><p>ملخص لطيف لما أنجزه الأبطال اليوم، من دون تحويل الرحلة إلى جدول درجات.</p></div><div className="parent-total" data-testid="display-family-total"><strong>{total}</strong><span>مهمة في دفتر العائلة</span></div></div>
      <div className="parent-grid">
        <div className="panel"><div className="panel-top"><div><h2 className="panel-title">نبض الأبطال</h2><p className="panel-subtitle">هذا الأسبوع حتى الآن</p></div><Trophy color="hsl(var(--accent))" /></div><div className="child-progress">
          <div className="child-progress-row"><div className="mini-avatar" style={{ background: profiles[0].color }}>أ</div><div className="child-progress-copy"><strong>أيهم</strong><span>{saved.completed.ayham} مهام مكتملة • {saved.xp.ayham.toLocaleString("ar-SA")} نقطة شجاعة</span><div className="progress-small"><i style={{ width: `${Math.min(100, 35 + saved.completed.ayham * 12)}%` }} /></div></div></div>
          <div className="child-progress-row"><div className="mini-avatar" style={{ background: profiles[1].color }}>ك</div><div className="child-progress-copy"><strong>كنان</strong><span>{saved.completed.kinan} مهام مكتملة • {saved.xp.kinan.toLocaleString("ar-SA")} نقطة شجاعة</span><div className="progress-small"><i style={{ width: `${Math.min(100, 25 + saved.completed.kinan * 12)}%` }} /></div></div></div>
        </div><button className="outline-button" data-testid="button-switch-from-parent" onClick={onChooseProfile} style={{ width: "100%", marginTop: 24 }}><Users size={15} /> تبديل ملف البطل</button></div>
        <div className="panel"><div className="panel-top"><div><h2 className="panel-title">سجل اليوم</h2><p className="panel-subtitle">محطات صغيرة تصنع عادة كبيرة.</p></div><ChartNoAxesColumnIncreasing color="hsl(var(--primary))" /></div><div className="timeline">
          <div className="timeline-item"><span className="timeline-icon"><Check size={14} /></span><div className="timeline-copy"><strong>تم تجهيز الرحلة</strong><p>الحقيبة جاهزة والأدوات في مكانها.</p></div></div>
          <div className="timeline-item"><span className="timeline-icon"><Star size={14} fill="currentColor" /></span><div className="timeline-copy"><strong>محطة الإفطار</strong><p>بدأ اليوم بطاقة هادئة.</p></div></div>
          {total > 0 ? <div className="timeline-item"><span className="timeline-icon"><Trophy size={14} /></span><div className="timeline-copy"><strong>كنز جديد في الدفتر</strong><p>آخر إنجاز عائلي: {total} مهام مكتملة.</p></div></div> : <div className="empty-reward" data-testid="empty-parent-activity"><CircleHelp size={17} /><div>لم يبدأ أي بطل مهمة بعد. الخريطة تنتظر أول خطوة.</div></div>}
        </div></div>
      </div>
      <div className="section-block"><div className="section-heading"><div><h2>أدوات الوالدين</h2><p>لنبقي اللعب آمناً ومرناً.</p></div></div><div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 15, flexWrap: "wrap" }}><div><strong style={{ display: "block", fontSize: 14 }}>إعادة خريطة هذا الجهاز</strong><span className="subtle" style={{ fontSize: 11 }}>يمسح الإنجازات المحلية لتبدأ العائلة حكاية جديدة.</span></div><button className="outline-button" data-testid="button-reset-journey" onClick={onReset}><RotateCcw size={15} /> بدء حكاية جديدة</button></div></div>
    </section>
  );
}

export default App;
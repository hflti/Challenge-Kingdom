import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  LogOut,
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
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import ayhamPhoto from "@assets/أيهم_1787868667283.jpeg";
import kinanPhoto from "@assets/كنان_1787868667282.jpeg";
import { AdminConsole } from "./components/admin-console";
import { ChildExtras, defaultChildRewards, normalizeChildRewards, type BoxOpening, type ChildRewardsState } from "./components/child-extras";
import { defaultChildContent, normalizeChildContent, type ChildContentConfig } from "./lib/child-content";
import { accountsApi, type FamilyMember } from "./lib/account-api";

type ProfileId = string;
type Screen = "choose" | "home" | "quest" | "gate" | "reward";
type Tab = "quest" | "parent";

type Profile = {
  id: ProfileId;
  name: string;
  grade: string;
  title: string;
  quote: string;
  initials: string;
  photo: string;
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
  rewardPoints?: number;
  requiresCode?: boolean;
};

const profiles: Profile[] = [
  {
    id: "ayham",
    name: "أيهم",
    grade: "الفارس • الصف الرابع",
    title: "فارس نجمة الشمال",
    quote: "أجمع المعرفة مثلما يجمع الفارس كنوزه.",
    initials: "أ",
    photo: ayhamPhoto,
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
    photo: kinanPhoto,
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
  childRewards: Record<ProfileId, ChildRewardsState>;
  childContent: ChildContentConfig;
  extraChallenge: ExtraChallengeSettings;
};

type SavedMission = {
  id: string;
  title: string;
  description: string;
  duration: number;
  rewardPoints?: number;
  requiresCode?: boolean;
};

type ExtraChallengeSettings = {
  title: string;
  duration: number;
  rewardPoints: number;
};

type SoundPreferences = {
  enabled: boolean;
  volume: number;
};

type ActiveChallenge = {
  challengeId?: string;
  mission: SavedMission;
  seconds: number;
  extensionCount: number;
  timerEndsAt?: number | null;
  challengeStartedAt?: number | null;
  pauseSeconds: number;
  pauseActive?: boolean;
  pauseStartedAt?: number | null;
  pauseResumeBlockedUntil?: number | null;
  pausedSecondsTotal?: number;
  pauseRechargeCount?: number;
  pauseEndsAt: number | null;
  timeUp: boolean;
  timeUpAt?: number | null;
  alertSeconds?: number;
  alertEndsAt?: number | null;
  graceSeconds?: number;
  graceEndsAt?: number | null;
  approvalStatus?: "gate" | "rejected";
  completionChoice?: "pending";
  running: boolean;
  updatedAt: number;
  /** Retained only to restore challenges saved by the previous pause rule. */
  pauseUsed?: boolean;
};

type ActiveChallenges = Partial<Record<ProfileId, ActiveChallenge>>;
type SyncedKingdomState = Omit<SavedState, "selectedId">;
type ProfileAccessAction = "enter" | "switch" | "parent";

type CloudStateResponse = {
  state: SyncedKingdomState;
  activeChallenges: ActiveChallenges;
  version: number;
  updatedAt: string;
};

const storageKey = "challenge-kingdom-state-v1";
const activeChallengesKey = "challenge-kingdom-active-v1";
const soundPreferencesKey = "challenge-kingdom-sound-v1";
const defaultSoundPreferences: SoundPreferences = { enabled: true, volume: 0.55 };
const mapStages = ["بوابة البيت", "غابة القراءة", "ميدان التحدي", "قلعة الحكمة"];
const totalStages = mapStages.length;
const mapTotalPoints = 120;
const mapFinishPoints = mapTotalPoints;
const pauseBudgetSeconds = 30;
const pauseResumeLockSeconds = 5;
const pauseRechargeIntervalSeconds = 5 * 60;
const pauseRechargeAmountSeconds = 30;
const timeUpAlertSeconds = 15;
const timeUpDecisionSeconds = 120;
const defaultExtraChallenge: ExtraChallengeSettings = { title: "التحدي الإضافي", duration: 10 * 60, rewardPoints: 10 };
const kingdomApiUrl = import.meta.env.VITE_KINGDOM_API_URL?.trim()
  || (import.meta.env.PROD ? "./api.php" : "/api/kingdom-state");
const kingdomApiSaveMethod = import.meta.env.PROD ? "POST" : "PUT";

function readSavedState(): SavedState {
  const fallback: SavedState = {
    selectedId: null,
    completed: { ayham: 0, kinan: 0 },
    points: { ayham: 0, kinan: 0 },
    customMissions: { ayham: [], kinan: [] },
    childRewards: { ayham: defaultChildRewards, kinan: defaultChildRewards },
    childContent: defaultChildContent,
    extraChallenge: defaultExtraChallenge,
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
      childRewards: Object.fromEntries(Object.entries({ ...fallback.childRewards, ...(parsed.childRewards ?? {}) }).map(([id, value]) => [id, normalizeChildRewards(value)])),
      childContent: normalizeChildContent(parsed.childContent),
      extraChallenge: {
        title: typeof parsed.extraChallenge?.title === "string" && parsed.extraChallenge.title.trim() ? parsed.extraChallenge.title.trim() : fallback.extraChallenge.title,
        duration: typeof parsed.extraChallenge?.duration === "number" ? parsed.extraChallenge.duration : fallback.extraChallenge.duration,
        rewardPoints: typeof parsed.extraChallenge?.rewardPoints === "number" ? parsed.extraChallenge.rewardPoints : fallback.extraChallenge.rewardPoints,
      },
    };
  } catch {
    return fallback;
  }
}

function readActiveChallenges(): ActiveChallenges {
  try {
    const raw = localStorage.getItem(activeChallengesKey);
    return raw ? (JSON.parse(raw) as ActiveChallenges) : {};
  } catch {
    return {};
  }
}

function readSoundPreferences(): SoundPreferences {
  try {
    const raw = localStorage.getItem(soundPreferencesKey);
    if (!raw) return defaultSoundPreferences;
    const parsed = JSON.parse(raw) as Partial<SoundPreferences>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaultSoundPreferences.enabled,
      volume: typeof parsed.volume === "number" ? Math.min(1, Math.max(0, parsed.volume)) : defaultSoundPreferences.volume,
    };
  } catch {
    return defaultSoundPreferences;
  }
}

function toSyncedKingdomState(state: SavedState): SyncedKingdomState {
  return {
    completed: state.completed,
    points: state.points,
    customMissions: state.customMissions,
    childRewards: state.childRewards,
    childContent: state.childContent,
    extraChallenge: state.extraChallenge,
  };
}

function isProfileRecord(value: unknown): value is Record<ProfileId, unknown> {
  return value !== null && typeof value === "object";
}

function normalizeSyncedKingdomState(value: unknown): SyncedKingdomState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SyncedKingdomState>;
   if (!isProfileRecord(candidate.completed) || !isProfileRecord(candidate.points) || !isProfileRecord(candidate.customMissions)) return null;

  return {
    completed: Object.fromEntries(Object.entries(candidate.completed).map(([id, value]) => [id, typeof value === "number" ? value : 0])),
    points: Object.fromEntries(Object.entries(candidate.points).map(([id, value]) => [id, typeof value === "number" ? value : 0])),
    customMissions: Object.fromEntries(Object.entries(candidate.customMissions).map(([id, value]) => [id, Array.isArray(value) ? value as SavedMission[] : []])),
    childRewards: Object.fromEntries(Object.entries(candidate.childRewards ?? {}).map(([id, value]) => [id, normalizeChildRewards(value)])),
    childContent: normalizeChildContent(candidate.childContent),
    extraChallenge: {
      title: typeof candidate.extraChallenge?.title === "string" && candidate.extraChallenge.title.trim() ? candidate.extraChallenge.title.trim() : defaultExtraChallenge.title,
      duration: typeof candidate.extraChallenge?.duration === "number" ? candidate.extraChallenge.duration : defaultExtraChallenge.duration,
      rewardPoints: typeof candidate.extraChallenge?.rewardPoints === "number" ? candidate.extraChallenge.rewardPoints : defaultExtraChallenge.rewardPoints,
    },
  };
}

function normalizeActiveChallenges(value: unknown): ActiveChallenges {
  return value && typeof value === "object" ? value as ActiveChallenges : {};
}

function cloudSyncSignature(state: SavedState, challenges: ActiveChallenges) {
  const stableChallenges = Object.fromEntries(
    Object.entries(challenges).map(([profileId, challenge]) => {
      if (!challenge) return [profileId, null];
      const { seconds, pauseSeconds, alertSeconds, graceSeconds, updatedAt, ...stableChallenge } = challenge;
      return [profileId, stableChallenge];
    }),
  );
  return JSON.stringify({ state: toSyncedKingdomState(state), activeChallenges: stableChallenges });
}

function missionFromSaved(savedMission: SavedMission): Mission {
  const existing = missions.find((item) => item.id === savedMission.id);
  return { ...savedMission, icon: existing?.icon ?? (savedMission.requiresCode ? KeyRound : PenLine), featured: existing?.featured };
}

function restoreActiveChallenge(challenge: ActiveChallenge | undefined) {
  if (!challenge) return null;
  const now = Date.now();
  let seconds = challenge.seconds;
  const storedPauseSeconds = typeof challenge.pauseSeconds === "number" ? challenge.pauseSeconds : (challenge.pauseUsed ? 0 : pauseBudgetSeconds);
  let pauseSeconds = storedPauseSeconds;
  if (challenge.pauseRechargeCount == null) pauseSeconds = Math.min(pauseSeconds, pauseBudgetSeconds);
  let pauseActive = challenge.pauseActive ?? Boolean(challenge.pauseEndsAt);
  let pauseStartedAt = challenge.pauseStartedAt ?? (pauseActive ? challenge.updatedAt : null);
  let pauseResumeBlockedUntil = challenge.pauseResumeBlockedUntil
    ?? (pauseActive && pauseStartedAt ? pauseStartedAt + pauseResumeLockSeconds * 1000 : null);
  let pausedSecondsTotal = challenge.pausedSecondsTotal ?? 0;
  let pauseRechargeCount = challenge.pauseRechargeCount ?? 0;
  const challengeStartedAt = challenge.challengeStartedAt ?? (challenge.running || pauseActive || challenge.timeUp ? challenge.updatedAt - Math.max(0, challenge.mission.duration - challenge.seconds) * 1000 : null);
  let pauseEndsAt = challenge.pauseEndsAt;
  let timerEndsAt = challenge.timerEndsAt ?? null;
  let running = challenge.running;
  let timeUp = challenge.timeUp;
  let timeUpAt = challenge.timeUpAt ?? null;
  let alertSeconds = challenge.alertSeconds ?? 0;
  let alertEndsAt = challenge.alertEndsAt ?? null;
  let graceSeconds = challenge.graceSeconds ?? 0;
  let graceEndsAt = challenge.graceEndsAt ?? null;

  if (!timeUp && pauseActive && pauseEndsAt) {
    if (pauseEndsAt > now) {
      pauseSeconds = Math.ceil((pauseEndsAt - now) / 1000);
      running = false;
      timerEndsAt = null;
    } else {
      const pauseEndedAt = pauseEndsAt;
      const secondsBeforePause = seconds;
      const pauseStarted = pauseStartedAt ?? pauseEndedAt - pauseSeconds * 1000;
      pausedSecondsTotal += Math.max(0, Math.floor((pauseEndedAt - pauseStarted) / 1000));
      seconds = Math.max(0, seconds - Math.floor((now - pauseEndsAt) / 1000));
      pauseSeconds = 0;
      pauseActive = false;
      pauseStartedAt = null;
      pauseResumeBlockedUntil = null;
      pauseEndsAt = null;
      timerEndsAt = pauseEndedAt + secondsBeforePause * 1000;
      running = true;
    }
  } else if (!timeUp && running) {
    if (timerEndsAt) {
      seconds = Math.max(0, Math.ceil((timerEndsAt - now) / 1000));
    } else {
      // Challenges saved before absolute deadlines were introduced still
      // recover from their last persisted tick.
      seconds = Math.max(0, seconds - Math.floor((now - challenge.updatedAt) / 1000));
      timerEndsAt = now + seconds * 1000;
    }
  }

  if (!timeUp && challengeStartedAt) {
    const pauseElapsed = pauseActive && pauseStartedAt ? Math.max(0, Math.floor((now - pauseStartedAt) / 1000)) : 0;
    const activeElapsed = Math.max(0, Math.floor((now - challengeStartedAt) / 1000) - pausedSecondsTotal - pauseElapsed);
    let allocatedActiveDuration = pauseActive || !timerEndsAt
      ? activeElapsed + seconds
      : activeElapsed + (timerEndsAt - now) / 1000;
    let newRechargeCount = pauseRechargeCount;
    while (
      (newRechargeCount + 1) * pauseRechargeIntervalSeconds <= activeElapsed &&
      (newRechargeCount + 1) * pauseRechargeIntervalSeconds < allocatedActiveDuration
    ) {
      newRechargeCount += 1;
      allocatedActiveDuration += pauseRechargeAmountSeconds;
    }
    const rechargeUnits = newRechargeCount - pauseRechargeCount;
    if (rechargeUnits > 0) {
      const rechargeSeconds = rechargeUnits * pauseRechargeAmountSeconds;
      pauseSeconds += rechargeSeconds;
      if (pauseActive) {
        seconds += rechargeSeconds;
        if (pauseEndsAt) pauseEndsAt += rechargeSeconds * 1000;
      } else if (timerEndsAt) {
        timerEndsAt += rechargeSeconds * 1000;
        seconds = Math.max(0, Math.ceil((timerEndsAt - now) / 1000));
      }
      pauseRechargeCount = newRechargeCount;
    }
  }

  if (!timeUp && !pauseActive && running) {
    running = seconds > 0;
    if (seconds === 0) {
      timeUp = true;
      timeUpAt = timerEndsAt ?? challenge.timerEndsAt ?? challenge.updatedAt + challenge.seconds * 1000;
      timerEndsAt = null;
    }
  }

  if (timeUp) {
    timeUpAt ??= challenge.updatedAt;
    alertEndsAt ??= timeUpAt + timeUpAlertSeconds * 1000;
    graceEndsAt ??= alertEndsAt + timeUpDecisionSeconds * 1000;
    if (now < alertEndsAt) {
      alertSeconds = Math.ceil((alertEndsAt - now) / 1000);
      graceSeconds = timeUpDecisionSeconds;
    } else if (now < graceEndsAt) {
      alertSeconds = 0;
      graceSeconds = Math.ceil((graceEndsAt - now) / 1000);
    } else {
      alertSeconds = 0;
      graceSeconds = 0;
    }
  } else {
    alertSeconds = 0;
    alertEndsAt = null;
    graceSeconds = 0;
    graceEndsAt = null;
    timeUpAt = null;
  }

  return {
    ...challenge,
    challengeId: challenge.challengeId ?? `legacy-${challenge.mission.id}-${challenge.updatedAt}`,
    seconds,
    timerEndsAt,
    challengeStartedAt,
    pauseSeconds,
    pauseActive,
    pauseStartedAt,
    pauseResumeBlockedUntil,
    pausedSecondsTotal,
    pauseRechargeCount,
    pauseEndsAt,
    timeUp,
    timeUpAt,
    alertSeconds,
    alertEndsAt,
    graceSeconds,
    graceEndsAt,
    running,
    updatedAt: now,
  };
}

function getInitialActiveChallenge() {
  const saved = readSavedState();
  return saved.selectedId ? restoreActiveChallenge(readActiveChallenges()[saved.selectedId]) : null;
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

function extensionDuration(originalDuration: number, extensionCount: number) {
  let duration = originalDuration;
  for (let count = 0; count < extensionCount; count += 1) {
    duration = Math.max(1, Math.round(duration * (2 / 3)));
  }
  return duration;
}

type SoundKind = "click" | "start" | "bell" | "alarm" | "success" | "failure";

let audioContext: AudioContext | null = null;
let audioMasterGain: GainNode | null = null;
let lastClickAt = 0;
let soundPreferences = readSoundPreferences();

function applySoundPreferences(preferences: SoundPreferences) {
  soundPreferences = preferences;
  if (audioContext && audioMasterGain) {
    audioMasterGain.gain.setTargetAtTime(
      preferences.enabled ? preferences.volume : 0,
      audioContext.currentTime,
      0.02,
    );
  }
}

function getAudioContext() {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContextConstructor();
    audioMasterGain = audioContext.createGain();
    audioMasterGain.gain.value = soundPreferences.enabled ? soundPreferences.volume : 0;
    audioMasterGain.connect(audioContext.destination);
  }
  return audioContext;
}

function playSound(kind: SoundKind) {
  if (!soundPreferences.enabled || soundPreferences.volume <= 0) return;
  const context = getAudioContext();
  const masterGain = audioMasterGain;
  if (!context || !masterGain) return;

  // Browsers may create Web Audio contexts in a suspended state until a
  // user gesture. Calling resume from the button event unlocks the shared
  // context on iOS Safari as well as Chromium-based browsers.
  if (context.state === "suspended") void context.resume();

  if (kind === "click") {
    const now = performance.now();
    if (now - lastClickAt < 70) return;
    lastClickAt = now;
  }

  const notes =
    kind === "click"
      ? [{ frequency: 590, delay: 0, length: 0.055 }]
      : kind === "start"
      ? [{ frequency: 392, delay: 0, length: 0.14 }, { frequency: 523, delay: 0.16, length: 0.2 }]
      : kind === "bell"
      ? [{ frequency: 880, delay: 0, length: 0.22 }, { frequency: 660, delay: 0.24, length: 0.34 }]
      : kind === "alarm"
        ? [
            ...Array.from({ length: timeUpAlertSeconds }, (_, index) => [
              { frequency: 880, delay: index, length: 0.19 },
              { frequency: 660, delay: index + 0.24, length: 0.19 },
            ]).flat(),
            { frequency: 880, delay: timeUpAlertSeconds - 0.26, length: 0.25 },
          ]
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
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + delay + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + length);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + length + 0.04);
  });
}

function getArabicDate() {
  return new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
}

function App() {
  const [saved, setSaved] = useState<SavedState>(() => readSavedState());
  const [soundPreferencesState, setSoundPreferencesState] = useState<SoundPreferences>(() => readSoundPreferences());
  const [activeChallenges, setActiveChallenges] = useState<ActiveChallenges>(() => readActiveChallenges());
  const [screen, setScreen] = useState<Screen>(() => {
    const state = readSavedState();
    const active = getInitialActiveChallenge();
    return state.selectedId ? (active ? (active.approvalStatus ? "gate" : "quest") : "home") : "choose";
  });
  const [tab, setTab] = useState<Tab>("quest");
  const [selectedId, setSelectedId] = useState<ProfileId | null>(() => readSavedState().selectedId);
  const [mission, setMission] = useState<Mission | null>(() => {
    const active = getInitialActiveChallenge();
    return active ? missionFromSaved(active.mission) : null;
  });
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(() => getInitialActiveChallenge()?.challengeId ?? null);
  const [seconds, setSeconds] = useState(() => getInitialActiveChallenge()?.seconds ?? 0);
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(() => getInitialActiveChallenge()?.timerEndsAt ?? null);
  const [timerRunning, setTimerRunning] = useState(() => getInitialActiveChallenge()?.running ?? false);
  const [timeUp, setTimeUp] = useState(() => getInitialActiveChallenge()?.timeUp ?? false);
  const [timeUpAt, setTimeUpAt] = useState<number | null>(() => getInitialActiveChallenge()?.timeUpAt ?? null);
  const [challengeStartedAt, setChallengeStartedAt] = useState<number | null>(() => getInitialActiveChallenge()?.challengeStartedAt ?? null);
  const [pauseSeconds, setPauseSeconds] = useState(() => getInitialActiveChallenge()?.pauseSeconds ?? pauseBudgetSeconds);
  const [pauseActive, setPauseActive] = useState(() => getInitialActiveChallenge()?.pauseActive ?? Boolean(getInitialActiveChallenge()?.pauseEndsAt));
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(() => getInitialActiveChallenge()?.pauseStartedAt ?? null);
  const [pauseResumeBlockedUntil, setPauseResumeBlockedUntil] = useState<number | null>(() => getInitialActiveChallenge()?.pauseResumeBlockedUntil ?? null);
  const [pausedSecondsTotal, setPausedSecondsTotal] = useState(() => getInitialActiveChallenge()?.pausedSecondsTotal ?? 0);
  const [pauseRechargeCount, setPauseRechargeCount] = useState(() => getInitialActiveChallenge()?.pauseRechargeCount ?? 0);
  const [pauseEndsAt, setPauseEndsAt] = useState<number | null>(() => getInitialActiveChallenge()?.pauseEndsAt ?? null);
  const [alertSeconds, setAlertSeconds] = useState(() => getInitialActiveChallenge()?.alertSeconds ?? 0);
  const [alertEndsAt, setAlertEndsAt] = useState<number | null>(() => getInitialActiveChallenge()?.alertEndsAt ?? null);
  const [graceSeconds, setGraceSeconds] = useState(() => getInitialActiveChallenge()?.graceSeconds ?? 0);
  const [graceEndsAt, setGraceEndsAt] = useState<number | null>(() => getInitialActiveChallenge()?.graceEndsAt ?? null);
  const [approvalStatus, setApprovalStatus] = useState<"gate" | "rejected" | null>(() => getInitialActiveChallenge()?.approvalStatus ?? null);
  const [completionChoice, setCompletionChoice] = useState<"pending" | null>(() => getInitialActiveChallenge()?.completionChoice ?? null);
  const [extensionCount, setExtensionCount] = useState(() => getInitialActiveChallenge()?.extensionCount ?? 0);
  const [finishCodeOpen, setFinishCodeOpen] = useState(false);
  const [finishCode, setFinishCode] = useState("");
  const [finishCodeError, setFinishCodeError] = useState("");
  const [profileAccessAction, setProfileAccessAction] = useState<ProfileAccessAction | null>(null);
  const [profileAccessTarget, setProfileAccessTarget] = useState<ProfileId | null>(null);
  const [profileAccessCode, setProfileAccessCode] = useState("");
  const [profileAccessError, setProfileAccessError] = useState("");
  const [lockedMission, setLockedMission] = useState<Mission | null>(null);
  const [unlockCode, setUnlockCode] = useState("");
  const [unlockCodeError, setUnlockCodeError] = useState("");
  const [extraSetupOpen, setExtraSetupOpen] = useState(false);
  const [extraSetupMinutes, setExtraSetupMinutes] = useState("");
  const [extraSetupPoints, setExtraSetupPoints] = useState("");
  const [extraSetupError, setExtraSetupError] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const memberTokenRef = useRef<string | null>(null);
  const memberRoleRef = useRef<"owner" | "child" | null>(null);
  const [memberToken, setMemberToken] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"needs-code" | "connecting" | "synced" | "offline">("needs-code");
  const [answerResult, setAnswerResult] = useState<"yes" | "no" | null>(() => {
    const active = getInitialActiveChallenge();
    return active?.approvalStatus === "rejected" ? "no" : active?.completionChoice === "pending" ? "yes" : null;
  });
  const [pointResult, setPointResult] = useState<{ earned: number; earlyBonus: number; deduction: number; bonus: number; total: number; extensions: number } | null>(null);
  const timerWasRunningRef = useRef(timerRunning);
  const timeUpAnnouncedRef = useRef(timeUp);
  const pauseBellPlayedRef = useRef(false);
  const cloudVersionRef = useRef<number | null>(null);
  const cloudReadyRef = useRef(false);
  const skipCloudSaveRef = useRef(false);
  const lastCloudSignatureRef = useRef<string | null>(null);
  const cloudSaveInFlightRef = useRef(false);
  const pendingCloudSaveRef = useRef(false);
  const completedProfileIdRef = useRef<ProfileId | null>(null);
  const completedChallengeIdRef = useRef<string | null>(null);
  const completionBasePointsRef = useRef<number | null>(null);
  const completionBaseCompletedRef = useRef<number | null>(null);
  const completionPointsDeltaRef = useRef<number | null>(null);
  const completionCompletedDeltaRef = useRef<number | null>(null);
  const savedRef = useRef(saved);
  const activeChallengesRef = useRef(activeChallenges);

  const availableProfiles = useMemo<Profile[]>(() => familyMembers.filter((member) => member.role === "child").map((member) => {
    const visual = profiles.find((item) => item.id === member.id || item.name === member.name);
    return visual ? { ...visual, ...member, id: member.id, grade: member.grade || visual.grade, title: member.title || visual.title, quote: member.quote || visual.quote, color: member.color || visual.color }
      : { id: member.id, name: member.name, grade: member.grade || "بطل المملكة", title: member.title || "مستكشف جديد", quote: member.quote || "كل خطوة صغيرة تقود إلى كنز جديد.", initials: member.name.slice(0, 1), photo: "", color: member.color || "#5a78b5", icon: Shield, level: 1, xp: 0, streak: 0 };
  }), [familyMembers]);
  const owner = useMemo(() => familyMembers.find((member) => member.role === "owner") ?? null, [familyMembers]);
  const profile = useMemo(() => availableProfiles.find((item) => item.id === selectedId) ?? null, [availableProfiles, selectedId]);
  const completed = profile ? (saved.completed[profile.id] ?? 0) : 0;
  const points = profile ? (saved.points[profile.id] ?? 0) : 0;
  const profileMissions = useMemo(
    () => [
      ...missions,
      ...(selectedId ? (saved.customMissions[selectedId] ?? []).map((item) => ({ ...item, icon: PenLine })) : []),
      {
        id: "extra-challenge",
        title: saved.extraChallenge.title,
        description: "تحدٍ خاص يفتحه ولي الأمر بالرمز، ومكافأته يحددها القائد.",
        duration: saved.extraChallenge.duration,
        rewardPoints: saved.extraChallenge.rewardPoints,
        requiresCode: true,
        icon: KeyRound,
      },
    ],
    [saved.customMissions, saved.extraChallenge, selectedId],
  );

  const applyActiveChallenge = useCallback((active: ActiveChallenge | null) => {
    setMission(active ? missionFromSaved(active.mission) : null);
    setActiveChallengeId(active?.challengeId ?? null);
    setSeconds(active?.seconds ?? 0);
    setTimerEndsAt(active?.timerEndsAt ?? null);
    setTimerRunning(active?.running ?? false);
    setTimeUp(active?.timeUp ?? false);
    setTimeUpAt(active?.timeUpAt ?? null);
    setChallengeStartedAt(active?.challengeStartedAt ?? null);
    setPauseSeconds(active?.pauseSeconds ?? pauseBudgetSeconds);
    setPauseActive(active?.pauseActive ?? Boolean(active?.pauseEndsAt));
    setPauseStartedAt(active?.pauseStartedAt ?? null);
    setPauseResumeBlockedUntil(
      active?.pauseResumeBlockedUntil
      ?? (active?.pauseActive && active.pauseStartedAt
        ? active.pauseStartedAt + pauseResumeLockSeconds * 1000
        : null),
    );
    setPausedSecondsTotal(active?.pausedSecondsTotal ?? 0);
    setPauseRechargeCount(active?.pauseRechargeCount ?? 0);
    setPauseEndsAt(active?.pauseEndsAt ?? null);
    setAlertSeconds(active?.alertSeconds ?? 0);
    setAlertEndsAt(active?.alertEndsAt ?? null);
    setGraceSeconds(active?.graceSeconds ?? 0);
    setGraceEndsAt(active?.graceEndsAt ?? null);
    setApprovalStatus(active?.approvalStatus ?? null);
    setCompletionChoice(active?.completionChoice ?? null);
    setAnswerResult(active?.approvalStatus === "rejected" ? "no" : active?.completionChoice === "pending" ? "yes" : null);
    setExtensionCount(active?.extensionCount ?? 0);
    timerWasRunningRef.current = active?.running ?? false;
    timeUpAnnouncedRef.current = active?.timeUp ?? false;
    pauseBellPlayedRef.current = false;
  }, []);

  const cancelTimedOutMission = useCallback(() => {
    if (!profile || !selectedId) return;
    setTimerRunning(false);
    setTimerEndsAt(null);
    setMission(null);
    setTimeUp(false);
    setTimeUpAt(null);
    setAlertSeconds(0);
    setAlertEndsAt(null);
    setGraceSeconds(0);
    setGraceEndsAt(null);
    setPauseActive(false);
    setPauseEndsAt(null);
    setPauseResumeBlockedUntil(null);
    setApprovalStatus(null);
    setCompletionChoice(null);
    setFinishCodeOpen(false);
    setAnswerResult("no");
    setSaved((currentSaved) => ({
      ...currentSaved,
      points: { ...currentSaved.points, [profile.id]: currentSaved.points[profile.id] - 2 },
    }));
    setActiveChallenges((currentChallenges) => {
      const next = { ...currentChallenges };
      delete next[selectedId];
      return next;
    });
    setScreen("home");
    playSound("failure");
  }, [profile, selectedId]);

  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    activeChallengesRef.current = activeChallenges;
  }, [activeChallenges]);

  const applyCloudState = useCallback((response: CloudStateResponse) => {
    const remoteState = normalizeSyncedKingdomState(response.state);
    if (!remoteState || !Number.isFinite(response.version) || response.version < 1) {
      throw new Error("Received an invalid shared kingdom state.");
    }

    const remoteChallenges = normalizeActiveChallenges(response.activeChallenges);
    cloudVersionRef.current = response.version;
    lastCloudSignatureRef.current = cloudSyncSignature(
      { ...remoteState, selectedId: null },
      remoteChallenges,
    );
    skipCloudSaveRef.current = true;
    setSaved((current) => ({ ...remoteState, selectedId: current.selectedId }));
    setActiveChallenges(remoteChallenges);

    if (!selectedId) return;
    const active = restoreActiveChallenge(remoteChallenges[selectedId]);
    applyActiveChallenge(active);
    setScreen((current) => {
      if (active) return active.approvalStatus ? "gate" : "quest";
      return current === "quest" || current === "gate" ? "home" : current;
    });
  }, [applyActiveChallenge, selectedId]);

  const pullCloudState = useCallback(async (force = false, apply = true) => {
    if (!familyCode || !memberTokenRef.current) return "missing" as const;
    try {
      const response = await fetch(kingdomApiUrl, {
        headers: { "x-family-code": familyCode, Authorization: `Bearer ${memberTokenRef.current}` },
        cache: "no-store",
      });
      if (response.status === 404) return "missing" as const;
      if (!response.ok) throw new Error(`Cloud request failed with ${response.status}.`);

      const payload = await response.json() as CloudStateResponse;
      if (apply && (force || payload.version > (cloudVersionRef.current ?? 0))) {
        applyCloudState(payload);
      } else {
        cloudVersionRef.current = Math.max(cloudVersionRef.current ?? 0, payload.version);
      }
      setSyncStatus("synced");
      return "found" as const;
    } catch {
      setSyncStatus("offline");
      return "offline" as const;
    }
  }, [applyCloudState, familyCode]);

  const saveCloudState = useCallback(async (keepalive = false) => {
    if (!familyCode || !memberTokenRef.current || !cloudReadyRef.current) return;
    if (cloudSaveInFlightRef.current) {
      pendingCloudSaveRef.current = true;
      return;
    }

    cloudSaveInFlightRef.current = true;
    let completionConflictRetried = false;
    try {
      do {
        pendingCloudSaveRef.current = false;
        const isChildInitialState = memberRoleRef.current === "child" && cloudVersionRef.current === null && selectedId;
        const stateForSave = isChildInitialState
          ? {
              completed: { [selectedId]: savedRef.current.completed[selectedId] ?? 0 },
              points: { [selectedId]: savedRef.current.points[selectedId] ?? 0 },
              customMissions: { [selectedId]: savedRef.current.customMissions[selectedId] ?? [] },
              childRewards: { [selectedId]: savedRef.current.childRewards[selectedId] ?? defaultChildRewards },
              extraChallenge: {},
            }
          : toSyncedKingdomState(savedRef.current);
        const challengesForSave = isChildInitialState
          ? (activeChallengesRef.current[selectedId] ? { [selectedId]: activeChallengesRef.current[selectedId] } : {})
          : activeChallengesRef.current;
        const response = await fetch(kingdomApiUrl, {
          method: kingdomApiSaveMethod,
          headers: {
            "Content-Type": "application/json",
            "x-family-code": familyCode,
            Authorization: `Bearer ${memberTokenRef.current}`,
          },
          body: JSON.stringify({
            state: stateForSave,
            activeChallenges: challengesForSave,
            version: cloudVersionRef.current,
            completedProfileId: completedProfileIdRef.current ?? undefined,
            completedChallengeId: completedChallengeIdRef.current ?? undefined,
            completionBasePoints: completionBasePointsRef.current ?? undefined,
            completionBaseCompleted: completionBaseCompletedRef.current ?? undefined,
            completionPointsDelta: completionPointsDeltaRef.current ?? undefined,
            completionCompletedDelta: completionCompletedDeltaRef.current ?? undefined,
          }),
          cache: "no-store",
          keepalive,
        });

        if (response.status === 409) {
          if (completedProfileIdRef.current) {
            if (!completionConflictRetried) {
              completionConflictRetried = true;
              await pullCloudState(false, false);
              pendingCloudSaveRef.current = true;
              continue;
            }
            completedProfileIdRef.current = null;
            completedChallengeIdRef.current = null;
            completionBasePointsRef.current = null;
            completionBaseCompletedRef.current = null;
            completionPointsDeltaRef.current = null;
            completionCompletedDeltaRef.current = null;
            await pullCloudState(true);
            return;
          }
          await pullCloudState();
          return;
        }
        if (!response.ok) throw new Error(`Cloud save failed with ${response.status}.`);

        const payload = await response.json() as CloudStateResponse;
        cloudVersionRef.current = payload.version;
        if (completedProfileIdRef.current && !payload.activeChallenges[completedProfileIdRef.current]) {
          completedProfileIdRef.current = null;
          completedChallengeIdRef.current = null;
          completionBasePointsRef.current = null;
          completionBaseCompletedRef.current = null;
          completionPointsDeltaRef.current = null;
          completionCompletedDeltaRef.current = null;
        }
        setSyncStatus("synced");
      } while (pendingCloudSaveRef.current);
    } catch {
      setSyncStatus("offline");
    } finally {
      cloudSaveInFlightRef.current = false;
    }
  }, [familyCode, pullCloudState]);

  useEffect(() => {
    if (!familyCode || !memberToken) {
      cloudReadyRef.current = false;
      lastCloudSignatureRef.current = null;
      return;
    }

    let cancelled = false;
    cloudReadyRef.current = false;
    setSyncStatus("connecting");
    void (async () => {
      const result = await pullCloudState(true);
      if (cancelled) return;
      cloudReadyRef.current = true;
      if (result === "missing") {
        await saveCloudState();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [familyCode, memberToken]);

  useEffect(() => {
    if (!familyCode) { setFamilyMembers([]); return; }
    let cancelled = false;
    setMembersLoading(true); setMembersError("");
    void accountsApi.familyMembers(familyCode).then((result) => {
      if (!cancelled) {
        setFamilyMembers(result.members);
        setSaved((current) => {
           const next = { ...current, completed: { ...current.completed }, points: { ...current.points }, customMissions: { ...current.customMissions }, childRewards: { ...current.childRewards } };
          result.members.filter((member) => member.role === "child").forEach((member) => {
            next.completed[member.id] ??= 0;
            next.points[member.id] ??= 0;
            next.customMissions[member.id] ??= [];
             next.childRewards[member.id] ??= defaultChildRewards;
          });
          return next;
        });
        setSelectedId((current) => result.members.some((member) => member.id === current && member.role === "child") ? current : null);
      }
    }).catch((cause) => {
      if (!cancelled) setMembersError(cause instanceof Error ? cause.message : "تعذر تحميل ملفات العائلة.");
    }).finally(() => { if (!cancelled) setMembersLoading(false); });
    return () => { cancelled = true; };
  }, [familyCode]);

  useEffect(() => {
    if (!familyCode || !memberToken || !cloudReadyRef.current) return;
    const signature = cloudSyncSignature(saved, activeChallenges);
    if (skipCloudSaveRef.current) {
      skipCloudSaveRef.current = false;
      lastCloudSignatureRef.current = signature;
      return;
    }
    if (signature === lastCloudSignatureRef.current) return;
    lastCloudSignatureRef.current = signature;
    const timeout = window.setTimeout(() => {
      void saveCloudState();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [activeChallenges, familyCode, memberToken, saved, saveCloudState]);

  useEffect(() => {
    if (!familyCode || !memberToken) return;
    const poll = () => {
      if (!document.hidden) void pullCloudState();
    };
    const interval = window.setInterval(poll, 4000);
    window.addEventListener("focus", poll);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", poll);
    };
  }, [familyCode, memberToken, pullCloudState]);

  useEffect(() => {
    if (!familyCode || !memberToken) return;
    const persistBeforeExit = () => {
      void saveCloudState(true);
    };
    window.addEventListener("pagehide", persistBeforeExit);
    return () => window.removeEventListener("pagehide", persistBeforeExit);
  }, [familyCode, memberToken, saveCloudState]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ ...saved, selectedId }));
  }, [saved, selectedId]);

  useEffect(() => {
    localStorage.setItem(soundPreferencesKey, JSON.stringify(soundPreferencesState));
    applySoundPreferences(soundPreferencesState);
  }, [soundPreferencesState]);

  useEffect(() => {
    localStorage.setItem(activeChallengesKey, JSON.stringify(activeChallenges));
  }, [activeChallenges]);

  const updateSoundPreferences = (next: SoundPreferences) => {
    setSoundPreferencesState(next);
    applySoundPreferences(next);
  };

  const connectFamily = async (code: string) => {
    const normalizedCode = code.trim();
    await accountsApi.bootstrapFamily(normalizedCode);
    memberTokenRef.current = null;
    memberRoleRef.current = null;
    setMemberToken(null);
    cloudVersionRef.current = null;
    cloudReadyRef.current = false;
    lastCloudSignatureRef.current = null;
    setFamilyCode(normalizedCode);
    setSyncStatus("connecting");
  };

  useEffect(() => {
    const playButtonClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>("button:not(:disabled)");
      if (button && !button.dataset.sound) playSound("click");
    };
    document.addEventListener("click", playButtonClick, true);
    return () => document.removeEventListener("click", playButtonClick, true);
  }, []);

  useEffect(() => {
    if (!timerRunning || !timerEndsAt || timeUp) return;
    timerWasRunningRef.current = true;
    const tick = () => {
      const now = Date.now();
      let effectiveTimerEndsAt = timerEndsAt;
      const remainingBeforeRecharge = Math.max(0, Math.ceil((timerEndsAt - now) / 1000));
      if (challengeStartedAt && remainingBeforeRecharge > 0) {
        const activeElapsed = Math.max(0, Math.floor((now - challengeStartedAt) / 1000) - pausedSecondsTotal);
        const earnedRechargeCount = Math.floor(activeElapsed / pauseRechargeIntervalSeconds);
        const rechargeUnits = Math.max(0, earnedRechargeCount - pauseRechargeCount);
        if (rechargeUnits > 0) {
          const rechargeSeconds = rechargeUnits * pauseRechargeAmountSeconds;
          effectiveTimerEndsAt += rechargeSeconds * 1000;
          setTimerEndsAt(effectiveTimerEndsAt);
          setPauseSeconds((current) => current + rechargeSeconds);
          setPauseRechargeCount(earnedRechargeCount);
        }
      }
      const remaining = Math.max(0, Math.ceil((effectiveTimerEndsAt - now) / 1000));
      setSeconds((current) => current === remaining ? current : remaining);
      if (remaining === 0) setTimerRunning(false);
    };
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [challengeStartedAt, pauseRechargeCount, pausedSecondsTotal, timeUp, timerEndsAt, timerRunning]);

  useEffect(() => {
    if (!mission || timerRunning || seconds !== 0 || timeUp || !timerWasRunningRef.current || timeUpAnnouncedRef.current) return;
    timerWasRunningRef.current = false;
    timeUpAnnouncedRef.current = true;
    const endedAt = timerEndsAt ?? Date.now();
    const nextAlertEndsAt = endedAt + timeUpAlertSeconds * 1000;
    const nextGraceEndsAt = nextAlertEndsAt + timeUpDecisionSeconds * 1000;
    const now = Date.now();
    setTimerEndsAt(null);
    setTimeUp(true);
    setTimeUpAt(endedAt);
    setAlertEndsAt(nextAlertEndsAt);
    setAlertSeconds(Math.max(0, Math.ceil((nextAlertEndsAt - now) / 1000)));
    setGraceEndsAt(nextGraceEndsAt);
    setGraceSeconds(now < nextAlertEndsAt ? timeUpDecisionSeconds : Math.max(0, Math.ceil((nextGraceEndsAt - now) / 1000)));
    if (now < nextAlertEndsAt) playSound("alarm");
  }, [mission, seconds, timeUp, timerEndsAt, timerRunning]);

  useEffect(() => {
    if (!pauseActive || !pauseEndsAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((pauseEndsAt - Date.now()) / 1000));
      setPauseSeconds((current) => current === remaining ? current : remaining);
      if (remaining === 0) {
        const resumedTimerEndsAt = pauseEndsAt + seconds * 1000;
        const pauseStarted = pauseStartedAt ?? pauseEndsAt - pauseBudgetSeconds * 1000;
        timerWasRunningRef.current = true;
        setPausedSecondsTotal((current) => current + Math.max(0, Math.floor((pauseEndsAt - pauseStarted) / 1000)));
        setPauseActive(false);
        setPauseStartedAt(null);
        setPauseResumeBlockedUntil(null);
        setPauseEndsAt(null);
        setTimerEndsAt(resumedTimerEndsAt);
        setTimerRunning(true);
      }
    };
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [pauseActive, pauseEndsAt, pauseSeconds, pauseStartedAt, seconds]);

  useEffect(() => {
    if (!pauseActive) {
      pauseBellPlayedRef.current = false;
      return;
    }
    if (pauseSeconds === 5 && !pauseBellPlayedRef.current) {
      pauseBellPlayedRef.current = true;
      playSound("bell");
    }
  }, [pauseActive, pauseSeconds]);

  useEffect(() => {
    if (!timeUp || !alertEndsAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((alertEndsAt - Date.now()) / 1000));
      setAlertSeconds((current) => current === remaining ? current : remaining);
    };
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [alertEndsAt, timeUp]);

  useEffect(() => {
    if (!timeUp || alertSeconds > 0 || !graceEndsAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((graceEndsAt - Date.now()) / 1000));
      setGraceSeconds((current) => current === remaining ? current : remaining);
      if (remaining === 0) cancelTimedOutMission();
    };
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [alertSeconds, cancelTimedOutMission, graceEndsAt, timeUp]);

  useEffect(() => {
    if (!selectedId || !mission) return;
    const persisted: ActiveChallenge = {
      challengeId: activeChallengeId ?? `legacy-${mission.id}-${Date.now()}`,
      mission: { id: mission.id, title: mission.title, description: mission.description, duration: mission.duration, rewardPoints: mission.rewardPoints, requiresCode: mission.requiresCode },
      seconds,
      extensionCount,
      timerEndsAt,
      challengeStartedAt,
      pauseSeconds,
      pauseActive,
      pauseStartedAt,
      pauseResumeBlockedUntil,
      pausedSecondsTotal,
      pauseRechargeCount,
      pauseEndsAt,
      timeUp,
      timeUpAt,
      alertSeconds,
      alertEndsAt,
      graceSeconds,
      graceEndsAt,
      approvalStatus: approvalStatus ?? undefined,
      completionChoice: completionChoice ?? undefined,
      running: timerRunning,
      updatedAt: Date.now(),
    };
    setActiveChallenges((current) => {
      const next = { ...current, [selectedId]: persisted };
      activeChallengesRef.current = next;
      return next;
    });
  }, [selectedId, activeChallengeId, mission, seconds, extensionCount, timerEndsAt, challengeStartedAt, pauseSeconds, pauseActive, pauseStartedAt, pauseResumeBlockedUntil, pausedSecondsTotal, pauseRechargeCount, pauseEndsAt, timeUp, timeUpAt, alertSeconds, alertEndsAt, graceSeconds, graceEndsAt, approvalStatus, completionChoice, timerRunning]);

  useEffect(() => {
    const reconcileFromClock = () => {
      if (!selectedId) return;
      const active = restoreActiveChallenge(activeChallengesRef.current[selectedId]);
      if (!active) return;
      const nextChallenges = { ...activeChallengesRef.current, [selectedId]: active };
      activeChallengesRef.current = nextChallenges;
      setActiveChallenges(nextChallenges);
      applyActiveChallenge(active);
      if (active.approvalStatus) setScreen("gate");
    };
    const onVisibilityChange = () => {
      if (!document.hidden) reconcileFromClock();
    };
    window.addEventListener("focus", reconcileFromClock);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", reconcileFromClock);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [applyActiveChallenge, selectedId]);

  const chooseProfile = (id: ProfileId) => {
    const active = restoreActiveChallenge(activeChallenges[id]);
    setSelectedId(id);
    setLockedMission(null);
    setUnlockCode("");
    setUnlockCodeError("");
    setTab("quest");
    setScreen(active ? (active.approvalStatus ? "gate" : "quest") : "home");
    setFinishCodeOpen(false);
    applyActiveChallenge(active);
  };

  const requestProfileAccess = (action: ProfileAccessAction, target: ProfileId | null = null) => {
    if (action === "enter") {
      memberTokenRef.current = null;
      memberRoleRef.current = null;
      setMemberToken(null);
      cloudReadyRef.current = false;
    }
    setProfileAccessAction(action);
    setProfileAccessTarget(target);
    setProfileAccessCode("");
    setProfileAccessError("");
  };

  const cancelProfileAccess = () => {
    setProfileAccessAction(null);
    setProfileAccessTarget(null);
    setProfileAccessCode("");
    setProfileAccessError("");
  };

  const verifyProfileAccess = async () => {
    const action = profileAccessAction;
    const target = profileAccessTarget;
    const member = action === "enter" && target ? familyMembers.find((item) => item.id === target && item.role === "child") : owner;
    if (!member) { setProfileAccessError(action === "enter" ? "هذا الملف غير متاح." : "أضف ولي أمر من لوحة الإدارة أولاً."); return; }
    try {
      const session = await accountsApi.verifyMember(familyCode, member.id, profileAccessCode, action === "enter" ? "child" : "owner");
      memberTokenRef.current = session.token;
      memberRoleRef.current = session.role;
      setMemberToken(session.token);
      cancelProfileAccess();
      if (action === "enter" && target) chooseProfile(target);
      else if (action === "switch") {
        setScreen("choose");
        memberTokenRef.current = null;
        memberRoleRef.current = null;
        setMemberToken(null);
        cloudReadyRef.current = false;
      }
      else if (action === "parent") { setTab("parent"); setScreen("home"); }
      if (action !== "switch") void pullCloudState(true);
    } catch {
      setProfileAccessCode(""); setProfileAccessError("الرمز غير صحيح. حاول مرة أخرى.");
    }
  };

  const startMission = (nextMission: Mission) => {
    if (mission && !pointResult) {
      if (mission.id === nextMission.id) {
        playSound("click");
        setScreen("quest");
      }
      return;
    }
    setMission(nextMission);
    setActiveChallengeId(crypto.randomUUID());
    setSeconds(nextMission.duration);
    setTimerEndsAt(null);
    setTimerRunning(false);
    setTimeUp(false);
    setTimeUpAt(null);
    setChallengeStartedAt(null);
    setFinishCodeOpen(false);
    setFinishCode("");
    setFinishCodeError("");
    setAnswerResult(null);
    setPointResult(null);
    setPauseSeconds(pauseBudgetSeconds);
    setPauseActive(false);
    setPauseStartedAt(null);
    setPauseResumeBlockedUntil(null);
    setPausedSecondsTotal(0);
    setPauseRechargeCount(0);
    setPauseEndsAt(null);
    setAlertSeconds(0);
    setAlertEndsAt(null);
    setGraceSeconds(0);
    setGraceEndsAt(null);
    setApprovalStatus(null);
    setCompletionChoice(null);
    setExtensionCount(0);
    timerWasRunningRef.current = false;
    timeUpAnnouncedRef.current = false;
    pauseBellPlayedRef.current = false;
    playSound("start");
    setScreen("quest");
  };

  const requestMissionStart = (nextMission: Mission) => {
    if (!nextMission.requiresCode) {
      startMission(nextMission);
      return;
    }
    setLockedMission(nextMission);
    setUnlockCode("");
    setUnlockCodeError("");
  };

  const unlockExtraChallenge = async () => {
    if (!lockedMission) return;
    if (!owner) { setUnlockCodeError("أضف ولي أمر من لوحة الإدارة أولاً."); return; }
    try {
      const session = await accountsApi.verifyMember(familyCode, owner.id, unlockCode, "owner");
      memberTokenRef.current = session.token; setMemberToken(session.token);
      memberRoleRef.current = session.role;
      void pullCloudState(true);
    } catch { setUnlockCode(""); setUnlockCodeError("الرمز غير صحيح. اطلب مساعدة ولي الأمر."); return; }
    const nextMission = lockedMission;
    setUnlockCode("");
    setUnlockCodeError("");
    setExtraSetupMinutes(String(Math.max(1, Math.round(nextMission.duration / 60))));
    setExtraSetupPoints(String(nextMission.rewardPoints ?? defaultExtraChallenge.rewardPoints));
    setExtraSetupError("");
    setExtraSetupOpen(true);
  };

  const startCustomizedExtraChallenge = () => {
    if (!lockedMission) return;
    const minutes = Number(extraSetupMinutes);
    const rewardPoints = Number(extraSetupPoints);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
      setExtraSetupError("اختر مدة بين دقيقة واحدة وساعتين.");
      return;
    }
    if (!Number.isInteger(rewardPoints) || rewardPoints < 1 || rewardPoints > 50) {
      setExtraSetupError("اختر مكافأة بين نقطة واحدة و50 نقطة.");
      return;
    }
    const nextMission = { ...lockedMission, duration: minutes * 60, rewardPoints };
    setLockedMission(null);
    setExtraSetupOpen(false);
    setExtraSetupError("");
    startMission(nextMission);
  };

  const cancelExtraChallengeUnlock = () => {
    setLockedMission(null);
    setUnlockCode("");
    setUnlockCodeError("");
    setExtraSetupOpen(false);
    setExtraSetupError("");
  };

  const startTimer = () => {
    if (!mission || seconds <= 0 || timeUp) return;
    const now = Date.now();
    timerWasRunningRef.current = true;
    setChallengeStartedAt((current) => current ?? now);
    setTimerEndsAt(now + seconds * 1000);
    setTimerRunning(true);
  };

  const extendMission = () => {
    if (!mission || alertSeconds > 0 || graceSeconds <= 0) return;
    const nextCount = extensionCount + 1;
    const nextSeconds = extensionDuration(mission.duration, nextCount);
    setSeconds(nextSeconds);
    setTimerEndsAt(Date.now() + nextSeconds * 1000);
    setTimeUp(false);
    setTimeUpAt(null);
    setFinishCodeOpen(false);
    setFinishCode("");
    setFinishCodeError("");
    setExtensionCount(nextCount);
    setAlertSeconds(0);
    setAlertEndsAt(null);
    setGraceSeconds(0);
    setGraceEndsAt(null);
    setCompletionChoice(null);
    setTimerRunning(true);
    timerWasRunningRef.current = true;
    timeUpAnnouncedRef.current = false;
  };

  const pauseMission = () => {
    if (!mission || !timerRunning || pauseSeconds <= 0 || timeUp) return;
    const now = Date.now();
    timerWasRunningRef.current = false;
    setTimerRunning(false);
    setTimerEndsAt(null);
    setPauseActive(true);
    setPauseStartedAt(now);
    setPauseResumeBlockedUntil(now + pauseResumeLockSeconds * 1000);
    setPauseEndsAt(now + pauseSeconds * 1000);
  };

  const resumeMission = () => {
    if (!mission || !pauseActive || seconds <= 0) return;
    const now = Date.now();
    if (pauseResumeBlockedUntil && now < pauseResumeBlockedUntil) return;
    const pauseDeadline = pauseEndsAt ?? now;
    const pauseStarted = pauseStartedAt ?? Math.min(now, pauseDeadline - pauseBudgetSeconds * 1000);
    const pauseFinishedAt = Math.min(now, pauseDeadline);
    timerWasRunningRef.current = true;
    setPauseActive(false);
    setPauseStartedAt(null);
    setPauseResumeBlockedUntil(null);
    setPausedSecondsTotal((current) => current + Math.max(0, Math.floor((pauseFinishedAt - pauseStarted) / 1000)));
    setPauseEndsAt(null);
    setTimerEndsAt(pauseDeadline <= now ? pauseDeadline + seconds * 1000 : now + seconds * 1000);
    setTimerRunning(true);
  };

  const verifyFinishCode = async () => {
    if (timeUp && (alertSeconds > 0 || graceSeconds <= 0)) return;
    if (!owner) { setFinishCodeError("أضف ولي أمر من لوحة الإدارة أولاً."); return; }
    try {
      const session = await accountsApi.verifyMember(familyCode, owner.id, finishCode, "owner");
      memberTokenRef.current = session.token; setMemberToken(session.token);
      memberRoleRef.current = session.role;
      void pullCloudState(true);
    } catch { setFinishCode(""); setFinishCodeError("الرمز غير صحيح. حاول مرة أخرى."); return; }
    setTimerRunning(false);
    setTimerEndsAt(null);
    setPauseActive(false);
    setPauseEndsAt(null);
     setPauseResumeBlockedUntil(null);
    setFinishCodeError("");
    setFinishCodeOpen(false);
    setAnswerResult(null);
    setCompletionChoice(null);
    setApprovalStatus("gate");
    setScreen("gate");
  };

  const openEarlyFinishCode = () => {
    if (!mission || timeUp || alertSeconds > 0) return;
    if (!timerRunning) startTimer();
    setPauseActive(false);
     setPauseResumeBlockedUntil(null);
    setPauseEndsAt(null);
    setFinishCodeOpen(true);
    setFinishCode("");
    setFinishCodeError("");
  };

  const closeFinishCode = () => {
    setFinishCodeOpen(false);
    setFinishCode("");
    setFinishCodeError("");
  };

  const completeMission = (deduction: 0 | 2 | 4 | 6) => {
    if (!profile || !mission) return;
    playSound("success");
    const baseEarned = mission.rewardPoints ?? pointsForExtensions(extensionCount);
    const earlyBonus = !timeUp && seconds > 0 ? 2 : 0;
    const earned = Math.max(0, baseEarned + earlyBonus - deduction);
    const currentPoints = saved.points[profile.id];
    const rawTotal = currentPoints + earned;
    const bonus = 0;
    const total = rawTotal;
    setPointResult({ earned, earlyBonus, deduction, bonus, total, extensions: extensionCount });
    const completedState: SavedState = {
      ...saved,
      completed: { ...saved.completed, [profile.id]: Math.min(totalStages, saved.completed[profile.id] + 1) },
      points: { ...saved.points, [profile.id]: total },
      childRewards: {
        ...saved.childRewards,
        [profile.id]: {
          ...(saved.childRewards[profile.id] ?? defaultChildRewards),
          lifetimePoints: (saved.childRewards[profile.id]?.lifetimePoints ?? currentPoints) + earned,
        },
      },
    };
    const completedChallenges = { ...activeChallenges };
    delete completedChallenges[profile.id];
    completedProfileIdRef.current = profile.id;
    completedChallengeIdRef.current = activeChallengeId;
    completionBasePointsRef.current = currentPoints;
    completionBaseCompletedRef.current = saved.completed[profile.id];
    completionPointsDeltaRef.current = total - currentPoints;
    completionCompletedDeltaRef.current = completedState.completed[profile.id] - saved.completed[profile.id];
    savedRef.current = completedState;
    activeChallengesRef.current = completedChallenges;
    lastCloudSignatureRef.current = cloudSyncSignature(completedState, completedChallenges);
    setSaved(completedState);
    setActiveChallenges(completedChallenges);
    setMission(null);
    setActiveChallengeId(null);
    setTimerRunning(false);
    setTimerEndsAt(null);
    setTimeUpAt(null);
    setChallengeStartedAt(null);
    setPauseActive(false);
    setPauseStartedAt(null);
     setPauseResumeBlockedUntil(null);
    setPausedSecondsTotal(0);
    setPauseRechargeCount(0);
    setPauseEndsAt(null);
    setAlertSeconds(0);
    setAlertEndsAt(null);
    setGraceSeconds(0);
    setGraceEndsAt(null);
    setApprovalStatus(null);
    setCompletionChoice(null);
    setScreen("reward");
    void saveCloudState();
  };

  const answerMission = (answer: "yes" | "no") => {
    if (!profile) return;
    if (answer === "yes") {
      setAnswerResult("yes");
      if (timeUp) {
        setCompletionChoice("pending");
        setGraceSeconds(0);
        setGraceEndsAt(null);
        return;
      }
      completeMission(0);
      return;
    }
    playSound("failure");
    setAnswerResult("no");
    setCompletionChoice(null);
    setApprovalStatus("rejected");
  };

  const cancelUnfinishedMission = (withPenalty: boolean) => {
    if (!profile) return;
    if (withPenalty) {
      setSaved((current) => ({
        ...current,
        points: { ...current.points, [profile.id]: current.points[profile.id] - 2 },
      }));
    }
    newChallenge();
  };

  const newChallenge = () => {
    setMission(null);
    setActiveChallengeId(null);
    setLockedMission(null);
    setUnlockCode("");
    setUnlockCodeError("");
    setPointResult(null);
    setTimerRunning(false);
    setTimerEndsAt(null);
    setTimeUp(false);
    setTimeUpAt(null);
    setChallengeStartedAt(null);
    setFinishCodeOpen(false);
    setFinishCode("");
    setFinishCodeError("");
    setAnswerResult(null);
    setPauseSeconds(pauseBudgetSeconds);
    setPauseActive(false);
    setPauseStartedAt(null);
     setPauseResumeBlockedUntil(null);
    setPausedSecondsTotal(0);
    setPauseRechargeCount(0);
    setPauseEndsAt(null);
    setAlertSeconds(0);
    setAlertEndsAt(null);
    setGraceSeconds(0);
    setGraceEndsAt(null);
    setApprovalStatus(null);
    setCompletionChoice(null);
    setExtensionCount(0);
    timerWasRunningRef.current = false;
    timeUpAnnouncedRef.current = false;
    pauseBellPlayedRef.current = false;
    if (selectedId) {
      setActiveChallenges((current) => {
        const next = { ...current };
        delete next[selectedId];
        return next;
      });
    }
    setScreen("home");
    setTab("quest");
  };

  const leaveMission = () => {
    setScreen("home");
    setTab("quest");
  };

  const returnToQuest = () => {
    setTab("quest");
    setScreen(mission && !pointResult ? (approvalStatus ? "gate" : "quest") : "home");
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

  const saveExtraChallenge = (title: string, durationMinutes: number, rewardPoints: number) => {
    setSaved((current) => ({
      ...current,
      extraChallenge: { title, duration: durationMinutes * 60, rewardPoints },
    }));
  };

  const awardExtraPoints = (amount: number) => {
    if (!profile || !Number.isFinite(amount) || amount <= 0) return;
    setSaved((current) => ({
      ...current,
      points: { ...current.points, [profile.id]: (current.points[profile.id] ?? 0) + Math.floor(amount) },
      childRewards: {
        ...current.childRewards,
        [profile.id]: {
          ...(current.childRewards[profile.id] ?? defaultChildRewards),
          lifetimePoints: (current.childRewards[profile.id]?.lifetimePoints ?? current.points[profile.id] ?? 0) + Math.floor(amount),
        },
      },
    }));
    playSound("success");
  };

  const spendRewardPoints = (cost: number, itemId: string) => {
    if (!profile || !Number.isFinite(cost) || cost < 1) return false;
    const currentRewards = savedRef.current.childRewards[profile.id] ?? defaultChildRewards;
    const currentPoints = savedRef.current.points[profile.id] ?? 0;
    if (currentPoints < cost || currentRewards.purchasedIds.includes(itemId)) return false;
    setSaved((current) => ({
      ...current,
      points: { ...current.points, [profile.id]: (current.points[profile.id] ?? 0) - cost },
      childRewards: {
        ...current.childRewards,
        [profile.id]: {
          ...(current.childRewards[profile.id] ?? defaultChildRewards),
          purchasedIds: [...(current.childRewards[profile.id]?.purchasedIds ?? []), itemId],
        },
      },
    }));
    playSound("success");
    return true;
  };

  const openRewardBox = (opening: BoxOpening) => {
    if (!profile) return;
    setSaved((current) => {
      const rewards = current.childRewards[profile.id] ?? defaultChildRewards;
      if (rewards.openedBoxes.some((item) => item.boxIndex === opening.boxIndex)) return current;
      return {
        ...current,
        childRewards: {
          ...current.childRewards,
          [profile.id]: { ...rewards, openedBoxes: [...rewards.openedBoxes, opening] },
        },
      };
    });
    playSound("success");
  };

  const resetMap = async (enteredCode: string) => {
    if (!profile || !owner) return false;
    try {
      const session = await accountsApi.verifyMember(familyCode, owner.id, enteredCode, "owner");
      memberTokenRef.current = session.token; setMemberToken(session.token);
      memberRoleRef.current = session.role;
      void pullCloudState(true);
    } catch { return false; }
    setSaved((current) => ({
      ...current,
      completed: { ...current.completed, [profile.id]: 0 },
      points: { ...current.points, [profile.id]: 0 },
    }));
    return true;
  };

  const logout = () => {
    memberTokenRef.current = null;
    memberRoleRef.current = null;
    setMemberToken(null);
    setFamilyCode("");
    setFamilyMembers([]);
    setMembersError("");
    setSelectedId(null);
    setSaved((current) => ({ ...current, selectedId: null }));
    setScreen("choose");
    setTab("quest");
    setProfileAccessAction(null);
    setProfileAccessTarget(null);
    setProfileAccessCode("");
    setProfileAccessError("");
    setFinishCode("");
    setUnlockCode("");
    cloudVersionRef.current = null;
    cloudReadyRef.current = false;
    lastCloudSignatureRef.current = null;
  };

  const goBack = () => {
    if (screen === "quest" || screen === "gate" || screen === "reward") {
      setScreen("home");
      setTab("quest");
      return;
    }
    if (tab === "parent") {
      setTab("quest");
      setScreen("home");
      return;
    }
    if (screen === "home") {
      setSelectedId(null);
      setTab("quest");
      setScreen("choose");
      return;
    }
    logout();
  };

  const revealAdmin = async (code: string) => {
    try {
      await accountsApi.revealAdmin(code);
      setAdminOpen(true);
      return true;
    } catch {
      return false;
    }
  };

  if (!familyCode) {
    return <FamilySyncSetup onConnect={connectFamily} onAdminReveal={revealAdmin} adminOpen={adminOpen} onCloseAdmin={() => setAdminOpen(false)} />;
  }

  if (screen === "choose" || !selectedId || !profile) {
    return (
      <>
        <ProfileChooser profiles={availableProfiles} loading={membersLoading} error={membersError} onChoose={(id) => requestProfileAccess("enter", id)} onBack={logout} onLogout={logout} />
        {profileAccessAction && (
          <ProfileAccessGate
            action={profileAccessAction}
            code={profileAccessCode}
            error={profileAccessError}
            onCode={(value) => { setProfileAccessCode(value); setProfileAccessError(""); }}
            onVerify={verifyProfileAccess}
            onCancel={cancelProfileAccess}
          />
        )}
      </>
    );
  }
  const activeProfile = profile;

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
            <button data-testid="nav-quest" className={tab === "quest" ? "active" : ""} onClick={returnToQuest}>
              <House size={17} /> <span>ساحة المغامرة</span>
            </button>
            <button data-testid="nav-parent" className={tab === "parent" ? "active" : ""} onClick={() => requestProfileAccess("parent")}>
              <ChartNoAxesColumnIncreasing size={17} /> <span>مرصد الوالدين</span>
            </button>
          </nav>
          <div className="side-profile" data-testid="display-sidebar-profile">
            {activeProfile.photo ? <img className="mini-avatar profile-photo" src={activeProfile.photo} alt={`صورة ${activeProfile.name}`} /> : <span className="mini-avatar">{activeProfile.initials}</span>}
            <div className="side-profile-copy"><strong>{activeProfile.name}</strong><span>{activeProfile.title}</span></div>
            <button className="icon-button" data-testid="button-switch-sidebar-profile" aria-label="تبديل البطل" onClick={() => requestProfileAccess("switch")}><RefreshCcw size={15} /></button>
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
              <span className={`sync-chip ${syncStatus}`} data-testid="status-cloud-sync">
                {syncStatus === "synced" ? "البيانات متزامنة" : syncStatus === "connecting" ? "جارٍ ربط البيانات…" : "سيُعاد الحفظ عند عودة الاتصال"}
              </span>
              <span className="date-chip" data-testid="text-today-date">{getArabicDate()}</span>
              <button className="profile-switch" data-testid="button-switch-profile" onClick={() => requestProfileAccess("switch")}>
                {activeProfile.photo ? <img className="mini-avatar profile-photo" src={activeProfile.photo} alt={`صورة ${activeProfile.name}`} /> : <span className="mini-avatar">{activeProfile.initials}</span>}
                <span>تبديل البطل</span>
                <ChevronLeft size={14} />
              </button>
              <div className="topbar-session-actions">
                <button className="outline-button header-nav-button" type="button" data-testid="button-go-back" aria-label="العودة للصفحة السابقة" onClick={goBack}><ArrowLeft size={15} /> العودة</button>
                <button className="outline-button header-nav-button logout-button" type="button" data-testid="button-logout" aria-label="تسجيل الخروج" onClick={logout}><LogOut size={15} /> تسجيل الخروج</button>
              </div>
            </div>
          </header>

          <div className="content">
            {tab === "parent" && screen === "home" ? (
              <ParentView profiles={availableProfiles} saved={saved} soundPreferences={soundPreferencesState} onSoundPreferencesChange={updateSoundPreferences} onSaveExtraChallenge={saveExtraChallenge} onChooseProfile={() => requestProfileAccess("switch")} />
            ) : screen === "home" ? (
               <HomeView profile={activeProfile} completed={completed} points={points} childRewards={saved.childRewards[activeProfile.id] ?? defaultChildRewards} childContent={saved.childContent} activeMission={mission && !pointResult ? mission : null} missions={profileMissions} lockedMission={lockedMission} unlockCode={unlockCode} unlockCodeError={unlockCodeError} extraSetupOpen={extraSetupOpen} extraSetupMinutes={extraSetupMinutes} extraSetupPoints={extraSetupPoints} extraSetupError={extraSetupError} onStart={requestMissionStart} onUnlockCode={setUnlockCode} onUnlock={unlockExtraChallenge} onCancelUnlock={cancelExtraChallengeUnlock} onExtraSetupMinutes={setExtraSetupMinutes} onExtraSetupPoints={setExtraSetupPoints} onStartCustomizedExtra={startCustomizedExtraChallenge} onCreateMission={createMission} onDeleteMission={deleteMission} onResetMap={resetMap} onSpendReward={spendRewardPoints} onOpenRewardBox={openRewardBox} onAwardExtraPoints={awardExtraPoints} onParent={() => requestProfileAccess("parent")} />
            ) : screen === "quest" && mission ? (
              <QuestView mission={mission} seconds={seconds} running={timerRunning} timeUp={timeUp} extensionCount={extensionCount} pauseActive={pauseActive} pauseSeconds={pauseSeconds} pauseResumeBlockedUntil={pauseResumeBlockedUntil} alertSeconds={alertSeconds} graceSeconds={graceSeconds} finishCodeOpen={finishCodeOpen} finishCode={finishCode} error={finishCodeError} onBack={leaveMission} onStartTimer={startTimer} onPause={pauseMission} onResume={resumeMission} onExtend={extendMission} onOpenFinishCode={() => { if (graceSeconds > 0) { setFinishCodeOpen(true); setFinishCodeError(""); } }} onOpenEarlyFinish={openEarlyFinishCode} onCancelFinishCode={closeFinishCode} onCode={setFinishCode} onVerifyCode={verifyFinishCode} />
            ) : screen === "gate" ? (
              <GateView answerResult={answerResult} completionChoice={completionChoice} onAnswer={answerMission} onComplete={completeMission} onBack={leaveMission} onCancel={cancelUnfinishedMission} />
            ) : (
              <RewardView result={pointResult} profileName={activeProfile.name} onNew={newChallenge} />
            )}
          </div>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="التنقل">
        <button data-testid="mobile-nav-quest" className={tab === "quest" ? "active" : ""} onClick={returnToQuest}><House size={18} /><span>المغامرة</span></button>
        <button data-testid="mobile-nav-parent" className={tab === "parent" ? "active" : ""} onClick={() => requestProfileAccess("parent")}><Users size={18} /><span>الوالدان</span></button>
        <button data-testid="mobile-nav-profile" onClick={() => requestProfileAccess("switch")}><UserRound size={18} /><span>الأبطال</span></button>
      </nav>
      {profileAccessAction && (
        <ProfileAccessGate
          action={profileAccessAction}
          code={profileAccessCode}
          error={profileAccessError}
          onCode={(value) => { setProfileAccessCode(value); setProfileAccessError(""); }}
          onVerify={verifyProfileAccess}
          onCancel={cancelProfileAccess}
        />
      )}
    </div>
  );
}

function FamilySyncSetup({ onConnect, onAdminReveal, adminOpen, onCloseAdmin }: { onConnect: (code: string) => Promise<void>; onAdminReveal: (code: string) => Promise<boolean>; adminOpen: boolean; onCloseAdmin: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = code.trim();
    if (normalizedCode.length < 4 || normalizedCode.length > 64) {
      setError("اكتب رمز عائلة من 4 إلى 64 حرفاً أو رقماً.");
      return;
    }
    try {
      if (await onAdminReveal(normalizedCode)) return;
      await onConnect(normalizedCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز العائلة. حاول مرة أخرى.");
    }
  };

  return (
    <div className="kingdom-app family-sync-page" dir="rtl">
      <section className="family-sync-card" data-testid="panel-family-sync-setup">
        <div className="brand-mark"><Crown size={24} /></div>
        <div className="eyebrow" style={{ justifyContent: "center" }}>ربط أجهزة العائلة</div>
        <h1 className="display-title">احتفظوا بالمملكة متصلة</h1>
        <p>أنشئوا رمزاً خاصاً بالعائلة على أول جهاز، ثم أدخلوه نفسه في أي هاتف أو متصفح آخر لتظهر النقاط والمهام والمؤقت كما هي.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="family-code">رمز العائلة</label>
          <input id="family-code" className="code-input" data-testid="input-family-code" type="password" autoComplete="off" minLength={4} maxLength={64} value={code} onChange={(event) => { setCode(event.target.value); setError(""); }} placeholder="مثال: مملكتنا2026" aria-describedby="family-code-note" autoFocus />
          <span id="family-code-note">لا تشاركوا هذا الرمز خارج العائلة.</span>
          {error && <p className="form-error" data-testid="status-family-code-error">{error}</p>}
          <button className="primary-button gold" type="submit" data-testid="button-connect-family"><KeyRound size={16} /> ربط المملكة</button>
        </form>
      </section>
       {adminOpen && <div className="admin-backdrop"><AdminConsole onClose={onCloseAdmin} /></div>}
    </div>
  );
}

function ProfileChooser({
  profiles: selectableProfiles,
  loading,
  error,
  onChoose,
  onBack,
  onLogout,
}: {
  profiles: Profile[];
  loading: boolean;
  error: string;
  onChoose: (id: ProfileId) => void;
  onBack: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="kingdom-app" dir="rtl">
      <div className="profile-choose">
        <header className="choose-top">
          <div className="choose-logo"><div className="brand-mark"><Crown size={21} /></div><span>مملكة التحديات</span></div>
          <div className="choose-header-actions">
            <span className="choose-date">{getArabicDate()}</span>
            <button className="outline-button header-nav-button" type="button" data-testid="button-go-back-choose" aria-label="العودة لربط المملكة" onClick={onBack}><ArrowLeft size={15} /> العودة</button>
            <button className="outline-button header-nav-button logout-button" type="button" data-testid="button-logout-choose" aria-label="تسجيل الخروج" onClick={onLogout}><LogOut size={15} /> تسجيل الخروج</button>
          </div>
        </header>
        <section className="choose-intro">
          <div className="eyebrow" style={{ justifyContent: "center" }}>بوابة الأبطال</div>
          <h1 className="display-title" data-testid="heading-profile-selection">من سيبدأ الحكاية؟</h1>
          <p className="subtle">اختر اسمك لنعيد فتح خريطتك ونرى أي كنز ينتظرك اليوم.</p>
        </section>
        {loading ? <p className="subtle" role="status">جارٍ تحميل ملفات العائلة…</p> : error ? <p className="form-error" role="alert">{error}</p> : selectableProfiles.length === 0 ? <div className="panel empty-profile-guidance"><Users size={28} /><p>لا توجد ملفات أطفال بعد. اطلب من ولي الأمر إضافة طفل من لوحة الإدارة.</p></div> : <div className="profile-grid">
          {selectableProfiles.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className="profile-card" data-testid={`button-profile-${item.id}`} onClick={() => onChoose(item.id)}>
                <div className="profile-avatar">{item.photo ? <img className="profile-choose-photo" src={item.photo} alt={`صورة ${item.name}`} /> : <span aria-hidden="true">{item.initials}</span>}<Icon className="profile-avatar-icon" size={47} strokeWidth={1.8} /></div>
                <h2>{item.name}</h2>
                <div className="grade">{item.grade}</div>
                <p className="quote">«{item.quote}»</p>
                <div className="profile-meta"><span className="meta-pill gold"><Star size={11} fill="currentColor" /> {item.title}</span><span className="meta-pill">المستوى {item.level}</span></div>
              </button>
            );
          })}
        </div>}
        <footer className="choose-foot"><LockKeyhole size={12} style={{ verticalAlign: "middle", marginLeft: 4 }} /> مساحة عائلية محفوظة على هذا الجهاز</footer>
      </div>
    </div>
  );
}

function ProfileAccessGate({
  action,
  code,
  error,
  onCode,
  onVerify,
  onCancel,
}: {
  action: ProfileAccessAction;
  code: string;
  error: string;
  onCode: (value: string) => void;
  onVerify: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="profile-access-backdrop" role="presentation">
      <section className="profile-access-card" role="dialog" aria-modal="true" aria-labelledby="profile-access-title" data-testid="panel-profile-access">
        <div className="profile-access-icon"><LockKeyhole size={24} /></div>
        <div className="eyebrow" style={{ justifyContent: "center" }}>بوابة العائلة</div>
         <h2 id="profile-access-title">{action === "enter" ? "افتح ملف البطل" : action === "parent" ? "افتح مرصد الوالدين" : "تأكيد تبديل البطل"}</h2>
         <p>{action === "enter" ? "أدخل رمز الطفل الخاص بهذا الملف." : "أدخل رمز ولي الأمر لإكمال هذا الإجراء."}</p>
        <form onSubmit={(event) => { event.preventDefault(); onVerify(); }}>
           <label htmlFor="profile-access-code">{action === "enter" ? "رمز الطفل" : "رمز ولي الأمر"}</label>
          <input
            id="profile-access-code"
            className="code-input"
            data-testid="input-profile-access-code"
            type="password"
            autoComplete="off"
            value={code}
             onChange={(event) => onCode(event.target.value)}
            aria-describedby={error ? "profile-access-error" : undefined}
            autoFocus
          />
          {error && <p className="form-error" id="profile-access-error" data-testid="status-profile-access-error">{error}</p>}
          <div className="profile-access-actions">
            <button className="primary-button" type="submit" data-testid="button-verify-profile-access"><KeyRound size={16} /> تحقق وافتح</button>
            <button className="outline-button" type="button" data-testid="button-cancel-profile-access" onClick={onCancel}><ArrowLeft size={16} /> إلغاء</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function HomeView({
  profile,
  completed,
  points,
  childRewards,
  childContent,
  activeMission,
  missions: availableMissions,
  lockedMission,
  unlockCode,
  unlockCodeError,
  extraSetupOpen,
  extraSetupMinutes,
  extraSetupPoints,
  extraSetupError,
  onStart,
  onUnlockCode,
  onUnlock,
  onCancelUnlock,
  onExtraSetupMinutes,
  onExtraSetupPoints,
  onStartCustomizedExtra,
  onCreateMission,
  onDeleteMission,
  onResetMap,
  onSpendReward,
  onOpenRewardBox,
  onAwardExtraPoints,
  onParent,
}: {
  profile: Profile;
  completed: number;
  points: number;
  childRewards: ChildRewardsState;
  childContent: ChildContentConfig;
  activeMission: Mission | null;
  missions: Mission[];
  lockedMission: Mission | null;
  unlockCode: string;
  unlockCodeError: string;
  extraSetupOpen: boolean;
  extraSetupMinutes: string;
  extraSetupPoints: string;
  extraSetupError: string;
  onStart: (mission: Mission) => void;
  onUnlockCode: (value: string) => void;
  onUnlock: () => void;
  onCancelUnlock: () => void;
  onExtraSetupMinutes: (value: string) => void;
  onExtraSetupPoints: (value: string) => void;
  onStartCustomizedExtra: () => void;
  onCreateMission: (title: string, durationMinutes: number) => void;
  onDeleteMission: (missionId: string) => void;
  onResetMap: (code: string) => Promise<boolean>;
  onSpendReward: (cost: number, itemId: string) => boolean;
  onOpenRewardBox: (opening: BoxOpening) => void;
  onAwardExtraPoints: (amount: number) => void;
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

  const submitMapReset = async () => {
    if (await onResetMap(resetCode)) {
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
              <button className="primary-button gold hero-cta" data-testid="button-start-featured" data-sound="start" onClick={() => onStart(activeMission ?? availableMissions[0])}>{activeMission ? <>استأنف التحدي <Play size={16} /></> : points >= mapFinishPoints ? <>واصل جمع الأوسمة <Star size={16} /></> : <>ابدأ المهمة <ArrowLeft size={16} /></>}</button>
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
        {lockedMission && !extraSetupOpen && (
          <section className="challenge-unlock-card" data-testid="panel-extra-challenge-lock">
            <div className="challenge-unlock-icon"><LockKeyhole size={23} /></div>
            <div>
              <strong>فتح «{lockedMission.title}»</strong>
              <p>هذا تحدٍ خاص. أدخل رمز ولي الأمر لبدء العدّاد.</p>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); onUnlock(); }}>
              <label htmlFor="extra-challenge-code">رمز ولي الأمر</label>
              <input id="extra-challenge-code" className="code-input" data-testid="input-extra-challenge-code" type="password" autoComplete="off" inputMode="numeric" maxLength={4} value={unlockCode} onChange={(event) => onUnlockCode(event.target.value.replace(/\D/g, ""))} aria-label="رمز فتح التحدي الإضافي" autoFocus />
              {unlockCodeError && <p className="form-error" data-testid="status-extra-challenge-code-error">{unlockCodeError}</p>}
              <div className="challenge-unlock-actions">
                <button className="primary-button" type="submit" data-testid="button-unlock-extra-challenge"><KeyRound size={16} /> فتح التحدي</button>
                <button className="outline-button" type="button" data-testid="button-cancel-extra-challenge-unlock" onClick={onCancelUnlock}><ArrowLeft size={16} /> العودة للمهام</button>
              </div>
            </form>
          </section>
        )}
        {lockedMission && extraSetupOpen && (
          <section className="challenge-unlock-card extra-challenge-setup-card" data-testid="panel-extra-challenge-setup">
            <div className="challenge-unlock-icon"><TimerReset size={23} /></div>
            <div>
              <strong>تم فتح «{lockedMission.title}»</strong>
              <p>اختر الوقت وعدد النقاط التي سيحصل عليها البطل قبل بدء التحدي.</p>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); onStartCustomizedExtra(); }}>
              <div className="extra-setup-fields">
                <label><span>الوقت بالدقائق</span><input data-testid="input-unlocked-extra-duration" type="number" min="1" max="120" step="1" value={extraSetupMinutes} onChange={(event) => onExtraSetupMinutes(event.target.value)} /></label>
                <label><span>النقاط المكتسبة</span><input data-testid="input-unlocked-extra-reward" type="number" min="1" max="50" step="1" value={extraSetupPoints} onChange={(event) => onExtraSetupPoints(event.target.value)} /></label>
              </div>
              {extraSetupError && <p className="form-error" data-testid="status-unlocked-extra-error">{extraSetupError}</p>}
              <div className="challenge-unlock-actions">
                <button className="primary-button" type="submit" data-testid="button-start-customized-extra"><Play size={16} /> بدء التحدي</button>
                <button className="outline-button" type="button" data-testid="button-cancel-extra-setup" onClick={onCancelUnlock}><ArrowLeft size={16} /> العودة للمهام</button>
              </div>
            </form>
          </section>
        )}
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
                const missionCard = <button key={item.id} className={`mission-card ${item.featured ? "featured" : ""}`} data-testid={`button-mission-${item.id}`} data-sound="start" onClick={() => onStart(item)} disabled={Boolean(activeMission && activeMission.id !== item.id)}>
                 <div className="mission-top"><span className="mission-icon"><Icon size={19} /></span><span className="mission-duration"><Clock3 size={12} style={{ verticalAlign: "middle", marginLeft: 3 }} /> {formatDuration(item.duration)}</span></div>
                  <h3>{item.title}</h3><p>{item.description}</p>{item.requiresCode && <span className="locked-mission-label"><LockKeyhole size={12} /> يحتاج رمز ولي الأمر • مكافأة {item.rewardPoints?.toLocaleString("ar-SA")} نقطة</span>}<ArrowLeft className="mission-arrow" size={18} />
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
            <div className="map-points-summary"><strong>{points} / {mapTotalPoints}</strong><span>نقطة في خريطة {profile.name}</span><div className="map-points-track"><i style={{ width: `${Math.max(0, Math.min(100, (points / mapTotalPoints) * 100))}%` }} /></div></div>
            {points >= mapFinishPoints && <div className="map-complete">
              <div><strong>فاز {profile.name} بالمرحلة الأخيرة!</strong><span>أدخل رمز القائد لإعادة الرحلة إلى المرحلة الأولى.</span></div>
              <div className="map-reset-actions"><input data-testid="input-map-reset-code" className="code-input" type="password" autoComplete="off" value={resetCode} onChange={(event) => setResetCode(event.target.value)} aria-label="رمز ولي الأمر لإعادة الخريطة" /><button className="outline-button" type="button" data-testid="button-reset-map" onClick={() => void submitMapReset()}><RotateCcw size={15} /> إعادة الخريطة</button></div>
              {resetError && <p className="form-error" data-testid="status-map-reset-error">{resetError}</p>}
            </div>}
        </div>
      </section>
      <ChildExtras content={childContent} points={points} rewards={childRewards} onSpend={onSpendReward} onOpenBox={onOpenRewardBox} onAwardPoints={onAwardExtraPoints} />
    </>
  );
}

function QuestView({
  mission,
  seconds,
  running,
  timeUp,
  extensionCount,
  pauseActive,
  pauseSeconds,
  pauseResumeBlockedUntil,
  alertSeconds,
  graceSeconds,
  finishCodeOpen,
  finishCode,
  error,
  onBack,
  onStartTimer,
  onPause,
  onResume,
  onExtend,
  onOpenFinishCode,
  onOpenEarlyFinish,
  onCancelFinishCode,
  onCode,
  onVerifyCode,
}: {
  mission: Mission;
  seconds: number;
  running: boolean;
  timeUp: boolean;
  extensionCount: number;
  pauseActive: boolean;
  pauseSeconds: number;
  pauseResumeBlockedUntil: number | null;
  alertSeconds: number;
  graceSeconds: number;
  finishCodeOpen: boolean;
  finishCode: string;
  error: string;
  onBack: () => void;
  onStartTimer: () => void;
  onPause: () => void;
  onResume: () => void;
  onExtend: () => void;
  onOpenFinishCode: () => void;
  onOpenEarlyFinish: () => void;
  onCancelFinishCode: () => void;
  onCode: (value: string) => void;
  onVerifyCode: () => void;
}) {
  const Icon = mission.icon;
  const progress = mission.duration ? ((mission.duration - seconds) / mission.duration) * 100 : 0;
  const nextExtensionSeconds = extensionDuration(mission.duration, extensionCount + 1);
  const canFinishEarly = seconds < mission.duration || running || pauseActive;
  const resumeWaitSeconds = pauseActive && pauseResumeBlockedUntil
    ? Math.max(0, Math.ceil((pauseResumeBlockedUntil - Date.now()) / 1000))
    : 0;
  return (
    <>
      <div className="quest-header"><button className="back-button" data-testid="button-back-to-missions" aria-label="العودة للمهام" onClick={onBack}><ArrowLeft size={18} /></button><div><div className="eyebrow">ميدان التحدي</div><p className="subtle">أثبت أن تركيزك أقوى من الملل.</p></div></div>
      <div className="quest-layout">
        <section className="quest-card" data-testid="panel-active-quest">
          <div className="eyebrow"><Icon size={14} /> المهمة النشطة</div><h1 data-testid="text-active-mission">{mission.title}</h1><p className="quest-description">{mission.description}</p>
           <div className={`timer-shell ${running ? "running" : ""} ${pauseActive ? "paused" : ""} ${alertSeconds > 0 ? "alerting" : ""}`} style={{ background: `conic-gradient(hsl(var(--accent)) 0 ${progress}%, rgba(249,240,214,.11) ${progress}% 100%)` }}><div className="timer-core"><span className="timer-number" data-testid="display-countdown">{timeUp && alertSeconds === 0 && graceSeconds > 0 ? formatTime(graceSeconds) : formatTime(seconds)}</span><span className="timer-label">{pauseActive ? `استراحة ${formatTime(pauseSeconds)}` : alertSeconds > 0 ? `تنبيه النهاية ${formatTime(alertSeconds)}` : timeUp && graceSeconds > 0 ? "مهلة القرار" : seconds === 0 ? "اكتمل الوقت" : running ? "المعركة جارية" : "جاهز للانطلاق"}</span></div></div>
           {!finishCodeOpen && <div className="quest-actions">
               {pauseActive ? <button className="primary-button gold" data-testid="button-resume-timer" onClick={onResume} disabled={resumeWaitSeconds > 0}><Play size={16} /> {resumeWaitSeconds > 0 ? `انتظر ${resumeWaitSeconds} ثوانٍ` : "استئناف التحدي"}</button> : running ? <button className="primary-button gold" data-testid="button-pause-timer" onClick={onPause} disabled={pauseSeconds <= 0}><Pause size={16} /> {pauseSeconds > 0 ? `إيقاف مؤقت (${formatTime(pauseSeconds)})` : "نفد رصيد الاستراحة"}</button> : <button className="primary-button gold" data-testid="button-start-timer" onClick={onStartTimer} disabled={seconds === 0 || alertSeconds > 0}><Play size={16} /> ابدأ العدّاد</button>}
              {!timeUp && canFinishEarly && <button className="outline-button early-finish-button" data-testid="button-finish-early" onClick={onOpenEarlyFinish}><KeyRound size={16} /> إنهاء المهمة الآن</button>}
            </div>}
            {!timeUp ? finishCodeOpen ? (
              <form className="finish-code-box early-finish-code-box" onSubmit={(event) => { event.preventDefault(); onVerifyCode(); }}>
                <strong>إنهاء المهمة قبل انتهاء الوقت</strong>
                <label htmlFor="finish-code">رمز ولي الأمر</label>
                <input id="finish-code" className="code-input" data-testid="input-finish-code" type="password" autoComplete="off" inputMode="numeric" maxLength={4} value={finishCode} onChange={(event) => onCode(event.target.value.replace(/\D/g, ""))} aria-label="رمز إنهاء المهمة" autoFocus />
                {error && <p className="gate-error" data-testid="status-finish-code-error">{error}</p>}
                <div className="finish-code-actions">
                  <button className="primary-button" type="submit" data-testid="button-verify-finish-code"><ShieldCheck size={16} /> متابعة</button>
                  <button className="outline-button" type="button" data-testid="button-cancel-finish-code" onClick={onCancelFinishCode}><ArrowLeft size={16} /> العودة للتحدي</button>
                </div>
              </form>
             ) : <p className={`quest-note ${pauseActive ? "pause-note" : ""}`}><ShieldCheck size={13} style={{ verticalAlign: "middle", marginLeft: 4 }} /> {pauseActive ? (resumeWaitSeconds > 0 ? `توقف مؤقت. يمكنك الاستمرار بعد ${resumeWaitSeconds} ثوانٍ.` : `الإيقاف المؤقت جارٍ. يمكنك الاستئناف الآن أو استخدام ما تبقى من الرصيد لاحقاً.`) : `رصيد الإيقاف المؤقت: ${formatTime(pauseSeconds)}. يُضاف 00:30 للرصيد ولوقت التحدي كل 5 دقائق من اللعب.`}</p> : (
             <div className="time-up-panel" data-testid="panel-time-up">
                <div className="time-up-heading"><BellRing size={20} /><strong>انتهى وقت المعركة!</strong><span>{alertSeconds > 0 ? `تنبيه النهاية جارٍ لمدة ${formatTime(alertSeconds)}. انتظر قبل التمديد.` : `لديك مهلة ${formatTime(graceSeconds)} لتمديد الوقت أو إنهاء التحدي، ثم يُلغى التحدي تلقائياً مع خصم نقطتين.`}</span></div>
               {!finishCodeOpen ? (
                 <div className="time-up-actions">
                    <button className="primary-button gold" data-testid="button-extend-time" onClick={onExtend} disabled={alertSeconds > 0 || graceSeconds <= 0}><TimerReset size={16} /> تمديد لمدة {formatDuration(nextExtensionSeconds)}</button>
                   <button className="outline-button" data-testid="button-open-finish-code" onClick={onOpenFinishCode} disabled={alertSeconds > 0 || graceSeconds <= 0}><KeyRound size={16} /> إنهاء المهمة</button>
                 </div>
               ) : (
                  <form className="finish-code-box" onSubmit={(event) => { event.preventDefault(); onVerifyCode(); }}>
                   <label htmlFor="finish-code">رمز إنهاء المهمة</label>
                     <input id="finish-code" className="code-input" data-testid="input-finish-code" type="password" autoComplete="off" inputMode="numeric" maxLength={4} value={finishCode} onChange={(event) => onCode(event.target.value.replace(/\D/g, ""))} aria-label="رمز إنهاء المهمة" autoFocus />
                   {error && <p className="gate-error" data-testid="status-finish-code-error">{error}</p>}
                    <div className="finish-code-actions">
                      <button className="primary-button" type="submit" data-testid="button-verify-finish-code"><ShieldCheck size={16} /> متابعة</button>
                      <button className="outline-button" type="button" data-testid="button-cancel-finish-code" onClick={onCancelFinishCode}><ArrowLeft size={16} /> العودة للتحدي</button>
                    </div>
                  </form>
               )}
             </div>
           )}
        </section>
        <aside className="battle-aside">
          <div className="monster-card"><h3>العدو: ملل</h3><p>يحب أن يهمس: «اترك الصفحة الآن». لا تمنحه هذه الفرصة.</p><div className="monster"><div className="monster-eyes"><span>•</span><span>•</span></div><div className="monster-mouth" /></div></div>
          <div className="rule-card"><h3>قواعد الميدان</h3><div className="rule"><ShieldCheck size={14} /><span>ضع أدواتك أمامك قبل بدء العدّاد.</span></div><div className="rule"><TimerReset size={14} /><span>يبدأ الإيقاف المؤقت بـ30 ثانية، ويتجدد 30 ثانية مع إضافة مثلها للوقت المتبقي كل 5 دقائق.</span></div><div className="rule"><Trophy size={14} /><span>النقاط تُحتسب بعد موافقة ولي الأمر.</span></div></div>
        </aside>
      </div>
    </>
  );
}

function GateView({
  answerResult,
  completionChoice,
  onAnswer,
  onComplete,
  onBack,
  onCancel,
}: {
  answerResult: "yes" | "no" | null;
  completionChoice: "pending" | null;
  onAnswer: (answer: "yes" | "no") => void;
  onComplete: (deduction: 0 | 2 | 4 | 6) => void;
  onBack: () => void;
  onCancel: (withPenalty: boolean) => void;
}) {
  return (
    <section className="gate-card">
      <div className="gate-seal"><LockKeyhole size={34} /></div>
      <div className="eyebrow" style={{ justifyContent: "center" }}>محطة العائلة</div>
      {answerResult === "no" ? (
        <>
          <h1 data-testid="heading-parent-gate">تبقى المرحلة مكانها</h1>
          <p>لم يتم اعتماد الإنجاز هذه المرة. لا مشكلة، يمكنك العودة والمحاولة في تحدٍ جديد عندما تكون المهمة جاهزة.</p>
          <div className="answer-result failure-result"><CircleX size={25} /><strong>لا يوجد تقدم على الخريطة</strong><span>شغّلنا موسيقى الفشل حتى تعرف أن المرحلة لم تُفتح.</span></div>
          <div className="answer-actions">
            <button className="primary-button" data-testid="button-return-after-failure" onClick={onBack}><Map size={16} /> العودة إلى الخريطة</button>
            <button className="outline-button" data-testid="button-cancel-unfinished-mission-without-penalty" onClick={() => onCancel(false)}><CircleX size={16} /> إلغاء المهمة بلا خصم</button>
            <button className="outline-button cancel-mission-button" data-testid="button-cancel-unfinished-mission" onClick={() => onCancel(true)}><CircleX size={16} /> إلغاء المهمة وخصم نقطتين</button>
          </div>
        </>
      ) : answerResult === "yes" && completionChoice === "pending" ? (
        <>
          <h1 data-testid="heading-completion-score-choice">اختر درجة الإنجاز</h1>
          <p>تم إنجاز المهمة بعد انتهاء الوقت. اختر اعتماد نقاط التحدي كاملة، أو اطرح منها مقدار الخصم المناسب.</p>
          <div className="completion-choice-card" data-testid="panel-completion-score-choice">
            <div className="completion-choice-icon"><Trophy size={24} /></div>
            <strong>كيف تريد احتساب النتيجة؟</strong>
            <span>سيُحفظ الاختيار مرة واحدة مع نقاط البطل.</span>
          </div>
          <div className="answer-actions completion-choice-actions">
            <button className="primary-button gold" data-testid="button-complete-full-score" data-sound="success" onClick={() => onComplete(0)}><CircleCheck size={19} /> الإنهاء بالدرجة الكاملة</button>
            <button className="outline-button deduction-button" data-testid="button-complete-deduction-2" onClick={() => onComplete(2)}><CircleX size={19} /> الإنهاء بخصم نقطتين</button>
            <button className="outline-button deduction-button" data-testid="button-complete-deduction-4" onClick={() => onComplete(4)}><CircleX size={19} /> الإنهاء بخصم 4 نقاط</button>
            <button className="outline-button deduction-button" data-testid="button-complete-deduction-6" onClick={() => onComplete(6)}><CircleX size={19} /> الإنهاء بخصم 6 نقاط</button>
          </div>
        </>
      ) : (
        <>
          <h1 data-testid="heading-parent-gate">هل تم الإنجاز؟</h1>
          <p>بعد إدخال رمز القائد، يتأكد ولي الأمر من أن المهمة الكاملة أُنجزت فعلاً في الدفتر أو الكتاب.</p>
          <div className="answer-actions">
            <button className="primary-button gold" data-testid="button-answer-yes" data-sound="success" onClick={() => onAnswer("yes")}><CircleCheck size={19} /> نعم، تم الإنجاز</button>
            <button className="outline-button" data-testid="button-answer-no" data-sound="failure" onClick={() => onAnswer("no")}><CircleX size={19} /> لا، ليس بعد</button>
          </div>
        </>
      )}
      {answerResult !== "no" && completionChoice !== "pending" && <button className="outline-button" data-testid="button-back-from-gate" onClick={onBack} style={{ marginTop: 17 }}><ArrowLeft size={15} /> العودة إلى الخريطة</button>}
    </section>
  );
}

function RewardView({ result, profileName, onNew }: { result: { earned: number; earlyBonus: number; deduction: number; bonus: number; total: number; extensions: number } | null; profileName: string; onNew: () => void }) {
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
        {result?.earlyBonus ? <span className="finish-bonus early-finish-bonus">مكافأة الإنهاء المبكر: +{result.earlyBonus.toLocaleString("ar-SA")} نقطتين إضافيتين</span> : null}
        {result?.deduction ? <span className="finish-bonus deduction-result">تم اعتماد الإنجاز مع خصم {result.deduction.toLocaleString("ar-SA")} نقاط من مكافأة المهمة</span> : null}
        {bonus > 0 && <span className="finish-bonus">مكافأة الفوز: +{bonus.toLocaleString("ar-SA")} لتكتمل الخريطة إلى {mapTotalPoints} نقطة</span>}
        <div className="total-points-pill">مجموع الخريطة: {result?.total.toLocaleString("ar-SA")} / {mapTotalPoints}</div>
      </div>
      <div className="reward-buttons"><button className="primary-button" data-testid="button-new-challenge" onClick={onNew}><Swords size={16} /> العودة للمملكة</button></div>
    </section>
  );
}

function ParentView({
  profiles: dynamicProfiles,
  saved,
  soundPreferences,
  onSoundPreferencesChange,
  onSaveExtraChallenge,
  onChooseProfile,
}: {
  profiles: Profile[];
  saved: SavedState;
  soundPreferences: SoundPreferences;
  onSoundPreferencesChange: (preferences: SoundPreferences) => void;
  onSaveExtraChallenge: (title: string, durationMinutes: number, rewardPoints: number) => void;
  onChooseProfile: () => void;
}) {
  const total = dynamicProfiles.reduce((sum, item) => sum + (saved.completed[item.id] ?? 0), 0);
  const [extraTitle, setExtraTitle] = useState(saved.extraChallenge.title);
  const [extraMinutes, setExtraMinutes] = useState(String(saved.extraChallenge.duration / 60));
  const [extraPoints, setExtraPoints] = useState(String(saved.extraChallenge.rewardPoints));
  const [extraChallengeError, setExtraChallengeError] = useState("");

  const submitExtraChallenge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = extraTitle.trim();
    const minutes = Number(extraMinutes);
    const rewardPoints = Number(extraPoints);
    if (!title || title.length > 60) {
      setExtraChallengeError("اكتب اسم التحدي، وبحد أقصى 60 حرفاً.");
      return;
    }
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
      setExtraChallengeError("اختر مدة بين دقيقة واحدة وساعتين.");
      return;
    }
    if (!Number.isInteger(rewardPoints) || rewardPoints < 1 || rewardPoints > 50) {
      setExtraChallengeError("اختر مكافأة بين نقطة واحدة و50 نقطة.");
      return;
    }
    onSaveExtraChallenge(title, minutes, rewardPoints);
    setExtraChallengeError("");
  };

  return (
    <section className="parent-view">
      <div className="parent-banner"><div><div className="eyebrow">مرصد الوالدين • {getArabicDate()}</div><h1>غرفة القيادة العائلية</h1><p>ملخص لطيف لما أنجزه الأبطال اليوم، من دون تحويل الرحلة إلى جدول درجات.</p></div><div className="parent-total" data-testid="display-family-total"><strong>{total}</strong><span>مهمة في دفتر العائلة</span></div></div>
      <div className="parent-grid">
        <div className="panel"><div className="panel-top"><div><h2 className="panel-title">نبض الأبطال</h2><p className="panel-subtitle">هذا الأسبوع حتى الآن</p></div><Trophy color="hsl(var(--accent))" /></div><div className="child-progress">
          {dynamicProfiles.length === 0 ? <p className="subtle">لا توجد ملفات أطفال.</p> : dynamicProfiles.map((child) => <div className="child-progress-row" key={child.id}>{child.photo ? <img className="mini-avatar profile-photo" src={child.photo} alt={`صورة ${child.name}`} /> : <span className="mini-avatar">{child.initials}</span>}<div className="child-progress-copy"><strong>{child.name}</strong><span>{saved.completed[child.id] ?? 0} مهام مكتملة • {(saved.points[child.id] ?? 0).toLocaleString("ar-SA")} / {mapTotalPoints} نقطة</span><div className="progress-small"><i style={{ width: `${Math.min(100, ((saved.points[child.id] ?? 0) / mapTotalPoints) * 100)}%` }} /></div></div></div>)}
        </div><button className="outline-button" data-testid="button-switch-from-parent" onClick={onChooseProfile} style={{ width: "100%", marginTop: 24 }}><Users size={15} /> تبديل ملف البطل</button></div>
        <div className="panel"><div className="panel-top"><div><h2 className="panel-title">سجل اليوم</h2><p className="panel-subtitle">محطات صغيرة تصنع عادة كبيرة.</p></div><ChartNoAxesColumnIncreasing color="hsl(var(--primary))" /></div><div className="timeline">
          <div className="timeline-item"><span className="timeline-icon"><Check size={14} /></span><div className="timeline-copy"><strong>تم تجهيز الرحلة</strong><p>الحقيبة جاهزة والأدوات في مكانها.</p></div></div>
          <div className="timeline-item"><span className="timeline-icon"><Star size={14} fill="currentColor" /></span><div className="timeline-copy"><strong>محطة الإفطار</strong><p>بدأ اليوم بطاقة هادئة.</p></div></div>
          {total > 0 ? <div className="timeline-item"><span className="timeline-icon"><Trophy size={14} /></span><div className="timeline-copy"><strong>كنز جديد في الدفتر</strong><p>آخر إنجاز عائلي: {total} مهام مكتملة.</p></div></div> : <div className="empty-reward" data-testid="empty-parent-activity"><CircleHelp size={17} /><div>لم يبدأ أي بطل مهمة بعد. الخريطة تنتظر أول خطوة.</div></div>}
        </div></div>
      </div>
      <section className="extra-challenge-settings panel" data-testid="panel-extra-challenge-settings">
        <div className="sound-settings-heading">
          <div className="sound-settings-icon extra-challenge-settings-icon" aria-hidden="true"><KeyRound size={21} /></div>
          <div>
            <h2 className="panel-title">تحدي إضافي</h2>
            <p className="panel-subtitle">سمِّ التحدي واضبط وقته ومكافأته. لن يبدأ الطفل التحدي إلا بعد إدخال رمز ولي الأمر.</p>
          </div>
        </div>
        <form className="extra-challenge-form" onSubmit={submitExtraChallenge}>
          <label className="extra-challenge-name-field"><span>اسم التحدي</span><input data-testid="input-extra-challenge-title" type="text" maxLength={60} value={extraTitle} onChange={(event) => setExtraTitle(event.target.value)} placeholder="مثال: رحلة حفظ سورة قصيرة" /></label>
          <label><span>الوقت بالدقائق</span><input data-testid="input-extra-challenge-duration" type="number" min="1" max="120" step="1" value={extraMinutes} onChange={(event) => setExtraMinutes(event.target.value)} /></label>
          <label><span>نقاط المكافأة</span><input data-testid="input-extra-challenge-reward" type="number" min="1" max="50" step="1" value={extraPoints} onChange={(event) => setExtraPoints(event.target.value)} /></label>
          <button className="primary-button" type="submit" data-testid="button-save-extra-challenge"><Check size={16} /> حفظ التحدي الإضافي</button>
        </form>
        {extraChallengeError && <p className="form-error" data-testid="status-extra-challenge-settings-error">{extraChallengeError}</p>}
      </section>
       <section className="sound-settings panel" data-testid="panel-sound-settings">
         <div className="sound-settings-heading">
           <div className="sound-settings-icon" aria-hidden="true">{soundPreferences.enabled ? <Volume2 size={21} /> : <VolumeX size={21} />}</div>
           <div>
             <h2 className="panel-title">أصوات التحديات</h2>
             <p className="panel-subtitle">اختاروا الإيقاع المناسب للمذاكرة أو الأماكن الهادئة.</p>
           </div>
           <button
             className={`sound-toggle ${soundPreferences.enabled ? "enabled" : ""}`}
             type="button"
             role="switch"
             aria-checked={soundPreferences.enabled}
             aria-label={soundPreferences.enabled ? "إيقاف أصوات التحديات" : "تشغيل أصوات التحديات"}
             data-testid="button-toggle-sounds"
             data-sound="none"
             onClick={() => onSoundPreferencesChange({ ...soundPreferences, enabled: !soundPreferences.enabled })}
           >
             <span className="sound-toggle-knob" />
             <span>{soundPreferences.enabled ? "الأصوات تعمل" : "الأصوات متوقفة"}</span>
           </button>
         </div>
         <div className="sound-level-row">
           <div className="sound-level-copy">
             <label htmlFor="sound-level">مستوى الصوت</label>
             <span>النغمات فقط • {Math.round(soundPreferences.volume * 100)}٪</span>
           </div>
           <input
             id="sound-level"
             data-testid="input-sound-level"
             className="sound-range"
             type="range"
             min="0"
             max="100"
             step="5"
             value={Math.round(soundPreferences.volume * 100)}
             onInput={(event) => onSoundPreferencesChange({ ...soundPreferences, volume: Number(event.currentTarget.value) / 100 })}
             onChange={(event) => onSoundPreferencesChange({ ...soundPreferences, volume: Number(event.currentTarget.value) / 100 })}
             aria-label="مستوى صوت التحديات"
           />
         </div>
         <p className="sound-visual-note"><BellRing size={14} /> تظل رسائل الوقت والعدّاد والتنبيهات المرئية واضحة حتى عند إيقاف الأصوات.</p>
       </section>
    </section>
  );
}

export default App;
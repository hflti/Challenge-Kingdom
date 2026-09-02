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
  ImagePlus,
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
  Unlock,
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
import { accountsApi, isFamilySessionFailure, type FamilyMember } from "./lib/account-api";

type ProfileId = string;
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
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
    title: "تركيز الواجب",
    description: "حل الواجب الأصعب بهدوء، واترك الملل خارج القلعة.",
    duration: 8 * 60,
    icon: Swords,
    featured: true,
  },
];

type SavedState = {
  selectedId: ProfileId | null;
  completed: Record<ProfileId, number>;
  points: Record<ProfileId, number>;
  customMissions: Record<ProfileId, SavedMission[]>;
  childRewards: Record<ProfileId, ChildRewardsState>;
  childContent: ChildContentConfig;
  profileAvatars: Record<ProfileId, string>;
  profilePhotos: Record<ProfileId, string>;
};

type SavedMission = {
  id: string;
  title: string;
  description: string;
  duration: number;
  rewardPoints?: number;
  requiresCode?: boolean;
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
type ProfileAccessAction = "enter" | "switch" | "parent" | "protected-feature";

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
const avatarPresets = [
  { id: "knight", symbol: "🛡️", label: "الفارس" },
  { id: "astronaut", symbol: "🚀", label: "رائد الفضاء" },
  { id: "wizard", symbol: "🧙", label: "الساحر" },
  { id: "lion", symbol: "🦁", label: "الأسد" },
  { id: "fox", symbol: "🦊", label: "الثعلب" },
  { id: "unicorn", symbol: "🦄", label: "وحيد القرن" },
] as const;

function avatarSymbol(preset: string | undefined, fallback: string) {
  return avatarPresets.find((item) => item.id === preset)?.symbol ?? fallback;
}

function AvatarVisual({ value, alt }: { value: string; alt: string }) {
  return value.startsWith("/api/") || value.startsWith("http")
    ? <img className="avatar-photo" src={value} alt={alt} />
    : <>{value}</>;
}
const kingdomApiUrl = import.meta.env.VITE_KINGDOM_API_URL?.trim()
  || "/api/kingdom-state";
const kingdomApiSaveMethod = "PUT";
const expiredFamilySessionNotice = "انتهت الجلسة لأن رمز المملكة تغيّر. أدخل الرمز الجديد لإعادة الربط.";

function emptySavedState(): SavedState {
  return {
    selectedId: null,
    completed: { ayham: 0, kinan: 0 },
    points: { ayham: 0, kinan: 0 },
    customMissions: { ayham: [], kinan: [] },
    childRewards: { ayham: defaultChildRewards, kinan: defaultChildRewards },
    childContent: defaultChildContent,
    profileAvatars: { ayham: "knight", kinan: "astronaut" },
    profilePhotos: {},
  };
}

function readSavedState(): SavedState {
  const fallback = emptySavedState();
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
      profileAvatars: { ...fallback.profileAvatars, ...(parsed.profileAvatars ?? {}) },
      profilePhotos: { ...fallback.profilePhotos, ...(parsed.profilePhotos ?? {}) },
      childContent: normalizeChildContent(parsed.childContent),
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
    profileAvatars: state.profileAvatars,
    profilePhotos: state.profilePhotos,
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
    profileAvatars: isProfileRecord(candidate.profileAvatars) ? Object.fromEntries(Object.entries(candidate.profileAvatars).filter(([, preset]) => typeof preset === "string")) : {},
    profilePhotos: isProfileRecord(candidate.profilePhotos) ? Object.fromEntries(Object.entries(candidate.profilePhotos).filter(([, url]) => typeof url === "string" && url.startsWith("/api/storage/profile-images/"))) : {},
    childContent: normalizeChildContent(candidate.childContent),
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
  const [familyCode, setFamilyCode] = useState("");
  const [familyUsername, setFamilyUsername] = useState("");
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
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
  const cloudSaveGenerationRef = useRef<number | null>(null);
  const pendingCloudSaveRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const completedProfileIdRef = useRef<ProfileId | null>(null);
  const completedChallengeIdRef = useRef<string | null>(null);
  const completionBasePointsRef = useRef<number | null>(null);
  const completionBaseCompletedRef = useRef<number | null>(null);
  const completionPointsDeltaRef = useRef<number | null>(null);
  const completionCompletedDeltaRef = useRef<number | null>(null);
  const pendingChildUnlockRef = useRef<(() => void) | null>(null);
  const localMutationRef = useRef(0);
  const approvalGateRef = useRef(Boolean(getInitialActiveChallenge()?.approvalStatus));
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
    ],
    [saved.customMissions, selectedId],
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
    approvalGateRef.current = Boolean(active?.approvalStatus);
    setCompletionChoice(active?.completionChoice ?? null);
    setAnswerResult(active?.approvalStatus === "rejected" ? "no" : active?.completionChoice === "pending" ? "yes" : null);
    setExtensionCount(active?.extensionCount ?? 0);
    timerWasRunningRef.current = active?.running ?? false;
    timeUpAnnouncedRef.current = active?.timeUp ?? false;
    pauseBellPlayedRef.current = false;
  }, []);

  const clearMemberSession = useCallback((notice = "") => {
    sessionGenerationRef.current += 1;
    memberTokenRef.current = null;
    memberRoleRef.current = null;
    setMemberToken(null);
    setFamilyCode("");
    setFamilyUsername("");
    setFamilyMembers([]);
    setMembersLoading(false);
    setMembersError("");
    setSelectedId(null);
    const clearedState = emptySavedState();
    savedRef.current = clearedState;
    activeChallengesRef.current = {};
    setSaved(clearedState);
    setActiveChallenges({});
    applyActiveChallenge(null);
    setScreen("choose");
    setTab("quest");
    setProfileAccessAction(null);
    setProfileAccessTarget(null);
    setProfileAccessCode("");
    setProfileAccessError("");
    pendingChildUnlockRef.current = null;
    setFinishCode("");
    setFinishCodeError("");
    setFinishCodeOpen(false);
    setPointResult(null);
    cloudVersionRef.current = null;
    cloudReadyRef.current = false;
    lastCloudSignatureRef.current = null;
    skipCloudSaveRef.current = false;
    cloudSaveGenerationRef.current = null;
    pendingCloudSaveRef.current = false;
    completedProfileIdRef.current = null;
    completedChallengeIdRef.current = null;
    completionBasePointsRef.current = null;
    completionBaseCompletedRef.current = null;
    completionPointsDeltaRef.current = null;
    completionCompletedDeltaRef.current = null;
    setSessionNotice(notice);
    setSyncStatus("needs-code");
  }, [applyActiveChallenge]);

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
    approvalGateRef.current = false;
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
    // A verified completion must not be replaced by an older running timer
    // returned while the newly authorized parent session is being connected.
    if (approvalGateRef.current) return;
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
    const requestedFamilyCode = familyCode;
    const requestedToken = memberTokenRef.current;
    const requestedGeneration = sessionGenerationRef.current;
    const requestedMutation = localMutationRef.current;
    if (!requestedFamilyCode || !requestedToken) return "missing" as const;
    try {
      const response = await fetch(kingdomApiUrl, {
        headers: { "x-family-code": requestedFamilyCode, Authorization: `Bearer ${requestedToken}` },
        cache: "no-store",
      });
      if (response.status === 401) {
        if (
          sessionGenerationRef.current === requestedGeneration
          && familyCode === requestedFamilyCode
          && memberTokenRef.current === requestedToken
        ) clearMemberSession(expiredFamilySessionNotice);
        return "unauthorized" as const;
      }
      if (response.status === 404) return "missing" as const;
      if (!response.ok) throw new Error(`Cloud request failed with ${response.status}.`);

      const payload = await response.json() as CloudStateResponse;
      if (
        sessionGenerationRef.current !== requestedGeneration
        || familyCode !== requestedFamilyCode
        || memberTokenRef.current !== requestedToken
        || localMutationRef.current !== requestedMutation
      ) return "stale" as const;
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
  }, [applyCloudState, clearMemberSession, familyCode]);

  const saveCloudState = useCallback(async (keepalive = false) => {
    const requestedFamilyCode = familyCode;
    const requestedToken = memberTokenRef.current;
    const requestedGeneration = sessionGenerationRef.current;
    if (!requestedFamilyCode || !requestedToken || !cloudReadyRef.current) return;
    if (cloudSaveInFlightRef.current && cloudSaveGenerationRef.current === requestedGeneration) {
      pendingCloudSaveRef.current = true;
      return;
    }

    cloudSaveInFlightRef.current = true;
    cloudSaveGenerationRef.current = requestedGeneration;
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
            }
          : toSyncedKingdomState(savedRef.current);
        const challengesForSave = isChildInitialState
          ? (activeChallengesRef.current[selectedId] ? { [selectedId]: activeChallengesRef.current[selectedId] } : {})
          : activeChallengesRef.current;
        const response = await fetch(kingdomApiUrl, {
          method: kingdomApiSaveMethod,
          headers: {
            "Content-Type": "application/json",
            "x-family-code": requestedFamilyCode,
            Authorization: `Bearer ${requestedToken}`,
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

        if (response.status === 401) {
          if (
            sessionGenerationRef.current === requestedGeneration
            && familyCode === requestedFamilyCode
            && memberTokenRef.current === requestedToken
          ) clearMemberSession(expiredFamilySessionNotice);
          return;
        }
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
        if (
          sessionGenerationRef.current !== requestedGeneration
          || familyCode !== requestedFamilyCode
          || memberTokenRef.current !== requestedToken
        ) return;
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
      if (
        sessionGenerationRef.current === requestedGeneration
        && familyCode === requestedFamilyCode
        && memberTokenRef.current === requestedToken
      ) setSyncStatus("offline");
    } finally {
      if (cloudSaveGenerationRef.current === requestedGeneration) {
        cloudSaveInFlightRef.current = false;
        cloudSaveGenerationRef.current = null;
      }
    }
  }, [clearMemberSession, familyCode, pullCloudState]);

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
    const requestedFamilyCode = familyCode;
    const requestedGeneration = sessionGenerationRef.current;
    setMembersLoading(true); setMembersError("");
    void accountsApi.familyMembers(familyUsername, familyCode).then((result) => {
      if (
        !cancelled
        && sessionGenerationRef.current === requestedGeneration
        && familyCode === requestedFamilyCode
      ) {
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
      if (
        !cancelled
        && sessionGenerationRef.current === requestedGeneration
        && familyCode === requestedFamilyCode
      ) {
        if (isFamilySessionFailure(cause)) {
          clearMemberSession(expiredFamilySessionNotice);
        } else {
          setMembersError(cause instanceof Error ? cause.message : "تعذر تحميل ملفات العائلة.");
        }
      }
    }).finally(() => { if (!cancelled) setMembersLoading(false); });
    return () => { cancelled = true; };
  }, [clearMemberSession, familyCode, familyUsername]);

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

  const connectFamily = async (username: string, code: string) => {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedCode = code.trim();
    await accountsApi.bootstrapFamily(normalizedUsername, normalizedCode);
    clearMemberSession();
    setFamilyUsername(normalizedUsername);
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
    if (profileAccessAction === "protected-feature") pendingChildUnlockRef.current = null;
    setProfileAccessAction(null);
    setProfileAccessTarget(null);
    setProfileAccessCode("");
    setProfileAccessError("");
  };

  const verifyProfileAccess = async () => {
    const action = profileAccessAction;
    const target = profileAccessTarget;
    const enteredCode = profileAccessCode.trim();
    if (action === "protected-feature") {
      if (enteredCode !== familyCode.trim()) {
        setProfileAccessCode("");
        setProfileAccessError("رمز المملكة غير صحيح. حاول مرة أخرى.");
        return;
      }
      const onUnlocked = pendingChildUnlockRef.current;
      pendingChildUnlockRef.current = null;
      cancelProfileAccess();
      onUnlocked?.();
      return;
    }
    const childId = action === "enter" ? target : null;
    const member = childId ? familyMembers.find((item) => item.id === childId && item.role === "child") : owner;
    if (!member) { setProfileAccessError(action === "enter" ? "هذا الملف غير متاح." : "أضف ولي أمر من لوحة الإدارة أولاً."); return; }
    try {
      const session = await accountsApi.verifyMember(familyUsername, familyCode, member.id, enteredCode, action === "enter" ? "child" : "owner");
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
    } catch (cause) {
      if (isFamilySessionFailure(cause)) {
        clearMemberSession(expiredFamilySessionNotice);
        return;
      }
      setProfileAccessCode(""); setProfileAccessError("الرمز غير صحيح. حاول مرة أخرى.");
    }
  };

  const requestChildUnlock = (onUnlocked: () => void) => {
    if (!profile) return;
    pendingChildUnlockRef.current = onUnlocked;
    requestProfileAccess("protected-feature", profile.id);
  };

  const startMission = (nextMission: Mission) => {
    if (mission && !pointResult) {
      if (mission.id === nextMission.id) {
        playSound("click");
        setScreen("quest");
      }
      return;
    }
    localMutationRef.current += 1;
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
    approvalGateRef.current = false;
    setCompletionChoice(null);
    setExtensionCount(0);
    timerWasRunningRef.current = false;
    timeUpAnnouncedRef.current = false;
    pauseBellPlayedRef.current = false;
    playSound("start");
    setScreen("quest");
  };

  const requestMissionStart = (nextMission: Mission) => {
    requestChildUnlock(() => {
      startMission(nextMission);
    });
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
      const session = await accountsApi.verifyMember(familyUsername, familyCode, owner.id, finishCode.trim(), "owner");
      memberTokenRef.current = session.token; setMemberToken(session.token);
      memberRoleRef.current = session.role;
    } catch (cause) {
      if (isFamilySessionFailure(cause)) {
        clearMemberSession(expiredFamilySessionNotice);
        return;
      }
      setFinishCode(""); setFinishCodeError("الرمز غير صحيح. حاول مرة أخرى."); return;
    }
    timerWasRunningRef.current = false;
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
    approvalGateRef.current = true;
    setScreen("gate");
  };

  const openEarlyFinishCode = () => {
    if (!mission || timeUp || alertSeconds > 0 || !timerRunning) return;
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
    approvalGateRef.current = false;
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
    approvalGateRef.current = false;
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

  const createMission = (title: string, durationMinutes: number, rewardPoints: number) => {
    if (!profile || !Number.isInteger(rewardPoints) || rewardPoints < 1 || rewardPoints > 50) return;
    const newMission: SavedMission = {
      id: `custom-${Date.now()}`,
      title,
      description: "مهمة كتبتها أنت. أنجزها كاملة قبل أن يهرب الملل.",
      duration: durationMinutes * 60,
      rewardPoints,
    };
    localMutationRef.current += 1;
    setSaved((current) => ({
      ...current,
      customMissions: {
        ...current.customMissions,
        [profile.id]: [...(current.customMissions[profile.id] ?? []), newMission],
      },
    }));
  };

  const uploadProfilePhoto = async (profileId: ProfileId, file: File) => {
    const token = memberTokenRef.current;
    if (!token || memberRoleRef.current !== "owner") throw new Error("أدخل رمز المملكة من مرصد الوالدين أولاً.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error("اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 5 ميجابايت.");
    }
    const prepared = await fetch("/api/storage/profile-images/request-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-family-code": familyCode,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ profileId, name: file.name, size: file.size, contentType: file.type }),
    });
    if (!prepared.ok) throw new Error("تعذر تجهيز رفع الصورة.");
    const { uploadURL, photoUrl } = await prepared.json() as { uploadURL: string; photoUrl: string };
    const uploaded = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!uploaded.ok) throw new Error("تعذر رفع الصورة. حاول مرة أخرى.");
    setSaved((current) => ({ ...current, profilePhotos: { ...current.profilePhotos, [profileId]: photoUrl } }));
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

  const finishReadingStory = async (code: string): Promise<{ ok: boolean; error?: string }> => {
    if (!profile || !owner) return { ok: false, error: "أضف ولي أمر من لوحة الإدارة أولاً." };
    try {
      const session = await accountsApi.verifyMember(familyUsername, familyCode, owner.id, code.trim(), "owner");
      memberTokenRef.current = session.token;
      memberRoleRef.current = session.role;
      awardExtraPoints(saved.childContent.pointRewards.readingStory);
      return { ok: true };
    } catch (cause) {
      if (isFamilySessionFailure(cause)) {
        clearMemberSession(expiredFamilySessionNotice);
        return { ok: false, error: expiredFamilySessionNotice };
      }
      return { ok: false, error: "الرمز غير صحيح. حاول مرة أخرى." };
    }
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
      const session = await accountsApi.verifyMember(familyUsername, familyCode, owner.id, enteredCode.trim(), "owner");
      memberTokenRef.current = session.token; setMemberToken(session.token);
      memberRoleRef.current = session.role;
      void pullCloudState(true);
    } catch (cause) {
      if (isFamilySessionFailure(cause)) clearMemberSession(expiredFamilySessionNotice);
      return false;
    }
    setSaved((current) => ({
      ...current,
      completed: { ...current.completed, [profile.id]: 0 },
      points: { ...current.points, [profile.id]: 0 },
    }));
    return true;
  };

  const logout = () => {
    clearMemberSession();
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
      const session = await accountsApi.revealAdmin(code);
      setAdminToken(session.token);
      setAdminOpen(true);
      return true;
    } catch {
      return false;
    }
  };

  if (!familyCode) {
    return <FamilySyncSetup notice={sessionNotice} onConnect={connectFamily} onAdminReveal={revealAdmin} adminToken={adminToken} adminOpen={adminOpen} onCloseAdmin={() => { setAdminOpen(false); setAdminToken(null); }} />;
  }

  if (screen === "choose" || !selectedId || !profile) {
    return (
      <>
        <ProfileChooser profiles={availableProfiles} profileAvatars={saved.profileAvatars} profilePhotos={saved.profilePhotos} loading={membersLoading} error={membersError} onChoose={(id) => requestProfileAccess("enter", id)} onBack={logout} onLogout={logout} />
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
            <span className="mini-avatar" aria-label={`رمز ${activeProfile.name}`}><AvatarVisual value={saved.profilePhotos[activeProfile.id] ?? avatarSymbol(saved.profileAvatars[activeProfile.id], activeProfile.initials)} alt={activeProfile.name} /></span>
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
                <span className="mini-avatar" aria-label={`رمز ${activeProfile.name}`}><AvatarVisual value={saved.profilePhotos[activeProfile.id] ?? avatarSymbol(saved.profileAvatars[activeProfile.id], activeProfile.initials)} alt={activeProfile.name} /></span>
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
              <ParentView profiles={availableProfiles} saved={saved} soundPreferences={soundPreferencesState} onSoundPreferencesChange={updateSoundPreferences} onChooseProfile={() => requestProfileAccess("switch")} onChooseAvatar={(profileId, preset) => setSaved((current) => ({ ...current, profileAvatars: { ...current.profileAvatars, [profileId]: preset }, profilePhotos: { ...current.profilePhotos, [profileId]: "" } }))} onUploadPhoto={uploadProfilePhoto} />
            ) : screen === "home" ? (
              <HomeView profile={activeProfile} avatar={saved.profilePhotos[activeProfile.id] ?? avatarSymbol(saved.profileAvatars[activeProfile.id], activeProfile.initials)} completed={completed} points={points} childRewards={saved.childRewards[activeProfile.id] ?? defaultChildRewards} childContent={saved.childContent} activeMission={mission && !pointResult ? mission : null} missions={profileMissions} onStart={requestMissionStart} onCreateMission={(...args) => requestChildUnlock(() => createMission(...args))} onDeleteMission={(missionId) => requestChildUnlock(() => deleteMission(missionId))} onResetMap={resetMap} onSpendReward={spendRewardPoints} onOpenRewardBox={openRewardBox} onAwardExtraPoints={awardExtraPoints} onFinishStory={finishReadingStory} onRequestUnlock={requestChildUnlock} onParent={() => requestProfileAccess("parent")} />
            ) : screen === "quest" && mission ? (
              <QuestView mission={mission} avatar={saved.profilePhotos[activeProfile.id] ?? avatarSymbol(saved.profileAvatars[activeProfile.id], activeProfile.initials)} seconds={seconds} running={timerRunning} timeUp={timeUp} extensionCount={extensionCount} pauseActive={pauseActive} pauseSeconds={pauseSeconds} pauseResumeBlockedUntil={pauseResumeBlockedUntil} alertSeconds={alertSeconds} graceSeconds={graceSeconds} finishCodeOpen={finishCodeOpen} finishCode={finishCode} error={finishCodeError} onBack={leaveMission} onCancelBeforeStart={newChallenge} onStartTimer={startTimer} onPause={pauseMission} onResume={resumeMission} onExtend={extendMission} onOpenFinishCode={() => { if (graceSeconds > 0) { setFinishCodeOpen(true); setFinishCodeError(""); } }} onOpenEarlyFinish={openEarlyFinishCode} onCancelFinishCode={closeFinishCode} onCode={setFinishCode} onVerifyCode={verifyFinishCode} />
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

function FamilySyncSetup({ notice, onConnect, onAdminReveal, adminToken, adminOpen, onCloseAdmin }: { notice?: string; onConnect: (username: string, code: string) => Promise<void>; onAdminReveal: (code: string) => Promise<boolean>; adminToken: string | null; adminOpen: boolean; onCloseAdmin: () => void }) {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealCode, setRevealCode] = useState("");
  const [revealError, setRevealError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    const normalizedCode = code.trim();
    if (!/^[A-Za-z0-9]{3,32}$/.test(normalizedUsername)) {
      setError("اكتب اسم مستخدم للعائلة بالإنجليزية والأرقام فقط (3–32 رمزاً).");
      return;
    }
    if (normalizedCode.length < 4 || normalizedCode.length > 64) {
      setError("اكتب رمز عائلة من 4 إلى 64 حرفاً أو رقماً.");
      return;
    }
    try {
      await onConnect(normalizedUsername, normalizedCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز العائلة. حاول مرة أخرى.");
    }
  };

  const submitReveal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = revealCode.trim();
    if (normalizedCode.length < 4 || normalizedCode.length > 64) {
      setRevealError("اكتب رمز الكشف بشكل صحيح.");
      return;
    }
    setRevealError("");
    if (await onAdminReveal(normalizedCode)) {
      setRevealCode("");
      setRevealOpen(false);
    } else {
      setRevealError("رمز الكشف غير صحيح.");
    }
  };

  return (
    <div className="kingdom-app family-sync-page" dir="rtl">
      <section className="family-sync-card" data-testid="panel-family-sync-setup">
        <div className="brand-mark"><Crown size={24} /></div>
        <div className="eyebrow" style={{ justifyContent: "center" }}>ربط أجهزة العائلة</div>
        <h1 className="display-title">احتفظوا بالمملكة متصلة</h1>
        <p>أدخلوا اسم مستخدم العائلة ورمزها في أي هاتف أو متصفح لتظهر النقاط والمهام والمؤقت كما هي.</p>
         <form autoComplete="off" onSubmit={(event) => void submit(event)}>
          <label htmlFor="family-username">إسم المستخدم</label>
          <input id="family-username" className="code-input" data-testid="input-family-username" type="text" name="family_username" autoComplete="off" inputMode="text" pattern="[A-Za-z0-9]{3,32}" minLength={3} maxLength={32} value={username} onChange={(event) => { setUsername(event.target.value.replace(/[^A-Za-z0-9]/g, "")); setError(""); }} autoFocus />
          <label htmlFor="family-code">الرمز</label>
          <input id="family-code" className="code-input" data-testid="input-family-code" type="password" name="family_access_code" autoComplete="new-password" minLength={4} maxLength={64} value={code} onChange={(event) => { setCode(event.target.value); setError(""); }} />
          {(error || notice) && <p className="form-error" data-testid="status-family-code-error">{error || notice}</p>}
          <button className="primary-button gold" type="submit" data-testid="button-connect-family"><KeyRound size={16} /> ربط المملكة</button>
        </form>
         <div className="admin-entry-tools">
           <button className="admin-reveal-trigger" type="button" data-testid="button-open-reveal" aria-expanded={revealOpen} onClick={() => { setRevealOpen((open) => !open); setRevealError(""); }}><Unlock size={16} /> إعادة ضبط</button>
           {revealOpen && <form className="admin-reveal-form" onSubmit={(event) => void submitReveal(event)}>
             <label htmlFor="admin-reveal-code">رمز الدخول</label>
             <input id="admin-reveal-code" className="code-input" data-testid="input-admin-reveal-code" type="password" name="admin_reveal_code" autoComplete="new-password" minLength={4} maxLength={64} value={revealCode} onChange={(event) => { setRevealCode(event.target.value); setRevealError(""); }} autoFocus />
             {revealError && <p className="form-error" data-testid="status-admin-reveal-error">{revealError}</p>}
             <button className="secondary-button" type="submit" data-testid="button-submit-admin-reveal"><ShieldCheck size={15} /> موافق</button>
           </form>}
         </div>
      </section>
      <InstallAppButton />
       {adminOpen && adminToken && <div className="admin-backdrop"><AdminConsole initialToken={adminToken} onClose={onCloseAdmin} /></div>}
    </div>
  );
}

function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (!promptEvent && !isIos) return null;
  return <div className="pwa-install">
    {promptEvent ? <button className="outline-button" type="button" onClick={() => { void promptEvent.prompt().then(() => setPromptEvent(null)); }}><Plus size={16} /> تثبيت المملكة على الجهاز</button> : <span>على iPhone/iPad: اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية» لتثبيت المملكة.</span>}
  </div>;
}

function ProfileChooser({
  profiles: selectableProfiles,
  profileAvatars,
  profilePhotos,
  loading,
  error,
  onChoose,
  onBack,
  onLogout,
}: {
  profiles: Profile[];
  profileAvatars: Record<ProfileId, string>;
  profilePhotos: Record<ProfileId, string>;
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
                <div className="profile-avatar"><span aria-hidden="true"><AvatarVisual value={profilePhotos[item.id] ?? avatarSymbol(profileAvatars[item.id], item.initials)} alt={item.name} /></span>{!profilePhotos[item.id] && <Icon className="profile-avatar-icon" size={47} strokeWidth={1.8} />}</div>
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
         <h2 id="profile-access-title">{action === "enter" ? "افتح ملف البطل" : action === "protected-feature" ? "افتح ميزة البطل" : action === "parent" ? "افتح مرصد الوالدين" : "تأكيد تبديل البطل"}</h2>
          <p>أدخل الرمز الموحد للمملكة لإكمال هذا الإجراء.</p>
        <form onSubmit={(event) => { event.preventDefault(); onVerify(); }}>
            <label htmlFor="profile-access-code">الرمز الموحد للمملكة</label>
          <input
            id="profile-access-code"
            className="code-input"
            data-testid="input-profile-access-code"
            type="password"
            name="member_access_code"
            autoComplete="new-password"
            minLength={4}
            maxLength={64}
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
  avatar,
  completed,
  points,
  childRewards,
  childContent,
  activeMission,
  missions: availableMissions,
  onStart,
  onCreateMission,
  onDeleteMission,
  onResetMap,
  onSpendReward,
  onOpenRewardBox,
  onAwardExtraPoints,
  onFinishStory,
  onRequestUnlock,
  onParent,
}: {
  profile: Profile;
  avatar: string;
  completed: number;
  points: number;
  childRewards: ChildRewardsState;
  childContent: ChildContentConfig;
  activeMission: Mission | null;
  missions: Mission[];
  onStart: (mission: Mission) => void;
  onCreateMission: (title: string, durationMinutes: number, rewardPoints: number) => void;
  onDeleteMission: (missionId: string) => void;
  onResetMap: (code: string) => Promise<boolean>;
  onSpendReward: (cost: number, itemId: string) => boolean;
  onOpenRewardBox: (opening: BoxOpening) => void;
  onAwardExtraPoints: (amount: number) => void;
  onFinishStory: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onRequestUnlock: (onUnlocked: () => void) => void;
  onParent: () => void;
}) {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskMinutes, setTaskMinutes] = useState("10");
  const [taskPoints, setTaskPoints] = useState("10");
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
    const rewardPoints = Number(taskPoints);
    if (!Number.isInteger(rewardPoints) || rewardPoints < 1 || rewardPoints > 50) {
      setTaskError("اختر مكافأة بين نقطة واحدة و50 نقطة.");
      return;
    }
    onCreateMission(title, minutes, rewardPoints);
    setTaskTitle("");
    setTaskMinutes("10");
    setTaskPoints("10");
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
        <form className="mission-composer" onSubmit={submitMission} data-testid="form-create-mission">
          <div className="composer-fields">
            <label><span>اسم المهمة</span><input data-testid="input-mission-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="مهمة جديدة" /></label>
            <label className="minutes-field"><span>الدقائق</span><input data-testid="input-mission-duration" type="number" min="1" max="120" step="1" value={taskMinutes} onChange={(event) => setTaskMinutes(event.target.value)} /></label>
            <label className="points-field"><span>النقاط</span><input data-testid="input-mission-reward" type="number" min="1" max="50" step="1" value={taskPoints} onChange={(event) => setTaskPoints(event.target.value)} /></label>
            <button className="primary-button" type="submit" data-testid="button-create-mission"><Plus size={16} /> إضافة المهمة</button>
          </div>
          {taskError && <p className="form-error" data-testid="status-create-mission-error">{taskError}</p>}
        </form>
        <div className="missions-grid">
             {availableMissions.map((item) => {
            const Icon = item.icon;
                const isLatestCustom = item.id.startsWith("custom-") && item.id === availableMissions.at(-1)?.id;
                const missionCard = <button key={item.id} className={`mission-card ${item.featured ? "featured" : ""} ${isLatestCustom ? "latest-custom-mission" : ""}`} data-testid={`button-mission-${item.id}`} data-sound="start" onClick={() => onStart(item)} disabled={Boolean(activeMission && activeMission.id !== item.id)}>
                 <div className="mission-top"><span className="mission-icon"><Icon size={19} /></span><span className="mission-duration"><Clock3 size={12} style={{ verticalAlign: "middle", marginLeft: 3 }} /> {formatDuration(item.duration)}</span><span className="card-avatar" aria-label={`رمز ${profile.name}`}><AvatarVisual value={avatar} alt={profile.name} /></span></div>
                  <h3>{item.title}</h3><p>{item.description}</p>{item.rewardPoints && <span className="mission-reward">مكافأة {item.rewardPoints.toLocaleString("ar-SA")} نقطة</span>}<ArrowLeft className="mission-arrow" size={18} />
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
              <div><strong>فاز {profile.name} بالمرحلة الأخيرة!</strong><span>أدخل الرمز الموحد للمملكة لإعادة الرحلة إلى المرحلة الأولى.</span></div>
              <div className="map-reset-actions"><input data-testid="input-map-reset-code" className="code-input" type="password" name="map_reset_code" autoComplete="new-password" value={resetCode} onChange={(event) => setResetCode(event.target.value)} aria-label="الرمز الموحد للمملكة لإعادة الخريطة" /><button className="outline-button" type="button" data-testid="button-reset-map" onClick={() => void submitMapReset()}><RotateCcw size={15} /> إعادة الخريطة</button></div>
              {resetError && <p className="form-error" data-testid="status-map-reset-error">{resetError}</p>}
            </div>}
        </div>
      </section>
      <ChildExtras content={childContent} points={points} rewards={childRewards} childName={profile.name} childAvatar={avatar} onSpend={onSpendReward} onOpenBox={onOpenRewardBox} onAwardPoints={onAwardExtraPoints} onFinishStory={onFinishStory} onRequestUnlock={onRequestUnlock} />
    </>
  );
}

function QuestView({
  mission,
  avatar,
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
  onCancelBeforeStart,
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
  avatar: string;
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
  onCancelBeforeStart: () => void;
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
  const canFinishEarly = running;
  const resumeWaitSeconds = pauseActive && pauseResumeBlockedUntil
    ? Math.max(0, Math.ceil((pauseResumeBlockedUntil - Date.now()) / 1000))
    : 0;
  return (
    <>
      <div className="quest-header"><button className="back-button" data-testid="button-back-to-missions" aria-label="العودة للمهام" onClick={onBack}><ArrowLeft size={18} /></button><div><div className="eyebrow">ميدان التحدي</div><p className="subtle">أثبت أن تركيزك أقوى من الملل.</p></div></div>
      <div className="quest-layout">
        <section className="quest-card" data-testid="panel-active-quest">
          <div className="eyebrow"><Icon size={14} /> المهمة النشطة <span className="card-avatar quest-avatar" aria-label="رمز البطل"><AvatarVisual value={avatar} alt="البطل" /></span></div><h1 data-testid="text-active-mission">{mission.title}</h1><p className="quest-description">{mission.description}</p>
           <div className={`timer-shell ${running ? "running" : ""} ${pauseActive ? "paused" : ""} ${alertSeconds > 0 ? "alerting" : ""}`} style={{ background: `conic-gradient(hsl(var(--accent)) 0 ${progress}%, rgba(249,240,214,.11) ${progress}% 100%)` }}><div className="timer-core"><span className="timer-number" data-testid="display-countdown">{timeUp && alertSeconds === 0 && graceSeconds > 0 ? formatTime(graceSeconds) : formatTime(seconds)}</span><span className="timer-label">{pauseActive ? `استراحة ${formatTime(pauseSeconds)}` : alertSeconds > 0 ? `تنبيه النهاية ${formatTime(alertSeconds)}` : timeUp && graceSeconds > 0 ? "مهلة القرار" : seconds === 0 ? "اكتمل الوقت" : running ? "المعركة جارية" : "جاهز للانطلاق"}</span></div></div>
           <div className="quest-actions">
               {pauseActive ? <button className="primary-button gold" data-testid="button-resume-timer" onClick={onResume} disabled={resumeWaitSeconds > 0}><Play size={16} /> {resumeWaitSeconds > 0 ? `انتظر ${resumeWaitSeconds} ثوانٍ` : "استئناف التحدي"}</button> : running ? <button className="primary-button gold" data-testid="button-pause-timer" onClick={onPause} disabled={pauseSeconds <= 0}><Pause size={16} /> {pauseSeconds > 0 ? `إيقاف مؤقت (${formatTime(pauseSeconds)})` : "نفد رصيد الاستراحة"}</button> : <><button className="primary-button gold" data-testid="button-start-timer" onClick={onStartTimer} disabled={seconds === 0 || alertSeconds > 0}><Play size={16} /> ابدأ العدّاد</button>{!timeUp && <button className="outline-button cancel-before-start" type="button" data-testid="button-cancel-before-start" onClick={onCancelBeforeStart}><CircleX size={16} /> إلغاء قبل البدء</button>}</>}
              {!timeUp && canFinishEarly && !finishCodeOpen && <button className="outline-button early-finish-button" data-testid="button-finish-early" onClick={onOpenEarlyFinish}><KeyRound size={16} /> إنهاء المهمة الآن</button>}
            </div>
            {!timeUp ? finishCodeOpen ? (
              <form className="finish-code-box early-finish-code-box" onSubmit={(event) => { event.preventDefault(); onVerifyCode(); }}>
                <strong>إنهاء المهمة قبل انتهاء الوقت</strong>
                <label htmlFor="finish-code">الرمز الموحد للمملكة</label>
                 <input id="finish-code" className="code-input" data-testid="input-finish-code" type="password" name="finish_code" autoComplete="new-password" maxLength={64} value={finishCode} onChange={(event) => onCode(event.target.value)} aria-label="الرمز الموحد للمملكة" autoFocus />
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
                   <label htmlFor="finish-code">الرمز الموحد للمملكة</label>
                      <input id="finish-code" className="code-input" data-testid="input-finish-code" type="password" name="finish_code" autoComplete="new-password" maxLength={64} value={finishCode} onChange={(event) => onCode(event.target.value)} aria-label="الرمز الموحد للمملكة" autoFocus />
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
          <p>بعد إدخال الرمز الموحد للمملكة، يتأكد المسؤول من أن المهمة الكاملة أُنجزت فعلاً في الدفتر أو الكتاب.</p>
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
  onChooseProfile,
  onChooseAvatar,
  onUploadPhoto,
}: {
  profiles: Profile[];
  saved: SavedState;
  soundPreferences: SoundPreferences;
  onSoundPreferencesChange: (preferences: SoundPreferences) => void;
  onChooseProfile: () => void;
  onChooseAvatar: (profileId: ProfileId, preset: string) => void;
  onUploadPhoto: (profileId: ProfileId, file: File) => Promise<void>;
}) {
  const total = dynamicProfiles.reduce((sum, item) => sum + (saved.completed[item.id] ?? 0), 0);
  const [uploadStatus, setUploadStatus] = useState<Record<ProfileId, string>>({});
  return (
    <section className="parent-view">
      <div className="parent-banner"><div><div className="eyebrow">مرصد الوالدين • {getArabicDate()}</div><h1>غرفة القيادة العائلية</h1><p>ملخص لطيف لما أنجزه الأبطال اليوم، من دون تحويل الرحلة إلى جدول درجات.</p></div><div className="parent-total" data-testid="display-family-total"><strong>{total}</strong><span>مهمة في دفتر العائلة</span></div></div>
      <section className="avatar-picker panel" data-testid="panel-avatar-picker">
        <h2 className="panel-title">صور الأبطال</h2><p className="panel-subtitle">ارفعوا صورة الطفل من الهاتف أو اختاروا رمزاً جاهزاً. تتزامن الصورة مع أجهزة العائلة.</p>
        <div className="avatar-picker-children">{dynamicProfiles.map((child) => <div className="avatar-picker-child" key={child.id}><strong>{child.name}</strong><span className="profile-photo-preview"><AvatarVisual value={saved.profilePhotos[child.id] ?? avatarSymbol(saved.profileAvatars[child.id], child.initials)} alt={child.name} /></span><label className="outline-button avatar-upload-button"><ImagePlus size={15} /> رفع صورة<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; setUploadStatus((current) => ({ ...current, [child.id]: "جارٍ رفع الصورة…" })); try { await onUploadPhoto(child.id, file); setUploadStatus((current) => ({ ...current, [child.id]: "تم حفظ الصورة ومزامنتها." })); } catch (error) { setUploadStatus((current) => ({ ...current, [child.id]: error instanceof Error ? error.message : "تعذر رفع الصورة." })); } input.value = ""; }} /></label>{uploadStatus[child.id] && <small className="avatar-upload-status">{uploadStatus[child.id]}</small>}<div className="avatar-preset-list">{avatarPresets.map((preset) => <button key={preset.id} type="button" className={`avatar-preset ${!saved.profilePhotos[child.id] && saved.profileAvatars[child.id] === preset.id ? "selected" : ""}`} aria-label={`${preset.label} لـ${child.name}`} aria-pressed={!saved.profilePhotos[child.id] && saved.profileAvatars[child.id] === preset.id} onClick={() => onChooseAvatar(child.id, preset.id)}><span>{preset.symbol}</span><small>{preset.label}</small></button>)}</div></div>)}</div>
      </section>
      <div className="parent-grid">
        <div className="panel"><div className="panel-top"><div><h2 className="panel-title">نبض الأبطال</h2><p className="panel-subtitle">هذا الأسبوع حتى الآن</p></div><Trophy color="hsl(var(--accent))" /></div><div className="child-progress">
          {dynamicProfiles.length === 0 ? <p className="subtle">لا توجد ملفات أطفال.</p> : dynamicProfiles.map((child) => <div className="child-progress-row" key={child.id}><span className="mini-avatar" aria-label={`رمز ${child.name}`}><AvatarVisual value={saved.profilePhotos[child.id] ?? avatarSymbol(saved.profileAvatars[child.id], child.initials)} alt={child.name} /></span><div className="child-progress-copy"><strong>{child.name}</strong><span>{saved.completed[child.id] ?? 0} مهام مكتملة • {(saved.points[child.id] ?? 0).toLocaleString("ar-SA")} / {mapTotalPoints} نقطة</span><div className="progress-small"><i style={{ width: `${Math.min(100, ((saved.points[child.id] ?? 0) / mapTotalPoints) * 100)}%` }} /></div></div></div>)}
        </div><button className="outline-button" data-testid="button-switch-from-parent" onClick={onChooseProfile} style={{ width: "100%", marginTop: 24 }}><Users size={15} /> تبديل ملف البطل</button></div>
        <div className="panel"><div className="panel-top"><div><h2 className="panel-title">سجل اليوم</h2><p className="panel-subtitle">محطات صغيرة تصنع عادة كبيرة.</p></div><ChartNoAxesColumnIncreasing color="hsl(var(--primary))" /></div><div className="timeline">
          <div className="timeline-item"><span className="timeline-icon"><Check size={14} /></span><div className="timeline-copy"><strong>تم تجهيز الرحلة</strong><p>الحقيبة جاهزة والأدوات في مكانها.</p></div></div>
          <div className="timeline-item"><span className="timeline-icon"><Star size={14} fill="currentColor" /></span><div className="timeline-copy"><strong>محطة الإفطار</strong><p>بدأ اليوم بطاقة هادئة.</p></div></div>
          {total > 0 ? <div className="timeline-item"><span className="timeline-icon"><Trophy size={14} /></span><div className="timeline-copy"><strong>كنز جديد في الدفتر</strong><p>آخر إنجاز عائلي: {total} مهام مكتملة.</p></div></div> : <div className="empty-reward" data-testid="empty-parent-activity"><CircleHelp size={17} /><div>لم يبدأ أي بطل مهمة بعد. الخريطة تنتظر أول خطوة.</div></div>}
        </div></div>
      </div>
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
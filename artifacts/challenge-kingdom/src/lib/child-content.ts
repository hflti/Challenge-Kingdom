import contract from "../../public/child-content-contract.json";
import fullyVocalizedStoriesSource from "../../../../attached_assets/Pasted---1788326937780_1788326937781.txt?raw";

const rules = contract.rules;
const legacyDefaultReadingStoryIds = [
  "fast-rabbit",
  "moon-trip",
  "tree-friend",
  "knowledge-treasure",
  "busy-bee",
  "golden-key",
] as const;

function bundledVocalizedStories(): ReadingStoryContent[] {
  const sections: Array<{ title: string; lines: string[] }> = [];
  for (const rawLine of fullyVocalizedStoriesSource.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = line.match(/^\d+\.\s+(.+)$/);
    if (heading) {
      sections.push({ title: heading[1].trim(), lines: [] });
    } else if (line && sections.length > 0) {
      sections[sections.length - 1].lines.push(line);
    }
  }
  return contract.baseContent.readingStories.map((story, index) => ({
    id: story.id,
    title: sections[index]?.title ?? story.title,
    text: sections[index]?.lines.join("\n\n") || story.text,
  }));
}

export type LetterGameContent = {
  id: string;
  title: string;
  description: string;
  question: string;
  options: string[];
  answer: string;
};

export type NumberQuestionContent = {
  id: string;
  prompt: string;
  answer: number;
};

export type ReadingStoryContent = {
  id: string;
  title: string;
  text: string;
};

export type RewardKind = "screen" | "treat" | "money" | "game";

export type StoreItemContent = {
  id: string;
  title: string;
  cost: number;
  kind: RewardKind;
  imageUrl?: string;
};

export type PointRewardsContent = {
  letterAnswer: number;
  numberAnswer: number;
  readingStory: number;
};

export type ChildContentConfig = {
  letterGames: LetterGameContent[];
  numberQuestions: NumberQuestionContent[];
  readingStories: ReadingStoryContent[];
  storeItems: StoreItemContent[];
  majorBoxRewards: number[];
  displayBoxRewards: number[];
  pointRewards: PointRewardsContent;
};

export const defaultChildContent: ChildContentConfig = {
  letterGames: [
    { id: "match-letter", title: "طابق الحرف", description: "اختر الحرف الذي يبدأ به اسم الصورة.", question: "بَاب", options: ["ب", "ت", "م"], answer: "ب" },
    { id: "order-letters", title: "رتّب الحروف", description: "ما الكلمة الصحيحة؟", question: "ب ـ ا ـ ت ـ ك", options: ["كِتَاب", "بَاتِك", "تَابِك"], answer: "كِتَاب" },
    { id: "missing-letter", title: "الحرف الناقص", description: "أكمل الكلمة بالحرف المناسب.", question: "قَلَـ", options: ["م", "ب", "ر"], answer: "م" },
    { id: "letter-sound", title: "صوت الحرف", description: "أي كلمة تبدأ بصوت (س)؟", question: "س", options: ["سَمَك", "قَمَر", "بَيْت"], answer: "سَمَك" },
    { id: "english-match", title: "English match", description: "Choose the word that starts with B.", question: "B", options: ["Book", "Moon", "Fish"], answer: "Book" },
    { id: "letter-order", title: "Letter order", description: "Which letter comes after C?", question: "A ـ B ـ C ـ ?", options: ["D", "E", "F"], answer: "D" },
  ],
  numberQuestions: [
    { id: "numbers-1", prompt: "6 + 3", answer: 9 },
    { id: "numbers-2", prompt: "19 − 4", answer: 15 },
    { id: "numbers-3", prompt: "5 × 4", answer: 20 },
    { id: "numbers-4", prompt: "32 ÷ 4", answer: 8 },
    { id: "numbers-5", prompt: "12 + 8", answer: 20 },
  ],
  readingStories: [
    ...bundledVocalizedStories(),
  ],
  storeItems: [
    { id: "tablet-15", title: "استخدام الآيباد 15 دقيقة", cost: 15, kind: "screen" },
    { id: "chocolate", title: "قطعة شوكولاتة", cost: 10, kind: "treat" },
    { id: "pocket-money", title: "زيادة 2 ريال في المصروف", cost: 10, kind: "money" },
    { id: "game-1", title: "لعبة ممتعة: سباق النجوم", cost: 10, kind: "game" },
    { id: "game-2", title: "لعبة ممتعة: صائد الحروف", cost: 10, kind: "game" },
    { id: "game-3", title: "لعبة ممتعة: ذاكرة الأبطال", cost: 10, kind: "game" },
    { id: "game-4", title: "لعبة ممتعة: تحدي الألوان", cost: 10, kind: "game" },
    { id: "game-5", title: "لعبة ممتعة: متاهة الكنز", cost: 10, kind: "game" },
    { id: "game-6", title: "لعبة ممتعة: قفزة القمر", cost: 10, kind: "game" },
    { id: "meal-choice", title: "اختيار وجبة الغد", cost: 20, kind: "treat" },
    { id: "late-night", title: "نصف ساعة إضافية قبل النوم", cost: 25, kind: "screen" },
    { id: "small-toy", title: "لعبة صغيرة أو ملصقات", cost: 25, kind: "treat" },
  ],
  majorBoxRewards: [50, 100, 150],
  displayBoxRewards: [15, 25],
  pointRewards: { letterAnswer: 2, numberAnswer: 1, readingStory: 5 },
};

export type ChildContentValidation = {
  valid: boolean;
  error?: string;
};

function text(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength ? value.trim() : fallback;
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) return fallback;
  const items = value.map((item, index) => text(item, fallback[index] ?? `خيار ${index + 1}`, 120));
  return new Set(items).size === items.length ? items : fallback;
}

function hasUniqueIds(items: Array<{ id: string }>): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

function hasLegacyDefaultReadingStories(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== legacyDefaultReadingStoryIds.length) return false;
  const ids = value.map((item) => item && typeof item === "object" ? (item as ReadingStoryContent).id : null);
  return new Set(ids).size === legacyDefaultReadingStoryIds.length
    && legacyDefaultReadingStoryIds.every((id) => ids.includes(id));
}

function hasPreviousBundledReadingStories(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== contract.baseContent.readingStories.length) return false;
  return contract.baseContent.readingStories.every((story, index) => {
    const candidate = value[index] as Partial<ReadingStoryContent> | undefined;
    return candidate?.id === story.id && candidate?.title === story.title && candidate?.text === story.text;
  });
}

export function validateChildContent(value: unknown): ChildContentValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, error: "محتوى الطفل غير صالح." };
  }
  const content = value as Partial<ChildContentConfig>;
  if (!Array.isArray(content.letterGames) || content.letterGames.length !== rules.letterGamesCount || !hasUniqueIds(content.letterGames)) {
    return { valid: false, error: "يجب إدخال 6 ألعاب حروف بمعرّفات مختلفة." };
  }
  for (const game of content.letterGames) {
    if (!game || typeof game !== "object" || !validText(game.id, rules.letterGameIdMaxLength) || !validText(game.title, rules.letterGameTitleMaxLength) || !validText(game.description, rules.letterGameDescriptionMaxLength) || !validText(game.question, rules.letterGameQuestionMaxLength)
      || !Array.isArray(game.options) || game.options.length < rules.letterGameOptionMinCount || game.options.length > rules.letterGameOptionMaxCount
      || game.options.some((option) => !validText(option, rules.letterGameOptionMaxLength))
      || new Set(game.options).size !== game.options.length
      || !validText(game.answer, rules.letterGameOptionMaxLength) || !game.options.includes(game.answer)) {
      return { valid: false, error: "تأكد من أن كل لعبة حروف تحتوي خيارات مختلفة وإجابة صحيحة ضمنها." };
    }
  }
  if (!Array.isArray(content.numberQuestions) || content.numberQuestions.length !== rules.numberQuestionsCount || !hasUniqueIds(content.numberQuestions)) {
    return { valid: false, error: "يجب إدخال 5 مسائل أرقام بمعرّفات مختلفة." };
  }
  for (const question of content.numberQuestions) {
    if (!question || typeof question !== "object" || !validText(question.id, rules.numberQuestionIdMaxLength) || !validText(question.prompt, rules.numberQuestionPromptMaxLength)
      || !Number.isInteger(question.answer) || question.answer < rules.numberAnswerMin || question.answer > rules.numberAnswerMax) {
      return { valid: false, error: "إجابات مسائل الأرقام يجب أن تكون أعداداً صحيحة بين -10000 و10000." };
    }
  }
  if (!Array.isArray(content.readingStories) || content.readingStories.length !== rules.readingStoriesCount || !hasUniqueIds(content.readingStories)) {
    return { valid: false, error: "يجب إدخال 6 قصص قراءة بمعرّفات مختلفة." };
  }
  for (const story of content.readingStories) {
    if (!story || typeof story !== "object" || !validText(story.id, rules.readingStoryIdMaxLength) || !validText(story.title, rules.readingStoryTitleMaxLength) || !validText(story.text, rules.readingStoryTextMaxLength)) {
      return { valid: false, error: "تأكد من اكتمال عناوين ونصوص القصص." };
    }
  }
  if (!Array.isArray(content.storeItems) || content.storeItems.length !== rules.storeItemsCount) {
    return { valid: false, error: "يجب إدخال 12 مكافأة في المتجر." };
  }
  if (!hasUniqueIds(content.storeItems)) {
    return { valid: false, error: "معرّفات مكافآت المتجر يجب أن تكون مختلفة." };
  }
  for (const item of content.storeItems) {
    if (!item || typeof item !== "object" || !validText(item.id, rules.storeItemIdMaxLength) || !validText(item.title, rules.storeItemTitleMaxLength)
      || !Number.isInteger(item.cost) || item.cost < rules.storeCostMin || item.cost > rules.storeCostMax
      || !(rules.rewardKinds as readonly string[]).includes(item.kind as string)
      || (item.imageUrl !== undefined && (typeof item.imageUrl !== "string" || !/^\/api\/storage\/reward-images\/[0-9a-f-]{36}$/i.test(item.imageUrl)))) {
      return { valid: false, error: "أسعار المتجر يجب أن تكون أعداداً صحيحة بين 5 و25." };
    }
  }
  const validRewardList = (list: unknown, length: number) =>
    Array.isArray(list) && list.length === length
    && list.every((item) => Number.isInteger(item) && item >= rules.boxRewardMin && item <= rules.boxRewardMax)
    && new Set(list).size === list.length;
  if (!validRewardList(content.majorBoxRewards, rules.majorBoxRewardCount) || !validRewardList(content.displayBoxRewards, rules.displayBoxRewardCount)) {
    return { valid: false, error: "يجب إدخال 3 جوائز كبرى وقيمتين تحفيزيتين مختلفتين، بين 1 و10000." };
  }
  const majorRewards = content.majorBoxRewards as number[];
  const displayRewards = content.displayBoxRewards as number[];
  if (Math.min(...majorRewards) <= Math.max(...displayRewards)) {
    return { valid: false, error: "كل جائزة كبرى يجب أن تكون أعلى من قيم التحفيز." };
  }
  const pointRewards = content.pointRewards;
  if (!pointRewards || typeof pointRewards !== "object"
    || !Number.isInteger(pointRewards.letterAnswer) || pointRewards.letterAnswer < rules.pointRewardMin || pointRewards.letterAnswer > rules.pointRewardMax
    || !Number.isInteger(pointRewards.numberAnswer) || pointRewards.numberAnswer < rules.pointRewardMin || pointRewards.numberAnswer > rules.pointRewardMax
    || !Number.isInteger(pointRewards.readingStory) || pointRewards.readingStory < rules.pointRewardMin || pointRewards.readingStory > rules.pointRewardMax) {
    return { valid: false, error: "نقاط التعلّم يجب أن تكون أعداداً صحيحة بين 1 و100." };
  }
  return { valid: true };
}

export function normalizeChildContent(value: unknown): ChildContentConfig {
  if (!value || typeof value !== "object") return defaultChildContent;
  const candidate = value as Partial<ChildContentConfig>;
  const letterGames = Array.isArray(candidate.letterGames) && candidate.letterGames.length === 6
    ? candidate.letterGames.map((item, index) => {
      const fallback = defaultChildContent.letterGames[index];
      const options = stringList(item && typeof item === "object" ? (item as LetterGameContent).options : null, fallback.options);
      return {
        id: text(item && typeof item === "object" ? (item as LetterGameContent).id : null, fallback.id, 80),
        title: text(item && typeof item === "object" ? (item as LetterGameContent).title : null, fallback.title, 120),
        description: text(item && typeof item === "object" ? (item as LetterGameContent).description : null, fallback.description, 240),
        question: text(item && typeof item === "object" ? (item as LetterGameContent).question : null, fallback.question, 160),
        options,
        answer: options.includes(item && typeof item === "object" ? (item as LetterGameContent).answer : "") ? (item as LetterGameContent).answer : fallback.answer,
      };
    })
    : defaultChildContent.letterGames;
  const numberQuestions = Array.isArray(candidate.numberQuestions) && candidate.numberQuestions.length === 5
    ? candidate.numberQuestions.map((item, index) => {
      const fallback = defaultChildContent.numberQuestions[index];
      return {
        id: text(item && typeof item === "object" ? (item as NumberQuestionContent).id : null, fallback.id, 80),
        prompt: text(item && typeof item === "object" ? (item as NumberQuestionContent).prompt : null, fallback.prompt, 80),
        answer: typeof (item && typeof item === "object" ? (item as NumberQuestionContent).answer : null) === "number"
          && Number.isFinite((item as NumberQuestionContent).answer)
          ? Math.round((item as NumberQuestionContent).answer)
          : fallback.answer,
      };
    })
    : defaultChildContent.numberQuestions;
  const readingStories = hasLegacyDefaultReadingStories(candidate.readingStories) || hasPreviousBundledReadingStories(candidate.readingStories)
    ? defaultChildContent.readingStories
    : Array.isArray(candidate.readingStories) && candidate.readingStories.length === 6
    ? candidate.readingStories.map((item, index) => {
      const fallback = defaultChildContent.readingStories[index];
      return {
        id: text(item && typeof item === "object" ? (item as ReadingStoryContent).id : null, fallback.id, 80),
        title: text(item && typeof item === "object" ? (item as ReadingStoryContent).title : null, fallback.title, 120),
        text: text(item && typeof item === "object" ? (item as ReadingStoryContent).text : null, fallback.text, rules.readingStoryTextMaxLength),
      };
    })
    : defaultChildContent.readingStories;
  const storeItems = Array.isArray(candidate.storeItems) && candidate.storeItems.length === 12
    ? candidate.storeItems.map((item, index) => {
      const fallback = defaultChildContent.storeItems[index];
      const kind = item && typeof item === "object" && ["screen", "treat", "money", "game"].includes((item as StoreItemContent).kind)
        ? (item as StoreItemContent).kind
        : fallback.kind;
      return {
        id: text(item && typeof item === "object" ? (item as StoreItemContent).id : null, fallback.id, 80),
        title: text(item && typeof item === "object" ? (item as StoreItemContent).title : null, fallback.title, 160),
        cost: typeof (item && typeof item === "object" ? (item as StoreItemContent).cost : null) === "number"
          ? Math.min(25, Math.max(5, Math.round((item as StoreItemContent).cost)))
          : fallback.cost,
        kind,
        ...(
          item && typeof item === "object"
          && typeof (item as StoreItemContent).imageUrl === "string"
          && /^\/api\/storage\/reward-images\/[0-9a-f-]{36}$/i.test((item as StoreItemContent).imageUrl!)
            ? { imageUrl: (item as StoreItemContent).imageUrl }
            : {}
        ),
      };
    })
    : defaultChildContent.storeItems;
  const rewards = (list: unknown, fallback: number[]) => Array.isArray(list) && list.length === fallback.length && list.every((item) => typeof item === "number" && Number.isFinite(item))
    ? list.map((item) => Math.min(10000, Math.max(1, Math.round(item as number))))
    : fallback;
  const majorBoxRewards = rewards(candidate.majorBoxRewards, defaultChildContent.majorBoxRewards);
  const displayBoxRewards = rewards(candidate.displayBoxRewards, defaultChildContent.displayBoxRewards);
  const isLegacyMajorDefaults = majorBoxRewards.join(",") === "50,75,100";
  const isLegacyDisplayDefaults = displayBoxRewards.join(",") === "10,15";
  const normalized = {
    letterGames,
    numberQuestions,
    readingStories,
    storeItems,
    majorBoxRewards: isLegacyMajorDefaults ? defaultChildContent.majorBoxRewards : majorBoxRewards,
    displayBoxRewards: isLegacyDisplayDefaults ? defaultChildContent.displayBoxRewards : displayBoxRewards,
    pointRewards: {
      letterAnswer: typeof candidate.pointRewards?.letterAnswer === "number" ? Math.min(rules.pointRewardMax, Math.max(rules.pointRewardMin, Math.round(candidate.pointRewards.letterAnswer))) : defaultChildContent.pointRewards.letterAnswer,
      numberAnswer: typeof candidate.pointRewards?.numberAnswer === "number" ? Math.min(rules.pointRewardMax, Math.max(rules.pointRewardMin, Math.round(candidate.pointRewards.numberAnswer))) : defaultChildContent.pointRewards.numberAnswer,
      readingStory: typeof candidate.pointRewards?.readingStory === "number" ? Math.min(rules.pointRewardMax, Math.max(rules.pointRewardMin, Math.round(candidate.pointRewards.readingStory))) : defaultChildContent.pointRewards.readingStory,
    },
  };
  return validateChildContent(normalized).valid ? normalized : structuredClone(defaultChildContent);
}
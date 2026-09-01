import { readFileSync } from "node:fs";
import path from "node:path";

export type JsonMap = Record<string, unknown>;

type ChildContentRules = {
  letterGamesCount: number;
  numberQuestionsCount: number;
  readingStoriesCount: number;
  storeItemsCount: number;
  letterGameIdMaxLength: number;
  letterGameTitleMaxLength: number;
  letterGameDescriptionMaxLength: number;
  letterGameQuestionMaxLength: number;
  letterGameOptionMinCount: number;
  letterGameOptionMaxCount: number;
  letterGameOptionMaxLength: number;
  numberQuestionIdMaxLength: number;
  numberQuestionPromptMaxLength: number;
  numberAnswerMin: number;
  numberAnswerMax: number;
  readingStoryIdMaxLength: number;
  readingStoryTitleMaxLength: number;
  readingStoryTextMaxLength: number;
  storeItemIdMaxLength: number;
  storeItemTitleMaxLength: number;
  storeCostMin: number;
  storeCostMax: number;
  pointRewardMin: number;
  pointRewardMax: number;
  majorBoxRewardCount: number;
  displayBoxRewardCount: number;
  boxRewardMin: number;
  boxRewardMax: number;
  rewardKinds: string[];
};

let cachedRules: ChildContentRules | undefined;

function loadRules(): ChildContentRules {
  if (cachedRules) return cachedRules;
  const candidates = [
    path.resolve(process.cwd(), "artifacts/challenge-kingdom/public/child-content-contract.json"),
    path.resolve(import.meta.dirname, "../../challenge-kingdom/public/child-content-contract.json"),
    path.resolve(import.meta.dirname, "../../../challenge-kingdom/public/child-content-contract.json"),
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as { rules?: ChildContentRules };
      if (parsed.rules) {
        cachedRules = parsed.rules;
        return cachedRules;
      }
    } catch {
      // Try the next known location so the bundled service works from either workspace or dist.
    }
  }
  throw new Error("Child content contract is missing.");
}

function text(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function unique(values: unknown[]): boolean {
  return new Set(values).size === values.length;
}

export function isValidChildContent(value: unknown): value is JsonMap {
  const rules = loadRules();
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const content = value as JsonMap;
  const letterGames = content.letterGames;
  const numberQuestions = content.numberQuestions;
  const readingStories = content.readingStories;
  const storeItems = content.storeItems;
  const majorRewards = content.majorBoxRewards;
  const displayRewards = content.displayBoxRewards;
  const pointRewards = content.pointRewards;

  if (!Array.isArray(letterGames) || letterGames.length !== rules.letterGamesCount || !unique(letterGames.map((item) => item && typeof item === "object" ? (item as JsonMap).id : null))) return false;
  for (const raw of letterGames) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const item = raw as JsonMap;
    if (!text(item.id, rules.letterGameIdMaxLength)
      || !text(item.title, rules.letterGameTitleMaxLength)
      || !text(item.description, rules.letterGameDescriptionMaxLength)
      || !text(item.question, rules.letterGameQuestionMaxLength)
      || !Array.isArray(item.options)
      || item.options.length < rules.letterGameOptionMinCount
      || item.options.length > rules.letterGameOptionMaxCount
      || !item.options.every((option) => text(option, rules.letterGameOptionMaxLength))
      || !unique(item.options)
      || !text(item.answer, rules.letterGameOptionMaxLength)
      || !item.options.includes(item.answer)) return false;
  }

  if (!Array.isArray(numberQuestions) || numberQuestions.length !== rules.numberQuestionsCount || !unique(numberQuestions.map((item) => item && typeof item === "object" ? (item as JsonMap).id : null))) return false;
  for (const raw of numberQuestions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const item = raw as JsonMap;
    if (!text(item.id, rules.numberQuestionIdMaxLength)
      || !text(item.prompt, rules.numberQuestionPromptMaxLength)
      || !Number.isInteger(item.answer)
      || (item.answer as number) < rules.numberAnswerMin
      || (item.answer as number) > rules.numberAnswerMax) return false;
  }

  if (!Array.isArray(readingStories) || readingStories.length !== rules.readingStoriesCount || !unique(readingStories.map((item) => item && typeof item === "object" ? (item as JsonMap).id : null))) return false;
  for (const raw of readingStories) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const item = raw as JsonMap;
    if (!text(item.id, rules.readingStoryIdMaxLength)
      || !text(item.title, rules.readingStoryTitleMaxLength)
      || !text(item.text, rules.readingStoryTextMaxLength)) return false;
  }

  if (!Array.isArray(storeItems) || storeItems.length !== rules.storeItemsCount || !unique(storeItems.map((item) => item && typeof item === "object" ? (item as JsonMap).id : null))) return false;
  for (const raw of storeItems) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const item = raw as JsonMap;
    if (!text(item.id, rules.storeItemIdMaxLength)
      || !text(item.title, rules.storeItemTitleMaxLength)
      || !Number.isInteger(item.cost)
      || (item.cost as number) < rules.storeCostMin
      || (item.cost as number) > rules.storeCostMax
      || typeof item.kind !== "string"
      || !rules.rewardKinds.includes(item.kind)) return false;
  }
  if (!pointRewards || typeof pointRewards !== "object" || Array.isArray(pointRewards)) return false;
  const points = pointRewards as JsonMap;
  if (!["letterAnswer", "numberAnswer", "readingStory"].every((key) =>
    Number.isInteger(points[key]) && (points[key] as number) >= rules.pointRewardMin && (points[key] as number) <= rules.pointRewardMax,
  )) return false;

  const validRewards = (items: unknown, expectedLength: number) =>
    Array.isArray(items) && items.length === expectedLength
    && items.every((item) => Number.isInteger(item) && (item as number) >= rules.boxRewardMin && (item as number) <= rules.boxRewardMax)
    && unique(items);
  if (!validRewards(majorRewards, rules.majorBoxRewardCount) || !validRewards(displayRewards, rules.displayBoxRewardCount)) return false;
  return Math.min(...(majorRewards as number[])) > Math.max(...(displayRewards as number[]));
}
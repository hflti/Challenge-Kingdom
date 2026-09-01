<?php
declare(strict_types=1);

/**
 * This validator intentionally reads the same contract as the Node service.
 * Keep the decision pure so the parity check can call it without a database.
 */
function childContentContract(): array
{
    static $contract;
    if (is_array($contract)) return $contract;

    $path = __DIR__ . '/child-content-contract.json';
    $json = is_file($path) ? file_get_contents($path) : false;
    $decoded = is_string($json) ? json_decode($json, true) : null;
    if (!is_array($decoded) || !is_array($decoded['rules'] ?? null)) {
        throw new RuntimeException('Child content contract is missing or invalid.');
    }
    $contract = $decoded;
    return $contract;
}

function isValidChildContent(mixed $value): bool
{
    $rules = childContentContract()['rules'];
    if (!is_array($value)) return false;
    $text = static function (mixed $item, int $max): bool {
        if (!is_string($item)) return false;
        $trimmed = trim($item);
        $length = function_exists('mb_strlen') ? mb_strlen($trimmed, 'UTF-8') : strlen($trimmed);
        return $length > 0 && $length <= $max;
    };
    $unique = static fn(array $items): bool => count(array_unique($items, SORT_REGULAR)) === count($items);

    $letterGames = $value['letterGames'] ?? null;
    $numberQuestions = $value['numberQuestions'] ?? null;
    $readingStories = $value['readingStories'] ?? null;
    $storeItems = $value['storeItems'] ?? null;
    $majorRewards = $value['majorBoxRewards'] ?? null;
    $displayRewards = $value['displayBoxRewards'] ?? null;
    $pointRewards = $value['pointRewards'] ?? null;

    if (!is_array($letterGames) || count($letterGames) !== $rules['letterGamesCount']) return false;
    $letterIds = [];
    foreach ($letterGames as $item) {
        if (!is_array($item)
            || !$text($item['id'] ?? null, $rules['letterGameIdMaxLength'])
            || !$text($item['title'] ?? null, $rules['letterGameTitleMaxLength'])
            || !$text($item['description'] ?? null, $rules['letterGameDescriptionMaxLength'])
            || !$text($item['question'] ?? null, $rules['letterGameQuestionMaxLength'])
            || !is_array($item['options'] ?? null)
            || count($item['options']) < $rules['letterGameOptionMinCount']
            || count($item['options']) > $rules['letterGameOptionMaxCount']
            || !$text($item['answer'] ?? null, $rules['letterGameOptionMaxLength'])
            || !in_array($item['answer'], $item['options'], true)) return false;
        foreach ($item['options'] as $option) if (!$text($option, $rules['letterGameOptionMaxLength'])) return false;
        if (!$unique($item['options'])) return false;
        $letterIds[] = $item['id'];
    }
    if (!$unique($letterIds)) return false;

    if (!is_array($numberQuestions) || count($numberQuestions) !== $rules['numberQuestionsCount']) return false;
    $numberIds = [];
    foreach ($numberQuestions as $item) {
        if (!is_array($item)
            || !$text($item['id'] ?? null, $rules['numberQuestionIdMaxLength'])
            || !$text($item['prompt'] ?? null, $rules['numberQuestionPromptMaxLength'])
            || !is_int($item['answer'] ?? null)
            || $item['answer'] < $rules['numberAnswerMin']
            || $item['answer'] > $rules['numberAnswerMax']) return false;
        $numberIds[] = $item['id'];
    }
    if (!$unique($numberIds)) return false;

    if (!is_array($readingStories) || count($readingStories) !== $rules['readingStoriesCount']) return false;
    $storyIds = [];
    foreach ($readingStories as $item) {
        if (!is_array($item)
            || !$text($item['id'] ?? null, $rules['readingStoryIdMaxLength'])
            || !$text($item['title'] ?? null, $rules['readingStoryTitleMaxLength'])
            || !$text($item['text'] ?? null, $rules['readingStoryTextMaxLength'])) return false;
        $storyIds[] = $item['id'];
    }
    if (!$unique($storyIds)) return false;

    if (!is_array($storeItems) || count($storeItems) !== $rules['storeItemsCount']) return false;
    $storeIds = [];
    foreach ($storeItems as $item) {
        if (!is_array($item)
            || !$text($item['id'] ?? null, $rules['storeItemIdMaxLength'])
            || !$text($item['title'] ?? null, $rules['storeItemTitleMaxLength'])
            || !is_int($item['cost'] ?? null)
            || $item['cost'] < $rules['storeCostMin']
            || $item['cost'] > $rules['storeCostMax']
            || !is_string($item['kind'] ?? null)
            || !in_array($item['kind'], $rules['rewardKinds'], true)) return false;
        $storeIds[] = $item['id'];
    }
    if (!$unique($storeIds)) return false;
    if (!is_array($pointRewards)) return false;
    foreach (['letterAnswer', 'numberAnswer', 'readingStory'] as $key) {
        if (!is_int($pointRewards[$key] ?? null)
            || $pointRewards[$key] < $rules['pointRewardMin']
            || $pointRewards[$key] > $rules['pointRewardMax']) return false;
    }

    $validRewards = static function (mixed $items, int $expectedLength) use ($rules, $unique): bool {
        return is_array($items)
            && count($items) === $expectedLength
            && array_reduce($items, static fn(bool $valid, mixed $item): bool => $valid
                && is_int($item)
                && $item >= $rules['boxRewardMin']
                && $item <= $rules['boxRewardMax'], true)
            && $unique($items);
    };
    if (!$validRewards($majorRewards, $rules['majorBoxRewardCount']) || !$validRewards($displayRewards, $rules['displayBoxRewardCount'])) return false;
    return min($majorRewards) > max($displayRewards);
}
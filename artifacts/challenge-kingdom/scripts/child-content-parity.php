<?php
declare(strict_types=1);

require_once __DIR__ . '/../public/child-content-validator.php';

$input = stream_get_contents(STDIN);
$payload = is_string($input) ? json_decode($input, true) : null;
if (!is_array($payload) || !is_array($payload['baseContent'] ?? null) || !is_array($payload['cases'] ?? null)) {
    fwrite(STDERR, "Parity input is invalid.\n");
    exit(2);
}

function resolveParityValue(mixed $value): mixed
{
    if (is_array($value) && isset($value['repeat'], $value['count'])
        && is_string($value['repeat']) && is_int($value['count']) && $value['count'] >= 0) {
        return str_repeat($value['repeat'], $value['count']);
    }
    if (is_array($value)) {
        foreach ($value as $key => $item) $value[$key] = resolveParityValue($item);
    }
    return $value;
}

function applyParityChanges(array $base, array $changes): array
{
    $content = $base;
    foreach ($changes as $change) {
        if (!is_array($change) || !is_array($change['path'] ?? null) || !array_key_exists('value', $change)) {
            fwrite(STDERR, "Parity case change is invalid.\n");
            exit(2);
        }
        $target =& $content;
        foreach ($change['path'] as $segment) {
            if ((!is_int($segment) && !is_string($segment)) || !is_array($target) || !array_key_exists($segment, $target)) {
                fwrite(STDERR, "Parity case path is invalid.\n");
                exit(2);
            }
            $target =& $target[$segment];
        }
        $target = resolveParityValue($change['value']);
        unset($target);
    }
    return $content;
}

$results = [];
foreach ($payload['cases'] as $case) {
    if (!is_array($case) || !is_string($case['name'] ?? null) || !is_bool($case['expected'] ?? null) || !is_array($case['changes'] ?? null)) {
        fwrite(STDERR, "Parity case is invalid.\n");
        exit(2);
    }
    $content = applyParityChanges($payload['baseContent'], $case['changes']);
    $results[] = ['name' => $case['name'], 'valid' => isValidChildContent($content)];
}

echo json_encode($results, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
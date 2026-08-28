<?php
declare(strict_types=1);

const MAX_REQUEST_BYTES = 2_000_000;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function readConfig(): array
{
    $configPath = __DIR__ . '/api-config.php';
    if (!is_file($configPath)) {
        respond(500, ['error' => 'Server configuration is missing.']);
    }

    $config = require $configPath;
    if (!is_array($config)) {
        respond(500, ['error' => 'Server configuration is invalid.']);
    }

    foreach (['db_host', 'db_name', 'db_user', 'db_password', 'app_secret'] as $key) {
        if (!isset($config[$key]) || !is_string($config[$key]) || trim($config[$key]) === '') {
            respond(500, ['error' => 'Server configuration is incomplete.']);
        }
    }

    if (strlen($config['app_secret']) < 32) {
        respond(500, ['error' => 'Server secret must contain at least 32 characters.']);
    }
    if ($config['app_secret'] === 'ضع_هنا_سراً_عشوائياً_طويلاً') {
        respond(500, ['error' => 'Server secret must be changed before use.']);
    }

    return $config;
}

function configureCors(array $config): void
{
    $allowedOrigin = trim((string)($config['allowed_origin'] ?? ''));
    $requestOrigin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($allowedOrigin !== '' && $requestOrigin === $allowedOrigin) {
        header('Access-Control-Allow-Origin: ' . $allowedOrigin);
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Content-Type, X-Family-Code');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    }
}

function connectDatabase(array $config): PDO
{
    $host = trim($config['db_host']);
    $port = (int)($config['db_port'] ?? 3306);
    $dbName = trim($config['db_name']);
    $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4";

    $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS kingdom_states (
            family_key CHAR(64) NOT NULL PRIMARY KEY,
            state_json LONGTEXT NOT NULL,
            active_challenges_json LONGTEXT NOT NULL,
            version INT UNSIGNED NOT NULL DEFAULT 1,
            updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            CONSTRAINT chk_state_json CHECK (JSON_VALID(state_json)),
            CONSTRAINT chk_active_challenges_json CHECK (JSON_VALID(active_challenges_json))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    return $pdo;
}

function familyCodeFromRequest(): string
{
    $familyCode = trim((string)($_SERVER['HTTP_X_FAMILY_CODE'] ?? ''));
    $length = function_exists('mb_strlen') ? mb_strlen($familyCode, 'UTF-8') : strlen($familyCode);
    if ($length < 4 || $length > 64) {
        respond(400, ['error' => 'A valid family code is required.']);
    }
    return $familyCode;
}

function decodeStoredJson(string $json): array
{
    $decoded = json_decode($json, true);
    if (!is_array($decoded) || json_last_error() !== JSON_ERROR_NONE) {
        throw new RuntimeException('Stored JSON is invalid.');
    }
    return $decoded;
}

function encodeJson(array $value): string
{
    $encoded = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($encoded)) {
        throw new RuntimeException('Could not encode JSON.');
    }
    return $encoded;
}

function fetchRecord(PDO $pdo, string $familyKey, bool $forUpdate = false): ?array
{
    $sql = 'SELECT family_key, state_json, active_challenges_json, version, updated_at
            FROM kingdom_states WHERE family_key = :family_key'
        . ($forUpdate ? ' FOR UPDATE' : '');
    $statement = $pdo->prepare($sql);
    $statement->execute(['family_key' => $familyKey]);
    $record = $statement->fetch();
    return is_array($record) ? $record : null;
}

function responseFromRecord(array $record): array
{
    $updatedAt = new DateTimeImmutable($record['updated_at'], new DateTimeZone('UTC'));
    return [
        'state' => decodeStoredJson($record['state_json']),
        'activeChallenges' => decodeStoredJson($record['active_challenges_json']),
        'version' => (int)$record['version'],
        'updatedAt' => $updatedAt->format('Y-m-d\TH:i:s.v\Z'),
    ];
}

function requireNumber(array $data, string $key): float|int
{
    if (!array_key_exists($key, $data) || !is_numeric($data[$key])) {
        respond(400, ['error' => 'Completion data is incomplete.']);
    }
    return $data[$key] + 0;
}

function insertRecord(PDO $pdo, string $familyKey, array $state, array $activeChallenges): void
{
    $statement = $pdo->prepare(
        'INSERT INTO kingdom_states
            (family_key, state_json, active_challenges_json, version, updated_at)
         VALUES (:family_key, :state_json, :active_json, 1, UTC_TIMESTAMP(3))'
    );
    $statement->execute([
        'family_key' => $familyKey,
        'state_json' => encodeJson($state),
        'active_json' => encodeJson($activeChallenges),
    ]);
}

function updateRecord(
    PDO $pdo,
    string $familyKey,
    array $state,
    array $activeChallenges,
    int $currentVersion
): void {
    $statement = $pdo->prepare(
        'UPDATE kingdom_states
         SET state_json = :state_json,
             active_challenges_json = :active_json,
             version = version + 1,
             updated_at = UTC_TIMESTAMP(3)
         WHERE family_key = :family_key AND version = :version'
    );
    $statement->execute([
        'family_key' => $familyKey,
        'state_json' => encodeJson($state),
        'active_json' => encodeJson($activeChallenges),
        'version' => $currentVersion,
    ]);
    if ($statement->rowCount() !== 1) {
        throw new RuntimeException('Concurrent update detected.');
    }
}

$config = readConfig();
configureCors($config);

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (!in_array($method, ['GET', 'POST', 'PUT'], true)) {
    header('Allow: GET, POST, OPTIONS');
    respond(405, ['error' => 'Method not allowed.']);
}

try {
    $pdo = connectDatabase($config);
    $familyCode = familyCodeFromRequest();
    $familyKey = hash_hmac('sha256', $familyCode, $config['app_secret']);

    if ($method === 'GET') {
        $record = fetchRecord($pdo, $familyKey);
        if ($record === null) {
            respond(404, ['error' => 'No saved kingdom state was found.']);
        }
        respond(200, responseFromRecord($record));
    }

    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > MAX_REQUEST_BYTES) {
        respond(413, ['error' => 'Request is too large.']);
    }
    $rawBody = file_get_contents('php://input');
    if (!is_string($rawBody) || strlen($rawBody) > MAX_REQUEST_BYTES) {
        respond(413, ['error' => 'Request is too large.']);
    }
    $payloadObject = json_decode($rawBody);
    if (!is_object($payloadObject) || json_last_error() !== JSON_ERROR_NONE) {
        respond(400, ['error' => 'The request body must be valid JSON.']);
    }
    if (
        !property_exists($payloadObject, 'state') || !is_object($payloadObject->state)
        || !property_exists($payloadObject, 'activeChallenges') || !is_object($payloadObject->activeChallenges)
    ) {
        respond(400, ['error' => 'State and activeChallenges must be JSON objects.']);
    }
    $data = json_decode($rawBody, true);
    if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) {
        respond(400, ['error' => 'The request body must be valid JSON.']);
    }
    if (
        !array_key_exists('state', $data) || !is_array($data['state'])
        || !array_key_exists('activeChallenges', $data) || !is_array($data['activeChallenges'])
        || !array_key_exists('version', $data)
        || (!is_null($data['version']) && (!is_int($data['version']) || $data['version'] < 1))
    ) {
        respond(400, ['error' => 'The saved challenge data is invalid.']);
    }

    $completedProfileId = $data['completedProfileId'] ?? null;
    $completedChallengeId = $data['completedChallengeId'] ?? null;
    if (($completedProfileId === null) !== ($completedChallengeId === null)) {
        respond(400, ['error' => 'Completion requires both profile and challenge identifiers.']);
    }
    $hasCompletion = is_string($completedProfileId) && is_string($completedChallengeId);
    if ($hasCompletion) {
        if (
            !in_array($completedProfileId, ['ayham', 'kinan'], true)
            || $completedChallengeId === ''
            || strlen($completedChallengeId) > 128
        ) {
            respond(400, ['error' => 'Completion identifiers are invalid.']);
        }
        $completionBasePoints = requireNumber($data, 'completionBasePoints');
        $completionBaseCompleted = requireNumber($data, 'completionBaseCompleted');
        $completionPointsDelta = requireNumber($data, 'completionPointsDelta');
        $completionCompletedDelta = requireNumber($data, 'completionCompletedDelta');
        if (
            $completionBaseCompleted < 0
            || floor((float)$completionBaseCompleted) !== (float)$completionBaseCompleted
            || $completionPointsDelta < 0
            || !in_array((int)$completionCompletedDelta, [0, 1], true)
            || floor((float)$completionCompletedDelta) !== (float)$completionCompletedDelta
        ) {
            respond(400, ['error' => 'Completion score changes are invalid.']);
        }
    }

    $pdo->beginTransaction();
    $existing = fetchRecord($pdo, $familyKey, true);

    if ($existing === null) {
        insertRecord($pdo, $familyKey, $data['state'], $data['activeChallenges']);
    } else {
        $existingVersion = (int)$existing['version'];
        if ($data['version'] === null || $existingVersion !== $data['version']) {
            $pdo->rollBack();
            respond(409, ['error' => 'A newer version was saved from another device.']);
        }

        if ($hasCompletion) {
            $existingState = decodeStoredJson($existing['state_json']);
            $existingChallenges = decodeStoredJson($existing['active_challenges_json']);
            $activeChallenge = $existingChallenges[$completedProfileId] ?? null;
            $activeChallengeMatches = is_array($activeChallenge)
                && ($activeChallenge['challengeId'] ?? null) === $completedChallengeId;
            $existingPoints = is_array($existingState['points'] ?? null) ? $existingState['points'] : [];
            $existingCompleted = is_array($existingState['completed'] ?? null) ? $existingState['completed'] : [];
            $unchangedBootstrapProgress = $activeChallenge === null
                && ($existingPoints[$completedProfileId] ?? null) === $completionBasePoints
                && ($existingCompleted[$completedProfileId] ?? null) === $completionBaseCompleted;

            if (!$activeChallengeMatches && !$unchangedBootstrapProgress) {
                $pdo->rollBack();
                respond(409, ['error' => 'The challenge changed on another device.']);
            }

            unset($existingChallenges[$completedProfileId]);
            $existingPoints[$completedProfileId] = min(
                120,
                (float)($existingPoints[$completedProfileId] ?? 0) + $completionPointsDelta
            );
            $existingCompleted[$completedProfileId] = min(
                120,
                (float)($existingCompleted[$completedProfileId] ?? 0) + $completionCompletedDelta
            );
            $existingState['points'] = $existingPoints;
            $existingState['completed'] = $existingCompleted;
            updateRecord($pdo, $familyKey, $existingState, $existingChallenges, $existingVersion);
        } else {
            updateRecord(
                $pdo,
                $familyKey,
                $data['state'],
                $data['activeChallenges'],
                $existingVersion
            );
        }
    }

    $savedRecord = fetchRecord($pdo, $familyKey);
    $pdo->commit();
    if ($savedRecord === null) {
        throw new RuntimeException('Saved state could not be loaded.');
    }
    respond(200, responseFromRecord($savedRecord));
} catch (PDOException $error) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($error->getCode() === '23000') {
        respond(409, ['error' => 'The family state changed during this request.']);
    }
    error_log('Kingdom API database error: ' . $error->getMessage());
    respond(500, ['error' => 'The database request failed.']);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($error instanceof RuntimeException && $error->getMessage() === 'Concurrent update detected.') {
        respond(409, ['error' => 'A newer version was saved from another device.']);
    }
    error_log('Kingdom API error: ' . $error->getMessage());
    respond(500, ['error' => 'The server could not process the request.']);
}
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
        header('Access-Control-Allow-Headers: Content-Type, X-Family-Code, Authorization');
        header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
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
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS families (
            id CHAR(64) NOT NULL PRIMARY KEY,
            family_key CHAR(64) NOT NULL UNIQUE,
            name VARCHAR(128) NOT NULL DEFAULT \'Family\',
            created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS family_members (
            id CHAR(32) NOT NULL PRIMARY KEY,
            family_id CHAR(64) NOT NULL,
            role VARCHAR(16) NOT NULL,
            name VARCHAR(128) NOT NULL,
            code_hash CHAR(64) NOT NULL,
            grade VARCHAR(64) NULL,
            title VARCHAR(128) NULL,
            quote_text VARCHAR(512) NULL,
            color VARCHAR(32) NULL,
            credential_version INT UNSIGNED NOT NULL DEFAULT 1,
            created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            CONSTRAINT fk_member_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
            INDEX idx_member_family (family_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $column = $pdo->query("SHOW COLUMNS FROM family_members LIKE 'credential_version'")->fetch();
    if (!is_array($column)) {
        $pdo->exec('ALTER TABLE family_members ADD COLUMN credential_version INT UNSIGNED NOT NULL DEFAULT 1');
    }
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS admin_credentials (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            code_hash CHAR(64) NOT NULL,
            credential_version INT UNSIGNED NOT NULL DEFAULT 1,
            updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
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

function readJsonBody(): array
{
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > MAX_REQUEST_BYTES) respond(413, ['error' => 'Request is too large.']);
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || strlen($raw) > MAX_REQUEST_BYTES) respond(413, ['error' => 'Request is too large.']);
    $value = json_decode($raw, true);
    if (!is_array($value) || json_last_error() !== JSON_ERROR_NONE || (array_keys($value) === range(0, count($value) - 1) && $value !== [])) {
        respond(400, ['error' => 'The request body must be a JSON object.']);
    }
    return $value;
}

function expectPayload(array $data, array $required, array $optional = []): void
{
    foreach ($required as $key) if (!array_key_exists($key, $data)) respond(400, ['error' => 'The request body is incomplete.']);
    foreach ($data as $key => $_) if (!in_array($key, array_merge($required, $optional), true)) respond(400, ['error' => 'The request body contains an unsupported field.']);
}

function validText(mixed $value, int $max, bool $required = false): ?string
{
    if ($value === null && !$required) return null;
    if (!is_string($value)) respond(400, ['error' => 'A text field is invalid.']);
    $value = trim($value);
    $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    if (($required && $length < 1) || $length > $max) respond(400, ['error' => 'A text field is invalid.']);
    return $value;
}

function validCode(mixed $value): string
{
    $code = validText($value, 64, true);
    $length = function_exists('mb_strlen') ? mb_strlen($code, 'UTF-8') : strlen($code);
    if ($length < 4) respond(400, ['error' => 'Codes must be between 4 and 64 characters.']);
    return $code;
}

function validChildContent(mixed $value): array
{
    if (!is_array($value)) respond(400, ['error' => 'Child content must be an object.']);
    $text = function (mixed $item, int $max): bool {
        if (!is_string($item)) return false;
        $length = function_exists('mb_strlen') ? mb_strlen(trim($item), 'UTF-8') : strlen(trim($item));
        return $length > 0 && $length <= $max;
    };
    $letterGames = $value['letterGames'] ?? null;
    $numberQuestions = $value['numberQuestions'] ?? null;
    $readingStories = $value['readingStories'] ?? null;
    $storeItems = $value['storeItems'] ?? null;
    $majorRewards = $value['majorBoxRewards'] ?? null;
    $displayRewards = $value['displayBoxRewards'] ?? null;
    if (!is_array($letterGames) || count($letterGames) !== 6) respond(400, ['error' => 'Exactly six letter games are required.']);
    foreach ($letterGames as $item) {
        if (!is_array($item) || !$text($item['id'] ?? null, 80) || !$text($item['title'] ?? null, 120) || !$text($item['description'] ?? null, 240) || !$text($item['question'] ?? null, 160)
            || !is_array($item['options'] ?? null) || count($item['options']) < 2 || count($item['options']) > 6
            || !$text($item['answer'] ?? null, 120) || !in_array($item['answer'], $item['options'], true)) respond(400, ['error' => 'A letter game is invalid.']);
        foreach ($item['options'] as $option) if (!$text($option, 120)) respond(400, ['error' => 'A letter-game option is invalid.']);
        if (count(array_unique($item['options'])) !== count($item['options'])) respond(400, ['error' => 'A letter-game option is duplicated.']);
    }
    $letterIds = array_map(fn($item) => $item['id'], $letterGames);
    if (count(array_unique($letterIds)) !== count($letterIds)) respond(400, ['error' => 'Letter-game identifiers must be unique.']);
    if (!is_array($numberQuestions) || count($numberQuestions) !== 5) respond(400, ['error' => 'Exactly five number questions are required.']);
    foreach ($numberQuestions as $item) if (!is_array($item) || !$text($item['id'] ?? null, 80) || !$text($item['prompt'] ?? null, 80) || !is_int($item['answer'] ?? null) || $item['answer'] < -10000 || $item['answer'] > 10000) respond(400, ['error' => 'A number question is invalid.']);
    $numberIds = array_map(fn($item) => $item['id'], $numberQuestions);
    if (count(array_unique($numberIds)) !== count($numberIds)) respond(400, ['error' => 'Number-question identifiers must be unique.']);
    if (!is_array($readingStories) || count($readingStories) !== 6) respond(400, ['error' => 'Exactly six stories are required.']);
    foreach ($readingStories as $item) if (!is_array($item) || !$text($item['id'] ?? null, 80) || !$text($item['title'] ?? null, 120) || !$text($item['text'] ?? null, 2500)) respond(400, ['error' => 'A reading story is invalid.']);
    $storyIds = array_map(fn($item) => $item['id'], $readingStories);
    if (count(array_unique($storyIds)) !== count($storyIds)) respond(400, ['error' => 'Reading-story identifiers must be unique.']);
    if (!is_array($storeItems) || count($storeItems) !== 12) respond(400, ['error' => 'Exactly twelve store rewards are required.']);
    $ids = [];
    foreach ($storeItems as $item) {
        if (!is_array($item) || !$text($item['id'] ?? null, 80) || !$text($item['title'] ?? null, 160) || !is_int($item['cost'] ?? null) || $item['cost'] < 5 || $item['cost'] > 25 || !in_array($item['kind'] ?? null, ['screen', 'treat', 'money', 'game'], true)) respond(400, ['error' => 'A store reward is invalid.']);
        $ids[] = $item['id'];
    }
    if (count(array_unique($ids)) !== count($ids)) respond(400, ['error' => 'Store reward identifiers must be unique.']);
    foreach ([[$majorRewards, 3], [$displayRewards, 2]] as [$rewards, $count]) {
        if (!is_array($rewards) || count($rewards) !== $count) respond(400, ['error' => 'Box reward values are invalid.']);
        foreach ($rewards as $reward) if (!is_int($reward) || $reward < 1 || $reward > 10000) respond(400, ['error' => 'Box reward values are invalid.']);
        if (count(array_unique($rewards)) !== count($rewards)) respond(400, ['error' => 'Box reward values must be unique.']);
    }
    if (min($majorRewards) <= max($displayRewards)) respond(400, ['error' => 'Major box rewards must be greater than display rewards.']);
    return $value;
}

function codeHash(string $code, array $config): string { return hash_hmac('sha256', $code, $config['app_secret']); }
function opaqueId(): string { return bin2hex(random_bytes(16)); }

function ensureFamily(PDO $pdo, string $familyKey): array
{
    $find = $pdo->prepare('SELECT id, name FROM families WHERE family_key = :key');
    $find->execute(['key' => $familyKey]);
    $family = $find->fetch();
    if (is_array($family)) return $family;
    $insert = $pdo->prepare('INSERT INTO families (id, family_key, name) VALUES (:id, :key, :name)');
    $insert->execute(['id' => $familyKey, 'key' => $familyKey, 'name' => 'Family']);
    return ['id' => $familyKey, 'name' => 'Family'];
}

function initializeAdminCredential(PDO $pdo, array $config): void
{
    $exists = $pdo->query('SELECT id FROM admin_credentials WHERE id = 1')->fetch();
    if (is_array($exists)) return;
    $initial = $config['initial_admin_code'] ?? '';
    $credentialSeed = is_string($initial) && strlen(trim($initial)) >= 4 && strlen(trim($initial)) <= 64
        ? trim($initial)
        : bin2hex(random_bytes(24));
    $insert = $pdo->prepare('INSERT INTO admin_credentials (id, code_hash) VALUES (1, :hash)');
    $insert->execute(['hash' => codeHash($credentialSeed, $config)]);
}

function clientIp(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 64); }
function throttle(string $scope, int $limit = 5, int $window = 900): void
{
    $file = sys_get_temp_dir() . '/kingdom-rate-' . hash('sha256', $scope . '|' . clientIp());
    $now = time(); $hits = [];
    if (is_file($file)) {
        $decoded = json_decode((string)file_get_contents($file), true);
        if (is_array($decoded)) foreach ($decoded as $hit) if (is_int($hit) && $hit > $now - $window) $hits[] = $hit;
    }
    if (count($hits) >= $limit) respond(429, ['error' => 'Too many attempts. Please wait 15 minutes.']);
    $hits[] = $now; @file_put_contents($file, json_encode($hits), LOCK_EX);
}
function base64url(string $value): string { return rtrim(strtr(base64_encode($value), '+/', '-_'), '='); }
function adminToken(array $credential, array $config): array
{
    $expires = time() + 900;
    $payload = base64url(encodeJson(['exp' => $expires, 'cv' => (int)$credential['credential_version'], 'n' => base64url(random_bytes(12))]));
    $signature = base64url(hash_hmac('sha256', $payload, $config['app_secret'], true));
    return ['token' => $payload . '.' . $signature, 'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $expires)];
}
function requireAdmin(PDO $pdo, array $config): void
{
    $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (!preg_match('/^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/', $header, $match)) respond(401, ['error' => 'Administrator authorization is required.']);
    $expected = base64url(hash_hmac('sha256', $match[1], $config['app_secret'], true));
    if (!hash_equals($expected, $match[2])) respond(401, ['error' => 'Administrator authorization is invalid.']);
    $json = base64_decode(strtr($match[1], '-_', '+/'), true);
    $payload = is_string($json) ? json_decode($json, true) : null;
    $credential = $pdo->query('SELECT credential_version FROM admin_credentials WHERE id = 1')->fetch();
    if (!is_array($payload) || !is_array($credential) || !isset($payload['exp'], $payload['cv']) || !is_int($payload['exp']) || !is_int($payload['cv']) || $payload['exp'] < time() || $payload['cv'] !== (int)$credential['credential_version']) respond(401, ['error' => 'Administrator authorization has expired.']);
}
function memberToken(array $member, array $config): array
{
    $expires = time() + 900;
    $payload = base64url(encodeJson(['kind' => 'member', 'exp' => $expires, 'familyId' => $member['family_id'], 'memberId' => $member['id'], 'role' => $member['role'], 'cv' => (int)$member['credential_version']]));
    return ['token' => $payload . '.' . base64url(hash_hmac('sha256', $payload, $config['app_secret'], true)), 'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $expires)];
}
function requireMember(PDO $pdo, array $config, string $familyKey): array
{
    $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (!preg_match('/^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/', $header, $match)) respond(401, ['error' => 'Member authorization is required.']);
    if (!hash_equals(base64url(hash_hmac('sha256', $match[1], $config['app_secret'], true)), $match[2])) respond(401, ['error' => 'Member authorization is invalid.']);
    $raw = base64_decode(strtr($match[1], '-_', '+/'), true); $token = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($token) || ($token['kind'] ?? null) !== 'member' || !isset($token['exp'], $token['familyId'], $token['memberId'], $token['role'], $token['cv']) || !is_int($token['exp']) || $token['exp'] < time()) respond(401, ['error' => 'Member authorization has expired.']);
    $q = $pdo->prepare('SELECT m.id,m.family_id,m.role,m.credential_version,f.family_key FROM family_members m JOIN families f ON f.id=m.family_id WHERE m.id=:id');
    $q->execute(['id' => $token['memberId']]); $member = $q->fetch();
    if (!is_array($member) || $member['family_id'] !== $token['familyId'] || $member['family_key'] !== $familyKey || $member['role'] !== $token['role'] || (int)$member['credential_version'] !== $token['cv']) respond(401, ['error' => 'Member authorization is invalid.']);
    return $member;
}
function childCanWrite(array $oldState, array $newState, array $oldActive, array $newActive, string $memberId): bool
{
    foreach ($oldState as $key => $oldValue) {
        if (in_array($key, ['points', 'completed', 'customMissions', 'childRewards'], true)) continue;
        if (!array_key_exists($key, $newState) || encodeJson([$newState[$key]]) !== encodeJson([$oldValue])) return false;
    }
    foreach ($newState as $key => $_) if (!array_key_exists($key, $oldState) && !in_array($key, ['points', 'completed', 'customMissions', 'childRewards'], true)) return false;
    foreach (['points', 'completed', 'customMissions', 'childRewards'] as $key) {
        $old = is_array($oldState[$key] ?? null) ? $oldState[$key] : []; $new = is_array($newState[$key] ?? null) ? $newState[$key] : [];
        foreach ($old as $id => $value) if ($id !== $memberId && (!array_key_exists($id, $new) || encodeJson([$new[$id]]) !== encodeJson([$value]))) return false;
        foreach ($new as $id => $_) if ($id !== $memberId && !array_key_exists($id, $old)) return false;
    }
    foreach ($oldActive as $id => $value) if ($id !== $memberId && (!array_key_exists($id, $newActive) || encodeJson([$newActive[$id]]) !== encodeJson([$value]))) return false;
    foreach ($newActive as $id => $_) if ($id !== $memberId && !array_key_exists($id, $oldActive)) return false;
    return true;
}
function childInitialStateIsScoped(object $state, object $active, string $memberId): bool
{
    foreach (get_object_vars($state) as $key => $value) {
        if (in_array($key, ['points', 'completed', 'customMissions', 'childRewards'], true)) {
            if (!is_object($value)) return false;
            foreach (get_object_vars($value) as $id => $_) if ($id !== $memberId) return false;
        } elseif ($value !== null && (!is_object($value) || get_object_vars($value) !== [])) {
            return false;
        }
    }
    foreach (get_object_vars($active) as $id => $_) if ($id !== $memberId) return false;
    return true;
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
    $action = trim((string)($_GET['action'] ?? ''));
    if ($action !== '') {
        $adminActions = ['admin-families', 'admin-members', 'admin-content', 'admin-create-family', 'admin-create-member', 'admin-delete-member', 'admin-delete-family', 'admin-change-member-code', 'admin-change-family-code', 'admin-change-family-name'];
        if (!in_array($action, ['admin-reveal', 'family-members', 'verify-member', 'bootstrap-family', ...$adminActions], true)) respond(404, ['error' => 'Unknown action.']);
        if (in_array($action, ['admin-reveal', 'verify-member', 'bootstrap-family'], true) && $method !== 'POST') respond(405, ['error' => 'Method not allowed.']);
        if (in_array($action, ['admin-families', 'admin-members', 'family-members'], true) && $method !== 'GET') respond(405, ['error' => 'Method not allowed.']);
        if (in_array($action, ['admin-create-family', 'admin-create-member', 'admin-delete-member', 'admin-delete-family', 'admin-change-member-code', 'admin-change-family-code', 'admin-change-family-name'], true) && $method !== 'POST') respond(405, ['error' => 'Method not allowed.']);
        if ($action === 'admin-content' && !in_array($method, ['GET', 'POST'], true)) respond(405, ['error' => 'Method not allowed.']);
        if (in_array($action, $adminActions, true)) requireAdmin($pdo, $config);

        if ($action === 'admin-reveal') {
            throttle('admin-reveal', 8, 300);
            $data = readJsonBody();
            expectPayload($data, ['code']);
            $reveal = $config['admin_reveal_code'] ?? '';
            $submittedCode = is_string($data['code']) ? trim($data['code']) : null;
            if (is_string($reveal) && $reveal !== '' && is_string($submittedCode) && hash_equals(codeHash($reveal, $config), codeHash($submittedCode, $config))) {
                initializeAdminCredential($pdo, $config);
                $credential = $pdo->query('SELECT code_hash, credential_version FROM admin_credentials WHERE id = 1')->fetch();
                if (!is_array($credential)) respond(503, ['error'=>'Administrator access is not configured.']);
                respond(200, array_merge(['ok'=>true], adminToken($credential, $config)));
            }
            respond(401, ['error'=>'Invalid administrator access code.']);
        }
        if ($action === 'admin-families') {
            $rows = $pdo->query('SELECT f.id, f.name, COUNT(m.id) AS member_count FROM families f LEFT JOIN family_members m ON m.family_id=f.id GROUP BY f.id, f.name ORDER BY f.created_at DESC')->fetchAll();
            respond(200, ['families' => array_map(fn($r) => ['id'=>$r['id'], 'name'=>$r['name'], 'memberCount'=>(int)$r['member_count']], $rows)]);
        }
        if ($action === 'admin-create-family') {
            expectPayload($data = readJsonBody(), ['name', 'code']);
            $name = validText($data['name'], 80, true);
            $code = validCode($data['code']);
            $key = codeHash($code, $config);
            $exists = $pdo->prepare('SELECT id FROM families WHERE family_key=:key');
            $exists->execute(['key'=>$key]);
            if (is_array($exists->fetch())) respond(409, ['error'=>'That kingdom code is already in use.']);
            $insert = $pdo->prepare('INSERT INTO families (id, family_key, name) VALUES (:id, :key, :name)');
            $insert->execute(['id'=>opaqueId(), 'key'=>$key, 'name'=>$name]);
            $family = $pdo->prepare('SELECT id,name FROM families WHERE family_key=:key');
            $family->execute(['key'=>$key]);
            $created = $family->fetch();
            respond(201, ['family'=>['id'=>$created['id'], 'name'=>$created['name']]]);
        }
        if ($action === 'admin-members') {
            $id = validText($_GET['familyId'] ?? null, 64, true);
            $family = $pdo->prepare('SELECT id,name FROM families WHERE id=:id'); $family->execute(['id'=>$id]); $family = $family->fetch();
            if (!is_array($family)) respond(404, ['error'=>'Family not found.']);
            $q=$pdo->prepare('SELECT id,role,name,grade,title,quote_text,color FROM family_members WHERE family_id=:id ORDER BY created_at'); $q->execute(['id'=>$id]);
            $members=array_map(fn($r)=>['id'=>$r['id'],'role'=>$r['role'],'name'=>$r['name'],'grade'=>$r['grade'],'title'=>$r['title'],'quote'=>$r['quote_text'],'color'=>$r['color']],$q->fetchAll());
            respond(200,['family'=>['id'=>$family['id'],'name'=>$family['name']],'members'=>$members]);
        }
        if ($action === 'admin-content' && $method === 'GET') {
            $id = validText($_GET['familyId'] ?? null, 64, true);
            $q = $pdo->prepare('SELECT family_key FROM families WHERE id=:id'); $q->execute(['id'=>$id]); $family = $q->fetch();
            if (!is_array($family)) respond(404, ['error'=>'Family not found.']);
            $record = fetchRecord($pdo, $family['family_key']);
            $state = $record ? decodeStoredJson($record['state_json']) : [];
            respond(200, ['content'=>$state['childContent'] ?? null]);
        }
        if ($action === 'family-members' || $action === 'verify-member') {
            $key = codeHash(familyCodeFromRequest(), $config);
            $q=$pdo->prepare('SELECT id,name FROM families WHERE family_key=:key'); $q->execute(['key'=>$key]); $family=$q->fetch();
            if (!is_array($family)) { throttle('family-members'); respond(404,['error'=>'Family not found.']); }
            if ($action === 'family-members') {
                $q=$pdo->prepare('SELECT id,role,name,grade,title,quote_text,color FROM family_members WHERE family_id=:id ORDER BY created_at');$q->execute(['id'=>$family['id']]);
                $members=array_map(fn($r)=>['id'=>$r['id'],'role'=>$r['role'],'name'=>$r['name'],'grade'=>$r['grade'],'title'=>$r['title'],'quote'=>$r['quote_text'],'color'=>$r['color']],$q->fetchAll());
                respond(200,['family'=>['id'=>$family['id'],'name'=>$family['name']],'members'=>$members]);
            }
            $data=readJsonBody(); expectPayload($data,['memberId','code'],['role']);
            if (!is_string($data['memberId']) || !is_string($data['code']) || (isset($data['role']) && !in_array($data['role'],['owner','child'],true))) respond(400,['error'=>'Member verification data is invalid.']);
            $q=$pdo->prepare('SELECT id,family_id,role,code_hash,credential_version FROM family_members WHERE id=:id AND family_id=:family');$q->execute(['id'=>$data['memberId'],'family'=>$family['id']]);$member=$q->fetch();
            if (!is_array($member) || (isset($data['role']) && $member['role']!==$data['role']) || !hash_equals($member['code_hash'],codeHash($data['code'],$config))) { throttle('verify-member'); respond(401,['error'=>'Invalid member code.']); }
            respond(200,['ok'=>true,'role'=>$member['role'], ...memberToken($member,$config)]);
        }
        if ($action === 'bootstrap-family') {
            $key = codeHash(familyCodeFromRequest(), $config); throttle('bootstrap-family');
            $pdo->beginTransaction(); $family = ensureFamily($pdo, $key); $pdo->commit();
            respond(200, ['family' => ['id' => $family['id'], 'name' => $family['name']]]);
        }
        $data = readJsonBody();
        if ($action === 'admin-content') {
            expectPayload($data, ['familyId', 'content']);
            $content = validChildContent($data['content']);
            $pdo->beginTransaction();
            $q = $pdo->prepare('SELECT family_key FROM families WHERE id=:id FOR UPDATE'); $q->execute(['id'=>$data['familyId']]); $family = $q->fetch();
            if (!is_array($family)) { $pdo->rollBack(); respond(404, ['error'=>'Family not found.']); }
            $record = fetchRecord($pdo, $family['family_key'], true);
            if ($record) {
                $state = decodeStoredJson($record['state_json']);
                $state['childContent'] = $content;
                updateRecord($pdo, $family['family_key'], $state, decodeStoredJson($record['active_challenges_json']), (int)$record['version']);
            } else {
                insertRecord($pdo, $family['family_key'], [
                    'completed'=>[], 'points'=>[], 'customMissions'=>[], 'childRewards'=>[],
                    'extraChallenge'=>['title'=>'التحدي الإضافي','duration'=>600,'rewardPoints'=>10],
                    'childContent'=>$content,
                ], []);
            }
            $pdo->commit();
            respond(200, ['content'=>$content]);
        }
        if ($action === 'admin-change-family-name') {
            expectPayload($data, ['familyId', 'name']);
            $name = validText($data['name'], 80, true);
            $exists = $pdo->prepare('SELECT id FROM families WHERE id=:id');
            $exists->execute(['id'=>$data['familyId']]);
            if (!is_array($exists->fetch())) respond(404, ['error'=>'Family not found.']);
            $q = $pdo->prepare('UPDATE families SET name=:name, updated_at=UTC_TIMESTAMP(3) WHERE id=:id');
            $q->execute(['name'=>$name, 'id'=>$data['familyId']]);
            respond(200, ['ok'=>true]);
        }
        if ($action === 'admin-delete-family') {
            expectPayload($data, ['familyId', 'confirm']);
            if (($data['confirm'] ?? null) !== true) respond(400, ['error'=>'Deletion confirmation is required.']);
            $pdo->beginTransaction();
            $q = $pdo->prepare('SELECT family_key FROM families WHERE id=:id FOR UPDATE');
            $q->execute(['id'=>$data['familyId']]);
            $family = $q->fetch();
            if (!is_array($family)) { $pdo->rollBack(); respond(404, ['error'=>'Family not found.']); }
            $pdo->prepare('DELETE FROM kingdom_states WHERE family_key=:key')->execute(['key'=>$family['family_key']]);
            $pdo->prepare('DELETE FROM families WHERE id=:id')->execute(['id'=>$data['familyId']]);
            $pdo->commit();
            respond(200, ['ok'=>true]);
        }
        if ($action === 'admin-create-member') {
            expectPayload($data,['familyId','role','name','code'],['grade','title','quote','color']);
            if (!is_string($data['familyId']) || !in_array($data['role'],['owner','child'],true)) respond(400,['error'=>'Member data is invalid.']);
            $name=validText($data['name'],128,true);$code=validCode($data['code']);
            foreach(['grade'=>64,'title'=>128,'quote'=>512,'color'=>32] as $k=>$max) if(isset($data[$k])) validText($data[$k],$max);
            $pdo->beginTransaction();
            $check=$pdo->prepare('SELECT id FROM families WHERE id=:id FOR UPDATE');$check->execute(['id'=>$data['familyId']]);if(!is_array($check->fetch())) { $pdo->rollBack();respond(404,['error'=>'Family not found.']);}
            if($data['role']==='owner'){ $q=$pdo->prepare("SELECT id FROM family_members WHERE family_id=:id AND role='owner' FOR UPDATE");$q->execute(['id'=>$data['familyId']]);if($q->fetch()){ $pdo->rollBack();respond(409,['error'=>'A family can have only one owner.']);}}
            $q=$pdo->prepare('INSERT INTO family_members (id,family_id,role,name,code_hash,grade,title,quote_text,color) VALUES (:id,:family,:role,:name,:hash,:grade,:title,:quote,:color)');
            $q->execute(['id'=>opaqueId(),'family'=>$data['familyId'],'role'=>$data['role'],'name'=>$name,'hash'=>codeHash($code,$config),'grade'=>$data['grade']??null,'title'=>$data['title']??null,'quote'=>$data['quote']??null,'color'=>$data['color']??null]);$pdo->commit();respond(201,['ok'=>true]);
        }
        if ($action === 'admin-change-member-code') {
            expectPayload($data,['familyId','memberId','newCode']);$code=validCode($data['newCode']);
            $q=$pdo->prepare('UPDATE family_members SET code_hash=:hash,credential_version=credential_version+1 WHERE id=:member AND family_id=:family');$q->execute(['hash'=>codeHash($code,$config),'member'=>$data['memberId'],'family'=>$data['familyId']]);if($q->rowCount()!==1)respond(404,['error'=>'Member not found.']);respond(200,['ok'=>true]);
        }
        if ($action === 'admin-delete-member') {
            expectPayload($data,['familyId','memberId','confirm']);if(($data['confirm']??null)!==true)respond(400,['error'=>'Deletion confirmation is required.']);
            $pdo->beginTransaction();$q=$pdo->prepare('SELECT id FROM family_members WHERE id=:member AND family_id=:family FOR UPDATE');$q->execute(['member'=>$data['memberId'],'family'=>$data['familyId']]);if(!$q->fetch()){$pdo->rollBack();respond(404,['error'=>'Member not found.']);}
            $f=$pdo->prepare('SELECT family_key FROM families WHERE id=:id FOR UPDATE');$f->execute(['id'=>$data['familyId']]);$f=$f->fetch(); if(is_array($f)&&($record=fetchRecord($pdo,$f['family_key'],true))){$state=decodeStoredJson($record['state_json']);$active=decodeStoredJson($record['active_challenges_json']);foreach(['points','completed','customMissions','childRewards'] as $key)if(is_array($state[$key]??null))unset($state[$key][$data['memberId']]);unset($active[$data['memberId']]);updateRecord($pdo,$f['family_key'],$state,$active,(int)$record['version']);}
            $pdo->prepare('DELETE FROM family_members WHERE id=:id')->execute(['id'=>$data['memberId']]);$pdo->commit();respond(200,['ok'=>true]);
        }
        if ($action === 'admin-change-family-code') {
            expectPayload($data,['familyId','newCode']);$newKey=codeHash(validCode($data['newCode']),$config);$pdo->beginTransaction();$q=$pdo->prepare('SELECT family_key FROM families WHERE id=:id FOR UPDATE');$q->execute(['id'=>$data['familyId']]);$family=$q->fetch();if(!is_array($family)){$pdo->rollBack();respond(404,['error'=>'Family not found.']);}
            if($family['family_key']!==$newKey){$state=fetchRecord($pdo,$family['family_key'],true);if(fetchRecord($pdo,$newKey,true)){$pdo->rollBack();respond(409,['error'=>'That family code is already in use.']);}$pdo->prepare('UPDATE families SET family_key=:new WHERE id=:id')->execute(['new'=>$newKey,'id'=>$data['familyId']]);if($state)$pdo->prepare('UPDATE kingdom_states SET family_key=:new WHERE family_key=:old')->execute(['new'=>$newKey,'old'=>$family['family_key']]);}$pdo->commit();respond(200,['ok'=>true]);
        }
    }
    if ($method !== 'GET' && $method !== 'PUT') respond(405, ['error' => 'Method not allowed.']);
    $familyCode = familyCodeFromRequest();
    $familyKey = hash_hmac('sha256', $familyCode, $config['app_secret']);
    $memberSession = requireMember($pdo, $config, $familyKey);

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
            $completedProfileId === ''
            || strlen($completedProfileId) > 128
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
    ensureFamily($pdo, $familyKey);
    $existing = fetchRecord($pdo, $familyKey, true);

    if ($existing === null) {
        if ($memberSession['role'] === 'child' && !childInitialStateIsScoped($payloadObject->state, $payloadObject->activeChallenges, $memberSession['id'])) {
            $pdo->rollBack();
            respond(403, ['error' => 'Children may only create their own progress.']);
        }
        insertRecord($pdo, $familyKey, $data['state'], $data['activeChallenges']);
    } else {
        $existingVersion = (int)$existing['version'];
        if ($data['version'] === null || $existingVersion !== $data['version']) {
            $pdo->rollBack();
            respond(409, ['error' => 'A newer version was saved from another device.']);
        }
        if ($memberSession['role'] === 'child') {
            if ($hasCompletion && $completedProfileId !== $memberSession['id']) {
                $pdo->rollBack();
                respond(403, ['error' => 'Children may only complete their own challenges.']);
            }
            if (!childCanWrite(
                decodeStoredJson($existing['state_json']),
                $data['state'],
                decodeStoredJson($existing['active_challenges_json']),
                $data['activeChallenges'],
                $memberSession['id']
            )) {
                $pdo->rollBack();
                respond(403, ['error' => 'Children may only change their own progress.']);
            }
        }

        if ($hasCompletion) {
            $existingState = decodeStoredJson($existing['state_json']);
            $existingChallenges = decodeStoredJson($existing['active_challenges_json']);
            $activeChallenge = $existingChallenges[$completedProfileId] ?? null;
            $activeChallengeMatches = is_array($activeChallenge)
                && ($activeChallenge['challengeId'] ?? null) === $completedChallengeId;
            $existingPoints = is_array($existingState['points'] ?? null) ? $existingState['points'] : [];
            $existingCompleted = is_array($existingState['completed'] ?? null) ? $existingState['completed'] : [];
            $existingChildRewards = is_array($existingState['childRewards'] ?? null) ? $existingState['childRewards'] : [];
            $incomingChildRewards = is_array($data['state']['childRewards'] ?? null) ? $data['state']['childRewards'] : [];
            $unchangedBootstrapProgress = $activeChallenge === null
                && ($existingPoints[$completedProfileId] ?? null) === $completionBasePoints
                && ($existingCompleted[$completedProfileId] ?? null) === $completionBaseCompleted;

            if (!$activeChallengeMatches && !$unchangedBootstrapProgress) {
                $pdo->rollBack();
                respond(409, ['error' => 'The challenge changed on another device.']);
            }

            unset($existingChallenges[$completedProfileId]);
            $existingPoints[$completedProfileId] = (float)($existingPoints[$completedProfileId] ?? 0) + $completionPointsDelta;
            $existingCompleted[$completedProfileId] = min(
                120,
                (float)($existingCompleted[$completedProfileId] ?? 0) + $completionCompletedDelta
            );
            $existingState['points'] = $existingPoints;
            $existingState['completed'] = $existingCompleted;
            if (array_key_exists($completedProfileId, $incomingChildRewards)) {
                $existingChildRewards[$completedProfileId] = $incomingChildRewards[$completedProfileId];
            }
            $existingState['childRewards'] = $existingChildRewards;
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
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
            created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            CONSTRAINT fk_member_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
            INDEX idx_member_family (family_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
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
    if (!is_string($initial) || trim($initial) === '') return;
    $insert = $pdo->prepare('INSERT INTO admin_credentials (id, code_hash) VALUES (1, :hash)');
    $insert->execute(['hash' => codeHash(validCode($initial), $config)]);
}

function clientIp(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 64); }
function throttleLogin(): void
{
    $file = sys_get_temp_dir() . '/kingdom-admin-login-' . hash('sha256', clientIp());
    $now = time(); $hits = [];
    if (is_file($file)) {
        $decoded = json_decode((string)file_get_contents($file), true);
        if (is_array($decoded)) foreach ($decoded as $hit) if (is_int($hit) && $hit > $now - 300) $hits[] = $hit;
    }
    if (count($hits) >= 8) respond(429, ['error' => 'Too many login attempts. Please wait a few minutes.']);
    $hits[] = $now;
    @file_put_contents($file, json_encode($hits), LOCK_EX);
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
        $adminActions = ['admin-families', 'admin-members', 'admin-create-member', 'admin-delete-member', 'admin-change-member-code', 'admin-change-family-code', 'admin-change-code'];
        if (!in_array($action, ['admin-login', 'family-members', 'verify-member', ...$adminActions], true)) respond(404, ['error' => 'Unknown action.']);
        if (($action === 'admin-login' || $action === 'verify-member') && $method !== 'POST') respond(405, ['error' => 'Method not allowed.']);
        if (in_array($action, ['admin-families', 'admin-members', 'family-members'], true) && $method !== 'GET') respond(405, ['error' => 'Method not allowed.']);
        if (in_array($action, ['admin-create-member', 'admin-delete-member', 'admin-change-member-code', 'admin-change-family-code', 'admin-change-code'], true) && $method !== 'POST') respond(405, ['error' => 'Method not allowed.']);
        if (in_array($action, $adminActions, true) && $action !== 'admin-login') requireAdmin($pdo, $config);

        if ($action === 'admin-login') {
            throttleLogin(); $data = readJsonBody(); expectPayload($data, ['code']);
            initializeAdminCredential($pdo, $config);
            $credential = $pdo->query('SELECT code_hash, credential_version FROM admin_credentials WHERE id = 1')->fetch();
            if (!is_array($credential) || !is_string($data['code']) || !hash_equals($credential['code_hash'], codeHash($data['code'], $config))) respond(401, ['error' => 'Invalid administrator code.']);
            respond(200, adminToken($credential, $config));
        }
        if ($action === 'admin-families') {
            $rows = $pdo->query('SELECT f.id, f.name, COUNT(m.id) AS member_count FROM families f LEFT JOIN family_members m ON m.family_id=f.id GROUP BY f.id, f.name ORDER BY f.created_at DESC')->fetchAll();
            respond(200, ['families' => array_map(fn($r) => ['id'=>$r['id'], 'name'=>$r['name'], 'memberCount'=>(int)$r['member_count']], $rows)]);
        }
        if ($action === 'admin-members') {
            $id = validText($_GET['familyId'] ?? null, 64, true);
            $family = $pdo->prepare('SELECT id,name FROM families WHERE id=:id'); $family->execute(['id'=>$id]); $family = $family->fetch();
            if (!is_array($family)) respond(404, ['error'=>'Family not found.']);
            $q=$pdo->prepare('SELECT id,role,name,grade,title,quote_text,color FROM family_members WHERE family_id=:id ORDER BY created_at'); $q->execute(['id'=>$id]);
            $members=array_map(fn($r)=>['id'=>$r['id'],'role'=>$r['role'],'name'=>$r['name'],'grade'=>$r['grade'],'title'=>$r['title'],'quote'=>$r['quote_text'],'color'=>$r['color']],$q->fetchAll());
            respond(200,['family'=>['id'=>$family['id'],'name'=>$family['name']],'members'=>$members]);
        }
        if ($action === 'family-members' || $action === 'verify-member') {
            $key = codeHash(familyCodeFromRequest(), $config);
            $q=$pdo->prepare('SELECT id,name FROM families WHERE family_key=:key'); $q->execute(['key'=>$key]); $family=$q->fetch();
            if (!is_array($family)) respond(404,['error'=>'Family not found.']);
            if ($action === 'family-members') {
                $q=$pdo->prepare('SELECT id,role,name,grade,title,quote_text,color FROM family_members WHERE family_id=:id ORDER BY created_at');$q->execute(['id'=>$family['id']]);
                $members=array_map(fn($r)=>['id'=>$r['id'],'role'=>$r['role'],'name'=>$r['name'],'grade'=>$r['grade'],'title'=>$r['title'],'quote'=>$r['quote_text'],'color'=>$r['color']],$q->fetchAll());
                respond(200,['family'=>['id'=>$family['id'],'name'=>$family['name']],'members'=>$members]);
            }
            $data=readJsonBody(); expectPayload($data,['memberId','code'],['role']);
            if (!is_string($data['memberId']) || !is_string($data['code']) || (isset($data['role']) && !in_array($data['role'],['owner','child'],true))) respond(400,['error'=>'Member verification data is invalid.']);
            $q=$pdo->prepare('SELECT role,code_hash FROM family_members WHERE id=:id AND family_id=:family');$q->execute(['id'=>$data['memberId'],'family'=>$family['id']]);$member=$q->fetch();
            if (!is_array($member) || (isset($data['role']) && $member['role']!==$data['role']) || !hash_equals($member['code_hash'],codeHash($data['code'],$config))) respond(401,['error'=>'Invalid member code.']);
            respond(200,['ok'=>true,'role'=>$member['role']]);
        }
        $data = readJsonBody();
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
            $q=$pdo->prepare('UPDATE family_members SET code_hash=:hash WHERE id=:member AND family_id=:family');$q->execute(['hash'=>codeHash($code,$config),'member'=>$data['memberId'],'family'=>$data['familyId']]);if($q->rowCount()!==1)respond(404,['error'=>'Member not found.']);respond(200,['ok'=>true]);
        }
        if ($action === 'admin-change-code') {
            expectPayload($data,['currentCode','newCode']);$new=validCode($data['newCode']);$q=$pdo->query('SELECT code_hash FROM admin_credentials WHERE id=1')->fetch();
            if(!is_array($q)||!is_string($data['currentCode'])||!hash_equals($q['code_hash'],codeHash($data['currentCode'],$config)))respond(401,['error'=>'Invalid administrator code.']);
            $pdo->prepare('UPDATE admin_credentials SET code_hash=:hash,credential_version=credential_version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=1')->execute(['hash'=>codeHash($new,$config)]);respond(200,['ok'=>true]);
        }
        if ($action === 'admin-delete-member') {
            expectPayload($data,['familyId','memberId','confirm']);if(($data['confirm']??null)!==true)respond(400,['error'=>'Deletion confirmation is required.']);
            $pdo->beginTransaction();$q=$pdo->prepare('SELECT id FROM family_members WHERE id=:member AND family_id=:family FOR UPDATE');$q->execute(['member'=>$data['memberId'],'family'=>$data['familyId']]);if(!$q->fetch()){$pdo->rollBack();respond(404,['error'=>'Member not found.']);}
            $f=$pdo->prepare('SELECT family_key FROM families WHERE id=:id FOR UPDATE');$f->execute(['id'=>$data['familyId']]);$f=$f->fetch(); if(is_array($f)&&($record=fetchRecord($pdo,$f['family_key'],true))){$state=decodeStoredJson($record['state_json']);$active=decodeStoredJson($record['active_challenges_json']);foreach(['points','completed','customMissions'] as $key)if(is_array($state[$key]??null))unset($state[$key][$data['memberId']]);unset($active[$data['memberId']]);updateRecord($pdo,$f['family_key'],$state,$active,(int)$record['version']);}
            $pdo->prepare('DELETE FROM family_members WHERE id=:id')->execute(['id'=>$data['memberId']]);$pdo->commit();respond(200,['ok'=>true]);
        }
        if ($action === 'admin-change-family-code') {
            expectPayload($data,['familyId','newCode']);$newKey=codeHash(validCode($data['newCode']),$config);$pdo->beginTransaction();$q=$pdo->prepare('SELECT family_key FROM families WHERE id=:id FOR UPDATE');$q->execute(['id'=>$data['familyId']]);$family=$q->fetch();if(!is_array($family)){$pdo->rollBack();respond(404,['error'=>'Family not found.']);}
            if($family['family_key']!==$newKey){$state=fetchRecord($pdo,$family['family_key'],true);if(fetchRecord($pdo,$newKey,true)){$pdo->rollBack();respond(409,['error'=>'That family code is already in use.']);}$pdo->prepare('UPDATE families SET family_key=:new WHERE id=:id')->execute(['new'=>$newKey,'id'=>$data['familyId']]);if($state)$pdo->prepare('UPDATE kingdom_states SET family_key=:new WHERE family_key=:old')->execute(['new'=>$newKey,'old'=>$family['family_key']]);}$pdo->commit();respond(200,['ok'=>true]);
        }
    }
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
    ensureFamily($pdo, $familyKey);
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
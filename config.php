<?php

$host = getenv('DB_HOST') ?: 'localhost';
$db   = getenv('DB_NAME') ?: 'test';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') ?: '';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    // En production, il vaut mieux logger l'erreur plutôt que de l'afficher
    throw new \PDOException($e->getMessage(), (int)$e->getCode());
}

function start_secure_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $secure = is_https_request();
    $params = session_get_cookie_params();

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => $params['path'],
        'domain' => $params['domain'],
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    ini_set('session.use_strict_mode', '1');
    session_start();
}

function is_https_request(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }

    if (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443') {
        return true;
    }

    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
        return strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https';
    }

    if (!empty($_SERVER['HTTP_X_FORWARDED_SSL'])) {
        return strtolower((string)$_SERVER['HTTP_X_FORWARDED_SSL']) === 'on';
    }

    if (!empty($_SERVER['REQUEST_SCHEME'])) {
        return strtolower((string)$_SERVER['REQUEST_SCHEME']) === 'https';
    }

    return false;
}

function aza_api_request(string $path, array $payload, string $method = 'POST'): array
{
    $base = rtrim(getenv('AZA_API_BASE_URL') ?: 'https://api.sowwwl.cloud', '/');
    $token = getenv('AZA_API_TOKEN') ?: '';

    if ($token === '') {
        return [
            'ok' => false,
            'status' => 0,
            'error' => 'AZA_API_TOKEN is not configured.',
        ];
    }

    $url = $base . $path;
    $headers = [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
    ];

    $options = [
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'content' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'timeout' => 20,
        ],
    ];

    $context = stream_context_create($options);
    $body = @file_get_contents($url, false, $context);

    $status = 0;
    if (isset($http_response_header[0]) && preg_match('#HTTP/\\S+\\s+(\\d+)#', $http_response_header[0], $match)) {
        $status = (int)$match[1];
    }

    if ($body === false) {
        $error = error_get_last();
        return [
            'ok' => false,
            'status' => $status,
            'error' => $error['message'] ?? 'Request failed.',
        ];
    }

    $decoded = json_decode($body, true);

    return [
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'body' => $decoded ?? $body,
    ];
}

function aza_api_upload(string $file_path, string $file_name, string $user_id, ?string $workspace_id = null): array
{
    $base = rtrim(getenv('AZA_API_BASE_URL') ?: 'https://api.sowwwl.cloud', '/');
    $token = getenv('AZA_API_TOKEN') ?: '';

    if ($token === '') {
        return [
            'ok' => false,
            'status' => 0,
            'error' => 'AZA_API_TOKEN is not configured.',
        ];
    }

    if (!function_exists('curl_init')) {
        return [
            'ok' => false,
            'status' => 0,
            'error' => 'PHP cURL extension is not available.',
        ];
    }

    $mime = 'application/octet-stream';
    if (function_exists('mime_content_type')) {
        $detected = mime_content_type($file_path);
        if ($detected) {
            $mime = $detected;
        }
    }

    $url = $base . '/upload';
    $ch = curl_init($url);

    $post_fields = [
        'file' => new CURLFile($file_path, $mime, $file_name),
        'user_id' => $user_id,
    ];
    if ($workspace_id) {
        $post_fields['workspace_id'] = $workspace_id;
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $post_fields,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $token,
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
    ]);

    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($body === false) {
        $error = curl_error($ch);
        curl_close($ch);
        return [
            'ok' => false,
            'status' => $status,
            'error' => $error ?: 'Upload failed.',
        ];
    }

    curl_close($ch);
    $decoded = json_decode($body, true);

    return [
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'body' => $decoded ?? $body,
    ];
}

<?php
require __DIR__ . '/config.php';

start_secure_session();

$message = '';

function invite_codes(): array
{
    $raw = getenv('INVITE_CODES');
    if ($raw === false || trim($raw) === '') {
        $raw = getenv('INVITE_CODE') ?: '';
    }

    return array_values(array_filter(array_map('trim', explode(',', $raw))));
}

function valid_username(string $username): bool
{
    return (bool)preg_match('/^[a-zA-Z0-9_-]{3,32}$/', $username);
}

function rate_limit(string $key, int $max_attempts, int $window_seconds): array
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $now = time();
    $path = sys_get_temp_dir() . '/sowl_rl_' . sha1($key . '|' . $ip);

    $data = [
        'count' => 0,
        'reset' => $now + $window_seconds,
    ];

    if (is_file($path)) {
        $raw = json_decode((string)file_get_contents($path), true);
        if (is_array($raw) && isset($raw['count'], $raw['reset'])) {
            $data = [
                'count' => (int)$raw['count'],
                'reset' => (int)$raw['reset'],
            ];
        }
    }

    if ($data['reset'] <= $now) {
        $data = [
            'count' => 0,
            'reset' => $now + $window_seconds,
        ];
    }

    $data['count']++;
    file_put_contents($path, json_encode($data), LOCK_EX);

    $allowed = $data['count'] <= $max_attempts;
    $retry_after = max(0, $data['reset'] - $now);

    return [$allowed, $retry_after];
}

$invite_codes = invite_codes();

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
$csrf_token = $_SESSION['csrf_token'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? 'register';
    $rate_key = 'auth:' . $action;
    $max_attempts = $action === 'login' ? 8 : 4;
    $window_seconds = $action === 'login' ? 300 : 600;

    [$allowed, $retry_after] = rate_limit($rate_key, $max_attempts, $window_seconds);
    if (!$allowed) {
        $message = "Trop de tentatives. Réessaie dans {$retry_after} secondes.";
    } else {
        $posted_token = $_POST['csrf_token'] ?? '';
        if (!hash_equals($csrf_token, $posted_token)) {
            $message = "Session expirée. Réessaie.";
        } else {
            $action = $_POST['action'] ?? 'register';

        if ($action === 'register') {
            $username = trim($_POST['username'] ?? '');
            $password = (string)($_POST['password'] ?? '');
            $timezone = trim($_POST['timezone'] ?? '');
            $invite_code = trim($_POST['invite_code'] ?? '');

            if (empty($invite_codes)) {
                $message = "Inscription fermée : code d’invitation non configuré.";
            } elseif (!valid_username($username)) {
                $message = "Nom d’usage invalide (3–32 caractères, a-z, 0-9, _ ou -).";
            } elseif (strlen($password) < 8) {
                $message = "Mot de passe trop court (8 caractères minimum).";
            } elseif ($timezone === '' || strlen($timezone) > 64) {
                $message = "Fuseau horaire invalide.";
            } elseif (!in_array($invite_code, $invite_codes, true)) {
                $message = "Code d’invitation invalide.";
            } else {
                try {
                    $stmt = $pdo->prepare("
                        INSERT INTO lands (username, password_hash, email_virtual, timezone, zone_code)
                        VALUES (:username, :password_hash, :email_virtual, :timezone, :zone_code)
                    ");

                    $email_virtual = $username . '@o.local';
                    $zone_code = $timezone; // abstraction volontaire
                    $password_hash = password_hash($password, PASSWORD_DEFAULT);

                    $stmt->execute([
                        ':username' => $username,
                        ':password_hash' => $password_hash,
                        ':email_virtual' => $email_virtual,
                        ':timezone' => $timezone,
                        ':zone_code' => $zone_code
                    ]);

                    $new_id = $pdo->lastInsertId();
                    session_regenerate_id(true);
                    $_SESSION['user_id'] = $new_id;
                    $_SESSION['username'] = $username;
                    header('Location: /dashboard');
                    exit;
                } catch (PDOException $e) {
                    if ((string)$e->getCode() === '23000') {
                        $message = "Ce nom d’usage est déjà pris.";
                    } else {
                        $message = "Erreur d’inscription. Réessaie plus tard.";
                    }
                }
            }
        } elseif ($action === 'login') {
            $username = trim($_POST['username'] ?? '');
            $password = (string)($_POST['password'] ?? '');

            if ($username === '' || $password === '') {
                $message = "Identifiants invalides.";
            } else {
                $stmt = $pdo->prepare("SELECT id, username, password_hash FROM lands WHERE username = ?");
                $stmt->execute([$username]);
                $land = $stmt->fetch();

                if (!$land || !password_verify($password, $land['password_hash'])) {
                    usleep(200000);
                    $message = "Identifiants invalides.";
                } else {
                    session_regenerate_id(true);
                    $_SESSION['user_id'] = $land['id'];
                    $_SESSION['username'] = $land['username'];
                    header('Location: /dashboard');
                    exit;
                }
            }
        }
        }
    }
}
?>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>O.</title>
    <link rel="stylesheet" href="/styles.css">
    <script src="/main.js" defer></script>
</head>
<body class="AeiouuoieA auth-page">
<main>
    <h1>O.</h1>
    <p>S’installer ici.</p>
    <div class="actions">
        <a class="cta" href="/world">Voir le monde</a>
    </div>

    <?php if ($message): ?>
        <p class="message"><?= htmlspecialchars($message) ?></p>
    <?php endif; ?>

    <div class="panels">
        <form method="post" class="panel">
            <h2>Inscription</h2>
            <input type="hidden" name="action" value="register">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf_token) ?>">
            <input type="text" name="username" placeholder="Nom d’usage" autocomplete="username" required>
            <input type="password" name="password" placeholder="Mot de passe" autocomplete="new-password" required>
            <input type="text" name="timezone" placeholder="Fuseau horaire (ex: Europe/Paris)" required>
            <input type="text" name="invite_code" placeholder="Code d’invitation" autocomplete="one-time-code" required>
            <button type="submit">Poser une terre</button>
        </form>

        <form method="post" class="panel">
            <h2>Connexion</h2>
            <input type="hidden" name="action" value="login">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrf_token) ?>">
            <input type="text" name="username" placeholder="Nom d’usage" autocomplete="username" required>
            <input type="password" name="password" placeholder="Mot de passe" autocomplete="current-password" required>
            <button type="submit">Entrer</button>
        </form>
    </div>
</main>
</body>
</html>

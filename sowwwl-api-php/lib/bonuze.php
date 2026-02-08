<?php
declare(strict_types=1);

/**
 * b0n uZe — alphabetic equilibrium (server-only, deterministic).
 *
 * Public API:
 *  - bonuze_accept(PDO,int): array
 *  - bonuze_letter(PDO,int): array
 *  - bonuze_event(PDO,int,array): array
 *  - bonuze_allows_aza(PDO,int): bool
 */

const BONUZE_VERSION = 1;

function bonuze_alphabet(): array {
    return str_split('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
}

function bonuze_letter_from_index(int $i): string {
    $alpha = bonuze_alphabet();
    $i = max(0, min(25, $i));
    return $alpha[$i];
}

function bonuze_index_from_letter(string $ch): int {
    $alpha = bonuze_alphabet();
    $u = strtoupper(trim($ch));
    $idx = array_search($u, $alpha, true);
    return $idx === false ? 14 : (int)$idx;
}

function bonuze_decay_value(float $value, float $dtSec, float $windowSec): float {
    if ($dtSec <= 0) return $value;
    if ($dtSec >= $windowSec) return 0.0;
    $k = max(0.0, 1.0 - ($dtSec / $windowSec));
    return max(0.0, $value * $k);
}

function bonuze_row(PDO $pdo, int $uid): array {
    $stmt = $pdo->prepare("SELECT * FROM bonuze_state WHERE user_id = :u LIMIT 1");
    $stmt->execute([':u' => $uid]);
    $row = $stmt->fetch();
    if ($row) return $row;

    $pdo->prepare("
        INSERT IGNORE INTO bonuze_state (user_id, version, ok, locked, state_index, state_letter, osc_dir)
        VALUES (:u, :v, 0, 0, 14, 'O', 1)
    ")->execute([':u' => $uid, ':v' => BONUZE_VERSION]);

    $stmt = $pdo->prepare("SELECT * FROM bonuze_state WHERE user_id = :u LIMIT 1");
    $stmt->execute([':u' => $uid]);
    return (array)($stmt->fetch() ?: []);
}

function bonuze_ok(array $row): bool {
    if (empty($row)) return false;
    $v = (int)($row['version'] ?? 0);
    $consented = (string)($row['consented_at'] ?? '');
    return $v === BONUZE_VERSION && $consented !== '' && (int)($row['ok'] ?? 0) === 1;
}

function bonuze_flags_from_row(array $row): array {
    $flags = [];
    if (!empty($row['locked'])) $flags[] = 'locked';
    if ((float)($row['edits_1m'] ?? 0) > 5 || (float)($row['actions_5m'] ?? 0) > 20 || (float)($row['repeats_1h'] ?? 0) > 6) {
        $flags[] = 'spam';
    }
    if ((float)($row['actions_1h'] ?? 0) > 120 || (float)($row['actions_5m'] ?? 0) > 35) {
        $flags[] = 'instability';
    }
    if ((float)($row['noise_1h'] ?? 0) > 14) {
        $flags[] = 'rupture';
    }
    if ((int)($row['threats_30d'] ?? 0) > 0) {
        $flags[] = 'threat';
    }
    return array_values(array_unique($flags));
}

function bonuze_eval(PDO $pdo, int $uid, ?array $event = null): array {
    $row = bonuze_row($pdo, $uid);
    $now = new DateTimeImmutable('now');
    $nowStr = $now->format('Y-m-d H:i:s');

    $lastEval = isset($row['last_eval_at']) && $row['last_eval_at'] ? new DateTimeImmutable((string)$row['last_eval_at']) : null;
    $dt = $lastEval ? max(0.0, ($now->getTimestamp() - $lastEval->getTimestamp())) : 0.0;

    $actions5m = bonuze_decay_value((float)($row['actions_5m'] ?? 0), $dt, 300.0);
    $actions1h = bonuze_decay_value((float)($row['actions_1h'] ?? 0), $dt, 3600.0);
    $edits1m = bonuze_decay_value((float)($row['edits_1m'] ?? 0), $dt, 60.0);
    $repeats1h = bonuze_decay_value((float)($row['repeats_1h'] ?? 0), $dt, 3600.0);
    $noise1h = bonuze_decay_value((float)($row['noise_1h'] ?? 0), $dt, 3600.0);
    $threats30d = (int)($row['threats_30d'] ?? 0);

    $lastEventAt = isset($row['last_event_at']) && $row['last_event_at'] ? new DateTimeImmutable((string)$row['last_event_at']) : null;
    $lastChangeAt = isset($row['last_change_at']) && $row['last_change_at'] ? new DateTimeImmutable((string)$row['last_change_at']) : null;
    $threatLastAt = isset($row['threat_last_at']) && $row['threat_last_at'] ? new DateTimeImmutable((string)$row['threat_last_at']) : null;

    $lastSig = (string)($row['last_sig'] ?? '');
    $sig = '';
    $etype = '';

    if ($event) {
        $etype = strtolower(trim((string)($event['type'] ?? '')));
        $sig = (string)($event['sig'] ?? '');
        $weight = isset($event['weight']) ? (float)$event['weight'] : 1.0;
        if ($weight <= 0) $weight = 1.0;

        $actions5m += $weight;
        $actions1h += $weight;

        if ($etype === 'edit') $edits1m += $weight;
        if ($etype === 'noise') $noise1h += $weight;
        if ($etype === 'nav') $actions5m += ($weight * 0.2);

        if ($sig !== '' && $sig === $lastSig) {
            $repeats1h += 1.0;
        }
        if ($sig !== '') $lastSig = $sig;

        if ($etype === 'threat') {
            $threats30d += 1;
            $threatLastAt = $now;
        }

        $lastEventAt = $now;
    }

    // Expire threat window after 30d of silence from last threat.
    if ($threatLastAt) {
        $age = $now->getTimestamp() - $threatLastAt->getTimestamp();
        if ($age > 30 * 24 * 3600) {
            $threats30d = 0;
            $threatLastAt = null;
        }
    }

    $flags = [];
    if ($edits1m > 5 || $actions5m > 20 || $repeats1h > 6) $flags[] = 'spam';
    if ($actions1h > 120 || $actions5m > 35) $flags[] = 'instability';
    if ($noise1h > 14) $flags[] = 'rupture';
    if ($threats30d > 0) $flags[] = 'threat';

    $locked = (int)($row['locked'] ?? 0) === 1;
    if (in_array('threat', $flags, true)) {
        $locked = true;
    } elseif ($locked && $lastEventAt) {
        $silence = $now->getTimestamp() - $lastEventAt->getTimestamp();
        if ($silence >= 3 * 24 * 3600) {
            $locked = false;
        }
    }

    $idx = (int)($row['state_index'] ?? 14);
    $oscDir = (int)($row['osc_dir'] ?? 1);
    if ($oscDir === 0) $oscDir = 1;

    if (!$locked) {
        $delta = 0;
        if (in_array('spam', $flags, true)) {
            $delta += $oscDir * 3;
            $oscDir *= -1;
        }
        if (in_array('instability', $flags, true)) {
            $delta += $oscDir * 2;
            $oscDir *= -1;
        }
        if (in_array('rupture', $flags, true)) {
            $delta += ($idx <= 14) ? -2 : 2;
        }

        $silenceSec = $lastEventAt ? ($now->getTimestamp() - $lastEventAt->getTimestamp()) : (10 * 24 * 3600);
        $calm = $actions1h < 10 && $actions5m < 4;
        if ($delta === 0 && ($silenceSec >= 3 * 24 * 3600 || $calm)) {
            if ($idx < 14) $delta += 1;
            if ($idx > 14) $delta -= 1;
        }

        $idx = max(0, min(25, $idx + $delta));
        if ($delta !== 0) $lastChangeAt = $now;
    }

    $letter = bonuze_letter_from_index($idx);
    $flags = array_values(array_unique($flags));
    $flagsJson = $flags ? json_encode($flags, JSON_UNESCAPED_SLASHES) : null;

    $pdo->prepare("
        UPDATE bonuze_state SET
          version = :v,
          ok = :ok,
          locked = :locked,
          state_index = :i,
          state_letter = :l,
          flags_json = :f,
          last_eval_at = :le,
          last_event_at = :ev,
          last_change_at = :lc,
          osc_dir = :od,
          actions_5m = :a5,
          actions_1h = :a1,
          edits_1m = :e1,
          repeats_1h = :r1,
          noise_1h = :n1,
          threats_30d = :t30,
          threat_last_at = :tlast,
          last_sig = :ls
        WHERE user_id = :u
    ")->execute([
        ':v' => BONUZE_VERSION,
        ':ok' => bonuze_ok($row) ? 1 : 0,
        ':locked' => $locked ? 1 : 0,
        ':i' => $idx,
        ':l' => $letter,
        ':f' => $flagsJson,
        ':le' => $nowStr,
        ':ev' => $lastEventAt ? $lastEventAt->format('Y-m-d H:i:s') : null,
        ':lc' => $lastChangeAt ? $lastChangeAt->format('Y-m-d H:i:s') : null,
        ':od' => $oscDir,
        ':a5' => $actions5m,
        ':a1' => $actions1h,
        ':e1' => $edits1m,
        ':r1' => $repeats1h,
        ':n1' => $noise1h,
        ':t30' => $threats30d,
        ':tlast' => $threatLastAt ? $threatLastAt->format('Y-m-d H:i:s') : null,
        ':ls' => $lastSig !== '' ? $lastSig : null,
        ':u' => $uid,
    ]);

    return [
        'ok' => bonuze_ok($row),
        'locked' => $locked,
        'letter' => $letter,
        'flags' => $flags,
        'state_index' => $idx,
        'last_change_at' => $lastChangeAt ? $lastChangeAt->format('Y-m-d H:i:s') : null,
    ];
}

function bonuze_accept(PDO $pdo, int $uid): array {
    bonuze_row($pdo, $uid);
    $pdo->prepare("
        UPDATE bonuze_state SET version = :v, ok = 1, consented_at = NOW()
        WHERE user_id = :u
    ")->execute([':v' => BONUZE_VERSION, ':u' => $uid]);

    $r = bonuze_row($pdo, $uid);
    return ['ok' => true, 'version' => (int)($r['version'] ?? BONUZE_VERSION), 'consented_at' => $r['consented_at'] ?? null];
}

function bonuze_letter(PDO $pdo, int $uid): array {
    $row = bonuze_row($pdo, $uid);
    $ok = bonuze_ok($row);
    if (!$ok) {
        return ['charte_ok' => false, 'letter' => null];
    }
    $state = bonuze_eval($pdo, $uid, null);
    return ['charte_ok' => true, 'letter' => $state['letter']];
}

function bonuze_event(PDO $pdo, int $uid, array $event): array {
    $row = bonuze_row($pdo, $uid);
    if (!bonuze_ok($row)) return ['ok' => false, 'error' => 'charte_required'];
    $state = bonuze_eval($pdo, $uid, $event);
    return ['ok' => true, 'letter' => $state['letter'], 'locked' => $state['locked']];
}

function bonuze_allows_aza(PDO $pdo, int $uid): bool {
    $row = bonuze_row($pdo, $uid);
    if (!bonuze_ok($row)) return false;
    if ((int)($row['locked'] ?? 0) === 1) return false;

    $lastChangeAt = isset($row['last_change_at']) && $row['last_change_at'] ? new DateTimeImmutable((string)$row['last_change_at']) : null;
    if ($lastChangeAt) {
        $age = time() - $lastChangeAt->getTimestamp();
        if ($age < 36 * 3600) return false; // stable window
    }

    $lastEventAt = isset($row['last_event_at']) && $row['last_event_at'] ? new DateTimeImmutable((string)$row['last_event_at']) : null;
    if ($lastEventAt) {
        $silence = time() - $lastEventAt->getTimestamp();
        if ($silence < 3 * 24 * 3600) return false;
    }

    // Placeholder: treat quest_delta ENDED as qu3st_level >= 5.
    try {
        $stmt = $pdo->prepare("SELECT state FROM quest_delta WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $q = $stmt->fetch();
        $state = (string)($q['state'] ?? '');
        if ($state !== 'ENDED') return false;
    } catch (Throwable) {
        return false;
    }

    return true;
}


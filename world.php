<?php
require __DIR__ . '/config.php';

start_secure_session();

$username = $_SESSION['username'] ?? null;
?>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>O. — World</title>
    <link rel="stylesheet" href="/styles.css">
    <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"
        crossorigin="anonymous"
    >
    <script src="/main.js" defer></script>
</head>
  <body class="AeiouuoieA world-page">
  <main class="world-main">
    <h1>World</h1>
    <p class="world-text">
        Le monde est ouvert. Observe, puis entre. Chaque clic aspire les étoiles.
    </p>

    <div id="map" aria-label="Carte du monde">
        <canvas id="starfield" aria-hidden="true"></canvas>
    </div>
    <div class="map-actions">
        <button class="btn btn-secondary" id="toggle-map" type="button">Afficher la carte</button>
    </div>
    <p class="map-hint">Clique pour aspirer les étoiles.</p>

    <div class="actions">
        <a class="btn btn-primary" href="/dashboard">Accéder au dashboard</a>
        <?php if (!$username): ?>
            <a class="btn btn-secondary" href="/login">Se connecter / S’inscrire</a>
        <?php endif; ?>
    </div>

    <?php if ($username): ?>
        <p class="meta">Connecté en tant que <?= htmlspecialchars($username) ?>.</p>
    <?php else: ?>
        <p class="meta">Pas encore connecté. Tu peux entrer quand tu veux.</p>
    <?php endif; ?>
</main>

<script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"
    crossorigin="anonymous"
></script>
</body>
</html>

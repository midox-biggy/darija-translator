<?php
declare(strict_types=1);

// Web client:  php -S localhost:8000   then open http://localhost:8000
require __DIR__ . '/TranslatorClient.php';
$config = require __DIR__ . '/config.php';

$client = new TranslatorClient($config['url'], $config['user'], $config['password']);
$languages = ['auto' => 'Detect language', 'English' => 'English', 'French' => 'French',
    'Modern Standard Arabic' => 'Arabic (Fusha)', 'Spanish' => 'Spanish', 'German' => 'German'];

$text = trim((string) ($_POST['text'] ?? ''));
$source = array_key_exists($_POST['source'] ?? '', $languages) ? $_POST['source'] : 'auto';
$script = ($_POST['script'] ?? 'arabic') === 'latin' ? 'latin' : 'arabic';
$result = null;
$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $text !== '') {
    try {
        $result = $client->translate($text, $source, $script);
    } catch (TranslatorException $e) {
        $error = $e->getMessage() . ($e->getCode() ? ' (HTTP ' . $e->getCode() . ')' : '');
    }
}
try {
    $health = $client->health();
} catch (TranslatorException) {
    $health = null;
}

function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Darija Translator – PHP client</title>
    <style>
        :root { --red:#c1272d; --green:#006233; --bg:#f7f5f2; --card:#fff; --text:#1d1b19; --muted:#6b6560; --line:#e4dfd8; --error-bg:#fdecec; }
        @media (prefers-color-scheme: dark) { :root { --bg:#171514; --card:#221f1d; --text:#f1ece6; --muted:#a59d95; --line:#36312d; --red:#e0474d; --error-bg:#3a1d1d; } }
        * { box-sizing: border-box; }
        body { margin:0; font:15px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--text); }
        header { background:var(--card); border-bottom:3px solid var(--red); padding:14px 16px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
        header h1 { margin:0; font-size:18px; }
        .status { font-size:13px; color:var(--muted); }
        .status b { color: <?= $health ? 'var(--green)' : 'var(--red)' ?>; }
        main { max-width:720px; margin:0 auto; padding:16px; display:grid; gap:14px; }
        form, .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; display:grid; gap:10px; }
        textarea, select { font:inherit; color:var(--text); background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px; width:100%; }
        textarea { min-height:120px; resize:vertical; }
        .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .row select { width:auto; }
        button { font:inherit; border-radius:8px; padding:7px 14px; cursor:pointer; border:1px solid var(--line); background:transparent; color:var(--text); }
        button.primary { background:var(--red); border-color:var(--red); color:#fff; font-weight:600; margin-left:auto; }
        .output { font-size:21px; line-height:1.7; white-space:pre-wrap; font-family:"Geeza Pro","Noto Naskh Arabic",sans-serif; }
        .meta { font-size:12px; color:var(--muted); }
        .error { background:var(--error-bg); color:var(--red); border-radius:8px; padding:10px; }
    </style>
</head>
<body>
<header>
    <h1>Darija Translator <small class="meta">PHP client</small></h1>
    <span class="status">Server <?= e($config['url']) ?>:
        <b><?= $health ? 'online · ' . e($health['provider'] . '/' . $health['model']) : 'offline' ?></b></span>
</header>
<main>
    <form method="post">
        <textarea name="text" maxlength="5000" required placeholder="Text to translate into Moroccan Darija…"><?= e($text) ?></textarea>
        <div class="row">
            <label>From
                <select name="source">
                    <?php foreach ($languages as $id => $label): ?>
                        <option value="<?= e($id) ?>" <?= $id === $source ? 'selected' : '' ?>><?= e($label) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label><input type="radio" name="script" value="arabic" <?= $script === 'arabic' ? 'checked' : '' ?>> Arabic script</label>
            <label><input type="radio" name="script" value="latin" <?= $script === 'latin' ? 'checked' : '' ?>> Latin script</label>
            <button class="primary" type="submit">Translate</button>
        </div>
    </form>

    <?php if ($error): ?>
        <div class="error" role="alert"><?= e($error) ?></div>
    <?php endif; ?>

    <?php if ($result): ?>
        <section class="card">
            <div id="output" class="output" dir="<?= $result['script'] === 'arabic' ? 'rtl' : 'ltr' ?>"><?= e($result['translation']) ?></div>
            <div class="row">
                <button type="button" id="speak">🔊 Read aloud</button>
                <button type="button" id="copy">📋 Copy</button>
                <span class="meta"><?= e($result['provider'] . '/' . $result['model']) ?> ·
                    <?= $result['cached'] ? 'cached' : number_format($result['durationMs'] / 1000, 1) . ' s' ?> ·
                    user <?= e((string) $result['user']) ?></span>
            </div>
        </section>
        <script>
            const out = document.getElementById('output');
            const latin = <?= json_encode($result['script'] === 'latin') ?>;
            document.getElementById('copy').onclick = () => navigator.clipboard.writeText(out.textContent);
            document.getElementById('speak').onclick = () => {
                speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(out.textContent);
                const voices = speechSynthesis.getVoices();
                u.voice = voices.find(v => v.lang.startsWith(latin ? 'fr' : 'ar-MA'))
                       || voices.find(v => v.lang.startsWith(latin ? 'fr' : 'ar')) || null;
                u.lang = latin ? 'fr-FR' : 'ar-MA';
                speechSynthesis.speak(u);
            };
        </script>
    <?php endif; ?>
</main>
</body>
</html>

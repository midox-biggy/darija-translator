<?php
declare(strict_types=1);

// Terminal client:  php cli.php "How are you?"   |   php cli.php --latin "Good night"
require __DIR__ . '/TranslatorClient.php';
$config = require __DIR__ . '/config.php';

$args = array_slice($argv, 1);
$script = 'arabic';
if (($i = array_search('--latin', $args, true)) !== false) {
    $script = 'latin';
    unset($args[$i]);
}
$text = trim(implode(' ', $args));
if ($text === '') {
    fwrite(STDERR, "Usage: php cli.php [--latin] \"text to translate\"\n");
    exit(2);
}

$client = new TranslatorClient($config['url'], $config['user'], $config['password']);
try {
    $result = $client->translate($text, 'auto', $script);
    echo $result['translation'], PHP_EOL;
    fwrite(STDERR, sprintf("  [%s/%s · %s]\n", $result['provider'], $result['model'],
        $result['cached'] ? 'cached' : number_format($result['durationMs'] / 1000, 1) . ' s'));
} catch (TranslatorException $e) {
    fwrite(STDERR, 'Error (' . $e->getCode() . '): ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

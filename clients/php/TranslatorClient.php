<?php
declare(strict_types=1);

/**
 * PHP client for the Darija Translator REST service (TranslatorResource.translate()).
 * Uses cURL when the extension is available, plain PHP streams otherwise.
 */
final class TranslatorException extends RuntimeException
{
}

final class TranslatorClient
{
    public function __construct(
        private readonly string $baseUrl,
        private readonly string $username,
        private readonly string $password,
        private readonly int $timeoutSeconds = 90,
    ) {
    }

    /** GET /api/health (public). */
    public function health(): array
    {
        return $this->request('GET', '/api/health', null, false);
    }

    /**
     * POST /api/translator/translate
     *
     * @return array{translation:string, source:string, script:string, provider:string, model:string, cached:bool, durationMs:int, user:?string}
     */
    public function translate(string $text, string $source = 'auto', string $script = 'arabic'): array
    {
        return $this->request('POST', '/api/translator/translate', [
            'text' => $text,
            'source' => $source,
            'script' => $script,
        ]);
    }

    private function request(string $method, string $path, ?array $body, bool $auth = true): array
    {
        $url = rtrim($this->baseUrl, '/') . $path;
        $headers = ['Accept: application/json', 'X-Requested-With: PHP'];
        if ($auth) {
            $headers[] = 'Authorization: Basic ' . base64_encode($this->username . ':' . $this->password);
        }
        $payload = null;
        if ($body !== null) {
            $payload = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $headers[] = 'Content-Type: application/json; charset=utf-8';
        }

        [$status, $raw] = function_exists('curl_init')
            ? $this->sendWithCurl($method, $url, $headers, $payload)
            : $this->sendWithStreams($method, $url, $headers, $payload);

        $data = json_decode($raw, true);
        if ($status < 200 || $status >= 300) {
            $message = is_array($data) && isset($data['message']) ? $data['message'] : "HTTP $status";
            throw new TranslatorException($message, $status);
        }
        if (!is_array($data)) {
            throw new TranslatorException('The server returned an invalid answer', 502);
        }
        return $data;
    }

    /** @return array{0:int,1:string} */
    private function sendWithCurl(string $method, string $url, array $headers, ?string $payload): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
        ]);
        if ($payload !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        }
        $raw = curl_exec($ch);
        if ($raw === false) {
            $error = curl_error($ch);
            throw new TranslatorException("Cannot reach {$this->baseUrl}: $error", 0);
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        return [$status, (string) $raw];
    }

    /** @return array{0:int,1:string} */
    private function sendWithStreams(string $method, string $url, array $headers, ?string $payload): array
    {
        $context = stream_context_create(['http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'content' => $payload ?? '',
            'timeout' => $this->timeoutSeconds,
            'ignore_errors' => true, // read the JSON body of 4xx/5xx answers too
        ]]);
        $raw = @file_get_contents($url, false, $context);
        if ($raw === false) {
            throw new TranslatorException("Cannot reach {$this->baseUrl}", 0);
        }
        $status = 0;
        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                $status = (int) $m[1];
            }
        }
        return [$status, $raw];
    }
}

package ma.aui.darija.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Any server that speaks the OpenAI {@code /chat/completions} protocol. This covers
 * lightweight local models served by Ollama ({@code http://localhost:11434/v1}) or
 * LM Studio ({@code http://localhost:1234/v1}), as well as hosted OpenAI-compatible APIs.
 */
public class OpenAiCompatibleClient implements LlmClient {

    private final String provider;
    private final String baseUrl;
    private final String model;
    private final String apiKey;
    private final Duration timeout;
    private final HttpClient http;
    private final ObjectMapper json = new ObjectMapper();

    public OpenAiCompatibleClient(String provider, String baseUrl, String model, String apiKey, Duration timeout) {
        this.provider = provider;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.timeout = timeout;
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Override
    public String complete(String systemPrompt, String userMessage) {
        ObjectNode body = json.createObjectNode();
        body.put("model", model);
        body.put("temperature", 0.3);
        body.put("stream", false);
        ArrayNode messages = body.putArray("messages");
        messages.addObject().put("role", "system").put("content", systemPrompt);
        messages.addObject().put("role", "user").put("content", userMessage);

        HttpRequest.Builder request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/chat/completions"))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8));
        if (apiKey != null && !apiKey.isBlank()) request.header("Authorization", "Bearer " + apiKey);

        try {
            HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode root = json.readTree(response.body());
            if (response.statusCode() != 200) {
                JsonNode error = root.path("error");
                String msg = error.isTextual() ? error.asText() : error.path("message").asText("HTTP " + response.statusCode());
                throw new LlmException(provider + " error: " + msg, LlmException.mapUpstreamStatus(response.statusCode()));
            }
            String text = root.path("choices").path(0).path("message").path("content").asText("");
            // Reasoning models (Qwen3, DeepSeek-R1...) may wrap their thoughts in <think> tags.
            text = text.replaceAll("(?s)<think>.*?</think>", "").trim();
            if (text.isEmpty()) throw new LlmException(provider + " returned an empty answer", 502);
            return text;
        } catch (IOException e) {
            throw new LlmException("Cannot reach " + provider + " at " + baseUrl + ": " + e.getMessage(), 502, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LlmException("Interrupted while calling " + provider, 503, e);
        }
    }

    @Override
    public String providerName() {
        return provider;
    }

    @Override
    public String modelName() {
        return model;
    }
}

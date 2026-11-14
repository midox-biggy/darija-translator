package ma.aui.darija.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Google Gemini through the Generative Language REST API
 * ({@code POST /v1beta/models/{model}:generateContent}). A free API key comes from
 * https://aistudio.google.com/apikey.
 */
public class GeminiClient implements LlmClient {

    private static final String BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

    private final String apiKey;
    private final String model;
    private final Duration timeout;
    private final HttpClient http;
    private final ObjectMapper json = new ObjectMapper();

    public GeminiClient(String apiKey, String model, Duration timeout) {
        this.apiKey = apiKey;
        this.model = model;
        this.timeout = timeout;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    @Override
    public String complete(String systemPrompt, String userMessage) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new LlmException("GEMINI_API_KEY is not set on the server", 503);
        }
        ObjectNode body = json.createObjectNode();
        body.putObject("systemInstruction").putArray("parts").addObject().put("text", systemPrompt);
        ObjectNode content = body.putArray("contents").addObject();
        content.put("role", "user");
        content.putArray("parts").addObject().put("text", userMessage);
        body.putObject("generationConfig").put("temperature", 0.3);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + URLEncoder.encode(model, StandardCharsets.UTF_8) + ":generateContent"))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode root = json.readTree(response.body());
            if (response.statusCode() != 200) {
                String msg = root.path("error").path("message").asText("HTTP " + response.statusCode());
                throw new LlmException("Gemini error: " + msg, LlmException.mapUpstreamStatus(response.statusCode()));
            }
            JsonNode candidate = root.path("candidates").path(0);
            StringBuilder text = new StringBuilder();
            for (JsonNode part : candidate.path("content").path("parts")) {
                if (!part.path("thought").asBoolean(false)) text.append(part.path("text").asText(""));
            }
            if (text.isEmpty()) {
                String reason = candidate.path("finishReason").asText(
                        root.path("promptFeedback").path("blockReason").asText("empty answer"));
                throw new LlmException("Gemini returned no text (" + reason + ")", 502);
            }
            return text.toString().trim();
        } catch (IOException e) {
            throw new LlmException("Cannot reach Gemini: " + e.getMessage(), 502, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LlmException("Interrupted while calling Gemini", 503, e);
        }
    }

    @Override
    public String providerName() {
        return "gemini";
    }

    @Override
    public String modelName() {
        return model;
    }
}

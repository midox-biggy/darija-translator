package ma.aui.darija.llm;

import ma.aui.darija.config.AppConfig;

import java.time.Duration;

/** Builds the {@link LlmClient} selected by {@code LLM_PROVIDER}. */
public final class LlmClientFactory {

    private LlmClientFactory() {
    }

    public static LlmClient create(AppConfig config) {
        Duration timeout = Duration.ofSeconds(config.llmTimeoutSeconds());
        return switch (config.provider()) {
            case "gemini" -> new GeminiClient(config.geminiApiKey(), config.geminiModel(), timeout);
            case "ollama", "lmstudio", "openai" -> new OpenAiCompatibleClient(
                    config.provider(), config.openAiBaseUrl(), config.openAiModel(), config.openAiApiKey(), timeout);
            default -> throw new IllegalArgumentException(
                    "Unknown LLM_PROVIDER '" + config.provider() + "'. Use gemini, ollama, lmstudio or openai.");
        };
    }
}

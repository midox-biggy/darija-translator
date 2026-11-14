package ma.aui.darija.config;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Runtime configuration. Each key is looked up, in order, as a JVM system property
 * (-DGEMINI_API_KEY=...), an environment variable, then a {@code config.properties}
 * file in the working directory. The first non-blank value wins.
 */
public record AppConfig(
        int port,
        String provider,
        String geminiApiKey,
        String geminiModel,
        String openAiBaseUrl,
        String openAiModel,
        String openAiApiKey,
        String usersFile,
        int llmTimeoutSeconds) {

    public static AppConfig load() {
        Properties file = new Properties();
        Path path = Path.of("config.properties");
        if (Files.isRegularFile(path)) {
            try (Reader r = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
                file.load(r);
            } catch (IOException e) {
                throw new IllegalStateException("Cannot read " + path.toAbsolutePath(), e);
            }
        }
        Lookup l = new Lookup(file);
        String provider = l.get("LLM_PROVIDER", "gemini").toLowerCase();
        String defaultBaseUrl = switch (provider) {
            case "lmstudio" -> "http://localhost:1234/v1";
            default -> "http://localhost:11434/v1"; // Ollama
        };
        return new AppConfig(
                Integer.parseInt(l.get("PORT", "8080")),
                provider,
                l.get("GEMINI_API_KEY", ""),
                l.get("GEMINI_MODEL", "gemini-flash-latest"),
                l.get("OPENAI_BASE_URL", defaultBaseUrl),
                l.get("OPENAI_MODEL", "qwen2.5:3b"),
                l.get("OPENAI_API_KEY", ""),
                l.get("USERS_FILE", ""),
                Integer.parseInt(l.get("LLM_TIMEOUT_SECONDS", "60")));
    }

    private record Lookup(Properties file) {
        String get(String key, String fallback) {
            for (String v : new String[]{System.getProperty(key), System.getenv(key), file.getProperty(key)}) {
                if (v != null && !v.isBlank()) return v.trim();
            }
            return fallback;
        }
    }
}

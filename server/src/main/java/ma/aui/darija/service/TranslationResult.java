package ma.aui.darija.service;

/** What {@link TranslationService#translate} returns. */
public record TranslationResult(
        String translation,
        String source,
        Script script,
        String provider,
        String model,
        boolean cached,
        long durationMs) {
}

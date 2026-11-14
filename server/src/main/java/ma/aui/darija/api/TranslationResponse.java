package ma.aui.darija.api;

import ma.aui.darija.service.TranslationResult;

/** JSON answer of the translate endpoint. */
public record TranslationResponse(
        String translation,
        String source,
        String target,
        String script,
        String provider,
        String model,
        boolean cached,
        long durationMs,
        String user) {

    static TranslationResponse of(TranslationResult r, String user) {
        return new TranslationResponse(r.translation(), r.source(), "Moroccan Arabic (Darija)", r.script().id(),
                r.provider(), r.model(), r.cached(), r.durationMs(), user);
    }
}

package ma.aui.darija.api;

/**
 * JSON body of {@code POST /api/translator/translate}.
 *
 * @param text   the text to translate (required, max 5000 characters)
 * @param source source language name, e.g. "English" or "French"; "auto" (default) lets the LLM detect it
 * @param script "arabic" (default) or "latin"
 */
public record TranslationRequest(String text, String source, String script) {
}

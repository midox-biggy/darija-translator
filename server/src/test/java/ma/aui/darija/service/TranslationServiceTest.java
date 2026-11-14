package ma.aui.darija.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TranslationServiceTest {

    @Test
    void echoedMarkersAndQuotesAreRemoved() {
        assertEquals("كيداير؟", TranslationService.cleanAnswer("<<<\nكيداير؟\n>>>"));
        assertEquals("labas?", TranslationService.cleanAnswer("\"labas?\""));
        assertEquals("a <<< b", TranslationService.cleanAnswer("a <<< b"));
    }

    @Test
    void promptAsksForTheRightScript() {
        assertTrue(TranslationService.systemPrompt(Script.ARABIC).contains("Arabic script only"));
        assertTrue(TranslationService.systemPrompt(Script.LATIN).contains("Never use Arabic letters"));
        assertTrue(TranslationService.userMessage("hi", "auto").contains("<<<\nhi\n>>>"));
    }
}

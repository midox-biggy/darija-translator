package ma.aui.darija;

import ma.aui.darija.llm.LlmClient;
import ma.aui.darija.llm.LlmException;
import ma.aui.darija.security.UserStore;
import ma.aui.darija.service.TranslationService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Starts the real embedded server (Tomcat + Jersey + Jakarta Authentication) on a random port,
 * with a fake LLM, and calls it over HTTP like a client would.
 */
class DarijaServerTest {

    private static final AtomicInteger LLM_CALLS = new AtomicInteger();
    private static DarijaServer server;
    private static String base;
    private static final HttpClient http = HttpClient.newHttpClient();

    /** Fake model: answers "DARIJA(<text>)" or fails when asked to. */
    static class FakeLlm implements LlmClient {
        @Override
        public String complete(String systemPrompt, String userMessage) {
            LLM_CALLS.incrementAndGet();
            if (userMessage.contains("QUOTA")) throw new LlmException("quota exceeded", 429);
            String text = userMessage.substring(userMessage.indexOf("<<<\n") + 4, userMessage.lastIndexOf("\n>>>"));
            return "DARIJA(" + text + ")";
        }

        @Override
        public String providerName() {
            return "fake";
        }

        @Override
        public String modelName() {
            return "fake-1";
        }
    }

    @BeforeAll
    static void start() throws Exception {
        UserStore users = UserStore.load(null); // bundled users.properties -> student/darija2026
        server = new DarijaServer(0, new TranslationService(new FakeLlm()), users);
        server.start();
        base = "http://localhost:" + server.port();
    }

    @AfterAll
    static void stop() throws Exception {
        server.close();
    }

    private static String basic(String user, String password) {
        return "Basic " + Base64.getEncoder().encodeToString((user + ":" + password).getBytes(StandardCharsets.UTF_8));
    }

    private static HttpResponse<String> post(String json, String auth) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + "/api/translator/translate"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json));
        if (auth != null) b.header("Authorization", auth);
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    @Test
    void healthIsPublic() throws Exception {
        var r = http.send(HttpRequest.newBuilder(URI.create(base + "/api/health")).build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, r.statusCode());
        assertTrue(r.body().contains("\"status\":\"UP\""));
    }

    @Test
    void translateWithoutCredentialsIs401WithChallenge() throws Exception {
        var r = post("{\"text\":\"hello\"}", null);
        assertEquals(401, r.statusCode());
        assertTrue(r.headers().firstValue("WWW-Authenticate").orElse("").startsWith("Basic realm="));
        assertTrue(r.body().contains("Authentication required"));
    }

    @Test
    void scriptedClientsGet401WithoutBrowserPopupHeader() throws Exception {
        var r = http.send(HttpRequest.newBuilder(URI.create(base + "/api/translator/translate"))
                .header("Content-Type", "application/json")
                .header("X-Requested-With", "XMLHttpRequest")
                .POST(HttpRequest.BodyPublishers.ofString("{\"text\":\"hello\"}")).build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(401, r.statusCode());
        assertTrue(r.headers().firstValue("WWW-Authenticate").isEmpty());
    }

    @Test
    void wrongPasswordIs401() throws Exception {
        var r = post("{\"text\":\"hello\"}", basic("student", "wrong"));
        assertEquals(401, r.statusCode());
        assertTrue(r.body().contains("Invalid username or password"));
    }

    @Test
    void unknownUserIs401() throws Exception {
        assertEquals(401, post("{\"text\":\"hello\"}", basic("nobody", "darija2026")).statusCode());
    }

    @Test
    void validCredentialsTranslate() throws Exception {
        var r = post("{\"text\":\"How are you?\",\"source\":\"English\"}", basic("student", "darija2026"));
        assertEquals(200, r.statusCode(), r.body());
        assertTrue(r.body().contains("\"translation\":\"DARIJA(How are you?)\""), r.body());
        assertTrue(r.body().contains("\"user\":\"student\""), r.body());
        assertTrue(r.body().contains("\"script\":\"arabic\""), r.body());
    }

    @Test
    void getVariantWorksAndUsesCache() throws Exception {
        String q = URLEncoder.encode("Good morning", StandardCharsets.UTF_8);
        HttpRequest req = HttpRequest.newBuilder(URI.create(base + "/api/translator/translate?script=latin&text=" + q))
                .header("Authorization", basic("student", "darija2026")).build();
        var first = http.send(req, HttpResponse.BodyHandlers.ofString());
        int callsAfterFirst = LLM_CALLS.get();
        var second = http.send(req, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, first.statusCode(), first.body());
        assertTrue(first.body().contains("\"cached\":false"));
        assertTrue(second.body().contains("\"cached\":true"));
        assertEquals(callsAfterFirst, LLM_CALLS.get(), "second call must come from the cache");
    }

    @Test
    void unicodeRoundTrip() throws Exception {
        var r = post("{\"text\":\"Bonjour, ça va ? مرحبا\"}", basic("student", "darija2026"));
        assertEquals(200, r.statusCode(), r.body());
        assertTrue(r.body().contains("DARIJA(Bonjour, ça va ? مرحبا)"), r.body());
    }

    @Test
    void emptyTextIs400() throws Exception {
        var r = post("{\"text\":\"   \"}", basic("student", "darija2026"));
        assertEquals(400, r.statusCode());
        assertTrue(r.body().contains("text is required"));
    }

    @Test
    void badScriptIs400() throws Exception {
        assertEquals(400, post("{\"text\":\"hi\",\"script\":\"klingon\"}", basic("student", "darija2026")).statusCode());
    }

    @Test
    void malformedJsonIs400() throws Exception {
        assertEquals(400, post("{not json", basic("student", "darija2026")).statusCode());
    }

    @Test
    void tooLongTextIs400() throws Exception {
        String big = "a".repeat(TranslationService.MAX_CHARS + 1);
        assertEquals(400, post("{\"text\":\"" + big + "\"}", basic("student", "darija2026")).statusCode());
    }

    @Test
    void llmQuotaErrorIs429() throws Exception {
        var r = post("{\"text\":\"QUOTA\"}", basic("student", "darija2026"));
        assertEquals(429, r.statusCode());
        assertTrue(r.body().contains("quota exceeded"));
    }

    @Test
    void corsPreflightNeedsNoCredentials() throws Exception {
        var r = http.send(HttpRequest.newBuilder(URI.create(base + "/api/translator/translate"))
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                .header("Origin", "http://localhost:8081")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type").build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, r.statusCode(), r.body());
        assertEquals("*", r.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
    }

    @Test
    void meEndpointReportsCallerAndRole() throws Exception {
        var r = http.send(HttpRequest.newBuilder(URI.create(base + "/api/translator/me"))
                .header("Authorization", basic("student", "darija2026")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, r.statusCode(), r.body());
        assertTrue(r.body().contains("\"user\":\"student\""), r.body());
        assertTrue(r.body().contains("\"role\":\"user\""), r.body());
    }

    @Test
    void homePageIsPublic() throws Exception {
        var r = http.send(HttpRequest.newBuilder(URI.create(base + "/")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, r.statusCode());
        assertFalse(r.body().isEmpty());
        assertNull(r.headers().firstValue("WWW-Authenticate").orElse(null));
    }
}

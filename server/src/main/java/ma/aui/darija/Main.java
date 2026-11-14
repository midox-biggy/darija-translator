package ma.aui.darija;

import ma.aui.darija.config.AppConfig;
import ma.aui.darija.llm.LlmClient;
import ma.aui.darija.llm.LlmClientFactory;
import ma.aui.darija.security.PasswordHasher;
import ma.aui.darija.security.UserStore;
import ma.aui.darija.service.TranslationService;

import java.util.logging.Logger;

/**
 * Starts the Darija Translator service.
 * <pre>
 *   java -jar darija-translator.jar              start the server
 *   java -jar darija-translator.jar hash SECRET  print a password hash for users.properties
 * </pre>
 */
public final class Main {

    private static final Logger LOG = Logger.getLogger(Main.class.getName());

    private Main() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 2 && args[0].equals("hash")) {
            System.out.println(PasswordHasher.hash(args[1]));
            return;
        }

        AppConfig config = AppConfig.load();
        LlmClient llm = LlmClientFactory.create(config);
        UserStore users = UserStore.load(config.usersFile());
        TranslationService service = new TranslationService(llm);

        DarijaServer server = new DarijaServer(config.port(), service, users);
        server.start();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                server.close();
            } catch (Exception ignored) {
                // shutting down anyway
            }
        }));

        LOG.info(() -> """

                ==============================================================
                 Darija Translator is running on http://localhost:%d
                 LLM provider : %s (model %s)
                 Users loaded : %d
                 Try it       : curl -u student:darija2026 -H 'Content-Type: application/json' \\
                                -d '{"text":"How are you?"}' http://localhost:%d/api/translator/translate
                ==============================================================""".formatted(
                server.port(), llm.providerName(), llm.modelName(), users.size(), server.port()));
        if (llm.providerName().equals("gemini") && config.geminiApiKey().isBlank()) {
            LOG.warning("GEMINI_API_KEY is not set: translations will fail with 503 until you set it.");
        }
        server.await();
    }
}

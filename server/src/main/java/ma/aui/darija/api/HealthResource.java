package ma.aui.darija.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import ma.aui.darija.llm.LlmClient;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** Public endpoint (no login) that clients use to check the server is up. */
@Path("/health")
@Produces(MediaType.APPLICATION_JSON)
public class HealthResource {

    private final LlmClient llm;

    @Inject
    public HealthResource(LlmClient llm) {
        this.llm = llm;
    }

    @GET
    public Map<String, Object> health() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "UP");
        body.put("service", "Darija Translator");
        body.put("provider", llm.providerName());
        body.put("model", llm.modelName());
        body.put("time", Instant.now().toString());
        return body;
    }
}

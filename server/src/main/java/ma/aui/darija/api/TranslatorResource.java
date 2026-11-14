package ma.aui.darija.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.SecurityContext;
import ma.aui.darija.security.UserStore;
import ma.aui.darija.service.InvalidRequestException;
import ma.aui.darija.service.Script;
import ma.aui.darija.service.TranslationService;

import java.util.Map;

/**
 * The TranslatorResource REST endpoint. Everything under {@code /api/translator} is protected:
 * the container only lets a request in after the Jakarta Authentication module
 * ({@link ma.aui.darija.security.BasicAuthServerAuthModule}) has validated its Basic credentials.
 */
@Path("/translator")
@Produces(MediaType.APPLICATION_JSON + ";charset=UTF-8")
public class TranslatorResource {

    private final TranslationService service;

    @Inject
    public TranslatorResource(TranslationService service) {
        this.service = service;
    }

    /**
     * Translates a text into Moroccan Darija.
     * <pre>
     * POST /api/translator/translate
     * Authorization: Basic base64(user:password)
     * {"text": "How are you?", "source": "English", "script": "arabic"}
     * </pre>
     */
    @POST
    @Path("/translate")
    @Consumes(MediaType.APPLICATION_JSON)
    public TranslationResponse translate(TranslationRequest request, @Context SecurityContext security) {
        if (request == null) throw new InvalidRequestException("a JSON body with a 'text' field is required");
        var result = service.translate(request.text(), request.source(), Script.parse(request.script()));
        return TranslationResponse.of(result, userOf(security));
    }

    /** Same as {@link #translate} with query parameters, handy for a quick test in a browser or with cURL. */
    @GET
    @Path("/translate")
    public TranslationResponse translateQuery(@QueryParam("text") String text,
                                              @QueryParam("source") @DefaultValue("auto") String source,
                                              @QueryParam("script") @DefaultValue("arabic") String script,
                                              @Context SecurityContext security) {
        return translate(new TranslationRequest(text, source, script), security);
    }

    /** Lets a client check its credentials without spending LLM quota. */
    @GET
    @Path("/me")
    public Map<String, Object> me(@Context SecurityContext security) {
        return Map.of("user", userOf(security), "authenticated", true,
                "role", security.isUserInRole(UserStore.ROLE_USER) ? "user" : "none");
    }

    private static String userOf(SecurityContext security) {
        return security != null && security.getUserPrincipal() != null ? security.getUserPrincipal().getName() : null;
    }
}

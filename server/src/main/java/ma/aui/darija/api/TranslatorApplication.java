package ma.aui.darija.api;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.ws.rs.ext.ContextResolver;
import ma.aui.darija.service.TranslationService;
import ma.aui.darija.llm.LlmClient;
import org.glassfish.hk2.utilities.binding.AbstractBinder;
import org.glassfish.jersey.jackson.JacksonFeature;
import org.glassfish.jersey.server.ResourceConfig;
import org.glassfish.jersey.server.ServerProperties;

/** The Jakarta REST application, mounted by the server at {@code /api/*}. */
public class TranslatorApplication extends ResourceConfig {

    public TranslatorApplication(TranslationService service) {
        register(JacksonFeature.withoutExceptionMappers());
        register(ObjectMapperProvider.class);
        property(ServerProperties.WADL_FEATURE_DISABLE, true);
        // Hand the service objects to Jersey's injector; resources receive them through @Inject constructors.
        register(new AbstractBinder() {
            @Override
            protected void configure() {
                bind(service).to(TranslationService.class);
                bind(service.llm()).to(LlmClient.class);
            }
        });
        register(TranslatorResource.class);
        register(HealthResource.class);
        register(ApiExceptionMapper.class);
        register(CorsFilter.class);
    }

    /** Ignore unknown JSON fields so older/newer clients keep working. */
    public static class ObjectMapperProvider implements ContextResolver<ObjectMapper> {
        private final ObjectMapper mapper =
                new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

        @Override
        public ObjectMapper getContext(Class<?> type) {
            return mapper;
        }
    }
}

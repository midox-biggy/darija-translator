package ma.aui.darija.api;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.ext.Provider;

/**
 * Lets browser-based clients (for example the React Native app running on Expo Web) call the API.
 * The Chrome extension, PHP, Python and native mobile clients do not need it.
 */
@Provider
public class CorsFilter implements ContainerResponseFilter {
    @Override
    public void filter(ContainerRequestContext request, ContainerResponseContext response) {
        var h = response.getHeaders();
        h.putSingle("Access-Control-Allow-Origin", "*");
        h.putSingle("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        h.putSingle("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With");
        h.putSingle("Access-Control-Max-Age", "3600");
    }
}

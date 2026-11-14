package ma.aui.darija.security;

import jakarta.security.auth.message.AuthException;
import jakarta.security.auth.message.AuthStatus;
import jakarta.security.auth.message.MessageInfo;
import jakarta.security.auth.message.MessagePolicy;
import jakarta.security.auth.message.callback.CallerPrincipalCallback;
import jakarta.security.auth.message.callback.GroupPrincipalCallback;
import jakarta.security.auth.message.module.ServerAuthModule;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import javax.security.auth.Subject;
import javax.security.auth.callback.Callback;
import javax.security.auth.callback.CallbackHandler;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.logging.Logger;

/**
 * HTTP Basic authentication written against the Jakarta Authentication SPI (Servlet Container Profile).
 * <p>
 * The container (embedded Tomcat) calls {@link #validateRequest} before every request. For a protected
 * URL ({@code isMandatory = true}) the module reads the {@code Authorization: Basic ...} header, checks the
 * credentials against the {@link UserStore}, and on success hands the caller name and roles to the container
 * through {@link CallerPrincipalCallback} and {@link GroupPrincipalCallback}. On failure it answers
 * {@code 401 Unauthorized} with a JSON body and stops the request.
 */
public class BasicAuthServerAuthModule implements ServerAuthModule {

    /** Key the container puts in {@link MessageInfo#getMap()} when the requested URL has a security constraint. */
    static final String IS_MANDATORY = "jakarta.security.auth.message.MessagePolicy.isMandatory";

    private static final Logger LOG = Logger.getLogger(BasicAuthServerAuthModule.class.getName());
    private static final Class<?>[] SUPPORTED_TYPES = {HttpServletRequest.class, HttpServletResponse.class};

    private final UserStore users;
    private final String realm;
    private CallbackHandler handler;

    public BasicAuthServerAuthModule(UserStore users, String realm) {
        this.users = users;
        this.realm = realm;
    }

    @Override
    public void initialize(MessagePolicy requestPolicy, MessagePolicy responsePolicy,
                           CallbackHandler handler, Map<String, Object> options) {
        this.handler = handler;
    }

    @Override
    public Class<?>[] getSupportedMessageTypes() {
        return SUPPORTED_TYPES.clone();
    }

    @Override
    public AuthStatus validateRequest(MessageInfo messageInfo, Subject clientSubject, Subject serviceSubject)
            throws AuthException {
        HttpServletRequest request = (HttpServletRequest) messageInfo.getRequestMessage();
        HttpServletResponse response = (HttpServletResponse) messageInfo.getResponseMessage();
        boolean mandatory = Boolean.parseBoolean(String.valueOf(messageInfo.getMap().get(IS_MANDATORY)));

        Credentials credentials = Credentials.parse(request.getHeader("Authorization"));
        if (credentials == null) {
            if (!mandatory) return AuthStatus.SUCCESS;      // public URL (e.g. /api/health): let it through anonymously
            return challenge(request, response, "Authentication required: send an 'Authorization: Basic ...' header");
        }
        if (!users.verify(credentials.username(), credentials.password())) {
            LOG.info("Rejected login for user '" + credentials.username() + "' from " + request.getRemoteAddr());
            return challenge(request, response, "Invalid username or password");
        }
        try {
            handler.handle(new Callback[]{
                    new CallerPrincipalCallback(clientSubject, credentials.username()),
                    new GroupPrincipalCallback(clientSubject,
                            users.rolesOf(credentials.username()).toArray(String[]::new))
            });
        } catch (IOException | javax.security.auth.callback.UnsupportedCallbackException e) {
            AuthException ae = new AuthException("Container rejected the authenticated caller");
            ae.initCause(e);
            throw ae;
        }
        return AuthStatus.SUCCESS;
    }

    @Override
    public AuthStatus secureResponse(MessageInfo messageInfo, Subject serviceSubject) {
        return AuthStatus.SEND_SUCCESS;
    }

    @Override
    public void cleanSubject(MessageInfo messageInfo, Subject subject) {
        if (subject != null) subject.getPrincipals().clear();
    }

    private AuthStatus challenge(HttpServletRequest request, HttpServletResponse response, String message) {
        try {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            // Browsers show a login pop-up when they see this header. Scripted clients that send
            // "X-Requested-With" (our Chrome extension, the mobile app) handle the 401 themselves instead.
            if (request.getHeader("X-Requested-With") == null) {
                response.setHeader("WWW-Authenticate", "Basic realm=\"" + realm + "\", charset=\"UTF-8\"");
            }
            response.setHeader("Access-Control-Allow-Origin", "*");
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"status\":401,\"error\":\"Unauthorized\",\"message\":\""
                    + message.replace("\"", "'") + "\"}");
            response.flushBuffer();
        } catch (IOException e) {
            LOG.warning("Could not write 401 response: " + e.getMessage());
        }
        return AuthStatus.SEND_FAILURE;
    }

    /** Username and password decoded from a Basic Authorization header. */
    record Credentials(String username, String password) {
        static Credentials parse(String header) {
            if (header == null || !header.regionMatches(true, 0, "Basic ", 0, 6)) return null;
            try {
                String decoded = new String(Base64.getDecoder().decode(header.substring(6).trim()), StandardCharsets.UTF_8);
                int colon = decoded.indexOf(':');
                if (colon <= 0) return null;
                return new Credentials(decoded.substring(0, colon), decoded.substring(colon + 1));
            } catch (IllegalArgumentException e) {
                return null;
            }
        }
    }
}

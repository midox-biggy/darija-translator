package ma.aui.darija;

import jakarta.security.auth.message.config.AuthConfigFactory;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import ma.aui.darija.api.TranslatorApplication;
import ma.aui.darija.security.BasicAuthServerAuthModule;
import ma.aui.darija.security.UserStore;
import ma.aui.darija.service.TranslationService;
import org.apache.catalina.Context;
import org.apache.catalina.LifecycleException;
import org.apache.catalina.authenticator.NonLoginAuthenticator;
import org.apache.catalina.startup.Tomcat;
import org.apache.tomcat.util.descriptor.web.LoginConfig;
import org.apache.tomcat.util.descriptor.web.SecurityCollection;
import org.apache.tomcat.util.descriptor.web.SecurityConstraint;
import org.glassfish.jersey.servlet.ServletContainer;

import java.io.IOException;
import java.nio.file.Files;

/**
 * Embedded Tomcat hosting the Jakarta REST application.
 * <ul>
 *   <li>{@code /api/*} → Jersey ({@link TranslatorApplication})</li>
 *   <li>{@code /api/translator/*} → protected by a security constraint (role {@code user})</li>
 *   <li>authentication → {@link BasicAuthServerAuthModule}, registered with the standard
 *       {@link AuthConfigFactory#registerServerAuthModule} call of Jakarta Authentication 3</li>
 * </ul>
 */
public final class DarijaServer implements AutoCloseable {

    public static final String REALM = "DarijaTranslator";

    private final Tomcat tomcat = new Tomcat();

    public DarijaServer(int port, TranslationService service, UserStore users) throws IOException {
        tomcat.setBaseDir(Files.createTempDirectory("darija-tomcat").toString());
        tomcat.setPort(port);
        tomcat.getConnector(); // creates the HTTP/1.1 connector

        Context ctx = tomcat.addContext("", null);
        ctx.setRequestCharacterEncoding("UTF-8");
        ctx.setResponseCharacterEncoding("UTF-8");

        // 1. The REST application
        Tomcat.addServlet(ctx, "jersey", new ServletContainer(new TranslatorApplication(service)));
        ctx.addServletMappingDecoded("/api/*", "jersey");
        Tomcat.addServlet(ctx, "home", new HomeServlet());
        ctx.addServletMappingDecoded("", "home");

        // 2. Declarative security: only callers with role "user" may reach the translator
        SecurityCollection translator = new SecurityCollection("translator", "Translation endpoint");
        translator.addPatternDecoded("/api/translator/*");
        SecurityConstraint constraint = new SecurityConstraint();
        constraint.addCollection(translator);
        constraint.addAuthRole(UserStore.ROLE_USER);
        constraint.setAuthConstraint(true);
        ctx.addConstraint(constraint);
        ctx.addSecurityRole(UserStore.ROLE_USER);
        LoginConfig login = new LoginConfig();
        login.setRealmName(REALM);
        ctx.setLoginConfig(login);

        // The valve that enforces the constraint; it delegates authentication to the Jakarta Authentication module.
        NonLoginAuthenticator authenticator = new NonLoginAuthenticator();
        authenticator.setAllowCorsPreflight("always"); // browsers' OPTIONS pre-flight carries no credentials
        ctx.getPipeline().addValve(authenticator);

        // 3. Jakarta Authentication: plug our ServerAuthModule into this web application
        ctx.addServletContainerInitializer((classes, servletContext) ->
                AuthConfigFactory.getFactory().registerServerAuthModule(
                        new BasicAuthServerAuthModule(users, REALM), servletContext), null);
    }

    public void start() throws LifecycleException {
        tomcat.start();
    }

    /** The port actually bound (useful when started on port 0 in tests). */
    public int port() {
        return tomcat.getConnector().getLocalPort();
    }

    public void await() {
        tomcat.getServer().await();
    }

    @Override
    public void close() throws LifecycleException {
        tomcat.stop();
        tomcat.destroy();
    }

    /** Small landing page at "/" so opening the server in a browser explains what it is. */
    private static final class HomeServlet extends HttpServlet {
        @Override
        protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
            resp.setContentType("text/html;charset=UTF-8");
            resp.getWriter().write("""
                    <!doctype html><html><head><meta charset="utf-8"><title>Darija Translator API</title>
                    <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;line-height:1.5}
                    code{background:#f2f2f2;padding:2px 5px;border-radius:4px}</style></head><body>
                    <h1>Darija Translator API</h1>
                    <p>LLM-powered translation into Moroccan Arabic (Darija).</p>
                    <ul>
                      <li><code>GET /api/health</code> &mdash; public status check</li>
                      <li><code>POST /api/translator/translate</code> &mdash; Basic auth, JSON body
                          <code>{"text": "...", "source": "auto", "script": "arabic"}</code></li>
                      <li><code>GET /api/translator/translate?text=...</code> &mdash; Basic auth</li>
                    </ul></body></html>""");
        }
    }
}

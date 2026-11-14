package ma.aui.darija.security;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The identity store: who may call the API. Users come from a properties file of
 * {@code username = pbkdf2$...} lines (see {@link PasswordHasher}). Every user gets the role {@code user}.
 */
public class UserStore {

    public static final String ROLE_USER = "user";

    private final Map<String, String> hashes = new ConcurrentHashMap<>();

    /** Loads {@code usersFile} if given, otherwise the bundled {@code users.properties} (demo account). */
    public static UserStore load(String usersFile) {
        Properties props = new Properties();
        try {
            if (usersFile != null && !usersFile.isBlank()) {
                try (Reader r = Files.newBufferedReader(Path.of(usersFile), StandardCharsets.UTF_8)) {
                    props.load(r);
                }
            } else {
                try (InputStream in = UserStore.class.getResourceAsStream("/users.properties")) {
                    if (in == null) throw new IllegalStateException("users.properties not found on the classpath");
                    props.load(new InputStreamReader(in, StandardCharsets.UTF_8));
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read users file " + usersFile, e);
        }
        UserStore store = new UserStore();
        props.forEach((user, hash) -> store.hashes.put(user.toString().trim(), hash.toString().trim()));
        return store;
    }

    public void add(String username, String password) {
        hashes.put(username, PasswordHasher.hash(password));
    }

    public boolean verify(String username, String password) {
        String stored = hashes.get(username);
        if (stored == null) {
            // Hash anyway so an unknown user takes as long as a wrong password (no user enumeration by timing).
            PasswordHasher.verify(password, DUMMY_HASH);
            return false;
        }
        return PasswordHasher.verify(password, stored);
    }

    public Set<String> rolesOf(String username) {
        return hashes.containsKey(username) ? Set.of(ROLE_USER) : Set.of();
    }

    public int size() {
        return hashes.size();
    }

    private static final String DUMMY_HASH = PasswordHasher.hash("dummy-password");
}

package ma.aui.darija;

import ma.aui.darija.security.PasswordHasher;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PasswordHasherTest {

    @Test
    void hashVerifiesOnlyTheRightPassword() {
        String h = PasswordHasher.hash("s3cret");
        assertTrue(PasswordHasher.verify("s3cret", h));
        assertFalse(PasswordHasher.verify("S3cret", h));
        assertFalse(PasswordHasher.verify("s3cret", "garbage"));
    }

    @Test
    void samePasswordGetsDifferentSalt() {
        assertNotEquals(PasswordHasher.hash("x"), PasswordHasher.hash("x"));
    }
}

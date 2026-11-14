package ma.aui.darija.service;

import java.util.Locale;

/** The writing system used for the Darija output. */
public enum Script {
    /** Arabic letters: "كيداير؟" */
    ARABIC,
    /** Latin letters with Moroccan chat digits (Arabizi): "kidayr?" */
    LATIN;

    /** Parses "arabic"/"latin" (case-insensitive). Null or blank means ARABIC. */
    public static Script parse(String value) {
        if (value == null || value.isBlank()) return ARABIC;
        try {
            return Script.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new InvalidRequestException("script must be 'arabic' or 'latin'");
        }
    }

    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }
}

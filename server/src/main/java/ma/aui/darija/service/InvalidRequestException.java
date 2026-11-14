package ma.aui.darija.service;

/** The client sent something we cannot translate (empty text, text too long, bad option). Maps to HTTP 400. */
public class InvalidRequestException extends RuntimeException {
    public InvalidRequestException(String message) {
        super(message);
    }
}

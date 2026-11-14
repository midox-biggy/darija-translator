package ma.aui.darija.api;

/** JSON body for every error the API returns. */
public record ErrorResponse(int status, String error, String message) {
}

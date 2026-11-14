package ma.aui.darija.llm;

/** Raised when the LLM provider fails. {@code httpStatus} is the status our API should return. */
public class LlmException extends RuntimeException {

    private final int httpStatus;

    public LlmException(String message, int httpStatus) {
        super(message);
        this.httpStatus = httpStatus;
    }

    public LlmException(String message, int httpStatus, Throwable cause) {
        super(message, cause);
        this.httpStatus = httpStatus;
    }

    public int httpStatus() {
        return httpStatus;
    }

    /** Maps an upstream provider status to the status our own API reports. */
    static int mapUpstreamStatus(int upstream) {
        return switch (upstream) {
            case 429 -> 429;              // provider quota / rate limit: tell the client to slow down
            case 401, 403 -> 503;         // our API key is wrong: the service is misconfigured
            default -> 502;               // anything else: bad gateway
        };
    }
}

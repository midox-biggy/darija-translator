package ma.aui.darija.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import ma.aui.darija.llm.LlmException;
import ma.aui.darija.service.InvalidRequestException;

import java.util.logging.Level;
import java.util.logging.Logger;

/** Turns every exception into a JSON {@link ErrorResponse} with a fitting HTTP status. */
@Provider
public class ApiExceptionMapper implements ExceptionMapper<Throwable> {

    private static final Logger LOG = Logger.getLogger(ApiExceptionMapper.class.getName());

    @Override
    public Response toResponse(Throwable e) {
        if (e instanceof InvalidRequestException) return error(400, e.getMessage());
        if (e instanceof JsonProcessingException) return error(400, "malformed JSON body");
        if (e instanceof LlmException llm) {
            LOG.warning("LLM failure: " + llm.getMessage());
            return error(llm.httpStatus(), llm.getMessage());
        }
        if (e instanceof WebApplicationException web) {
            int status = web.getResponse().getStatus();
            return error(status, web.getResponse().getStatusInfo().getReasonPhrase());
        }
        LOG.log(Level.SEVERE, "Unexpected error", e);
        return error(500, "internal server error");
    }

    private static Response error(int status, String message) {
        String reason = Response.Status.fromStatusCode(status) != null
                ? Response.Status.fromStatusCode(status).getReasonPhrase()
                : "Error";
        return Response.status(status)
                .type(MediaType.APPLICATION_JSON)
                .entity(new ErrorResponse(status, reason, message))
                .build();
    }
}

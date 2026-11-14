package ma.aui.darija.llm;

/** A chat-style large language model that turns a system prompt + user message into text. */
public interface LlmClient {

    /**
     * Sends one prompt to the model and returns its text answer.
     *
     * @throws LlmException if the model cannot be reached or returns an error
     */
    String complete(String systemPrompt, String userMessage);

    /** Short provider id, e.g. {@code gemini} or {@code ollama}. */
    String providerName();

    /** The model id used for requests. */
    String modelName();
}

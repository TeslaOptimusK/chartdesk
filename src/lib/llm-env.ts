/** Resolve chat-completions API key — OPENAI_API_KEY or LLM_API_KEY. */
export function resolveLlmApiKey(): string | undefined {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.LLM_API_KEY?.trim() ||
    undefined
  );
}

export function resolveLlmEndpoint(): string {
  return (
    process.env.LLM_BASE_URL?.trim() ||
    "https://api.openai.com/v1/chat/completions"
  );
}

export function resolveLlmModel(): string {
  return process.env.LLM_MODEL?.trim() || "gpt-4o-mini";
}

import Groq from "groq-sdk";

/**
 * The LLM is used for language only: it reads text and returns JSON.
 * Groq by default (openai/gpt-oss-120b; Groq no longer serves Llama chat models); Ollama as an offline fallback (LLM_PROVIDER=ollama).
 * Temperature 0 and JSON mode, always.
 *
 * Takes plain env values instead of lib/env.ts so the harness script can use it outside Next.js.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmClient {
  provider: string;
  model: string;
  /** Returns the raw text of the reply (expected to be a JSON object). */
  complete(messages: ChatMessage[]): Promise<string>;
}

export interface LlmEnv {
  LLM_PROVIDER?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
}

export class LlmConfigError extends Error {}

function groqClient(apiKey: string, model: string): LlmClient {
  const groq = new Groq({ apiKey, maxRetries: 2, timeout: 20_000 });
  return {
    provider: "groq",
    model,
    async complete(messages) {
      const res = await groq.chat.completions.create({
        model,
        messages,
        temperature: 0,
        response_format: { type: "json_object" },
      });
      return res.choices[0]?.message?.content ?? "";
    },
  };
}

function ollamaClient(baseUrl: string, model: string): LlmClient {
  return {
    provider: "ollama",
    model,
    async complete(messages) {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: false, format: "json", options: { temperature: 0 } }),
      });
      if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
      const body = (await res.json()) as { message?: { content?: string } };
      return body.message?.content ?? "";
    },
  };
}

export function llmEnvFromProcess(): LlmEnv {
  const e = process.env;
  return {
    LLM_PROVIDER: e.LLM_PROVIDER,
    GROQ_API_KEY: e.GROQ_API_KEY,
    GROQ_MODEL: e.GROQ_MODEL,
    OLLAMA_BASE_URL: e.OLLAMA_BASE_URL,
    OLLAMA_MODEL: e.OLLAMA_MODEL,
  };
}

export function createLlm(env: LlmEnv): LlmClient {
  if (env.LLM_PROVIDER === "ollama") {
    return ollamaClient(env.OLLAMA_BASE_URL || "http://localhost:11434", env.OLLAMA_MODEL || "llama3.1:8b");
  }
  if (!env.GROQ_API_KEY) {
    throw new LlmConfigError("GROQ_API_KEY is not set. Add it to .env.local and restart the server.");
  }
  return groqClient(env.GROQ_API_KEY, env.GROQ_MODEL || "openai/gpt-oss-120b");
}

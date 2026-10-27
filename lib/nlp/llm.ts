import Groq from "groq-sdk";

/**
 * The LLM is used for language only: it reads text and returns JSON.
 * Groq by default (openai/gpt-oss-120b; Groq no longer serves Llama chat
 * models), with a backup model when the main one hits Groq's limits or is
 * down; Ollama as an offline option (LLM_PROVIDER=ollama).
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
  /** The model that answered the last call (the backup's name after a switch). */
  readonly model: string;
  /** Returns the raw text of the reply (expected to be a JSON object). */
  complete(messages: ChatMessage[]): Promise<string>;
}

export interface LlmEnv {
  LLM_PROVIDER?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  /** Model to use when the main one is rate-limited or down. "none" turns the backup off. */
  GROQ_FALLBACK_MODEL?: string;
  /** How hard reasoning models think before answering: low is enough for reading a request. */
  GROQ_REASONING_EFFORT?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
}

export const DEFAULT_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_FALLBACK_MODEL = "openai/gpt-oss-20b";

export class LlmConfigError extends Error {}

type Effort = "low" | "medium" | "high";

function effortFor(model: string, wanted: string | undefined): Effort | undefined {
  // Only reasoning models accept the setting; others would reject the request.
  if (!/gpt-oss|qwen3/i.test(model)) return undefined;
  return wanted === "medium" || wanted === "high" ? wanted : "low";
}

function groqClient(groq: Groq, model: string, effort: string | undefined): LlmClient {
  const reasoning_effort = effortFor(model, effort);
  return {
    provider: "groq",
    model,
    async complete(messages) {
      const res = await groq.chat.completions.create({
        model,
        messages,
        temperature: 0,
        response_format: { type: "json_object" },
        ...(reasoning_effort ? { reasoning_effort } : {}),
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

/**
 * Errors where trying another model helps: rate limits that outlasted the
 * retries (including the daily limit), outages, and a model that was removed.
 * A bad request or a wrong API key would fail on the backup too, so those don't switch.
 */
export function shouldFallBack(err: unknown): boolean {
  const status = typeof err === "object" && err !== null && "status" in err ? Number((err as { status: unknown }).status) : NaN;
  if (status === 429 || status >= 500) return true;
  const text = err instanceof Error ? err.message : String(err);
  return /rate limit|tokens per day|model_not_found|does not exist|decommissioned|over capacity|timed? ?out|ECONN|fetch failed/i.test(text);
}

/** When a model last failed, so later calls go straight to the backup for a while (shared by all requests in this server). */
const benchedUntil = new Map<string, number>();
const BENCH_MS = 10 * 60 * 1000;

export function withFallback(primary: LlmClient, backup: LlmClient, now: () => number = Date.now): LlmClient {
  let used = primary.model;
  return {
    provider: primary.provider,
    get model() {
      return used;
    },
    async complete(messages) {
      if ((benchedUntil.get(primary.model) ?? 0) <= now()) {
        try {
          const out = await primary.complete(messages);
          used = primary.model;
          return out;
        } catch (err) {
          if (!shouldFallBack(err)) throw err;
          benchedUntil.set(primary.model, now() + BENCH_MS);
        }
      }
      used = backup.model;
      return backup.complete(messages);
    },
  };
}

/** For tests: forget which models were benched. */
export function resetFallbackState(): void {
  benchedUntil.clear();
}

export function llmEnvFromProcess(): LlmEnv {
  const e = process.env;
  return {
    LLM_PROVIDER: e.LLM_PROVIDER,
    GROQ_API_KEY: e.GROQ_API_KEY,
    GROQ_MODEL: e.GROQ_MODEL,
    GROQ_FALLBACK_MODEL: e.GROQ_FALLBACK_MODEL,
    GROQ_REASONING_EFFORT: e.GROQ_REASONING_EFFORT,
    OLLAMA_BASE_URL: e.OLLAMA_BASE_URL,
    OLLAMA_MODEL: e.OLLAMA_MODEL,
  };
}

/**
 * maxRetries: retries of one model before giving up on it (the SDK waits on
 * rate limits, honouring retry-after). The app keeps it at 1 so a busy model
 * hands over to the backup quickly; the harness waits longer.
 * fallback: false measures the main model alone (the harness does this).
 */
export function createLlm(env: LlmEnv, opts: { maxRetries?: number; fallback?: boolean } = {}): LlmClient {
  if (env.LLM_PROVIDER === "ollama") {
    return ollamaClient(env.OLLAMA_BASE_URL || "http://localhost:11434", env.OLLAMA_MODEL || "llama3.1:8b");
  }
  if (!env.GROQ_API_KEY) {
    throw new LlmConfigError("GROQ_API_KEY is not set. Add it to .env.local and restart the server.");
  }
  const groq = new Groq({ apiKey: env.GROQ_API_KEY, maxRetries: opts.maxRetries ?? 1, timeout: 30_000 });
  const model = env.GROQ_MODEL || DEFAULT_MODEL;
  const primary = groqClient(groq, model, env.GROQ_REASONING_EFFORT);
  const backupModel = env.GROQ_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
  if (opts.fallback === false || backupModel === "none" || backupModel === model) return primary;
  return withFallback(primary, groqClient(groq, backupModel, env.GROQ_REASONING_EFFORT));
}

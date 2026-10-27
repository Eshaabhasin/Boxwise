/**
 * Runs every dictated request in tests/requests.json through the real
 * pipeline (normalize -> Groq -> zod -> guard), the same code the app uses,
 * and prints PASS/FAIL per request. Appends the pass rate to results/history.json.
 *
 *   npm run harness
 *   npm run harness -- --only 05,19          only these ids (prefix match)
 *   npm run harness -- --concurrency 2       requests at a time (default 1, kind to Groq's free tier)
 *   npm run harness -- --model qwen/qwen3.8-27b
 *   npm run harness -- --no-save             don't add this run to results/history.json
 *   npm run harness -- --fallback            allow the backup model (off by default, so the main model is measured)
 *
 * Needs GROQ_API_KEY in .env.local. No database is used.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { HarnessFile, compareCase, isDailyLimit, summarize, type CaseResult, type HarnessCase, type RunSummary } from "@/lib/harness/compare";
import { createLlm, llmEnvFromProcess } from "@/lib/nlp/llm";
import { parseRequest } from "@/lib/nlp/parse";

config({ path: ".env.local", quiet: true });

const ROOT = process.cwd();
const CASES = path.join(ROOT, "tests", "requests.json");
const HISTORY = path.join(ROOT, "results", "history.json");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const GREEN = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RED = (s: string) => `\x1b[31m${s}\x1b[0m`;
const YELLOW = (s: string) => `\x1b[33m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function main() {
  const file = HarnessFile.parse(JSON.parse(readFileSync(CASES, "utf8")));
  const only = arg("only")?.split(",").map((s) => s.trim());
  const cases = only ? file.requests.filter((c) => only.some((o) => c.id.startsWith(o))) : file.requests;
  const concurrency = Math.max(1, Number(arg("concurrency") ?? 1));
  const env = llmEnvFromProcess();
  if (arg("model")) env.GROQ_MODEL = arg("model");
  const llm = createLlm(env, { maxRetries: 6, fallback: process.argv.includes("--fallback") });

  console.log(`BoxBol harness: ${cases.length} requests, ${llm.provider} ${llm.model}, ${concurrency} at a time\n`);
  const started = new Date();
  const results: (CaseResult | undefined)[] = new Array(cases.length).fill(undefined);
  let next = 0;
  let stopped = "";

  async function worker() {
    while (next < cases.length && !stopped) {
      const i = next++;
      const c = cases[i] as HarnessCase;
      const r = await parseRequest(c.said, llm);
      const result = compareCase(c, r.request, r.error ?? (r.intent && r.intent !== "create_request" ? `read as “${r.intent}”, not a new request` : null));
      results[i] = result;
      const time = DIM(`${(r.latencyMs / 1000).toFixed(1)}s`);
      if (result.serviceError) {
        console.log(`${YELLOW("SKIP")} ${c.id} ${time} ${DIM("(LLM service error, not a misread)")}`);
        console.log(DIM(`     - ${result.problems[0]?.slice(0, 220)}`));
        if (isDailyLimit(result.problems[0] ?? "")) stopped = "Groq's daily token limit is used up";
        continue;
      }
      console.log(`${result.pass ? GREEN("PASS") : RED("FAIL")} ${c.id} ${time}`);
      if (!result.pass) {
        console.log(DIM(`     said: ${c.said}`));
        for (const p of result.problems) console.log(`     - ${p}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const summary = summarize(results, cases.map((c) => c.id), llm.model, started, new Date());
  const checked = summary.passed + summary.failed.length;
  if (stopped) console.log(YELLOW(`\nStopped early: ${stopped}. Run again after it resets.`));
  console.log(
    `\n${summary.passed}/${checked} read correctly (${summary.passRate}%)` +
      (summary.complete ? "" : `, ${summary.notChecked.length} of ${summary.total} not checked`) +
      ` in ${summary.durationSec}s`,
  );

  if (!process.argv.includes("--no-save") && !only) {
    mkdirSync(path.dirname(HISTORY), { recursive: true });
    const history: RunSummary[] = existsSync(HISTORY) ? (JSON.parse(readFileSync(HISTORY, "utf8")) as RunSummary[]) : [];
    history.push(summary);
    writeFileSync(HISTORY, `${JSON.stringify(history, null, 2)}\n`);
    const prev = history.at(-2);
    console.log(prev ? `Saved to results/history.json (last run: ${prev.passRate}% on ${prev.at.slice(0, 10)})` : "Saved to results/history.json");
  } else if (only) {
    console.log(DIM("Partial run (--only): not saved to results/history.json"));
  }
  process.exitCode = summary.failed.length > 0 ? 1 : summary.complete ? 0 : 3;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 2;
});

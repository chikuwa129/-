import "server-only";
import { ApiError, GoogleGenAI, type Schema } from "@google/genai";
import { logGemini } from "./logs";

const CALL_TIMEOUT_MS = 60_000;
const BUSY_RETRY_WAIT_MS = 2_000;

export type Purpose = "select" | "summarize" | "digest" | "tag" | "ideas";

let ai: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (ai) return ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY を設定してください");
  ai = new GoogleGenAI({ apiKey });
  return ai;
}

function models(): string[] {
  const list = (process.env.GEMINI_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (list.length === 0) throw new Error("GEMINI_MODELS を設定してください");
  return list;
}

type Kind = "busy" | "missing" | "error";

function classify(e: unknown): { kind: Kind; code: string } {
  const status = e instanceof ApiError ? e.status : undefined;
  const name = e instanceof Error ? e.name : "";
  const message = e instanceof Error ? e.message : String(e);
  if (name === "TimeoutError" || name === "AbortError" || /timed? ?out/i.test(message)) {
    return { kind: "busy", code: "TIMEOUT" };
  }
  if (status === 503 || status === 429 || /UNAVAILABLE|RESOURCE_EXHAUSTED/.test(message)) {
    return { kind: "busy", code: String(status ?? (message.match(/UNAVAILABLE|RESOURCE_EXHAUSTED/)?.[0] ?? "BUSY")) };
  }
  if (status === 404 || /NOT_FOUND/.test(message)) return { kind: "missing", code: String(status ?? "NOT_FOUND") };
  return { kind: "error", code: status != null ? String(status) : name || "ERROR" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * JSONで答えを返させる。GEMINI_MODELS の順に試し、
 * 混雑なら2秒待って1回だけ再試行 → だめなら次のモデル。モデルが無ければすぐ次へ。
 * それ以外のエラーはすぐ投げる。
 */
export async function generateJson<T>(purpose: Purpose, prompt: string, schema: Schema): Promise<T> {
  let lastError: unknown = null;
  for (const model of models()) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = Date.now();
      try {
        const res = await client().models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
            httpOptions: { timeout: CALL_TIMEOUT_MS },
          },
        });
        const text = res.text;
        if (!text) throw new Error("Geminiの応答が空でした");
        const parsed = JSON.parse(text) as T;
        await logGemini({ purpose, model, attempt, status: "ok", duration_ms: Date.now() - started });
        return parsed;
      } catch (e) {
        const { kind, code } = classify(e);
        await logGemini({ purpose, model, attempt, status: kind, error_code: code, duration_ms: Date.now() - started });
        lastError = e;
        if (kind === "error") throw e;
        if (kind === "missing") break;
        if (attempt === 1) await sleep(BUSY_RETRY_WAIT_MS);
      }
    }
  }
  throw new Error(`すべてのGeminiモデルが利用できませんでした: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

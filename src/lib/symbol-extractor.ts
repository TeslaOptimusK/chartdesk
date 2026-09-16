import type { Post, SymbolMeta } from "@/lib/types";
import {
  resolveLlmApiKey,
  resolveLlmEndpoint,
  resolveLlmModel,
} from "@/lib/llm-env";

const TICKER_RE = /\b([A-Z]{1,5}|0\d{5})\b/g;

export function extractSymbolsFromText(
  text: string,
  universe: SymbolMeta[]
): { symbolIds: string[]; method: "dictionary" | "ticker_regex" | "none" } {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (const sym of universe) {
    const needles = [
      sym.ticker.toLowerCase(),
      sym.nameKo.toLowerCase(),
      sym.nameEn.toLowerCase(),
      ...sym.aliases.map((a) => a.toLowerCase()),
    ];
    if (needles.some((n) => n && lower.includes(n))) {
      found.add(sym.id);
    }
  }

  if (found.size > 0) {
    return { symbolIds: [...found], method: "dictionary" };
  }

  const tickers = text.match(TICKER_RE) ?? [];
  for (const t of tickers) {
    const hit = universe.find((s) => s.ticker === t);
    if (hit) found.add(hit.id);
  }

  if (found.size > 0) {
    return { symbolIds: [...found], method: "ticker_regex" };
  }
  return { symbolIds: [], method: "none" };
}

export async function extractSymbolsWithOptionalLlm(
  post: Pick<Post, "title" | "body">,
  universe: SymbolMeta[]
): Promise<{ symbolIds: string[]; method: string }> {
  const base = extractSymbolsFromText(`${post.title}\n${post.body}`, universe);
  const apiKey = resolveLlmApiKey();
  if (!apiKey || base.symbolIds.length > 0) {
    return base;
  }

  // Optional LLM path — graceful no-op if endpoint missing/fails.
  try {
    const endpoint = resolveLlmEndpoint();
    const model = resolveLlmModel();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Extract stock/crypto tickers from Korean trading notes. Reply JSON {tickers:string[]}.",
          },
          {
            role: "user",
            content: `${post.title}\n${post.body}`.slice(0, 4000),
          },
        ],
      }),
    });
    if (!res.ok) return base;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.replace(/```json|```/g, "").trim()) as {
      tickers?: string[];
    };
    const ids = (parsed.tickers ?? [])
      .map((t) => universe.find((s) => s.ticker === t || s.aliases.includes(t))?.id)
      .filter((id): id is string => Boolean(id));
    if (ids.length) return { symbolIds: [...new Set(ids)], method: "llm" };
  } catch {
    // fall through
  }
  return base;
}

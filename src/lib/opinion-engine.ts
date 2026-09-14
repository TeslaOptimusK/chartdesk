import type {
  Candle,
  Confidence,
  Opinion,
  OpinionDirection,
  Post,
  PostCategory,
  SymbolMeta,
} from "@/lib/types";
import { ema, rsi } from "@/lib/indicators";

const MINDSET_RISKS = [
  "손절 기준을 미리 정했는지 확인하세요.",
  "포지션 크기가 계좌 대비 과도하지 않은지 점검하세요.",
  "복수 차트로 확증 편향을 피하세요.",
  "뉴스·테마 모멘텀에만 의존하지 마세요.",
];

function directionFromText(text: string): OpinionDirection {
  const t = text.toLowerCase();
  const buyHits = (t.match(/매수|롱|돌파|상승|bull|buy|지지/g) ?? []).length;
  const sellHits = (t.match(/매도|숏|이탈|하락|bear|sell|저항/g) ?? []).length;
  const watchHits = (t.match(/관망|대기|지켜|watch|홀딩/g) ?? []).length;
  if (buyHits === 0 && sellHits === 0 && watchHits === 0) return "unclear";
  if (buyHits > sellHits && buyHits >= watchHits) return "buy";
  if (sellHits > buyHits && sellHits >= watchHits) return "sell";
  if (watchHits >= buyHits && watchHits >= sellHits) return "watch";
  return "unclear";
}

function confidenceFrom(direction: OpinionDirection, chartBias: OpinionDirection): Confidence {
  if (direction === "unclear") return "low";
  if (direction === chartBias) return "medium";
  return "low";
}

function chartBias(candles: Candle[]): OpinionDirection {
  if (candles.length < 30) return "unclear";
  const closes = candles.map((c) => c.close);
  const fast = ema(closes, 9);
  const slow = ema(closes, 21);
  const r = rsi(candles, 14);
  const i = candles.length - 1;
  if (fast[i] == null || slow[i] == null || r[i] == null) return "unclear";
  if (fast[i]! > slow[i]! && r[i]! < 70) return "buy";
  if (fast[i]! < slow[i]! && r[i]! > 30) return "sell";
  return "watch";
}

function bulletsFromPost(post: Post, symbol: SymbolMeta, bias: OpinionDirection): string[] {
  const lines = post.body
    .split(/\n|。|\./)
    .map((s) => s.trim())
    .filter((s) => s.length > 8)
    .slice(0, 3);
  const chartFact =
    bias === "buy"
      ? `${symbol.ticker} 단기 EMA가 장기 EMA 상단 — 모멘텀 우세`
      : bias === "sell"
        ? `${symbol.ticker} 단기 EMA가 장기 EMA 하단 — 약세 압력`
        : `${symbol.ticker} 추세가 혼조 — 관망 구간`;
  return [chartFact, ...lines].slice(0, 4);
}

export function draftOpinionRuleBased(args: {
  post: Post;
  symbol: SymbolMeta;
  candles: Candle[];
}): Omit<Opinion, "id" | "createdAt"> {
  const text = `${args.post.title}\n${args.post.body}`;
  const textDir = directionFromText(text);
  const bias = chartBias(args.candles);
  const direction = textDir === "unclear" ? bias : textDir;
  const last = args.candles.at(-1);
  return {
    symbolId: args.symbol.id,
    direction,
    confidence: confidenceFrom(direction, bias),
    summary: `${args.symbol.nameKo}(${args.symbol.ticker}) — ${label(direction)} 초안`,
    rationale: bulletsFromPost(args.post, args.symbol, bias),
    risks: MINDSET_RISKS.slice(0, 2),
    sourcePostId: args.post.id,
    category: args.post.category,
    status: "draft",
    chartAnchor: last
      ? { fromTs: last.time - 86400 * 5, toTs: last.time }
      : undefined,
  };
}

function label(d: OpinionDirection) {
  switch (d) {
    case "buy":
      return "매수 관점";
    case "sell":
      return "매도 관점";
    case "watch":
      return "관망";
    default:
      return "불명확";
  }
}

export async function draftOpinionWithOptionalLlm(args: {
  post: Post;
  symbol: SymbolMeta;
  candles: Candle[];
}): Promise<Omit<Opinion, "id" | "createdAt">> {
  const rule = draftOpinionRuleBased(args);
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return rule;

  try {
    const endpoint =
      process.env.LLM_BASE_URL ?? "https://api.openai.com/v1/chat/completions";
    const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You draft Korean trading research notes (not advice). JSON: {direction, summary, rationale:string[], risks:string[], confidence}. direction: buy|sell|watch|unclear.",
          },
          {
            role: "user",
            content: JSON.stringify({
              symbol: args.symbol,
              post: { title: args.post.title, body: args.post.body.slice(0, 3000) },
              lastClose: args.candles.at(-1)?.close,
              ruleDraft: rule,
            }),
          },
        ],
      }),
    });
    if (!res.ok) return rule;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.replace(/```json|```/g, "").trim()) as Partial<
      typeof rule
    >;
    return {
      ...rule,
      direction: (parsed.direction as OpinionDirection) ?? rule.direction,
      summary: parsed.summary ?? rule.summary,
      rationale: parsed.rationale?.length ? parsed.rationale : rule.rationale,
      risks: parsed.risks?.length ? parsed.risks : rule.risks,
      confidence: (parsed.confidence as Confidence) ?? rule.confidence,
      status: "draft",
    };
  } catch {
    return rule;
  }
}

export function shouldAutoEnqueueOpinion(category: PostCategory): boolean {
  return category === "realtime_chart" || category === "insight";
}

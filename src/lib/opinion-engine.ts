import type {
  Candle,
  Confidence,
  Opinion,
  OpinionDirection,
  Post,
  PostCategory,
  SymbolMeta,
} from "@/lib/types";
import { ema, rsi, sma } from "@/lib/indicators";
import {
  resolveLlmApiKey,
  resolveLlmEndpoint,
  resolveLlmModel,
} from "@/lib/llm-env";

const MINDSET_RISKS = [
  "손절 기준을 미리 정했는지 확인하세요.",
  "포지션 크기가 계좌 대비 과도하지 않은지 점검하세요.",
  "복수 차트로 확증 편향을 피하세요.",
  "뉴스·테마 모멘텀에만 의존하지 마세요.",
  "원문 강의 맥락을 재확인한 뒤 승인하세요.",
];

function directionFromText(text: string): OpinionDirection {
  const t = text.toLowerCase();
  const buyHits = (t.match(/매수|롱|돌파|상승|bull|buy|지지\s*반등|추세\s*전환/g) ?? [])
    .length;
  const sellHits = (t.match(/매도|숏|이탈|하락|bear|sell|저항|손절/g) ?? [])
    .length;
  const watchHits = (t.match(/관망|대기|지켜|watch|홀딩|확인\s*후/g) ?? [])
    .length;
  if (buyHits === 0 && sellHits === 0 && watchHits === 0) return "unclear";
  if (watchHits > 0 && watchHits >= buyHits && watchHits >= sellHits)
    return "watch";
  if (buyHits > sellHits) return "buy";
  if (sellHits > buyHits) return "sell";
  return "unclear";
}

function confidenceFrom(
  direction: OpinionDirection,
  chartBias: OpinionDirection,
  textLen: number
): Confidence {
  if (direction === "unclear") return "low";
  if (direction === chartBias && textLen > 200) return "high";
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

function chartFacts(symbol: SymbolMeta, candles: Candle[]): string[] {
  if (!candles.length) return [`${symbol.ticker} 차트 데이터 없음`];
  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const changePct = ((last.close - prev.close) / prev.close) * 100;
  const fast = ema(closes, 9);
  const slow = ema(closes, 21);
  const r = rsi(candles, 14);
  const volAvg = sma(
    candles.map((c) => c.volume),
    20
  );
  const i = candles.length - 1;
  const facts: string[] = [
    `${symbol.ticker} 종가 ${last.close.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%)`,
  ];
  if (fast[i] != null && slow[i] != null) {
    facts.push(
      `EMA9 ${fast[i]!.toFixed(2)} / EMA21 ${slow[i]!.toFixed(2)} — ${
        fast[i]! > slow[i]! ? "단기 우위" : "단기 열세"
      }`
    );
  }
  if (r[i] != null) {
    facts.push(`RSI(14) ${r[i]!.toFixed(1)}`);
  }
  if (volAvg[i] != null && volAvg[i]! > 0) {
    const mult = last.volume / volAvg[i]!;
    facts.push(`거래량 ${mult.toFixed(1)}×(20봉 평균)`);
  }
  return facts;
}

function quoteLinesFromPost(post: Post, limit = 5): string[] {
  return post.body
    .split(/\r?\n|。|\.(?=\s)|•|·|- /)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 220)
    .filter((s) => !/https?:\/\//i.test(s))
    .slice(0, limit);
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
  const quotes = quoteLinesFromPost(args.post);
  const facts = chartFacts(args.symbol, args.candles);
  const rationale = [
    ...facts.slice(0, 2),
    ...quotes.map((q) => `원문: ${q}`),
  ].slice(0, 6);

  return {
    symbolId: args.symbol.id,
    direction,
    confidence: confidenceFrom(direction, bias, text.length),
    summary: `${args.symbol.nameKo}(${args.symbol.ticker}) — ${label(direction)} · 「${args.post.title.slice(0, 40)}」`,
    rationale:
      rationale.length > 0
        ? rationale
        : bulletsFallback(args.post, args.symbol, bias),
    risks: [
      ...MINDSET_RISKS.slice(0, 2),
      `출처 카테고리: ${args.post.category} · 승인 전 원문 대조 필요`,
    ],
    sourcePostId: args.post.id,
    category: args.post.category,
    status: "draft",
    chartAnchor: last
      ? { fromTs: last.time - 86400 * 5, toTs: last.time }
      : undefined,
  };
}

function bulletsFallback(
  post: Post,
  symbol: SymbolMeta,
  bias: OpinionDirection
): string[] {
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
  const apiKey = resolveLlmApiKey();
  if (!apiKey) return rule;

  try {
    const last = args.candles.at(-1);
    const closes = args.candles.map((c) => c.close);
    const fast = ema(closes, 9);
    const slow = ema(closes, 21);
    const r = rsi(args.candles, 14);
    const i = args.candles.length - 1;
    const res = await fetch(resolveLlmEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolveLlmModel(),
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You draft Korean trading research notes from membership lecture text + chart context (not advice). JSON: {direction, summary, rationale:string[], risks:string[], confidence}. direction: buy|sell|watch|unclear. Quote key lecture points in rationale. Always remind approval is required.",
          },
          {
            role: "user",
            content: JSON.stringify({
              symbol: {
                ticker: args.symbol.ticker,
                nameKo: args.symbol.nameKo,
                exchange: args.symbol.exchange,
              },
              post: {
                category: args.post.category,
                title: args.post.title,
                body: args.post.body.slice(0, 8000),
              },
              chart: {
                lastClose: last?.close,
                ema9: fast[i],
                ema21: slow[i],
                rsi14: r[i],
                bias: chartBias(args.candles),
              },
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

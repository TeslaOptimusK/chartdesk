import { resolveLlmApiKey, resolveLlmEndpoint, resolveLlmModel } from "@/lib/llm-env";
import { parsePatternDsl } from "@/lib/pattern-matcher";
import type {
  PatternDef,
  PatternRule,
  Post,
  PostCategory,
  Timeframe,
} from "@/lib/types";

export type PatternExtractMethod = "heuristic" | "llm" | "seed";

export interface ExtractedPatternDraft {
  name: string;
  description: string;
  rules: PatternRule[];
  dsl: string;
  timeframes: Timeframe[];
  display: { label: string; color: string };
  alert: { cooldownMinutes: number };
  extractMethod: PatternExtractMethod;
}

const RULE_TYPES = new Set<PatternRule["type"]>([
  "ma_cross",
  "swing_low_pair",
  "support_bounce",
  "rsi_oversold",
  "bullish_engulfing",
  "neckline_break",
  "volume_spike",
]);

const HEURISTICS: {
  re: RegExp;
  name: string;
  description: string;
  dsl: string;
  label: string;
  color: string;
  cooldown: number;
  categories?: PostCategory[];
}[] = [
  {
    re: /이중\s*바닥|더블\s*바텀|double\s*bottom/i,
    name: "이중바닥",
    description: "강의 본문에서 추출 — 유사 스윙 저점 쌍 + 넥라인 돌파",
    dsl: "swing_low_pair tolerancePct=2; neckline_break",
    label: "이중바닥?",
    color: "#38bdf8",
    cooldown: 240,
  },
  {
    re: /골든\s*크로스|이평.*교차|EMA.*크로스|이동평균.*상향/i,
    name: "단기 EMA 골든크로스",
    description: "강의 본문에서 추출 — 단기 EMA가 장기 EMA 상향 돌파",
    dsl: "ma_cross fast=9 slow=21",
    label: "EMA크로스",
    color: "#34d399",
    cooldown: 120,
  },
  {
    re: /지지.*반등|반등.*지지|support\s*bounce/i,
    name: "지지 반등",
    description: "강의 본문에서 추출 — 스윙 저점 지지 터치 후 양봉",
    dsl: "support_bounce",
    label: "지지반등",
    color: "#fbbf24",
    cooldown: 180,
  },
  {
    re: /RSI.*과매도|과매도.*RSI|rsi\s*<?\s*30/i,
    name: "RSI 과매도 반전 후보",
    description: "강의 본문에서 추출 — RSI 과매도 구간 반등 후보",
    dsl: "rsi_oversold period=14 threshold=30",
    label: "RSI과매도",
    color: "#fb7185",
    cooldown: 360,
  },
  {
    re: /장악형|잉걸핑|engulfing/i,
    name: "상승 장악형",
    description: "강의 본문에서 추출 — 음봉 이후 양봉 장악",
    dsl: "bullish_engulfing",
    label: "장악형",
    color: "#a3e635",
    cooldown: 60,
  },
  {
    re: /넥라인|neckline/i,
    name: "넥라인 돌파",
    description: "강의 본문에서 추출 — 스윙 고점 넥라인 상향 돌파",
    dsl: "neckline_break",
    label: "넥라인",
    color: "#60a5fa",
    cooldown: 180,
  },
  {
    re: /거래량\s*(급증|스파이크|폭발)|볼륨\s*(급증|스파이크)|volume\s*spike/i,
    name: "거래량 스파이크",
    description: "강의 본문에서 추출 — 평균 대비 거래량 급증",
    dsl: "volume_spike mult=2",
    label: "볼륨↑",
    color: "#c084fc",
    cooldown: 90,
  },
];

const DEFAULT_TFS: Timeframe[] = ["60", "240", "D"];

function draftFromHeuristic(
  h: (typeof HEURISTICS)[0]
): ExtractedPatternDraft {
  const rules = parsePatternDsl(h.dsl).filter((r) => RULE_TYPES.has(r.type));
  return {
    name: h.name,
    description: h.description,
    rules,
    dsl: h.dsl,
    timeframes: DEFAULT_TFS,
    display: { label: h.label, color: h.color },
    alert: { cooldownMinutes: h.cooldown },
    extractMethod: "heuristic",
  };
}

/** Stronger heuristic extractor — Korean lecture keyword → PatternDef rules. */
export function extractPatternsHeuristic(
  post: Pick<Post, "title" | "body" | "category">
): ExtractedPatternDraft[] {
  const text = `${post.title}\n${post.body}`;
  const out: ExtractedPatternDraft[] = [];
  const seen = new Set<string>();

  for (const h of HEURISTICS) {
    if (!h.re.test(text)) continue;
    if (seen.has(h.dsl)) continue;
    seen.add(h.dsl);
    out.push(draftFromHeuristic(h));
  }

  // survival_strategy without explicit rules → default double-bottom lesson
  if (
    out.length === 0 &&
    post.category === "survival_strategy" &&
    /패턴|전략|셋업|진입|손절/.test(text)
  ) {
    const h = HEURISTICS[0];
    out.push(draftFromHeuristic(h));
  }

  // realtime_chart with 돌파/지지 language
  if (out.length === 0 && post.category === "realtime_chart") {
    if (/돌파/.test(text)) {
      out.push(draftFromHeuristic(HEURISTICS[5]));
    } else if (/지지|반등/.test(text)) {
      out.push(draftFromHeuristic(HEURISTICS[2]));
    }
  }

  return out.slice(0, 4);
}

function sanitizeLlmDraft(raw: unknown): ExtractedPatternDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? "").trim();
  if (!name) return null;
  let rules: PatternRule[] = [];
  const dsl = typeof o.dsl === "string" ? o.dsl.trim() : "";
  if (dsl) {
    rules = parsePatternDsl(dsl).filter((r) => RULE_TYPES.has(r.type));
  } else if (Array.isArray(o.rules)) {
    for (const r of o.rules) {
      if (!r || typeof r !== "object") continue;
      const type = String((r as PatternRule).type) as PatternRule["type"];
      if (!RULE_TYPES.has(type)) continue;
      rules.push({
        type,
        params: (r as PatternRule).params,
      });
    }
  }
  if (!rules.length) return null;
  const builtDsl =
    dsl ||
    rules
      .map((r) => {
        const ps = Object.entries(r.params ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join(" ");
        return ps ? `${r.type} ${ps}` : r.type;
      })
      .join("; ");
  return {
    name,
    description: String(o.description ?? "LLM 추출 패턴").slice(0, 240),
    rules,
    dsl: builtDsl,
    timeframes: Array.isArray(o.timeframes)
      ? (o.timeframes as Timeframe[]).filter(Boolean).slice(0, 6)
      : DEFAULT_TFS,
    display: {
      label: String(
        (o.display as { label?: string } | undefined)?.label ?? name.slice(0, 8)
      ),
      color: String(
        (o.display as { color?: string } | undefined)?.color ?? "#38bdf8"
      ),
    },
    alert: {
      cooldownMinutes: Number(
        (o.alert as { cooldownMinutes?: number } | undefined)
          ?.cooldownMinutes ?? 180
      ),
    },
    extractMethod: "llm",
  };
}

async function extractPatternsLlm(
  post: Pick<Post, "title" | "body" | "category">
): Promise<ExtractedPatternDraft[]> {
  const apiKey = resolveLlmApiKey();
  if (!apiKey) return [];

  try {
    const res = await fetch(resolveLlmEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolveLlmModel(),
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: `Extract chart PatternDef rules from Korean trading lecture text.
Reply JSON {patterns:[{name,description,dsl,timeframes,display:{label,color},alert:{cooldownMinutes}}]}.
Allowed rule types in dsl (semicolon-separated): ma_cross, swing_low_pair, support_bounce, rsi_oversold, bullish_engulfing, neckline_break, volume_spike.
Example dsl: "swing_low_pair tolerancePct=2; neckline_break"
Max 3 patterns. Empty array if none.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              category: post.category,
              title: post.title,
              body: post.body.slice(0, 6000),
            }),
          },
        ],
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.replace(/```json|```/g, "").trim()) as {
      patterns?: unknown[];
    };
    if (!Array.isArray(parsed.patterns)) return [];
    return parsed.patterns
      .map(sanitizeLlmDraft)
      .filter((d): d is ExtractedPatternDraft => d != null)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Extract PatternDef drafts from a lecture/analysis post.
 * Prefers LLM when OPENAI_API_KEY / LLM_API_KEY is set; merges with heuristics.
 */
export async function extractPatternsFromPost(
  post: Pick<Post, "title" | "body" | "category">
): Promise<ExtractedPatternDraft[]> {
  const heuristic = extractPatternsHeuristic(post);
  const llm = await extractPatternsLlm(post);
  if (!llm.length) return heuristic;

  const seen = new Set(llm.map((d) => d.dsl));
  const merged = [...llm];
  for (const h of heuristic) {
    if (seen.has(h.dsl)) continue;
    seen.add(h.dsl);
    merged.push(h);
  }
  return merged.slice(0, 4);
}

/** Build a pending PatternDef linked to source post (disabled until review). */
export function toPendingPatternDef(
  draft: ExtractedPatternDraft,
  sourcePostId: string,
  id: string
): PatternDef {
  return {
    id,
    name: draft.name,
    description: draft.description,
    sourcePostIds: [sourcePostId],
    timeframes: draft.timeframes.length ? draft.timeframes : DEFAULT_TFS,
    rules: draft.rules,
    display: draft.display,
    alert: draft.alert,
    enabled: false,
    dsl: draft.dsl,
    reviewStatus: "pending",
    learnedAt: new Date().toISOString(),
    extractMethod: draft.extractMethod,
  };
}

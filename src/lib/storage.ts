import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  AlertItem,
  AppStoreData,
  ChartComment,
  Drawing,
  Opinion,
  PatternDef,
  PatternHit,
  Post,
  MultiConditionAlert,
  PaperAccount,
  CustomIndicatorScript,
  PriceWatch,
  TechnicalAlert,
  WebhookConfig,
} from "@/lib/types";
import { DEFAULT_PAPER_ACCOUNT, DEFAULT_WEBHOOK_CONFIG } from "@/lib/types";
import { createSeedStore, SEED_PATTERNS } from "@/lib/seed";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

let writeQueue: Promise<unknown> = Promise.resolve();

function migrateStore(raw: AppStoreData): AppStoreData {
  let patterns: PatternDef[] = (raw.patterns ?? []).map((p) => ({
    ...p,
    reviewStatus: p.reviewStatus ?? "approved",
    extractMethod: p.extractMethod ?? "seed",
  }));
  const pendingDemo = SEED_PATTERNS.find((p) => p.id === "pat_pending_demo");
  if (pendingDemo && !patterns.some((p) => p.id === "pat_pending_demo")) {
    patterns = [pendingDemo, ...patterns];
  }
  return {
    ...raw,
    patterns,
    priceWatches: raw.priceWatches ?? [],
    comments: raw.comments ?? [],
    news: raw.news ?? [],
    technicalAlerts: raw.technicalAlerts ?? [],
    webhookConfig: raw.webhookConfig ?? DEFAULT_WEBHOOK_CONFIG,
    multiConditionAlerts: raw.multiConditionAlerts ?? [],
    paperAccount: raw.paperAccount ?? { ...DEFAULT_PAPER_ACCOUNT },
    customIndicatorScripts: raw.customIndicatorScripts ?? [],
  };
}

async function ensureStore(): Promise<AppStoreData> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return migrateStore(JSON.parse(raw) as AppStoreData);
  } catch {
    const seed = createSeedStore();
    await fs.writeFile(STORE_PATH, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
}

async function mutate(
  fn: (data: AppStoreData) => AppStoreData | void
): Promise<AppStoreData> {
  const run = writeQueue.then(async () => {
    const data = await ensureStore();
    const next = fn(data) ?? data;
    await fs.writeFile(STORE_PATH, JSON.stringify(next, null, 2), "utf8");
    return next;
  });
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function readStore(): Promise<AppStoreData> {
  return ensureStore();
}

export async function resetStore(): Promise<AppStoreData> {
  return mutate(() => createSeedStore());
}

export async function updateWatchlist(ids: string[]): Promise<AppStoreData> {
  return mutate((d) => {
    d.watchlist = ids;
  });
}

export async function addPost(post: Omit<Post, "id" | "createdAt">): Promise<Post> {
  const created: Post = {
    ...post,
    id: `post_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await mutate((d) => {
    d.posts.unshift(created);
  });
  return created;
}

export async function addOpinion(
  opinion: Omit<Opinion, "id" | "createdAt">
): Promise<Opinion> {
  const created: Opinion = {
    ...opinion,
    id: `op_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await mutate((d) => {
    d.opinions.unshift(created);
  });
  return created;
}

export async function reviewOpinion(
  id: string,
  status: "approved" | "rejected",
  reviewer = "local-user"
): Promise<Opinion | null> {
  let updated: Opinion | null = null;
  await mutate((d) => {
    const op = d.opinions.find((o) => o.id === id);
    if (!op) return;
    op.status = status;
    op.reviewedBy = reviewer;
    op.reviewedAt = new Date().toISOString();
    updated = op;
    if (status === "approved") {
      d.alerts.unshift({
        id: `alert_${randomUUID().slice(0, 8)}`,
        type: "opinion",
        title: "의견 승인됨",
        message: `${op.summary} 이(가) 게시되었습니다.`,
        symbolId: op.symbolId,
        opinionId: op.id,
        firedAt: new Date().toISOString(),
        read: false,
      });
    }
  });
  return updated;
}

export async function saveDrawings(
  symbolId: string,
  drawings: Drawing[]
): Promise<Drawing[]> {
  await mutate((d) => {
    d.drawings = [
      ...d.drawings.filter((x) => x.symbolId !== symbolId),
      ...drawings,
    ];
  });
  return drawings;
}

export async function upsertPatternHits(hits: PatternHit[]): Promise<PatternHit[]> {
  await mutate((d) => {
    for (const hit of hits) {
      const idx = d.patternHits.findIndex((h) => h.id === hit.id);
      if (idx >= 0) d.patternHits[idx] = hit;
      else d.patternHits.unshift(hit);
    }
  });
  return hits;
}

export async function addAlert(
  alert: Omit<AlertItem, "id" | "firedAt" | "read">
): Promise<AlertItem> {
  const created: AlertItem = {
    ...alert,
    id: `alert_${randomUUID().slice(0, 8)}`,
    firedAt: new Date().toISOString(),
    read: false,
  };
  await mutate((d) => {
    d.alerts.unshift(created);
  });
  return created;
}

export async function markAlertsRead(ids?: string[]): Promise<AppStoreData> {
  return mutate((d) => {
    for (const a of d.alerts) {
      if (!ids || ids.includes(a.id)) a.read = true;
    }
  });
}

/** Feature ID: alert.price — persist watch definitions server-side */
export async function savePriceWatches(
  watches: PriceWatch[]
): Promise<PriceWatch[]> {
  await mutate((d) => {
    d.priceWatches = watches;
  });
  return watches;
}

export async function addPriceWatchServer(
  watch: Omit<PriceWatch, "id" | "createdAt">
): Promise<PriceWatch> {
  const created: PriceWatch = {
    ...watch,
    id: `pw_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await mutate((d) => {
    d.priceWatches = [created, ...(d.priceWatches ?? [])];
  });
  return created;
}

export async function addComment(
  comment: Omit<ChartComment, "id" | "createdAt">
): Promise<ChartComment> {
  const created: ChartComment = {
    ...comment,
    id: `cmt_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await mutate((d) => {
    d.comments = [created, ...(d.comments ?? [])];
  });
  return created;
}

export async function setPatternEnabled(
  id: string,
  enabled: boolean
): Promise<PatternDef | null> {
  let updated: PatternDef | null = null;
  await mutate((d) => {
    const p = d.patterns.find((x) => x.id === id);
    if (!p) return;
    p.enabled = enabled;
    updated = p;
  });
  return updated;
}

export async function addPattern(pattern: PatternDef): Promise<PatternDef> {
  await mutate((d) => {
    d.patterns.unshift(pattern);
  });
  return pattern;
}

export async function linkPatternSourcePost(
  patternId: string,
  postId: string
): Promise<PatternDef | null> {
  let updated: PatternDef | null = null;
  await mutate((d) => {
    const p = d.patterns.find((x) => x.id === patternId);
    if (!p) return;
    if (!p.sourcePostIds.includes(postId)) {
      p.sourcePostIds = [...p.sourcePostIds, postId];
    }
    updated = p;
  });
  return updated;
}

export async function reviewPattern(
  id: string,
  status: "approved" | "rejected",
  reviewer = "local-user"
): Promise<PatternDef | null> {
  let updated: PatternDef | null = null;
  await mutate((d) => {
    const p = d.patterns.find((x) => x.id === id);
    if (!p) return;
    p.reviewStatus = status;
    p.enabled = status === "approved";
    updated = p;
    if (status === "approved") {
      d.alerts.unshift({
        id: `alert_${randomUUID().slice(0, 8)}`,
        type: "pattern",
        title: "패턴 승인됨",
        message: `${p.name} 이(가) 매칭에 활성화되었습니다.`,
        patternId: p.id,
        firedAt: new Date().toISOString(),
        read: false,
      });
    }
  });
  void reviewer;
  return updated;
}

export async function setPatternFeedback(
  hitId: string,
  feedback: "correct" | "incorrect"
): Promise<PatternHit | null> {
  let updated: PatternHit | null = null;
  await mutate((d) => {
    const h = d.patternHits.find((x) => x.id === hitId);
    if (!h) return;
    h.feedback = feedback;
    updated = h;
  });
  return updated;
}

/** Feature ID: alert.webhook */
export async function saveWebhookConfig(
  config: WebhookConfig
): Promise<WebhookConfig> {
  await mutate((d) => {
    d.webhookConfig = config;
  });
  return config;
}

export async function readWebhookConfig(): Promise<WebhookConfig> {
  const d = await readStore();
  return d.webhookConfig ?? DEFAULT_WEBHOOK_CONFIG;
}

/** Feature ID: alert.technical.* */
export async function saveTechnicalAlerts(
  alerts: TechnicalAlert[]
): Promise<TechnicalAlert[]> {
  await mutate((d) => {
    d.technicalAlerts = alerts;
  });
  return alerts;
}

export async function addTechnicalAlert(
  alert: Omit<TechnicalAlert, "id" | "createdAt">
): Promise<TechnicalAlert> {
  const created: TechnicalAlert = {
    ...alert,
    id: `ta_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await mutate((d) => {
    d.technicalAlerts = [created, ...(d.technicalAlerts ?? [])];
  });
  return created;
}

/** Feature ID: alert.multi_condition */
export async function saveMultiConditionAlerts(
  alerts: MultiConditionAlert[]
): Promise<MultiConditionAlert[]> {
  await mutate((d) => {
    d.multiConditionAlerts = alerts;
  });
  return alerts;
}

export async function addMultiConditionAlert(
  alert: Omit<MultiConditionAlert, "id" | "createdAt">
): Promise<MultiConditionAlert> {
  const created: MultiConditionAlert = {
    ...alert,
    id: `mc_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await mutate((d) => {
    d.multiConditionAlerts = [created, ...(d.multiConditionAlerts ?? [])];
  });
  return created;
}

export async function addPriceWatchesBulk(
  watches: Omit<PriceWatch, "id" | "createdAt">[]
): Promise<PriceWatch[]> {
  const created = watches.map((w) => ({
    ...w,
    id: `pw_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  }));
  await mutate((d) => {
    d.priceWatches = [...created, ...(d.priceWatches ?? [])];
  });
  return created;
}

/** Feature ID: trade.paper */
export async function savePaperAccount(
  account: PaperAccount
): Promise<PaperAccount> {
  await mutate((d) => {
    d.paperAccount = account;
  });
  return account;
}

export async function readPaperAccount(): Promise<PaperAccount> {
  const d = await readStore();
  return d.paperAccount ?? { ...DEFAULT_PAPER_ACCOUNT };
}

export async function upsertCustomIndicatorScript(
  script: Omit<CustomIndicatorScript, "id" | "updatedAt"> & { id?: string }
): Promise<CustomIndicatorScript> {
  const created: CustomIndicatorScript = {
    id: script.id ?? `ci_${randomUUID().slice(0, 8)}`,
    name: script.name,
    source: script.source,
    updatedAt: new Date().toISOString(),
  };
  await mutate((d) => {
    const list = d.customIndicatorScripts ?? [];
    const idx = list.findIndex((s) => s.id === created.id);
    if (idx >= 0) list[idx] = created;
    else list.unshift(created);
    d.customIndicatorScripts = list;
  });
  return created;
}

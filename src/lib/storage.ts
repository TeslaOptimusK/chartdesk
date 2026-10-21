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
  SymbolMeta,
  TechnicalAlert,
  WatchlistSection,
  WebhookConfig,
} from "@/lib/types";
import { DEFAULT_PAPER_ACCOUNT, DEFAULT_WEBHOOK_CONFIG } from "@/lib/types";
import { createSeedStore, SEED_PATTERNS } from "@/lib/seed";
import {
  flattenWatchlist,
  normalizeWatchlistSections,
  symbolIdFor,
} from "@/lib/watchlist";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

/** Route bundles and dev reloads can load this module more than once; they must share one queue. */
const storeQueue = globalThis as typeof globalThis & {
  __chartdeskStoreQueue?: Promise<unknown>;
};

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = (storeQueue.__chartdeskStoreQueue ?? Promise.resolve()).then(task);
  storeQueue.__chartdeskStoreQueue = run.catch(() => undefined);
  return run;
}

/** Antivirus and indexers briefly lock files on Windows. */
const TRANSIENT_FS_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

async function retryTransient<T>(task: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (attempt >= 5 || !TRANSIENT_FS_CODES.has(code)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
}

/** A killed server leaves either the old file or the new one, never half of one. */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  try {
    await retryTransient(() => fs.rename(tmp, file));
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

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
  const symbols = raw.symbols ?? [];
  const watchlistSections = normalizeWatchlistSections(
    raw.watchlistSections,
    symbols,
    symbols.map((symbol) => symbol.id)
  );
  return {
    ...raw,
    patterns,
    watchlist: flattenWatchlist(watchlistSections),
    watchlistSections,
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

/** Null when there is no usable store yet. An unreadable file is kept aside, not overwritten. */
async function loadStore(): Promise<AppStoreData | null> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let raw: string;
  try {
    raw = await retryTransient(() => fs.readFile(STORE_PATH, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    return migrateStore(JSON.parse(raw) as AppStoreData);
  } catch {
    const aside = path.join(DATA_DIR, `store.corrupt-${Date.now()}.json`);
    await retryTransient(() => fs.rename(STORE_PATH, aside));
    console.error(
      `[store] data/store.json could not be parsed. Kept it as data/${path.basename(aside)} and started from the seed.`
    );
    return null;
  }
}

async function mutate(
  fn: (data: AppStoreData) => AppStoreData | void
): Promise<AppStoreData> {
  return enqueue(async () => {
    const data = (await loadStore()) ?? createSeedStore();
    const next = fn(data) ?? data;
    await writeJsonAtomic(STORE_PATH, next);
    return next;
  });
}

export async function readStore(): Promise<AppStoreData> {
  return enqueue(async () => {
    const data = await loadStore();
    if (data) return data;
    const seed = createSeedStore();
    await writeJsonAtomic(STORE_PATH, seed);
    return seed;
  });
}

export async function resetStore(): Promise<AppStoreData> {
  return mutate(() => createSeedStore());
}

export async function updateWatchlist(ids: string[]): Promise<AppStoreData> {
  return mutate((d) => {
    d.watchlist = ids;
  });
}

export async function updateWatchlistSections(
  sections: WatchlistSection[]
): Promise<AppStoreData> {
  return mutate((d) => {
    const known = new Set(d.symbols.map((symbol) => symbol.id));
    const next = sections.map((section) => ({
      id: section.id,
      name: section.name.trim() || "관심",
      symbolIds: section.symbolIds.filter((id) => known.has(id)),
    }));
    d.watchlistSections = next;
    d.watchlist = flattenWatchlist(next);
  });
}

export async function addSymbol(
  input: Omit<SymbolMeta, "id" | "aliases"> & { aliases?: string[] }
): Promise<SymbolMeta> {
  const ticker = input.ticker.trim().toUpperCase();
  const id = symbolIdFor(input.assetClass, ticker, input.exchange);
  let saved: SymbolMeta = {
    ...input,
    ticker,
    id,
    aliases: input.aliases ?? [],
  };
  await mutate((d) => {
    const existing = d.symbols.find(
      (symbol) =>
        symbol.id === id ||
        (symbol.ticker.toUpperCase() === ticker &&
          symbol.exchange.toUpperCase() === input.exchange.toUpperCase() &&
          symbol.assetClass === input.assetClass)
    );
    if (existing) {
      saved = existing;
      return;
    }
    d.symbols.push(saved);
  });
  return saved;
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

export interface AlertClaim {
  kind: "price" | "technical" | "multi";
  id: string;
  alert: Omit<AlertItem, "id" | "firedAt" | "read">;
}

/**
 * Marks each watch triggered and records its alert in one write. A watch that
 * another evaluation already triggered, or that was deleted meanwhile, is skipped.
 */
export async function claimTriggeredAlerts(
  claims: AlertClaim[],
  lastClose?: number
): Promise<{ fired: AlertItem[]; store: AppStoreData }> {
  const fired: AlertItem[] = [];
  const store = await mutate((d) => {
    const firedAt = new Date().toISOString();
    for (const claim of claims) {
      const list: Array<{ id: string; triggered?: boolean }> =
        claim.kind === "price"
          ? d.priceWatches
          : claim.kind === "technical"
            ? d.technicalAlerts
            : (d.multiConditionAlerts ?? []);
      const row = list.find((item) => item.id === claim.id);
      if (!row || row.triggered) continue;
      row.triggered = true;
      if (claim.kind === "price" && lastClose != null) {
        (row as PriceWatch).lastClose = lastClose;
      }
      const alert: AlertItem = {
        ...claim.alert,
        id: `alert_${randomUUID().slice(0, 8)}`,
        firedAt,
        read: false,
      };
      d.alerts.unshift(alert);
      fired.push(alert);
    }
  });
  return { fired, store };
}

export async function removePriceWatch(id: string): Promise<PriceWatch[]> {
  const store = await mutate((d) => {
    d.priceWatches = (d.priceWatches ?? []).filter((watch) => watch.id !== id);
  });
  return store.priceWatches;
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

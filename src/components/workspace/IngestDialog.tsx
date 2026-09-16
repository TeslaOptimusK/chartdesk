"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/store";
import { CATEGORY_LABELS, type PostCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as PostCategory[];

const FILE_ACCEPT = ".txt,.md,.json";

type BulkDraft = {
  title: string;
  body: string;
  category?: PostCategory;
  externalUrl?: string;
  fileName: string;
};

function parseJsonPayload(
  text: string,
  fileName: string,
  fallbackCategory: PostCategory
): BulkDraft[] {
  const j = JSON.parse(text) as unknown;
  if (Array.isArray(j)) {
    const out: BulkDraft[] = [];
    j.forEach((item, idx) => {
      if (!item || typeof item !== "object") return;
      const o = item as Record<string, unknown>;
      const title = String(o.title ?? "").trim();
      const body = String(o.body ?? o.content ?? "").trim();
      if (!title || !body) return;
      out.push({
        title,
        body,
        category: (o.category as PostCategory) || fallbackCategory,
        externalUrl: String(o.externalUrl ?? ""),
        fileName: `${fileName}#${idx + 1}`,
      });
    });
    return out;
  }
  if (j && typeof j === "object") {
    const o = j as Record<string, unknown>;
    if (Array.isArray(o.posts)) {
      return parseJsonPayload(JSON.stringify(o.posts), fileName, fallbackCategory);
    }
    const title = String(o.title ?? "").trim() || fileName.replace(/\.[^.]+$/, "");
    const body = String(o.body ?? o.content ?? "").trim();
    if (body) {
      return [
        {
          title,
          body,
          category: (o.category as PostCategory) || fallbackCategory,
          externalUrl: String(o.externalUrl ?? ""),
          fileName,
        },
      ];
    }
  }
  return [];
}

function titleFromText(name: string, text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return line.slice(0, 120) || name.replace(/\.[^.]+$/, "");
}

export function IngestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const {
    symbols,
    upsertPost,
    upsertOpinions,
    setPatterns,
    patterns,
    setAlerts,
  } = useWorkspace();
  const [category, setCategory] = useState<PostCategory>("realtime_chart");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [symbolIds, setSymbolIds] = useState<string[]>([]);
  const [ingestMethod, setIngestMethod] = useState<"manual_paste" | "file_drop">(
    "manual_paste"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<BulkDraft[]>([]);

  const toggleSymbol = (id: string) => {
    setSymbolIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const mergeQueue = useCallback((items: BulkDraft[]) => {
    setQueue((prev) => [...prev, ...items]);
    setIngestMethod("file_drop");
    if (items.length === 1) {
      setTitle(items[0].title);
      setBody(items[0].body);
      if (items[0].category) setCategory(items[0].category);
      if (items[0].externalUrl) setExternalUrl(items[0].externalUrl);
    }
    setOkMsg(`${items.length}건 대기열에 추가`);
  }, []);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setError(null);
      const collected: BulkDraft[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !["txt", "md", "json"].includes(ext)) {
          setError("지원: .txt, .md, .json (복수 선택 가능)");
          continue;
        }
        try {
          const text = await file.text();
          if (ext === "json") {
            const parsed = parseJsonPayload(text, file.name, category);
            if (!parsed.length) {
              setError(`${file.name}: JSON에 title/body가 없습니다`);
              continue;
            }
            collected.push(...parsed);
          } else {
            collected.push({
              title: titleFromText(file.name, text),
              body: text,
              category,
              fileName: file.name,
            });
          }
        } catch {
          setError(`${file.name} 읽기 실패`);
        }
      }
      if (collected.length) mergeQueue(collected);
    },
    [category, mergeQueue]
  );

  const refreshAlerts = async () => {
    const alertsRes = await fetch("/api/alerts");
    const alertsData = await alertsRes.json();
    setAlerts(alertsData.alerts ?? []);
  };

  const applyLearnResult = (data: {
    post?: { id: string };
    posts?: { id: string }[];
    opinions?: unknown[];
    patterns?: unknown[];
  }) => {
    if (data.post) upsertPost(data.post as never);
    if (data.posts) {
      for (const p of data.posts) upsertPost(p as never);
    }
    if (data.opinions?.length) upsertOpinions(data.opinions as never);
    if (data.patterns?.length) {
      const incoming = data.patterns as { id: string }[];
      const map = new Map(patterns.map((p) => [p.id, p]));
      for (const p of incoming) map.set(p.id, p as never);
      setPatterns([...map.values()] as never);
    }
  };

  const submitSingle = async () => {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          title,
          body,
          externalUrl,
          symbolIds,
          ingestMethod,
          autoOpinion: true,
          autoPatterns: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "인제스트 실패");
      applyLearnResult(data);
      await refreshAlerts();
      const patN = data.patterns?.length ?? 0;
      const opN = data.opinions?.length ?? 0;
      setOkMsg(
        `학습됨 · 패턴 ${patN} · 의견 초안 ${opN} (검수 필요)`
      );
      setTitle("");
      setBody("");
      setExternalUrl("");
      setSymbolIds([]);
      setIngestMethod("manual_paste");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setBusy(false);
    }
  };

  const submitBulk = async () => {
    if (!queue.length) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/learn/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultCategory: category,
          autoOpinion: true,
          autoPatterns: true,
          posts: queue.map((q) => ({
            category: q.category ?? category,
            title: q.title,
            body: q.body,
            externalUrl: q.externalUrl,
            ingestMethod: "file_drop" as const,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok && !data.imported) {
        throw new Error(data.error ?? "일괄 인제스트 실패");
      }
      applyLearnResult(data);
      await refreshAlerts();
      setOkMsg(
        `일괄 학습 ${data.imported}건 · 패턴 ${data.patterns?.length ?? 0} · 의견 ${data.opinions?.length ?? 0}`
      );
      setQueue([]);
      setTitle("");
      setBody("");
      setIngestMethod("manual_paste");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[var(--workspace-border)] bg-[var(--workspace-elevated)] text-[var(--workspace-fg)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>easychart 원문 학습 인제스트</DialogTitle>
          <DialogDescription className="text-[var(--workspace-muted)]">
            멤버십에서 합법적으로 열람한 글만 붙여넣거나 파일을 드롭하세요.
            스크레이핑 없음. 웹훅{" "}
            <code className="text-[10px]">POST /api/ingest/webhook</code> · 일괄{" "}
            <code className="text-[10px]">POST /api/learn/bulk</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            className={cn(
              "rounded-md border border-dashed px-3 py-4 text-center text-xs transition-colors",
              dragOver
                ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10"
                : "border-[var(--workspace-border)] text-[var(--workspace-muted)]"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void onFiles(e.dataTransfer.files);
            }}
            data-feature="ingest.file_drop"
          >
            <p className="mb-2">
              .txt / .md / .json 복수 드롭 · JSON 배열 지원
            </p>
            <label className="cursor-pointer text-[var(--brand-accent)] underline">
              파일 선택 (복수)
              <input
                type="file"
                accept={FILE_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => void onFiles(e.target.files)}
              />
            </label>
            {ingestMethod === "file_drop" && (
              <p className="mt-2 text-[10px] text-emerald-300/90">file_drop</p>
            )}
          </div>

          {queue.length > 0 && (
            <div
              className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-panel)] p-2"
              data-feature="ingest.bulk"
            >
              <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                <span>일괄 대기 {queue.length}건</span>
                <button
                  type="button"
                  className="text-[10px] text-[var(--workspace-muted)] underline"
                  onClick={() => setQueue([])}
                >
                  비우기
                </button>
              </div>
              <ul className="max-h-24 space-y-0.5 overflow-y-auto text-[10px] text-[var(--workspace-muted)]">
                {queue.map((q, i) => (
                  <li key={`${q.fileName}-${i}`}>
                    {q.fileName} — {q.title.slice(0, 40)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block text-xs">주제</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={
                    category === c
                      ? "rounded-md bg-[var(--brand-accent)] px-2 py-2 text-left text-xs font-semibold text-[#0b1016]"
                      : "rounded-md border border-[var(--workspace-border)] px-2 py-2 text-left text-xs text-[var(--workspace-muted)] hover:bg-[var(--workspace-panel)]"
                  }
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="title" className="mb-1.5 block text-xs">
              제목 (단건)
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setIngestMethod("manual_paste");
              }}
              className="border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
            />
          </div>

          <div>
            <Label htmlFor="body" className="mb-1.5 block text-xs">
              본문 (붙여넣기)
            </Label>
            <Textarea
              id="body"
              rows={6}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setIngestMethod("manual_paste");
              }}
              className="border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
              placeholder="멤버십에서 복사한 분석/강의 텍스트…"
            />
          </div>

          <div>
            <Label htmlFor="url" className="mb-1.5 block text-xs">
              원문 URL (참조용, 프록시하지 않음)
            </Label>
            <Input
              id="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://fanding.kr/@easychart/…"
              className="border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-xs">
              종목 태그 (비우면 사전/휴리스틱 자동 추출)
            </Label>
            <div className="flex flex-wrap gap-1">
              {symbols.map((s) => {
                const on = symbolIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSymbol(s.id)}
                    className={
                      on
                        ? "rounded bg-[var(--brand-accent)] px-2 py-1 text-[11px] font-medium text-[#0b1016]"
                        : "rounded border border-[var(--workspace-border)] px-2 py-1 text-[11px] text-[var(--workspace-muted)]"
                    }
                  >
                    {s.ticker}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-xs text-rose-300">{error}</p>}
          {okMsg && <p className="text-xs text-emerald-300">{okMsg}</p>}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          {queue.length > 0 && (
            <Button
              disabled={busy}
              onClick={submitBulk}
              variant="outline"
              className="border-[var(--brand-accent)] text-[var(--brand-accent)]"
            >
              {busy ? "학습 중…" : `일괄 학습 ${queue.length}건`}
            </Button>
          )}
          <Button
            disabled={busy || !title.trim() || !body.trim()}
            onClick={submitSingle}
            className="bg-[var(--brand-accent)] text-[#0b1016] hover:bg-[var(--brand-accent)]/90"
          >
            {busy ? "저장 중…" : "단건 학습 + 패턴/의견"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
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

const CATEGORIES = Object.keys(CATEGORY_LABELS) as PostCategory[];

export function IngestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { symbols, upsertPost, upsertOpinions, setAlerts } = useWorkspace();
  const [category, setCategory] = useState<PostCategory>("realtime_chart");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [symbolIds, setSymbolIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const toggleSymbol = (id: string) => {
    setSymbolIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const submit = async () => {
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
          ingestMethod: "manual_paste",
          autoOpinion: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "인제스트 실패");
      upsertPost(data.post);
      if (data.opinions?.length) upsertOpinions(data.opinions);
      const alertsRes = await fetch("/api/alerts");
      const alertsData = await alertsRes.json();
      setAlerts(alertsData.alerts ?? []);
      setOkMsg(
        data.opinions?.length
          ? `저장됨 · 의견 초안 ${data.opinions.length}건 (검수 대기)`
          : "저장됨 · 종목 미추출 시 수동 태깅 필요"
      );
      setTitle("");
      setBody("");
      setExternalUrl("");
      setSymbolIds([]);
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
          <DialogTitle>easychart 포스트 수동 인제스트</DialogTitle>
          <DialogDescription className="text-[var(--workspace-muted)]">
            멤버십에서 합법적으로 열람한 글만 붙여넣으세요. 원문 스크래핑·재배포는
            지원하지 않습니다. 파일 드롭/웹훅 훅은 이후 확장용으로 예약되어
            있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
              제목
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
              onChange={(e) => setBody(e.target.value)}
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            disabled={busy || !title.trim() || !body.trim()}
            onClick={submit}
            className="bg-[var(--brand-accent)] text-[#0b1016] hover:bg-[var(--brand-accent)]/90"
          >
            {busy ? "저장 중…" : "인제스트 + 의견 초안"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

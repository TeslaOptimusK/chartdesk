"use client";

import { useEffect } from "react";

export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[chartdesk] workspace crashed", error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--workspace-bg)] px-6 text-center">
      <p className="max-w-lg text-sm text-rose-300">
        ChartDesk 화면을 그리는 중 오류가 났습니다.
      </p>
      <p className="max-w-lg break-all text-xs text-[var(--workspace-faint)]">{error.message}</p>
      <button
        type="button"
        className="rounded border border-[var(--workspace-border)] px-3 py-1.5 text-sm text-[var(--workspace-fg)]"
        onClick={() => retry()}
      >
        다시 시도
      </button>
    </div>
  );
}

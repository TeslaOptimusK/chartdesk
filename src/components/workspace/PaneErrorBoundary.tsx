"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface PaneErrorBoundaryProps {
  /** Shown in the fallback, e.g. "차트" or "오른쪽 패널". */
  label: string;
  children: ReactNode;
}

interface PaneErrorBoundaryState {
  error: Error | null;
}

/** One failing chart or panel shows a retry card instead of blanking the whole workspace. */
export class PaneErrorBoundary extends Component<PaneErrorBoundaryProps, PaneErrorBoundaryState> {
  state: PaneErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PaneErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[chartdesk] ${this.props.label} crashed`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 bg-[var(--chart-bg)] p-4 text-center text-sm">
        <p className="text-rose-300">{this.props.label}을(를) 그리는 중 오류가 났습니다.</p>
        <p className="max-w-md break-all text-xs text-[var(--workspace-faint)]">{error.message}</p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => this.setState({ error: null })}
        >
          다시 시도
        </Button>
      </div>
    );
  }
}

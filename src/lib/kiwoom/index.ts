import type { KiwoomTradingAdapter } from "@/lib/kiwoom/types";
import { MockKiwoomAdapter } from "@/lib/kiwoom/mock-adapter";
import { OcxKiwoomStubAdapter } from "@/lib/kiwoom/ocx-stub";

/** Factory — mock (default) | ocx stub */
export function createKiwoomAdapter(): KiwoomTradingAdapter {
  const mode = (process.env.KIWOOM_MODE ?? "mock").toLowerCase();
  if (mode === "ocx") return new OcxKiwoomStubAdapter();
  return new MockKiwoomAdapter();
}

export type {
  KiwoomTradingAdapter,
  KiwoomOrderRequest,
  KiwoomOrderResult,
  KiwoomAdapterStatus,
} from "@/lib/kiwoom/types";

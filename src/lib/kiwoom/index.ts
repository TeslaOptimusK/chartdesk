import type { KiwoomTradingAdapter } from "@/lib/kiwoom/types";
import { MockKiwoomAdapter } from "@/lib/kiwoom/mock-adapter";
import { OcxKiwoomStubAdapter } from "@/lib/kiwoom/ocx-stub";
import { kiwoomQuotesConfigured } from "@/lib/kiwoom/quote-rest";
import { RestKiwoomAdapter } from "@/lib/kiwoom/rest-adapter";

/** Keys present → Kiwoom REST (real or mock host). Otherwise local paper, or the OCX stub. */
export function createKiwoomAdapter(): KiwoomTradingAdapter {
  if (kiwoomQuotesConfigured()) return new RestKiwoomAdapter();
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

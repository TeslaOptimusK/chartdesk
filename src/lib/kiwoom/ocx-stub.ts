import type {
  KiwoomAdapterStatus,
  KiwoomOrderRequest,
  KiwoomOrderResult,
  KiwoomTradingAdapter,
} from "@/lib/kiwoom/types";

/**
 * Windows-only OpenAPI+ (COM/OCX) stub.
 * Does not load ActiveX or call 영웅문 — documents the future hook only.
 * Never reads secrets from the repo; expect KIWOOM_* env vars when wired.
 *
 * Future wiring sketch (not implemented):
 * 1. Install 키움 OpenAPI+ + 영웅문4 (모의투자)
 * 2. Register KHOpenAPI.ocx (32-bit process often required)
 * 3. Bridge via a local Node native addon / edge process that hosts the OCX
 * 4. Map placeOrder → SendOrder (or REST kt10000/kt10001 when using OpenAPI REST)
 *
 * REST reference (키움 Open API):
 * - 매수 kt10000 POST /api/dostk/ordr
 * - 매도 kt10001 POST /api/dostk/ordr
 * Domains: https://api.kiwoom.com · mock https://mockapi.kiwoom.com
 */
export class OcxKiwoomStubAdapter implements KiwoomTradingAdapter {
  readonly id = "kiwoom-ocx-stub";
  readonly mode = "ocx" as const;

  status(): KiwoomAdapterStatus {
    const isWin = process.platform === "win32";
    const hasKeys = Boolean(
      process.env.KIWOOM_APP_KEY?.trim() ||
        process.env.KIWOOM_ACCOUNT_NO?.trim()
    );
    return {
      mode: "ocx",
      label: "키움 OpenAPI+ (스텁)",
      ready: false,
      platform: process.platform,
      notes: [
        isWin
          ? "Windows 감지 — OCX 브리지는 아직 연결되지 않음"
          : "OpenAPI+ OCX는 Windows 전용입니다",
        hasKeys
          ? "환경 변수에 키/계좌 힌트가 있으나 스텁은 주문하지 않습니다"
          : "KIWOOM_APP_KEY / KIWOOM_ACCOUNT_NO 는 .env.local 에만 두세요 (커밋 금지)",
        "실주문 전 반드시 모의투자로 검증하세요",
      ],
    };
  }

  async placeOrder(_req: KiwoomOrderRequest): Promise<KiwoomOrderResult> {
    return {
      ok: false,
      mode: "ocx",
      message:
        "OCX/OpenAPI+ 실연동은 아직 스텁입니다. KIWOOM_MODE=mock 으로 모의매매를 사용하세요.",
    };
  }
}

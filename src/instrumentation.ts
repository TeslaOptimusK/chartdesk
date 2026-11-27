export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.KIWOOM_BRIDGE_LISTEN !== "1") return;
  const { listenKiwoomBridge } = await import("@/lib/kiwoom/bridge");
  listenKiwoomBridge();
}

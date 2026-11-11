import { isLoopbackIp } from "@/lib/request-guard";

/**
 * Alert delivery is a POST from this PC. Block cloud-metadata and non-HTTP
 * targets. Loopback and ordinary LAN receivers stay allowed so a local
 * notifier still works.
 */
export function webhookUrlBlockReason(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if (value.length > 2000) return "url_too_long";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "invalid_url";
  }
  if (url.username || url.password) return "url_credentials";
  if (url.protocol !== "http:" && url.protocol !== "https:") return "url_protocol";

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "metadata.google.internal" ||
    host === "metadata.google.com" ||
    host.endsWith(".metadata.google.internal")
  ) {
    return "metadata_host";
  }
  if (isMetadataAddress(host)) return "metadata_address";
  return null;
}

function isMetadataAddress(host: string): boolean {
  if (isLoopbackIp(host)) return false;
  const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  const v4 = mapped?.[1] ?? host;
  const parts = v4.split(".");
  if (parts.length === 4) {
    const nums = parts.map((part) => Number(part));
    if (nums.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
      if (nums[0] === 169 && nums[1] === 254) return true;
      if (nums[0] === 0) return true;
    }
  }
  return host.startsWith("fe80:") || host === "::";
}

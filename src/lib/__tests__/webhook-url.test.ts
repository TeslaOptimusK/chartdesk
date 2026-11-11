import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { webhookUrlBlockReason } from "@/lib/webhook-url";

describe("webhook delivery URL", () => {
  it("allows empty, https, and a local receiver", () => {
    assert.equal(webhookUrlBlockReason(""), null);
    assert.equal(webhookUrlBlockReason("  "), null);
    assert.equal(webhookUrlBlockReason("https://hooks.example.com/alerts"), null);
    assert.equal(webhookUrlBlockReason("http://127.0.0.1:8787/hook"), null);
    assert.equal(webhookUrlBlockReason("http://192.168.0.20:8787/hook"), null);
  });

  it("blocks metadata addresses, credentials, and non-HTTP schemes", () => {
    assert.equal(
      webhookUrlBlockReason("http://169.254.169.254/latest/meta-data"),
      "metadata_address"
    );
    assert.equal(webhookUrlBlockReason("http://metadata.google.internal/"), "metadata_host");
    assert.equal(webhookUrlBlockReason("http://0.0.0.0/"), "metadata_address");
    assert.equal(webhookUrlBlockReason("http://user:pass@example.com/hook"), "url_credentials");
    assert.equal(webhookUrlBlockReason("file:///C:/Users/secret.txt"), "url_protocol");
    assert.equal(webhookUrlBlockReason("not a url"), "invalid_url");
  });
});
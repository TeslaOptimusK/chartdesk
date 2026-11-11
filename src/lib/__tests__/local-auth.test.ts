import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, it } from "node:test";
import { readLocalAuthSecret, resetLocalAuthForTests } from "@/lib/local-auth";

const previous = process.env.CHARTDESK_LOCAL_TOKEN;

afterEach(() => {
  resetLocalAuthForTests();
  if (previous === undefined) delete process.env.CHARTDESK_LOCAL_TOKEN;
  else process.env.CHARTDESK_LOCAL_TOKEN = previous;
});

describe("local auth secret", { concurrency: 1 }, () => {
  it("uses CHARTDESK_LOCAL_TOKEN when it is set", async () => {
    process.env.CHARTDESK_LOCAL_TOKEN = "desktop-token";
    assert.equal(await readLocalAuthSecret(), "desktop-token");
  });

  it("creates a file secret once and reads it back", async () => {
    delete process.env.CHARTDESK_LOCAL_TOKEN;
    const dir = await mkdtemp(path.join(tmpdir(), "chartdesk-auth-"));
    try {
      const first = await readLocalAuthSecret(dir);
      assert.match(first, /^[0-9a-f]{64}$/);
      resetLocalAuthForTests();
      const second = await readLocalAuthSecret(dir);
      assert.equal(second, first);
      const stored = (await readFile(path.join(dir, "local-auth.token"), "utf8")).trim();
      assert.equal(stored, first);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

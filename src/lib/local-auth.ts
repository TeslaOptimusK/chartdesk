import { execFile } from "child_process";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const LOCAL_AUTH_COOKIE = "chartdesk_local";
export const LOCAL_AUTH_HEADER = "x-chartdesk-token";

type Cache = { secret?: string };

const globalCache = globalThis as typeof globalThis & {
  __chartdeskLocalAuth?: Cache;
};

function cache(): Cache {
  return (globalCache.__chartdeskLocalAuth ??= {});
}

export function resetLocalAuthForTests(): void {
  globalCache.__chartdeskLocalAuth = {};
}

/**
 * Secret for the local session cookie and for scripts that send
 * `x-chartdesk-token`. `CHARTDESK_LOCAL_TOKEN` wins when it is set.
 * The file lives under data/ and is gitignored.
 */
export async function readLocalAuthSecret(
  dir = path.join(process.cwd(), "data")
): Promise<string> {
  const fromEnv = process.env.CHARTDESK_LOCAL_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const cached = cache().secret;
  if (cached) return cached;

  const file = path.join(dir, "local-auth.token");
  await fs.mkdir(dir, { recursive: true });

  const existing = await readTokenFile(file);
  if (existing) {
    cache().secret = existing;
    return existing;
  }

  const created = randomBytes(32).toString("hex");
  try {
    await fs.writeFile(file, `${created}\n`, { encoding: "utf8", flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    const raced = await readTokenFile(file);
    if (!raced) throw new Error("local auth token is empty");
    cache().secret = raced;
    return raced;
  }

  await tightenAcl(file);
  cache().secret = created;
  return created;
}

async function readTokenFile(file: string): Promise<string | null> {
  try {
    const text = (await fs.readFile(file, "utf8")).trim();
    return text || null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Keep the token file readable by this user and SYSTEM. Failure is not fatal. */
async function tightenAcl(file: string): Promise<void> {
  try {
    if (process.platform !== "win32") {
      await fs.chmod(file, 0o600);
      return;
    }
    const user = process.env.USERNAME;
    if (!user) return;
    const domain = process.env.USERDOMAIN;
    const principal = domain ? `${domain}\\${user}` : user;
    await execFileAsync("icacls", [
      file,
      "/inheritance:r",
      "/grant:r",
      `${principal}:(R,W)`,
      "SYSTEM:(R)",
    ]);
  } catch {
    // The file is already inside this user's profile if icacls is unavailable.
  }
}

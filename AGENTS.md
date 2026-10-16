<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Dev server: `npm run dev -- --hostname 0.0.0.0 --port 43127`. Open `http://127.0.0.1:43127`. `allowedDevOrigins` in `next.config.ts` includes `127.0.0.1`; without it, Next.js 16 blocks dev assets for that host and the UI stays on `ChartDesk 로딩 중…`.
- No API keys are required. Market data uses the mock adapter, and LLM features fall back to heuristics. See `.env.example`.
- The first API request creates gitignored `data/store.json` from seed. Delete that file to reset local state.
- `npm run typecheck`, `npm run test:easychart`, and `npm run build` succeed. `npm run lint` currently fails on existing React hook and unused-variable issues in the chart components.

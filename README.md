# ChartDesk

TradingView-like chart research workspace. Candles via `lightweight-charts`. Not affiliated with TradingView. **Not investment advice.**

Phase 1 feature contracts: [`docs/chartdesk/TRADINGVIEW_FEATURES.md`](./docs/chartdesk/TRADINGVIEW_FEATURES.md) · checklist [`docs/chartdesk/TRADINGVIEW_FEATURES_CHECKLIST.md`](./docs/chartdesk/TRADINGVIEW_FEATURES_CHECKLIST.md).

## Phase 1 (screenshot parity)

- Symbol search / header / recent / compare / chips (`SPX500` `SPY` `QQQ` `MAG7` `SOX` `VNQ` `VNPA`)
- Intervals `1/5/15/60/240/1D`, chart types candle · line · heikin-ashi
- Status line OHLC + change%, crosshair, undo/redo, price & time scales
- Session badge (`NYSE Closed (delayed)` …) + timezone picker
- Volume pane + MA overlays; drawings as `{time, price}` (trend, H-line, H-ray, fib, rect, text, measure, magnet, lock, object tree)
- Right tabs fixed: 워치리스트 · 뉴스 · 최근 · 패턴 · 포스트 · 알림 · 코멘터리
- Server-side price alerts (`이상` / `이하` / `돌파` + 노트), layout save, chart settings
- Pine Script: out of scope (`wont`)

## Run locally

```bash
npm install
cp .env.example .env.local   # optional — defaults to delayed Yahoo quotes (no API key)
npm run dev -- -H 127.0.0.1 -p 43127
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

### Windows desktop shortcut

After clone, create a Desktop `ChartDesk` shortcut once:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-desktop-shortcut.ps1
```

Double-click the shortcut (or run `scripts\start-chartdesk.bat`). It fetches `origin`, checks out `cursor/chartdesk-desktop`, and fast-forwards (`git pull --ff-only`). It does not reset or discard local edits. Then it runs `npm install` only when `node_modules` is missing or `package.json` / `package-lock.json` changed, starts the dev server in the background (`npm run dev -- -H 127.0.0.1 -p 43127`, log `data/chartdesk-server.log`), waits until **`/api/bootstrap` returns 200**, and opens **Chrome or Edge with `--app=http://127.0.0.1:43127`**. No command prompt stays open. Falls back to the default browser only if Chrome/Edge are missing. Closing the app window leaves the server running; the next double-click replaces it.

### Update on your PC

Do not run git yourself. Double-click the Desktop **ChartDesk** icon. The launcher fast-forwards `cursor/chartdesk-desktop` and opens the app.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Environment

See `.env.example`. Default `MARKET_DATA_MODE=delayed` pulls **Yahoo Finance** chart OHLCV (no API key) for KR `.KS`, US tickers, `BTC-USD`/`ETH-USD`, `^GSPC`/`^SOX`. Synthetic symbols (`MAG7`, `VNPA`) and fetch failures fall back to mock. Set `MARKET_DATA_MODE=mock` for offline deterministic candles. `MARKET_DATA_MODE=realtime` uses Yahoo poll (or optional `MARKET_DATA_WS_URL`); `LLM_API_KEY` for draft enrichment.

If `KIWOOM_APP_KEY` and `KIWOOM_APP_SECRET` are both set in `.env.local`, domestic 6-digit symbols use **Kiwoom REST history + websocket trades** (`0B` on port 10000). Other symbols stay on Yahoo or mock. `KIWOOM_QUOTE_HOST=mock` points at the paper host; real and paper keys are not interchangeable. The desktop launcher can keep `MARKET_DATA_MODE=delayed` — Korean quotes still switch to Kiwoom when the keys are present. Close ChartDesk and double-click the desktop icon again after changing keys.

Mock SSE keeps an in-memory **forming bar** and ticks about every `MARKET_DATA_TICK_MS` (default 1000ms) so 1분봉 wicks/body visibly move. Delayed/realtime Yahoo shares one poll subscriber so chart + watchlist show the same last print.

### Kiwoom 매매

Toolbar **매매**. With `KIWOOM_APP_KEY` and `KIWOOM_APP_SECRET`, the ticket reads the account (`kt00001`, `kt00018`) and sends cash orders on the same host as quotes. `KIWOOM_QUOTE_HOST=real` is a live account and asks for a confirm checkbox; `mock` uses the paper host. A buy can set a take-profit and a stop: while ChartDesk is running, a realtime print sells only shares already held. **분할** places equal limit buys across a chart price band (2–20 slices). Without keys, orders stay on the local paper ledger and brackets are not watched. Never commit app keys.

### Alerts & webhooks

- Unified evaluation: `POST /api/alerts/evaluate` with `{ symbolId, candles?, lastClose? }` or `{ scope: "pending" }` for watchlist/multi/technical across symbols. Fires on SSE mock ticks + 12s pending sweep.
- Alert webhook URL in the 알림 tab → `PUT /api/webhooks`; deliveries POST `{ alert, firedAt }` with retries, else logged to `data/webhook-log.json`.

### Fanding ingest & learning

- UI: paste or drag-drop `.txt` / `.md` / `.json` (multi-file + JSON array). Sets `ingestMethod: file_drop`.
- Bulk: `POST /api/learn/bulk` · status: `GET /api/learn/status`
- Webhook: `POST /api/ingest/webhook` JSON `{ category, title, body, … }` or `{ posts: […] }` → `202`
- Patterns extracted from lecture text land in **패턴** review queue (`pending` → approve/reject). Opinions stay draft until **코멘터리** approval.
- Guide: [`docs/chartdesk/fanding-learning-guide.md`](./docs/chartdesk/fanding-learning-guide.md)

Optional: `OPENAI_API_KEY` or `LLM_API_KEY` for richer pattern/opinion extract; heuristics work without keys.

### Easychart pattern overlay (Phase 1)

Spec: [`chartdesk-docs/EASYCHART_PATTERN_OVERLAY.md`](./chartdesk-docs/EASYCHART_PATTERN_OVERLAY.md).

Toolbar **EC** + **OB** / **FVG** / **Conf** / **TL** / **CH** / **Sweep** / **S/R** / **Fib** / **365** + preset **단타** (15m · 60m structure) / **스윙** (4h · D). Separate overlay canvas (not user drawings). Tests: `npm run test:easychart`.

## Data

JSON store at `data/store.json` (created on first boot from seed). Includes drawings, alerts, **price watches**, comments, news. Safe to delete to reset.

## Compliance

- No TradingView trademark/logo/widget embed
- No scraping of paid Fanding content — paste/export only
- Membership originals are not mirrored or proxied

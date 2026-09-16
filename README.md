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
cp .env.example .env.local   # optional — works with zero keys (mock data)
npm run dev -- -p 43127
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Environment

See `.env.example`. Without keys:

- Market data → deterministic mock candles
- LLM → rule-based symbol extract + opinion drafts

Optional: `MARKET_DATA_MODE=delayed` + vendor URL/key for free delayed quotes; `MARKET_DATA_MODE=realtime` for SSE ticks (`GET /api/market/sse?symbolId=&tf=`) and optional `MARKET_DATA_WS_URL`; `LLM_API_KEY` for draft enrichment.

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

Toolbar **EC** + **OB** / **FVG** / **Conf** + preset **단타** (15m · 60m structure) / **스윙** (4h · D). Separate overlay canvas (not user drawings). Tests: `npm run test:easychart`.

## Data

JSON store at `data/store.json` (created on first boot from seed). Includes drawings, alerts, **price watches**, comments, news. Safe to delete to reset.

## Compliance

- No TradingView trademark/logo/widget embed
- No scraping of paid Fanding content — paste/export only
- Membership originals are not mirrored or proxied

# ChartDesk

TradingView-like chart research workspace linked to **legally ingested** Fanding @easychart membership notes. Candles via `lightweight-charts`. Not affiliated with TradingView. **Not investment advice.**

## Features (Phase 0–3 slice)

- Dark chart workspace: symbol search (KR / US / crypto), timeframes, SMA/EMA/Bollinger, trend & horizontal drawings (persisted)
- Manual post ingest for 4 categories: 비밀 생존 전략 / 실시간 차트 분석 / 마인드셋 / 인사이트
- Opinion drafts (buy/sell/watch/unclear) with human approval queue; rule-based + optional LLM
- Pattern library (≥6 seeded), matcher, chart markers, feedback, alert center
- Multi-chart layouts (1 / 2 / 4), market-data adapter (`mock` | `delayed` | realtime-ready)

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

Optional: `MARKET_DATA_MODE=delayed` + vendor URL/key for free delayed quotes; `LLM_API_KEY` for draft enrichment.

## Data

JSON store at `data/store.json` (created on first boot from seed). Safe to delete to reset.

## Compliance

- No TradingView trademark/logo/widget embed
- No scraping of paid Fanding content — paste/export only
- Membership originals are not mirrored or proxied

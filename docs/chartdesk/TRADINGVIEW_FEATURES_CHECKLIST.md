# ChartDesk × TradingView — 구현 체크리스트  

정본: [`TRADINGVIEW_FEATURES.md`](./TRADINGVIEW_FEATURES.md)   
상태: `todo` / `doing` / `done` / `wont`  

Phase 1 완료 = 첨부 ChartDesk 스크린샷과 같은 셸.  

---  

## Phase 1 — 스크린샷 패리티  

| ID | 기능 | 상태 |  
|----|------|------|  
| `symbol.search` | 심볼 검색 (티커/한글명) | done |  
| `symbol.header` | NVDA 엔비디아 NASDAQ | done |  
| `symbol.recent` | 최근 탭 | done |  
| `symbol.compare` | 비교 | done |  
| `symbol.chips` | SPX500 SPY QQQ MAG7 SOX VNQ VNPA | done |  
| `chart.interval` | 1/5/15/60/240/1D | done |  
| `chart.type.candles` | 캔들 | done |  
| `chart.type.line` | 라인 | done |  
| `chart.type.heikin_ashi` | 하이킨 | done |  
| `chart.status_line` | OHLC + 등락% | done |  
| `chart.crosshair` | 크로스헤어 | done |  
| `chart.undo` | 실행취소/재실행 | done |  
| `scale.price` | 가격축 + 현재가 라벨/선 | done |  
| `scale.time` | 시간축 | done |  
| `data.session_status` | NYSE Closed (delayed) | done |  
| `chart.timezone` | New York (UTC-4) 등 | done |  
| `indicator.volume` | 볼륨 페인 | done |  
| `indicator.overlay` | MA 오버레이 | done |  
| `draw.trendline` | 추세선 | done |  
| `draw.horizontal_line` | 수평선 | done |  
| `draw.horizontal_ray` | 수평 레이 | done |  
| `draw.fib.retracement` | 피보 되돌림 | done |  
| `draw.rectangle` | 사각형 | done |  
| `draw.text` | 텍스트 | done |  
| `draw.measure` | 측정 | done |  
| `draw.magnet.weak` | 자석 | done |  
| `draw.lock_all` | 잠금 | done |  
| `draw.object_tree` | 드로잉 탭 / 오브젝트 없음 | done |  
| `draw.scope.symbol` | 드로잉 - {TICKER} | done |  
| `watchlist` | 워치리스트 탭 | done |  
| `alert.price` | 가격 알림 | done |  
| `alert.price.greater_than` | 이상 | done |  
| `alert.price.less_than` | 이하 | done |  
| `alert.price.crossing` | 돌파 | done |  
| `alert.message` | 노트 남김 | done |  
| `layout.save` | 레이아웃 저장 | done |  
| `chart.settings` | 설정 (최소: 색, 그리드) | done |  
| `shell.brand` | ChartDesk 셸 / 탭 순서 | done |  

탭 순서 고정: 워치리스트 · 뉴스 · 최근 · 패턴 · 포스트 · 알림 · 코멘터리  

---  

## Phase 2 — 매일 쓰는 분석  

| ID | 기능 | 상태 |  
|----|------|------|  
| `indicator.dialog` | 지표 검색 `/` | done |  
| `indicator.template` | 지표 템플릿 | done |  
| `chart.type.bars` | 바 | done |  
| `chart.type.hollow_candles` | 중공 캔들 | done |  
| `chart.type.area` | 에어리어 | done |  
| `chart.type.baseline` | 베이스라인 | done |  
| `chart.interval.full` | 전체 인터벌 + 커스텀 | done |  
| `chart.interval.custom` | 7분 등 리샘플 | done |  
| `chart.range_preset` | 1D/5D/1M/1Y/All | done |  
| `chart.goto` | 날짜 이동 | done |  
| `chart.date_format` | mm/dd/yyyy | done |  
| `chart.extended_hours` | 프리/애프터 | done |  
| `chart.snapshot` | 스냅샷 | done |  
| `chart.canvas` | 배경/그리드/워터마크 | done |  
| `scale.log` | 로그축 | done |  
| `scale.percent` | %축 | done |  
| `scale.indexed_100` | Indexed 100 | done |  
| `scale.countdown` | 봉 마감 카운트다운 | done |  
| `layout.grid` | 2~4분할 | done |  
| `layout.sync.symbol` | 심볼 동기 | done |  
| `layout.sync.interval` | 인터벌 동기 | done |  
| `layout.sync.crosshair` | 크로스헤어 동기 | done |  
| `layout.sync.drawings` | 드로잉 동기 | done |  
| `draw.ray` | 레이 | done |  
| `draw.extended_line` | 연장선 | done |  
| `draw.parallel_channel` | 평행 채널 | done |  
| `draw.vertical_line` | 수직선 | done |  
| `draw.long_position` | 롱 포지션 | done |  
| `draw.short_position` | 숏 포지션 | done |  
| `draw.vp.fixed_range` | 고정 VP | done |  
| `draw.anchored_vwap` | 앵커 VWAP | done |  
| `draw.favorites` | 즐겨찾는 도구 | done |  
| `draw.stay_in_mode` | 연속 그리기 | done |  
| `draw.sync.layout` | 레이아웃 동기 | done |  
| `alert.technical.drawing` | 선 알림 | done |  
| `alert.technical.indicator` | 지표 알림 | done |  
| `alert.webhook` | 웹훅 | done |  
| `news` | 뉴스 탭 | done |  
| `pattern.candlestick` | 캔들 패턴 | done |  
| `pattern.auto_chart` | 자동 차트 패턴 | done |  
| `note` | 코멘터리 | done |  
| `calendar.eco` | 경제 캘린더 | done |  
| `calendar.earnings` | 실적 캘린더 | done |  
| `events.earnings` | 실적 마커 | done |  
| `events.dividends` | 배당 마커 | done |  
| `events.splits` | 분할 마커 | done |  
| `events.news` | 뉴스 마커 | done |  
| `replay` | 바 리플레이 | done |  
| `shell.command_palette` | 빠른 검색 | done |  

내장 지표 전수는 정본 §7.2. 최소 즐겨찾기:  

| ID | 상태 |  
|----|------|  
| SMA / EMA / WMA | done |  
| EMA 20/50/200 템플릿 | done |  
| Bollinger Bands | done |  
| Ichimoku | done |  
| SuperTrend | done |  
| VWAP | done |  
| RSI | done |  
| MACD | done |  
| Stochastic | done |  
| ATR | done |  
| Volume | done |  

---  

## Phase 3 — 파워  

| ID | 기능 | 상태 |  
|----|------|------|  
| `chart.type.renko` | 렌코 | done |  
| `chart.type.kagi` | 카기 | done |  
| `chart.type.line_break` | 라인브레이크 | done |  
| `chart.type.point_figure` | 점숫자 | done |  
| `chart.type.range` | 레인지 | done |  
| `chart.type.volume_candles` | 볼륨 캔들 | done |  
| `draw.pitchfork` | 피치포크 패밀리 | done |  
| `draw.fib.*` | 피보 나머지 | done |  
| `draw.gann.*` | 간 | done |  
| `draw.pattern.*` | 하모닉/엘리엇 | done |  
| `draw.brush` | 브러시 | done |  
| `screener.stock` | 주식 스크리너 | done |  
| `heatmap` | 히트맵 | done |  
| `alert.watchlist` | 워치 일괄 알림 | done |  
| `alert.multi_condition` | 멀티조건 | done |  
| `trade.paper` | 페이퍼 | done |  
| `social.posts` | 포스트 | done |  
| `social.publish` | 게시 | done |  
| `fund.graphs` | 펀더멘털 그래프 | done |  
| `portfolio` | 포트폴리오 | done |  
| `indicator.on_indicator` | 지표 위 지표 | done |  
| `chart.seasonals` | 시즈널 | done |  
| JS 커스텀 지표 | | done |  

---  

## Phase 4 — 플랫폼 (차트 코어와 분리)  

| ID | 기능 | 상태 |  
|----|------|------|  
| Pine 런타임 | 없음. 약속 금지 | wont (1.x) |  
| `screener.pine` | Pine 스크리너 | wont — Pine 런타임 필요 (1.x 범위 밖, 가짜 Pine 실행기 없음) |  
| `chart.type.volume_footprint` | 풋프린트 | done |  
| `chart.type.tpo` | TPO | done |  
| `options.*` | 옵션 | done |  
| `yield_curves` | 금리곡선 | done |  
| `macro.maps` | 매크로맵 | done |  
| `trade.broker` | 브로커 | done |  
| `dom` | 호가창 | done |  
| `chart.interval.tick` | 틱봉 | done |  

---  

## Hardening notes (post Phase 4)

| Area | Status |  
|------|--------|  
| Alerts auto-fire on bar/mock ticks + webhook retries | done |  
| `POST /api/alerts/evaluate` `scope:"pending"` (watchlist multi-symbol) | done |  
| Realtime SSE / WS stub / poll + mock fallback | done |  
| Fanding file-drop + ingest webhook (no scrape) | done |  
| Extended hours bars + Pre/Post markers | done |  
| Bar replay play/scrub | done |  
| DOM imbalance · FP delta/POC · TPO POC/VA | done |  
| Snapshot composites drawings | done |  
| Pine / `screener.pine` | wont |  

### Fanding original-text learning

| Area | Status |
|------|--------|
| Category ingest + bulk multi-file/JSON | done |
| PatternDef extract (heuristic + LLM) + `source_post_ids` | done |
| Pattern review queue (pending → approve/reject) | done |
| Richer opinion drafts + approval | done |
| Learning status UI | done |
| No scrape / Pine wont | done |

---  

## 라벨 스모크 (한국어)  

- [x] 워치리스트 뉴스 최근 패턴 포스트 알림 코멘터리  
- [x] 드로잉 - NVDA / 오브젝트 없음  
- [x] 가격 알림 - NVDA / 이상 / 가격 / 노트 남김  
- [x] 일봉 캔들 라인 하이킨 비교  

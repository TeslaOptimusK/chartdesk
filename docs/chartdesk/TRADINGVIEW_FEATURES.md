# TradingView 기능 전수 조사 — ChartDesk 구현 스펙  
  
> Cursor / ChartDesk 개발용.   
> 조사일: 2026-09-15   
> 기준: TradingView Supercharts (tradingview.com) + Advanced Charts / Trading Platform 라이브러리 문서.   
> 목적: ChartDesk가 트레이딩뷰급 차트 워크벤치를 만들 때 **무엇을 만들고, 무엇을 나중에 둘지**를 한 파일에서 결정한다.  
  
---  
  
## 0. 이 문서를 쓰는 법  
  
| 읽는 사람 | 볼 곳 |  
|-----------|--------|  
| 프로덕트 / 기획 | §1 스크린샷 매핑, §2 IA, §16 페이즈 |  
| 프론트 (차트 UI) | §3\~§9, §13 단축키, §14 설정 |  
| 백엔드 / 데이터 | §15 데이터 계약 |  
| 지표 / 스크립트 | §7 지표, §11 Pine |  
| QA | 각 섹션 **인수 기준**, §16 체크리스트 |  
  
기능 ID는 코드·이슈·테스트에 그대로 쓴다. 예: `chart.interval`, `draw.fib.retracement`, `alert.price.crossing_up`.  
  
우선순위:  
  
| 등급 | 의미 |  
|------|------|  
| **P0** | ChartDesk 스크린샷에 이미 있거나, 없으면 차트가 아닌 화면 |  
| **P1** | 트레이딩뷰를 켠 사용자가 첫 주에 찾는 것 |  
| **P2** | 파워유저 / 유료 플랜급 |  
| **P3** | 소셜·브로커·옵션·매크로 등 플랫폼 확장. 차트 코어와 분리 |  
  
라이브러리 전제 (구현 전에 확정):  
  
- TradingView **Advanced Charts** (무료, 자체 호스팅, 자체 datafeed) → 차트/드로잉/지표 대부분 P0\~P1을 라이브러리가 제공. **Pine Script는 라이브러리에 없음.**  
- **Trading Platform** (유료 라이선스) → 워치리스트, 주문, DOM, Renko/Kagi 등.  
- **자체 구현** (lightweight-charts + 커스텀 UI) → ChartDesk 브랜딩은 쉽지만 드로잉 110종·오브젝트 트리를 전부 다시 짜야 함.  
  
ChartDesk 스크린샷은 **커스텀 셸 + 차트 엔진** 형태다. 이 문서는 엔진이 무엇이든 **기능 계약**을 적는다.  
  
---  
  
## 1. ChartDesk 스크린샷 ↔ TradingView 매핑  
  
첨부 UI는 NVDA 일봉 Supercharts를 한국어로 재배치한 화면이다. 위(드로잉 탭) / 아래(알림 탭) 두 상태.  
  
### 1.1 상단 툴바 (확인된 컨트롤)  
  
| ChartDesk UI | TV 원본 | Feature ID | P |  
|--------------|---------|------------|---|  
| ChartDesk 로고 / 차트 아이콘 | Supercharts 홈 | `shell.brand` | P0 |  
| 검색 `NVDA 엔비디아` | Symbol search | `symbol.search` | P0 |  
| 1분 / 5분 / 15분 / 1시간 / 4시간 / **일봉** | Interval | `chart.interval` | P0 |  
| 캔들 / 라인 / 하이킨 | Chart type | `chart.type` | P0 |  
| SPX500 SPY QQQ MAG7 SOX / VNQ VNPA 칩 | 비교·벤치마크 심볼 핀 | `symbol.compare`, `symbol.chips` | P0 |  
| 펜·텍스트·측정·화살표 등 | 좌측 드로잉 툴바를 상단으로 옮김 | `draw.*` | P0 |  
| 레이아웃 / 공유 / 설정 | Layout, Snapshot, Settings | `layout.*`, `chart.snapshot`, `chart.settings` | P0 |  
| 포스트 인베스트 | Ideas / Publish | `social.publish` | P2 |  
  
### 1.2 차트 헤더·범례  
  
| ChartDesk UI | TV | ID | P |  
|--------------|----|----|---|  
| `NVDA 엔비디아 NASDAQ` | 심볼 + 거래소 | `symbol.header` | P0 |  
| OHLC + 등락률 (`O 122.85 H 122.89 L 121.89 C 122.48 +1.613%`) | Status line | `chart.status_line` | P0 |  
| 비교 | Compare | `symbol.compare` | P0 |  
| `mm/dd/yyyy` | 날짜 포맷 | `chart.date_format` | P1 |  
| 노란/파란/분홍 오버레이선 | MA 등 overlay indicator | `indicator.overlay` | P0 |  
| 하단 녹/적 막대 | Volume pane | `indicator.volume` | P0 |  
| 우측 가격축 + 현재가 라벨 `122.48` | Price scale + last price | `scale.price` | P0 |  
| 점선 수평 현재가선 | Last price line | `scale.last_price_line` | P0 |  
| 크로스헤어 | Crosshair | `chart.crosshair` | P0 |  
| 차트 좌하단 TV 워터마크 | Branding | `chart.watermark` | P3 (라이선스에 따름) |  
  
### 1.3 우측 패널 탭 (스크린샷 핵심)  
  
ChartDesk는 TV 우측 툴바를 **탭 시트**로 붙였다.  
  
| 탭 | TV 대응 | ID | P | 스크린샷 상태 |  
|----|---------|----|---|----------------|  
| 워치리스트 | Watchlist | `watchlist` | P0 | 탭만 보임 |  
| 뉴스 | News / News Flow | `news` | P1 | 탭만 |  
| 최근 | Recently viewed | `symbol.recent` | P0 | 탭만 |  
| 패턴 | Auto chart patterns / candlestick patterns | `pattern` | P1 | 탭만 |  
| 포스트 | Ideas / Community | `social.posts` | P2 | 탭만 |  
| **알림** | Alerts | `alert` | P0 | 가격 알림 UI 구현됨 |  
| 코멘터리 | Notes / Comments | `note` | P1 | 댓글 한 줄 보임 |  
  
### 1.4 드로잉 패널 (위 스크린샷)  
  
- 제목: `드로잉 - NVDA` → 드로잉은 **심볼 스코프** (`draw.scope.symbol`).  
- `오브젝트 없음` → 오브젝트 트리 빈 상태 (`draw.object_tree`).  
- TV의 Object tree + Data window를 이 탭에 합친 것으로 본다.  
  
### 1.5 알림 패널 (아래 스크린샷)  
  
- 제목: `가격 알림 - NVDA`  
- 조건: `이상` + `가격` 드롭다운 → `alert.price.greater_than` (TV: Greater than)  
- 벨 아이콘으로 생성  
- `노트 남김` → 알림에 메모 (`alert.message`)  
- 예시 코멘트: `김수내기 의견` / `BTCUSDT 호수 조정이 모두 반해 있습니다.` / `9/12/2026 6:56:00 AM`   
→ 알림 탭과 코멘터리가 같은 타임라인에 섞여 보일 수 있음. **알림 히스토리 ≠ 사용자 노트**. 데이터 모델을 분리할 것.  
  
### 1.6 푸터  
  
- `NYSE Closed (delayed)` → 세션/지연시세 배지 `data.session_status`  
- `New York (UTC-4)` → 타임존 `chart.timezone`  
- `Go to` 날짜 점프는 TV 하단 Go to와 대응 `chart.goto`  
  
구현 시 한국어 라벨은 이 스크린샷을 **정본**으로 둔다. TV 영어명은 코드 ID로만 쓴다.  
  
---  
  
## 2. 정보 구조 (IA)  
  
TradingView Supercharts는 4영역이다. ChartDesk는 좌측 드로잉을 상단으로 옮기고 우측을 탭으로 고정했다.  
  
```  
┌─────────────────────────────────────────────────────────────┐  
│ TOP 심볼검색 인터벌 차트타입 비교칩 지표 알림 리플레이 │  
│ 실행취소 레이아웃 검색 설정 스냅샷 거래 게시 │  
├──┬──────────────────────────────────────────────┬───────────┤  
│L │ │ R 탭 │  
│ │ CHART CANVAS │ 워치 │  
│드│ 범례(OHLC) 오버레이 지표 │ 뉴스 │  
│로│ 메인 페인 │ 최근 │  
│잉│ 인디케이터 페인(RSI 등) │ 패턴 │  
│ │ 볼륨 페인 │ 포스트 │  
│유│ 가격축 → │ 알림 │  
│틸│ │ 코멘트 │  
│ │ 시간축 ↓ │ 오브젝트 │  
├──┴──────────────────────────────────────────────┴───────────┤  
│ BOTTOM 프리셋범위(1D/5D/1M/1Y/All) Go to 타임존 눈금설정 │  
└─────────────────────────────────────────────────────────────┘  
```  
  
ChartDesk 권장: **L 툴바는 접을 수 있게** 두고, 자주 쓰는 도구만 상단 아이콘으로 핀 (`draw.favorites`).  
  
---  
  
## 3. 심볼·검색·비교  
  
### 3.1 심볼 검색 `symbol.search` P0  
  
- 입력 시작 또는 티커 클릭으로 모달.  
- 결과 필드: ticker, 한글명, 거래소, 자산군(주식/ETF/지수/선물/FX/크립토).  
- 필터 탭: 전체 / 주식 / ETF / 지수 / 선물 / FX / 크립토.  
- 동일 티커 다중 거래소 (NVDA NASDAQ vs NVDA 다른 벤더) 구분. **거래소가 다르면 차트도 다르다.**  
- 최근 검색 `symbol.recent` P0, 즐겨찾기 `symbol.favorite` P1.  
- 스프레드/수식 심볼 `symbol.spread` P2 — 예: `NVDA - AMD`, `AAPL/SPX`.  
- 명령 팔레트 `shell.command_palette` P1 — TV Quick Search. 심볼뿐 아니라 지표·드로잉·설정 검색.  
  
인수 기준:  
  
- `NVDA` / `엔비디아` / `nvidia` 모두 같은 심볼로 연결.  
- 엔터 시 현재 차트 심볼만 바꾸고 드로잉은 심볼 스코프 규칙을 따른다 (§6.8).  
  
### 3.2 헤더 `symbol.header` P0  
  
표시: 로고(옵션), 티커, 한글명, 거래소, (옵션) 기술등급.  
  
### 3.3 비교 `symbol.compare` P0  
  
- 같은 페인에 두 번째 시리즈 오버레이.  
- 기본은 **새 가격축** 또는 **Indexed to 100** (§8). 스케일 단위가 다른 종목(NVDA vs MAG7 지수)은 축을 분리.  
- 비교 시리즈에도 독립 색·타입(라인 권장).  
- 비교 심볼 추가는 상단 칩(SPX500, SPY, QQQ, MAG7, SOX…)으로 원클릭.  
  
### 3.4 심볼 칩 `symbol.chips` P0  
  
스크린샷의 SPX500 / SPY / QQQ / MAG7 / SOX / VNQ / VNPA.  
  
- 클릭: 메인 심볼 교체 **또는** 비교 토글. 제품에서 한 가지로 고정할 것 (권장: **비교 토글**, 메인 교체는 검색).  
- 칩 세트는 사용자 커스텀 P1.  
  
---  
  
## 4. 인터벌 (타임프레임)  
  
### 4.1 기본 인터벌 `chart.interval` P0  
  
ChartDesk 스크린샷 고정 버튼:  
  
| UI | 코드 | 바 길이 |  
|----|------|---------|  
| 1분 | `1` | 1 minute |  
| 5분 | `5` | 5 minutes |  
| 15분 | `15` | 15 minutes |  
| 1시간 | `60` | 60 minutes |  
| 4시간 | `240` | 240 minutes |  
| 일봉 | `1D` | 1 day |  
  
### 4.2 TV 전체 인터벌 세트 `chart.interval.full` P1  
  
시간 기반:  
  
- 초: `1S 5S 10S 15S 30S` (유료 TV, 초 데이터 필요) P2  
- 분: `1 2 3 5 10 15 30 45`  
- 시간: `1H 2H 3H 4H`  
- 일: `1D 2D 3D`  
- 주: `1W`  
- 월: `1M 3M 6M 12M`  
  
가격 기반 (차트 타입과 묶임) P2:  
  
- Range bars (`chart.type.range`)  
- Renko / Kagi / Line Break / Point & Figure 의 box/reversal 크기  
  
틱 `chart.interval.tick` P3.  
  
커스텀 인터벌 `chart.interval.custom` P1 — 예: 7분, 90분. datafeed가 1분봉을 주면 클라이언트가 리샘플.  
  
### 4.3 하단 프리셋 범위 `chart.range_preset` P1  
  
TV 하단: 화면을 채우는 기간. 인터벌과 별개.  
  
- 1D / 5D / 1M / 3M / 6M / YTD / 1Y / 5Y / All  
- `Go to` 날짜 `chart.goto` P1  
- 커스텀 범위  
  
인수: 일봉에서 `1Y`를 누르면 약 252 거래일이 화면에 맞는다. 인터벌은 그대로 일봉.  
  
---  
  
## 5. 차트 타입  
  
TV Supercharts **21종**. ChartDesk 스크린샷은 캔들 / 라인 / 하이킨.  
  
### 5.1 시간 기반 — 클래식 P0\~P1  
  
| ID | 이름 | P | 비고 |  
|----|------|---|------|  
| `chart.type.candles` | 캔들 | P0 | OHLC 본체+심지. 상승/하락 색 |  
| `chart.type.hollow_candles` | 중공 캔들 | P1 | 시가 대비 종가로 채움/비움 |  
| `chart.type.bars` | 바 (OHLC) | P1 | |  
| `chart.type.heikin_ashi` | 하이킨아시 | P0 | 스크린샷. 스무딩 OHLC |  
| `chart.type.line` | 라인 | P0 | 보통 Close. 소스 선택(OHLC) P1 |  
| `chart.type.line_markers` | 마커 라인 | P2 | |  
| `chart.type.step_line` | 스텝 라인 | P2 | |  
| `chart.type.area` | 에어리어 | P1 | |  
| `chart.type.hlc_area` | HLC 에어리어 | P2 | Open 무시 |  
| `chart.type.baseline` | 베이스라인 | P1 | 기준가 위/아래 색 |  
| `chart.type.high_low` | 고저 | P2 | |  
| `chart.type.columns` | 컬럼 | P2 | 경제지표·펀더멘털에 자주 |  
  
### 5.2 가격 기반 P2 (노이즈 제거, 시간축 비선형)  
  
| ID | 이름 | 핵심 파라미터 |  
|----|------|----------------|  
| `chart.type.renko` | 렌코 | box size |  
| `chart.type.line_break` | 라인브레이크 | 라인 수 |  
| `chart.type.kagi` | 카기 | reversal % |  
| `chart.type.point_figure` | 점숫자 | box, reversal |  
| `chart.type.range` | 레인지 | range size |  
  
Advanced Charts 무료 라이브러리는 Renko/Kagi/P\&F/Line Break를 **Trading Platform에서만** 제공한다. 자체 구현 시 이 5종은 별도 스프린트.  
  
### 5.3 인디케이터 내장 차트 P2 (오더플로)  
  
| ID | 이름 | 데이터 요구 |  
|----|------|-------------|  
| `chart.type.volume_footprint` | 볼륨 풋프린트 | 가격대별 매수/매도 볼륨 |  
| `chart.type.volume_candles` | 볼륨 캔들 | 캔들 폭=거래량 |  
| `chart.type.tpo` | Time Price Opportunity (마켓프로파일) | TPO 문자/블록 |  
| `chart.type.svp` | Session Volume Profile 차트 | 세션 VP |  
  
일반 일봉 OHLCV만 있으면 **구현 불가**. 틱/풋프린트 피드가 있을 때만 P2로 연다.  
  
### 5.4 차트 타입 전환 규칙  
  
- 타입을 바꿔도 **드로잉·오버레이 지표는 유지**가 기본. 가격기반 타입은 시간 좌표가 달라져 드로잉이 어긋날 수 있음 → 경고 또는 숨김.  
- Heikin Ashi는 계산 OHLC라 실제 체결가와 다르다. 상태줄에 `HA` 배지.  
  
---  
  
## 6. 드로잉 도구 (110+)  
  
TV 좌측 툴바 8카테고리 + 유틸. ChartDesk는 상단 아이콘 + 우측 `드로잉` 탭.  
  
공통 동작 (모든 도구) `draw.common` P0:  
  
- 클릭-드래그로 생성, 핸들로 수정, Delete 삭제, Ctrl+Z 실행취소  
- 스타일: 색, 두께, 선종류(실선/점선), 투명도, 폰트  
- 플로팅 툴바: 스타일 / 템플릿 / 잠금 / 숨김 / 알림 / 삭제  
- 인디케이터 페인에도 그릴 수 있음 (RSI 다이버전스)  
- 자석: 약 `draw.magnet.weak` / 강 `draw.magnet.strong` (OHLC에 스냅)  
- 연속 그리기 `draw.stay_in_mode`  
- 전체 잠금 `draw.lock_all`  
- 숨김: 드로잉만 / 지표만 / 전부 `draw.hide_*`  
- 즐겨찾기 핀 `draw.favorites`  
  
### 6.1 커서 `draw.cursor` P0  
  
| ID | 이름 |  
|----|------|  
| `draw.cursor.cross` | 십자 (기본) |  
| `draw.cursor.dot` | 점 |  
| `draw.cursor.arrow` | 화살표 |  
| `draw.cursor.eraser` | 지우개 — 클릭한 오브젝트 삭제 |  
| `draw.cursor.demo` | 발표용 (P2) |  
| `draw.cursor.magic` | 연출용 (P3) |  
  
### 6.2 추세·라인 `draw.trend` — P0 필수 굵게  
  
| ID | 이름 | P |  
|----|------|---|  
| **`draw.trendline`** | 추세선 | **P0** |  
| `draw.arrow` | 화살선 | P1 |  
| `draw.ray` | 레이 (한쪽으로 무한) | P1 |  
| `draw.extended_line` | 연장선 (양방향 무한) | P1 |  
| `draw.info_line` | 정보선 (각도·거리 표시) | P1 |  
| `draw.trend_angle` | 추세 각도 | P2 |  
| **`draw.horizontal_line`** | 수평선 | **P0** |  
| **`draw.horizontal_ray`** | 수평 레이 | **P0** |  
| `draw.vertical_line` | 수직선 | P1 |  
| `draw.crossline` | 십자선 오브젝트 | P2 |  
| **`draw.parallel_channel`** | 평행 채널 | **P1** |  
| `draw.regression_trend` | 회귀 채널 | P2 |  
| `draw.flat_top_bottom` | 플랫 탑/바텀 채널 | P2 |  
| `draw.disjoint_channel` | 어긋난 채널 | P2 |  
| `draw.anchored_vwap` | 앵커 VWAP (드로잉) | P1 |  
  
피치포크:  
  
| ID | 이름 | P |  
|----|------|---|  
| `draw.pitchfork` | 앤드류스 피치포크 | P2 |  
| `draw.pitchfork.schiff` | Schiff | P2 |  
| `draw.pitchfork.modified_schiff` | Modified Schiff | P2 |  
| `draw.pitchfork.inside` | Inside | P2 |  
  
### 6.3 피보나치·간 `draw.fib` / `draw.gann`  
  
| ID | 이름 | P |  
|----|------|---|  
| **`draw.fib.retracement`** | 피보 되돌림 | **P0** |  
| `draw.fib.trend_extension` | 추세 기반 확장 | P1 |  
| `draw.fib.channel` | 피보 채널 | P2 |  
| `draw.fib.timezone` | 피보 시간대 | P2 |  
| `draw.fib.speed_fan` | 속도저항 팬 | P2 |  
| `draw.fib.trend_time` | 추세 기반 시간 | P2 |  
| `draw.fib.circles` | 피보 원 | P2 |  
| `draw.fib.spiral` | 피보 나선 | P3 |  
| `draw.fib.arcs` | 속도저항 호 | P2 |  
| `draw.fib.wedge` | 피보 웨지 | P2 |  
| `draw.pitchfan` | 피치팬 | P2 |  
| `draw.gann.box` | 간 박스 | P2 |  
| `draw.gann.square` | 간 스퀘어 | P2 |  
| `draw.gann.square_fixed` | 간 스퀘어 고정 | P2 |  
| `draw.gann.fan` | 간 팬 | P2 |  
  
피보 되돌림 기본 레벨: `0 0.236 0.382 0.5 0.618 0.786 1` + 확장 `1.272 1.618 2.618`. 레벨 on/off, 가격/퍼센트 라벨.  
  
자동 피보 `indicator.auto_fib` P2 — 스윙을 잡아 되돌림을 그림 (드로잉이 아니라 지표).  
  
### 6.4 패턴 `draw.pattern`  
  
| ID | 이름 | P |  
|----|------|---|  
| `draw.pattern.xabcd` | XABCD (하모닉) | P2 |  
| `draw.pattern.cypher` | Cypher | P2 |  
| `draw.pattern.abcd` | ABCD | P2 |  
| `draw.pattern.triangle` | 삼각형 | P2 |  
| `draw.pattern.three_drives` | Three drives | P2 |  
| `draw.pattern.head_shoulders` | 헤드앤숄더 | P1 |  
| `draw.elliott.impulse` | 엘리엇 충격 12345 | P2 |  
| `draw.elliott.correction` | 엘리엇 조정 ABC | P2 |  
| `draw.elliott.triangle` | 엘리엇 삼각 ABCDE | P2 |  
| `draw.elliott.double` | WXY | P2 |  
| `draw.elliott.triple` | WXYXZ | P2 |  
| `draw.cyclic_lines` | 사이클 라인 | P2 |  
| `draw.time_cycles` | 타임 사이클 | P2 |  
| `draw.sine_line` | 사인 라인 | P3 |  
  
자동 차트 패턴 `pattern.auto_chart` P1 — 헤드앤숄더, 이중천장 등을 엔진이 표시. ChartDesk `패턴` 탭과 연결.  
  
캔들 패턴 인식 `pattern.candlestick` P1 — 도지, 엔걸핑, 해머 등 마커.  
  
### 6.5 예측·측정 `draw.measure`  
  
| ID | 이름 | P |  
|----|------|---|  
| **`draw.long_position`** | 롱 포지션 (진입/손절/익절 박스) | **P1** |  
| **`draw.short_position`** | 숏 포지션 | **P1** |  
| `draw.position_forecast` | 포지션 예측 | P2 |  
| `draw.date_range` | 날짜 범위 | P1 |  
| `draw.price_range` | 가격 범위 | P1 |  
| `draw.date_price_range` | 날짜+가격 범위 | P1 |  
| `draw.bars_pattern` | 바 패턴 복사 | P2 |  
| `draw.ghost_feed` | 고스트 피드 (가상 미래봉) | P2 |  
| `draw.sector` | 섹터(부채꼴) | P2 |  
| `draw.vp.fixed_range` | 고정구간 볼륨프로파일 (드로잉) | P1 |  
| `draw.vp.anchored` | 앵커 볼륨프로파일 | P1 |  
| **`draw.measure`** | 측정 (Shift+클릭) 바수·%·가격 | **P0** |  
  
롱/숏 도구: 리스크 대비 보상 비율, 금액/틱/% 표시. 페이퍼 매매와 별개 (차트 위 계산기).  
  
### 6.6 도형 `draw.shape`  
  
| ID | 이름 | P |  
|----|------|---|  
| `draw.brush` | 브러시 | P1 |  
| `draw.highlighter` | 하이라이터 | P1 |  
| **`draw.rectangle`** | 사각형 | **P0** |  
| `draw.rotated_rectangle` | 회전 사각형 | P2 |  
| `draw.circle` | 원 | P1 |  
| `draw.ellipse` | 타원 | P1 |  
| `draw.path` | 패스 | P2 |  
| `draw.curve` | 곡선 | P2 |  
| `draw.double_curve` | 이중 곡선 | P2 |  
| `draw.polyline` | 폴리라인 | P1 |  
| `draw.triangle` | 삼각형 | P1 |  
| `draw.arc` | 호 | P2 |  
  
### 6.7 주석 `draw.anno` — ChartDesk 코멘터리와 연결  
  
| ID | 이름 | P |  
|----|------|---|  
| **`draw.text`** | 텍스트 | **P0** |  
| `draw.note` | 노트 (접힘) | P1 |  
| `draw.note.anchored` | 앵커 노트 (스크롤에 고정) | P1 |  
| `draw.signpost` | 이정표 | P2 |  
| `draw.callout` | 콜아웃 | P1 |  
| `draw.comment` | 코멘트 | P1 |  
| `draw.price_label` | 가격 라벨 | P1 |  
| `draw.price_note` | 가격 노트 | P1 |  
| `draw.table` | 테이블 | P2 |  
| `draw.pin` | 핀 | P2 |  
| `draw.flag` | 깃발 | P1 |  
| `draw.arrow_mark.{up,down,left,right}` | 화살 마크 | P1 |  
| `draw.arrow_marker` | 화살 마커 | P1 |  
| `draw.image` | 이미지 첨부 | P2 |  
| `draw.icon` / `draw.sticker` / `draw.emoji` | 아이콘·스티커 | P2 |  
  
### 6.8 저장·동기화 규칙 (버그 온상)  
  
TV 규칙 — ChartDesk도 동일하게 박제:  
  
| 모드 | 동작 |  
|------|------|  
| `draw.sync.off` | 이 차트, 이 레이아웃에만 저장 |  
| `draw.sync.layout` | 같은 레이아웃의 같은 심볼 모든 차트에 복제 |  
| `draw.sync.global` | 모든 레이아웃의 그 심볼에 복제 |  
  
- 워치리스트·알림은 레이아웃에 **넣지 않는다**.  
- 심볼을 바꾸면 그 심볼의 드로잉이 로드된다 (`draw.scope.symbol`). 스크린샷 `드로잉 - NVDA`가 이 모델.  
- 지표 템플릿을 덮어씌우면 인디케이터 페인 드로잉이 날아갈 수 있음 → Undo로만 복구. UI에 경고.  
  
오브젝트 트리 `draw.object_tree` P0:  
  
- 목록: 드로잉 / 지표 계층  
- 눈 아이콘 숨김, 잠금, 선택 시 차트 포커스  
- 빈 상태 카피: `오브젝트 없음`  
  
---  
  
## 7. 지표·전략  
  
TV Supercharts: 내장 **400+**, 커뮤니티 **100,000+**.   
Advanced Charts 라이브러리 내장: 아래 **약 100종** (Pine 없이 구현 가능).  
  
### 7.1 지표 다이얼로그 `indicator.dialog` P0  
  
- 단축키 `/`  
- 섹션: 즐겨찾기 / 내 스크립트 / 내장 Technicals / 커뮤니티(P2) / 스토어(P3)  
- 검색, 차트에 추가, 오버레이 vs 새 페인 자동 판단  
- 인스턴스 설정: 기간, 소스(close/ohlc4…), 색, 표시 타임프레임(MTF) P1  
- 지표 위 지표 `indicator.on_indicator` P2 (예: RSI의 SMA)  
- 템플릿 `indicator.template` P1 — 세트 저장/적용. 심볼·인터벌 기억 옵션  
- 차트당 개수 제한은 플랜이 아니라 **성능 쿼터**로 (권장 기본 10, 하드캡 50)  
  
### 7.2 라이브러리 내장 지표 전수 (구현 체크리스트)  
  
**추세 / 이동평균**  
  
- Moving Average (SMA)  
- Moving Average Exponential (EMA)  
- Moving Average Weighted (WMA)  
- Moving Average Smoothed  
- Moving Average Double / Triple / Adaptive / Hamming / Multiple  
- Double EMA / Triple EMA (TEMA)  
- Hull MA / Arnaud Legoux MA / Least Squares MA / McGinley Dynamic  
- MA Cross / EMA Cross / MA with EMA Cross  
- Moving Average Channel / Envelopes  
- Guppy Multiple Moving Average  
- SuperTrend  
- Parabolic SAR  
- Ichimoku Cloud  
- Linear Regression Curve / Slope  
- Zig Zag  
- Aroon / Average Directional Index (ADX) / Directional Movement (DMI)  
- Vortex / Trend Strength Index / Chop Zone / Choppiness Index  
  
**모멘텀**  
  
- Relative Strength Index (RSI)  
- Stochastic / Stochastic RSI  
- MACD  
- Commodity Channel Index (CCI)  
- Momentum / Rate Of Change (ROC)  
- Williams %R  
- Ultimate Oscillator  
- True Strength Indicator (TSI)  
- TRIX / Know Sure Thing / Coppock Curve  
- Connors RSI / Relative Vigor Index / Relative Volatility Index  
- Awesome Oscillator / Accelerator Oscillator  
- Chande Momentum Oscillator / Fisher Transform  
- SMI Ergodic / Price Oscillator / Balance of Power  
- Rank Correlation Index  
  
**변동성**  
  
- Bollinger Bands / %B / Width  
- Average True Range (ATR)  
- Keltner Channels  
- Donchian Channels  
- Standard Deviation / Historical Volatility  
- Chaikin Volatility  
- Volatility Close-to-Close / Zero Trend / O-H-L-C / Index  
- Standard Error / Standard Error Bands  
- Chande Kroll Stop / Ulcer Index (전략 계열과 겹침)  
  
**거래량**  
  
- **Volume** (P0, 스크린샷)  
- VWAP / VWMA  
- On Balance Volume (OBV)  
- Money Flow Index (MFI)  
- Chaikin Money Flow / Chaikin Oscillator  
- Accumulation/Distribution  
- Price Volume Trend  
- Net Volume / Volume Oscillator / Elder's Force Index  
- Ease of Movement / Klinger Oscillator  
- Volume Profile Fixed Range  
- Volume Profile Visible Range  
- 52 Week High/Low  
  
**기타**  
  
- Pivot Points Standard  
- Price Channel  
- Average Price / Median Price / Typical Price  
- Williams Alligator / Williams Fractal  
- Majority Rule / Spread / Ratio  
- Advance/Decline  
- Correlation Coefficient / Correlation-Log  
- Accumulative Swing Index / Mass Index  
- Detrended Price Oscillator  
  
### 7.3 Supercharts에만 있는 지표 (라이브러리 외) P2  
  
Pine 또는 전용 데이터:  
  
- Auto Fib Retracement, Auto Chart Patterns, Candlestick Pattern 인식  
- Session Volume Profile, Periodic Volume Profile, Time Price Opportunity  
- Cumulative Volume Delta, Volume Delta, Volume Footprint  
- Anchored VWAP (지표 버전)  
- 크립토 온체인 (active addresses, realized cap, ETF flows, liquidations, OI …)  
- 펀더멘털 지표 (EPS, 매출, P/E를 차트에 시리즈로)  
  
### 7.4 인기 프리셋 (ChartDesk 기본 즐겨찾기 추천)  
  
오버레이: EMA 20 / EMA 50 / EMA 200, SMA 20, Bollinger 20, Ichimoku, SuperTrend, VWAP, Volume   
페인: RSI 14, MACD 12/26/9, Stochastic, ATR 14  
  
스크린샷의 노란·파란·분홍 선은 MA 3개 오버레이로 보는 것이 맞다. 기본 템플릿으로 넣을지 빈 차트로 시작할지는 제품 결정.  
  
### 7.5 전략 테스터 `strategy.tester` P2  
  
Pine `strategy()` 백테스트. 라이브러리에는 없음.  
  
- 성과: 순이익, 승률, 프로핏팩터, 맥스DD, 샤프  
- 차트에 진입/청산 화살표  
- CSV/XLSX보내기  
- Deep backtesting (더 긴 히스토리)  
  
ChartDesk 1.0에서는 **빼는 것을 권장**. 지표 알림으로 대체.  
  
---  
  
## 8. 스케일·크로스헤어·캔버스  
  
### 8.1 가격축 `scale.price` P0  
  
모드:  
  
| ID | 설명 |  
|----|------|  
| `scale.regular` | 선형 가격 |  
| `scale.percent` | 시작점 대비 % |  
| `scale.log` | 로그 (같은 %가 같은 거리) |  
| `scale.indexed_100` | 첫 값을 100으로. 비교에 필수 |  
  
추가:  
  
- 반전 `scale.invert` P2  
- 좌/우 배치 `scale.position`  
- Auto / 수동 드래그  
- 가격:바 비율 잠금 `scale.lock_ratio` P2  
- 차트만 스케일 (지표 무시) `scale.price_only`  
- 통화·단위 표시  
- 소수 자릿수 / 틱 사이즈 `scale.precision` P0  
  
라벨·라인:  
  
- 현재가 라벨 + 선 P0  
- 고/저 라벨 P1  
- 프리/애프터 마켓 선 P1  
- 카운트다운(봉 마감까지) `scale.countdown` P1  
- 가격축 + 버튼으로 빠른 알림 P0 (스크린샷 알림 UX와 연결)  
  
### 8.2 시간축 `scale.time` P0  
  
- 타임존: Exchange / UTC / 사용자 (스크린샷 New York UTC-4)  
- 날짜 포맷 `mm/dd/yyyy` 등  
- 요일 표시  
- 세션 구분 세로선 P1  
- 확장 세션 (프리/애프터) `chart.extended_hours` P1 — 주식만  
  
### 8.3 크로스헤어 `chart.crosshair` P0  
  
- 십자선, OHLC 허브, 시간·가격 라벨  
- 멀티차트 동기 크로스헤어 `chart.crosshair.sync` P1  
  
### 8.4 캔버스 `chart.canvas` P1  
  
- 배경 단색/그라데이션 (ChartDesk 다크 네이비)  
- 그리드 가로/세로 on/off, 색  
- 워터마크 (심볼+인터벌)  
- 페인 구분선  
- 여백 (위/아래/오른쪽 %)  
- 네비게이션 버튼 (줌, 리셋, 스크롤)  
- 페인 버튼 (최대화, 접기, 순서, 제거)  
  
### 8.5 상태줄 `chart.status_line` P0  
  
`9/14/2026 12:00 AM O H L C 등락%`   
토글: 로고, 타이틀, OHLC, 지표값, 바 변경.  
  
### 8.6 줌·스크롤 P0  
  
- 휠 줌, 드래그 팬, 핀치  
- 영역 줌 `draw.zoom_in`  
- 더블클릭 리셋  
- 미래 여백 (오른쪽 빈 공간) — 드로잉 투영용  
  
---  
  
## 9. 레이아웃·멀티차트  
  
`layout.*`  
  
| ID | 내용 | P |  
|----|------|---|  
| `layout.grid` | 1\~16분할 (1,2,4,6,8…). TV 플랜별 상한 | P1 |  
| `layout.save` | 이름 붙여 클라우드/로컬 저장 | P0 |  
| `layout.load` | 목록, 즐겨찾기, 삭제 | P0 |  
| `layout.rename` | | P1 |  
| `layout.copy` | | P1 |  
| `layout.share` | 링크 공유 | P2 |  
| `layout.export` | CSV/데이터보내기 | P2 |  
| `layout.sync.symbol` | 모든 차트 심볼 동기 | P1 |  
| `layout.sync.interval` | 인터벌 동기 | P1 |  
| `layout.sync.crosshair` | | P1 |  
| `layout.sync.time` | 시간축 동기 | P1 |  
| `layout.sync.drawings` | §6.8 | P1 |  
  
레이아웃 URL이 곧 워크스페이스 ID. 워치리스트·알림은 레이아웃 밖 전역.  
  
실행취소/재실행 `chart.undo` `chart.redo` P0 — 드로잉·지표·설정 스택.  
  
---  
  
## 10. 알림  
  
ChartDesk 스크린샷의 `가격 알림 - NVDA` + `이상` 이 P0 최소 구현.  
  
### 10.1 종류  
  
| ID | 설명 | P |  
|----|------|---|  
| `alert.price` | 가격만. 인터벌 무관 | **P0** |  
| `alert.technical.drawing` | 추세선·채널·수평선 터치 | P1 |  
| `alert.technical.indicator` | RSI>70 등 | P1 |  
| `alert.technical.strategy` | Pine strategy 주문 | P3 |  
| `alert.technical.pattern` | 자동 패턴 | P2 |  
| `alert.watchlist` | 한 조건으로 리스트 전체 | P2 |  
| `alert.multi_condition` | 최대 5조건 AND | P2 |  
  
### 10.2 가격/값 연산자 (TV 13조건)  
  
가격 알림에서 쓰는 것:  
  
| ID | ChartDesk 라벨 제안 | 의미 |  
|----|---------------------|------|  
| `crossing` | 돌파 | 어느 방향이든 레벨 통과 |  
| `crossing_up` | 상향 돌파 | 아래→위 |  
| `crossing_down` | 하향 돌파 | 위→아래 |  
| `greater_than` | **이상** (스크린샷) | 틱 하나라도 위 |  
| `less_than` | 이하 | 틱 하나라도 아래 |  
  
채널/이동 (기술 알림):  
  
| ID | 의미 |  
|----|------|  
| `entering_channel` | 채널 진입 |  
| `exiting_channel` | 채널 이탈 |  
| `inside_channel` | 채널 안 |  
| `outside_channel` | 채널 밖 |  
| `moving_up` | N봉 동안 절대값 상승 |  
| `moving_down` | 절대값 하락 |  
| `moving_up_pct` | % 상승 |  
| `moving_down_pct` | % 하락 |  
  
생성 UX (TV와 동일하게 여러 입구):  
  
1. 상단 벨  
2. 우측 알림 탭 `+`  
3. 차트 우클릭 `알림 추가`  
4. 가격축 호버 `+` (해당 가격으로 즉시)  
5. 드로잉 우클릭  
6. 단축키 Alt+A  
  
### 10.3 알림 필드  
  
- 심볼, 조건, 값, (기술) 인터벌  
- 메시지/노트 `alert.message` — 스크린샷 `노트 남김`  
- 만료: 1\~2개월 / 무제한(P2)  
- 트리거: 한 번 / 봉마다 / 조건이 유지되는 동안  
- 채널: 인앱, 토스트, 사운드, 이메일, 푸시, **웹훅** P1  
  
서버 사이드가 원칙. 브라우저를 닫아도 돌아가야 한다. 클라 폴링만 하면 TV가 아니다.  
  
### 10.4 차트 위 표시  
  
- 활성 알림 수평선  
- 만료/비활성 숨김 옵션  
- 토스트 20초 자동 숨김  
  
지표 파라미터를 **알림 생성 이후** 바꿔도 알림은 옛 설정으로 동작 (TV 동작). UI에 명시.  
  
---  
  
## 11. Pine Script (P2/P3)  
  
TV 고유 DSL. Supercharts 차별점.  
  
할 수 있는 것:  
  
- `indicator()` 시각화, `strategy()` 백테스트, `alertcondition()`  
- 멀티타임프레임 `request.security`  
- 테이블, 라벨, 라인, polyline (v6)  
- 로그 `log.info` (v6)  
- Pine Screener — 워치리스트/지수를 스크립트로 스캔  
- 커뮤니티 퍼블리시 (open / protected / invite-only)  
  
ChartDesk 함정:  
  
- **Advanced Charts에 Pine 런타임이 없다.** JS Custom Studies로 비슷하게 흉내.  
- 1.0에서 Pine을 약속하지 말 것.  
- 로드맵: (1) JS 커스텀 지표 → (2) 제한된 수식 에디터 → (3) 독자 스크립트. Pine 호환은 법적·공수 이슈.  
  
Pine Editor 기능 (참고만): 자동완성, 버전관리, Profiler, 차트에 추가 (Ctrl+Enter).  
  
---  
  
## 12. 우측 제품 패널 (차트 바깥)  
  
ChartDesk 탭 + TV 우측 툴바 나머지.  
  
### 12.1 워치리스트 `watchlist` P0  
  
- 다중 리스트, 섹션(폴더), 드래그 정렬  
- 컬럼: 가격, 등락, %, 거래량, 시총… 커스텀 P1  
- 플래그 색 P1  
- 심볼 메모  
- import/export CSV P1  
- 리스트 알림 P2  
- 클릭 시 차트 심볼 변경  
- 고급 뷰: 섹터 분포, 오버뷰 P2  
  
저장은 레이아웃이 아니라 **유저 전역**.  
  
### 12.2 뉴스 `news` P1  
  
- 심볼 관련 헤드라인  
- 차트 위 번개 마커 (이벤트)  
- News Flow 전체 피드 P2  
  
### 12.3 최근 `symbol.recent` P0  
  
최근 본 심볼. 워치와 분리.  
  
### 12.4 패턴 `pattern` P1  
  
- 자동 차트 패턴 목록, 클릭 시 차트에 하이라이트  
- 캔들 패턴 토글  
- 없으면 `패턴 없음` 빈 상태  
  
### 12.5 포스트 `social.posts` P2  
  
TV Ideas: 차트 스냅샷 + 불/베어/뉴트럴 + 본문 + 댓글.   
ChartDesk `포스트 인베스트`와 연결. 차트 코어 이후.  
  
### 12.6 코멘터리 `note` P1  
  
심볼 단위 노트. 차트 주석(`draw.note`)과 동기화할지 결정 필요.   
권장: **심볼 노트(패널)** 와 **차트 좌표 노트(드로잉)** 는 다른 테이블.  
  
### 12.7 TV에 있고 ChartDesk 탭에 아직 없는 것  
  
| 제품 | ID | P | 메모 |  
|------|----|---|------|  
| 스크리너 (주식/ETF/채권/크립토/CEX/DEX) | `screener.*` | P2 | 500+ 필터, 차트 뷰 |  
| Pine Screener | `screener.pine` | P3 | |  
| 경제 캘린더 | `calendar.eco` | P1 | 금리, CPI, 고용 |  
| 실적/배당 캘린더 | `calendar.earnings` | P1 | 차트 이벤트 마커와 공유 |  
| 포트폴리오 | `portfolio` | P2 | |  
| 펀더멘털 그래프 | `fund.graphs` | P2 | |  
| 수익률 곡선 | `yield_curves` | P3 | |  
| 옵션 체인 / 전략 빌더 / 그릭스 | `options.*` | P3 | |  
| 매크로 맵 | `macro.maps` | P3 | |  
| 히트맵 | `heatmap` | P2 | |  
| Seasonals | `chart.seasonals` | P2 | |  
| 커뮤니티 피드 / 알림함 | `social.feed` | P3 | |  
| DOM / 호가 | `dom` | P2 | Trading Platform |  
| 페이퍼 트레이딩 | `trade.paper` | P2 | |  
| 브로커 연동 | `trade.broker` | P3 | 자격증명은 브라우저 로컬 |  
  
### 12.8 스크리너 요약 (나중에)  
  
- 6종: Stock, ETF, Bond, Crypto coins, CEX, DEX  
- 150+ 거래소, 50+국, 400\~500 필드  
- 멀티 타임프레임, 워치리스트를 유니버스로  
- 자동 새로고침 10초(유료) / 1분  
- 차트 보기 모드, 플래그 색  
  
---  
  
## 13. 바 리플레이·스냅샷·거래  
  
### 13.1 Bar Replay `replay` P1  
  
- 과거 시점부터 봉을 재생  
- 속도 9단, 한 봉씩, 자동재생  
- 리플레이 중 드로잉·지표 사용  
- 멀티차트 동기 리플레이 P2  
- 리플레이 중 페이퍼 주문 P2  
- 분/초 해상도 히스토리 (데이터 플랜)  
  
전략을 “그때 내가 어떻게 했을까”로 연습하는 기능. 차트 앱 완성도 분기점.  
  
### 13.2 스냅샷 `chart.snapshot` P1  
  
현재 차트 PNG. 다운로드 / 링크 / 아이디어 첨부.   
워터마크·주문 표시 on/off.  
  
### 13.3 페이퍼 트레이딩 `trade.paper` P2  
  
- 가상 잔고, 레버리지, 수수료  
- 차트에서 드래그로 주문·브래킷  
- 시장가/지정가/스탑  
- 체결 화살표, 손익 라벨  
- 멀티 계좌  
  
### 13.4 실거래 `trade.broker` P3  
  
차트 위 주문 티켓, 브래킷, 드래그 수정. 브로커 자격증명은 서버에 안 둠 (TV 모델).  
  
---  
  
## 14. 차트 설정 창 `chart.settings` P1  
  
TV 기어. 탭 구조 그대로 이식.  
  
1. **심볼** — 차트타입별 색(상승/하락/심지), 세션(정규/연장), 배당 조정, 선물 back-adjust, 정밀도, 타임존  
2. **상태 줄** — 로고/타이틀/OHLC/지표값  
3. **눈금과 선** — 축 모드, 라벨, 카운트다운, 날짜 포맷, 인터벌 바꿀 때 왼쪽 고정  
4. **캔버스** — 배경, 그리드, 크로스헤어, 워터마크, 버튼, 여백  
5. **트레이딩** — 매수/매도 버튼, 체결음, 포지션/주문 표시  
6. **알림** — 선 색, 활성만, 볼륨, 토스트  
7. **이벤트** — 아이디어 마커, 배당, 분할, 실적, 뉴스 번개  
8. **템플릿** — 설정 프리셋 저장  
  
가격축 컨텍스트 메뉴도 같은 항목의 숏컷.  
  
---  
  
## 15. 데이터·세션·이벤트  
  
### 15.1 Datafeed 계약 (차트 엔진이 요구)  
  
심볼 메타:  
  
- ticker, name_ko, name_en, exchange, timezone, session (`0930-1600`), holidays  
- minmov, pricescale, has_intraday, has_seconds, has_daily, supported_resolutions  
- 자산군, 통화, 로고 URL  
  
바:  
  
- `time, open, high, low, close, volume` (unix ms, 세션 TZ 주의)  
- 히스토리 페이징 (TV는 플랜별 5K\~40K 봉)  
- 실시간: 틱 또는 현재봉 업데이트 스트림  
- 지연시세면 배지 `delayed` (스크린샷 `NYSE Closed (delayed)`)  
  
세션:  
  
- 정규 / 프리 / 애프터  
- 장 개장 여부 `data.session_status` P0  
- 서머타임  
  
### 15.2 이벤트 마커 `events.*` P1  
  
차트 시간축 위:  
  
- 실적 `events.earnings`  
- 배당 `events.dividends`  
- 분할 `events.splits`  
- 뉴스 `events.news`  
- (소셜) 아이디어 `events.ideas` P2  
  
설정에서 on/off. 클릭 시 우측 뉴스/캘린더로 점프.  
  
### 15.3 펀더멘털 P2  
  
재무제표, 배수, 밸류에이션. 차트에 시리즈로 올리기. 비교 그래프.  
  
---  
  
## 16. 단축키 (Windows / 구현 권장)  
  
커스텀 리맵 P2.  
  
| 동작 | 키 | ID |  
|------|----|----|  
| 심볼 검색 | 글자 입력 | `symbol.search` |  
| 지표 | `/` | `indicator.dialog` |  
| 알림 | Alt+A | `alert.create` |  
| 추세선 | Alt+T | `draw.trendline` |  
| 수평선 | Alt+H | `draw.horizontal_line` |  
| 수직선 | Alt+V | `draw.vertical_line` |  
| 피보 되돌림 | Alt+F | `draw.fib.retracement` |  
| 십자선 도구 | Alt+C | `draw.crossline` |  
| 측정 | Shift+드래그 | `draw.measure` |  
| 임시 자석 | 드래그 중 Shift | `draw.magnet.weak` |  
| 스냅샷 | Alt+S | `chart.snapshot` |  
| 실행취소/재실행 | Ctrl+Z / Ctrl+Y | `chart.undo` |  
| 선택 삭제 | Delete | `draw.delete` |  
| 복사/붙여넣기 | Ctrl+C / V | `draw.copy` |  
| 드로잉 숨김 | Ctrl+Alt+H | `draw.hide_all` |  
| 리플레이 재생/정지 | Space | `replay.toggle` |  
| 노트 | Alt+N | `note.create` |  
  
---  
  
## 17. 구현 페이즈 (ChartDesk 추천)  
  
스크린샷을 **페이즈 1의 완료 정의**로 둔다.  
  
### Phase 1 — 스크린샷 패리티 (P0)  
  
차트 하나가 NVDA처럼 보여야 한다.  
  
- [ ] 심볼 검색 + NASDAQ:NVDA 로드  
- [ ] 인터벌 1/5/15/60/240/1D  
- [ ] 캔들 / 라인 / 하이킨아시  
- [ ] OHLC 상태줄, 현재가 라벨, 크로스헤어, 볼륨 페인  
- [ ] 비교 칩 + 비교 시리즈  
- [ ] 드로잉: 추세선, 수평선/레이, 피보, 사각형, 텍스트, 측정  
- [ ] 자석, 잠금, 삭제, Undo  
- [ ] 우측: 워치리스트, 최근, 드로잉 오브젝트 트리, 가격 알림(이상/이하/돌파)  
- [ ] 알림 서버 저장 + 인앱 토스트  
- [ ] 레이아웃 저장 (단차트라도)  
- [ ] 세션/지연 배지, 타임존  
- [ ] 다크 테마 ChartDesk 토큰  
  
### Phase 2 — 매일 쓰는 분석 (P1)  
  
- [ ] 지표 다이얼로그 + §7.2 내장 세트 + 템플릿 (EMA 20/50/200 기본)  
- [ ] 나머지 라인/채널/롱숏/VP 고정구간  
- [ ] 멀티차트 2\~4 + 심볼/인터벌 동기  
- [ ] Bar Replay  
- [ ] 스냅샷  
- [ ] 차트 설정 전체 탭  
- [ ] 뉴스 + 실적/배당 마커  
- [ ] 패턴 탭 (캔들 패턴 먼저, 자동 차트 패턴은 룰 기반)  
- [ ] 캘린더  
- [ ] 확장 세션  
- [ ] 로그/%/index100 축  
- [ ] 웹훅 알림  
  
### Phase 3 — 파워 (P2)  
  
- [ ] Renko/Kagi/P\&F/Range (데이터·엔진 가능 시)  
- [ ] Volume Profile / VWAP 앵커  
- [ ] 워치리스트 알림, 멀티조건 알림  
- [ ] 스크리너·히트맵  
- [ ] 페이퍼 트레이딩  
- [ ] 포스트/아이디어  
- [ ] 커스텀 JS 지표  
- [ ] 펀더멘털 그래프  
  
### Phase 4 — 플랫폼 (P3)  
  
- [ ] Pine 호환 또는 독자 스크립트 + Pine Screener  
- [ ] 풋프린트/TPO (틱 데이터 계약 후)  
- [ ] 옵션, 금리곡선, 매크로맵  
- [ ] 브로커 연동, DOM  
- [ ] 모바일/데스크톱 동기  
  
하지 말 것 (1.0):  
  
- 커뮤니티 10만 지표 마켓  
- Pine 호환 광고  
- 틱 풋프린트 없이 풋프린트 UI만 띄우기  
- 알림을 열린 브라우저에서만 계산  
  
---  
  
## 18. 권장 데이터 모델 (최소)  
  
```  
User  
 layouts[] // 차트 그리드, 인터벌, 차트타입, 축, 테마  
 watchlists[] // 전역  
 alerts[] // 전역, 서버  
 notes[] // 심볼 단위 패널 노트  
 indicator_templates[]  
 drawing_favorites[]  
 recent_symbols[]  
  
Layout  
 charts[]  
 symbol, exchange, interval, chartType  
 panes[] // overlay + oscillators + volume  
 indicators[] // id, params, pane, style  
 drawings[] // 심볼 스코프 복제본 또는 ref  
 compare_symbols[]  
 scale // regular|log|percent|indexed  
 timezone, session  
 sync // symbol, interval, crosshair, time, drawings  
  
Drawing  
 id, type, symbol, owner_scope // chart | layout | global  
 points[] // {time, price} 논리좌표 (픽셀 금지)  
 style, locked, hidden, alert_id?  
  
Alert  
 id, kind // price | drawing | indicator | watchlist  
 symbol, operator, value, interval?  
 message, expire_at, trigger_mode  
 channels[] // toast, email, webhook  
 active, last_fired_at  
```  
  
드로잉 좌표는 **time+price**. 줌해도 붙어 있어야 한다.  
  
---  
  
## 19. ChartDesk 카피 (한국어 정본)  
  
스크린샷 기준. 새 라벨도 이 말투(짧고 명사형).  
  
| ID | 라벨 |  
|----|------|  
| 워치리스트 | 워치리스트 |  
| 뉴스 | 뉴스 |  
| 최근 | 최근 |  
| 패턴 | 패턴 |  
| 포스트 | 포스트 |  
| 알림 | 알림 |  
| 코멘터리 | 코멘터리 |  
| 드로잉 탭 제목 | 드로잉 - {TICKER} |  
| 빈 드로잉 | 오브젝트 없음 |  
| 알림 탭 제목 | 가격 알림 - {TICKER} |  
| greater_than | 이상 |  
| less_than | 이하 |  
| crossing | 돌파 |  
| 조건 대상 | 가격 |  
| 노트 CTA | 노트 남김 |  
| 비교 | 비교 |  
| 일봉 | 일봉 |  
| 캔들 / 라인 / 하이킨 | 캔들 / 라인 / 하이킨 |  
  
---  
  
## 20. TradingView 플랜 상한 (참고, ChartDesk는 자체 쿼터)  
  
Supercharts 유료 차별화. 클론이 같은 숫자를 쓸 필요는 없다.  
  
| 항목 | Basic | Essential | Plus | Premium | Ultimate |  
|------|-------|-----------|------|---------|----------|  
| 레이아웃당 차트 | 1 | 2 | 4 | 8 | 16 |  
| 차트당 지표 | 2\~3 | 5 | 10 | 25 | 50 |  
| 히스토리 봉 | 5K | 10K | 10K | 20K | 40K |  
| 가격 알림 | 3 | 20 | 100 | 400 | 1000 |  
| 기술 알림 | — | 20 | 100 | 400 | 1000 |  
| 초봉 / 틱 | 상위 | | | | |  
| 볼륨 풋프린트 / TPO | 상위 | | | | |  
| 무제한 알림 만료 | 상위 | | | | |  
  
ChartDesk 제안 쿼터 (로그인 유저): 차트 4, 지표 15, 알림 50, 봉 10K. 게스트: 차트 1, 지표 5, 알림 0(세션만).  
  
---  
  
## 21. 라이브러리 vs 자체 구현 결정 체크  
  
| 기능 | Advanced Charts | Trading Platform | 자체 |  
|------|-----------------|------------------|------|  
| 캔들/라인/하이킨 | O | O | 가능 |  
| Renko/Kagi/P\&F | X | O | 직접 |  
| 드로잉 70\~110 | O | O | 공수 큼 |  
| 내장 지표 \~100 | O | O | 직접 |  
| Pine | X | X | 직접 |  
| 워치리스트 UI | 제한 | O | ChartDesk 탭 |  
| 알림 서버 | X (직접) | X (직접) | 필수 직접 |  
| 한국어 UI | locale | locale | 스크린샷 정본 |  
| 브랜딩 | 워터마크 정책 | 정책 | 자유 (라이선스 준수) |  
  
ChartDesk처럼 **우측 탭 셸을 독자 UI로 두고 가운데만 차트 엔진**을 넣는 구성이 스크린샷과 맞다.  
  
---  
  
## 22. 공식 레퍼런스  
  
- Features: https://www.tradingview.com/features/  
- Supercharts: https://www.tradingview.com/support/solutions/43000746464/  
- 차트 타입: https://www.tradingview.com/support/solutions/43000703407/  
- 드로잉: https://www.tradingview.com/support/solutions/43000703396/  
- 드로잉 리스트 (라이브러리): https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/Drawings-List  
- 지표 리스트 (라이브러리): https://www.tradingview.com/charting-library-docs/latest/ui_elements/indicators/Indicators-List/  
- 설정: https://www.tradingview.com/support/solutions/43000748166/  
- 알림: https://www.tradingview.com/support/solutions/43000520149/  
- 가격 알림: https://www.tradingview.com/support/solutions/43000763313/  
- 레이아웃: https://www.tradingview.com/support/solutions/43000692404/  
- Pine v6: https://www.tradingview.com/pine-script-docs/welcome/  
- 라이브러리 소개: https://www.tradingview.com/charting-library-docs/latest/introduction  
- 프라이싱(쿼터): https://www.tradingview.com/pricing/  
  
---  
  
## 23. Cursor에게  
  
1. 이 파일의 Feature ID를 이슈/컴포넌트명으로 쓴다. 새 이름을 만들지 않는다.  
2. Phase 1을 스크린샷과 픽셀 단위로 맞춘다. 탭 순서: 워치리스트 · 뉴스 · 최근 · 패턴 · 포스트 · 알림 · 코멘터리.  
3. 드로잉은 픽셀이 아니라 `{time, price}`로 저장한다.  
4. 알림은 서버. 가격 알림 P0만 먼저, 연산자 `이상/이하/돌파`.  
5. Pine·풋프린트·브로커는 Phase 1 범위 밖으로 이슈만 연다.  
6. 한국어 라벨은 §19가 정본. TV 영어는 코드와 주석에만.  
7. 트레이딩뷰 상표를 차트 안에 넣지 않는다. 데이터 벤더 워터마크 정책만 따른다.  
)  
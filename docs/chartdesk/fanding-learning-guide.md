# Fanding / easychart 원문 학습 가이드

ChartDesk는 **유료 Fanding을 스크레이핑하지 않습니다.** 멤버십에서 합법적으로 열람·저장한 강의·분석 텍스트만 사용자가 직접 공급합니다.

## 무엇을 넣나요

| 카테고리 | UI 라벨 | 용도 |
|----------|---------|------|
| `survival_strategy` | 비밀 생존 전략 | 셋업·패턴 규칙 추출에 유리 |
| `realtime_chart` | 실시간 차트 분석 | 종목 의견 초안 + 패턴 |
| `mindset` | 마인드셋 | 리스크 문구 보강 (의견은 보통 자동 미생성) |
| `insight` | 인사이트 | 테마·구조 인사이트 → 의견·패턴 |

## 넣는 방법 (택1)

1. **UI 붙여넣기** — 툴바 **포스트 인제스트** → 제목/본문 붙여넣기 → 주제 선택 → **단건 학습**.
2. **파일 드롭** — `.txt` / `.md` / `.json` **복수** 선택·드래그. JSON은 단건 객체 또는 **배열** / `{ "posts": [...] }` 지원.
3. **일괄 API** — `POST /api/learn/bulk`
4. **웹훅** — `POST /api/ingest/webhook` (단건 JSON/텍스트 또는 `{ posts: [...] }`)

### JSON 예시

```json
{
  "defaultCategory": "realtime_chart",
  "posts": [
    {
      "category": "survival_strategy",
      "title": "이중바닥 생존 전략",
      "body": "스윙 저점이 비슷하면 이중바닥… 넥라인 돌파 시…",
      "externalUrl": "https://fanding.kr/@easychart/…",
      "symbolIds": ["us_NVDA"]
    }
  ]
}
```

`symbolIds`를 비우면 티커/한글명 휴리스틱(또는 `OPENAI_API_KEY` / `LLM_API_KEY`)으로 추출합니다.

## 학습 파이프라인

1. 포스트를 `data/store.json`에 저장 (4 카테고리).
2. 본문에서 **PatternDef** 규칙 추출  
   - LLM (`OPENAI_API_KEY` 또는 `LLM_API_KEY`) 우선  
   - 없으면 한국어 키워드 휴리스틱 (이중바닥, 골든크로스, RSI 과매도, 장악형, 넥라인, 거래량 등).
3. 새 패턴은 `sourcePostIds` 연결, **`reviewStatus: pending`**, **비활성** → **패턴** 탭 검수 큐에서 승인·거절.
4. `realtime_chart` / `insight`는 차트 맥락과 원문 인용으로 **의견 초안** 생성 → **코멘터리**에서 승인 필수.
5. **학습 현황**은 패턴·포스트 탭 상단에 표시 (학습 포스트 / 파생 패턴 / 검수 대기 / 의견 초안).

## API 요약

| Method | Path | 역할 |
|--------|------|------|
| `POST` | `/api/posts` | 단건 학습 (패턴+의견) |
| `POST` | `/api/learn/bulk` | 다건 JSON 배열 |
| `GET` | `/api/learn/status` | 학습 통계 |
| `POST` | `/api/ingest/webhook` | 외부 드롭/자동화 (스크레이프 아님) |
| `PATCH` | `/api/patterns` | `{ id, reviewStatus }` 또는 `{ id, enabled }` |
| `PATCH` | `/api/opinions` | `{ id, status: approved\|rejected }` |

## 환경

```bash
cp .env.example .env.local
# OPENAI_API_KEY=sk-…   # 또는 LLM_API_KEY=
npm run dev -- -p 43127
```

키 없이도 휴리스틱으로 동작합니다. 시드 데이터는 데모용이며, 실제 멤버십 원문을 넣으면 동일 저장소에 추가·보강됩니다.

## 하지 않는 것

- 유료 Fanding 무단 수집·프록시
- Pine 런타임 (`wont`)
- 인증/팀 협업/모바일 레이아웃 (이 작업 범위 밖)

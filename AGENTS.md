# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project: FLAS — Factory Load Area Simulation System (공장 면적 부하 관리 시스템)

This system tracks factory floor area utilization across projects over time, enabling sales teams to instantly check available space when taking orders and operations teams to proactively detect/resolve space conflicts before they occur.

## Commands

```bash
# 백엔드 개발 서버 (localhost:3001)
cd backend && npx ts-node-dev --respawn --transpile-only src/index.ts

# 프론트엔드 개발 서버 (localhost:5173)
# 루트 node_modules에서 vite를 실행해야 함
/Users/ai-study-Codex/공장면적로드/node_modules/.bin/vite

# 프론트엔드 빌드
/Users/ai-study-Codex/공장면적로드/node_modules/.bin/vite build

# DB 마이그레이션 (스키마 변경 후)
cd backend && npx prisma migrate dev --name <migration_name>

# DB 시드 (공장 마스터 데이터 재적용)
cd backend && npx ts-node prisma/seed.ts

# Prisma Studio (DB 브라우저)
cd backend && npx prisma studio
```

**환경변수**: `backend/.env` — `DATABASE_URL="file:./dev.db"` (SQLite, 설치 불필요)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 8 + Tailwind CSS v4 |
| State/Data | TanStack Query v5 + React Router v6 + axios |
| Backend | Node.js + Express + TypeScript (ts-node-dev) |
| ORM | Prisma 5 |
| Database | **SQLite (개발)** / PostgreSQL (운영 목표) |

## Architecture

```
backend/
  prisma/
    schema.prisma      # Prisma 스키마 (SQLite)
    seed.ts            # 6개 공장 실데이터 시드
  src/
    index.ts           # Express 앱 진입점 (port 3001)
    routes/
      factories.ts     # 공장·구역 CRUD + 엑셀 업로드 (/api/factories)
      projects.ts      # 프로젝트 + 배치 등록 (/api/projects)
      assignments.ts   # 배치 수정·삭제 (/api/assignments)
      load.ts          # 부하율 계산 (/api/load)
    services/
      loadCalculator.ts    # 날짜별 면적 점유량 계산
      conflictValidator.ts # 등록 전 충돌(초과) 검증
    middleware/
      errorHandler.ts

frontend/
  src/
    api/client.ts          # axios 인스턴스 + 타입 + API 함수
    pages/
      FactoriesPage.tsx    # 공장·구역 CRUD UI (트리 테이블)
      ProjectsPage.tsx     # 프로젝트 등록 + 면적 배치 + 충돌 경고
    App.tsx                # BrowserRouter + QueryClientProvider + Nav
```

**패키지 호이스팅**: npm workspaces로 대부분의 패키지가 루트 `node_modules/`에 설치됨. `frontend/node_modules/.bin/`에는 tsc, tsserver만 있음 — vite는 루트에서 실행.

## Core Data Model

```
Factory (1) ──── (N) Zone (1) ──── (N) AreaAssignment (N) ──── (1) Project
  code, name         availableAreaSqm   startDate, endDate, requiredAreaSqm
```

## Load Calculation Logic

**부하율(%)** = (해당 날짜에 해당 구역에 걸쳐있는 모든 `confirmed` 배치의 `requiredAreaSqm` 합) ÷ `zone.availableAreaSqm` × 100

- 100% 미만: 여유 (녹색)
- 80~100%: 주의 (황색)
- 100% 초과: 초과 (적색)

충돌 검증은 `POST /api/projects/:id/assignments` 시 자동 실행. 초과 시 HTTP 409 반환, `force: true` 파라미터로 강제 등록 가능.

## Critical Business Rules

- 단일 프로젝트가 **복수 구역에 동시 배치** 가능 (factory + zone 조합으로 구분).
- `status = 'confirmed'`인 배치만 부하 계산에 포함 (`'draft'` 제외).
- 구역 삭제 시 배치 데이터도 cascade 삭제됨 — 프로덕션에서는 `isActive = false`로 비활성화 권장.
- **Tailwind CSS v4** 사용 중 — `tailwind.config.js` 불필요, `@import "tailwindcss"` 한 줄로 동작.
- Vite 6(Rolldown) 빌드 시 TypeScript `interface` import는 반드시 `import type { ... }` 사용.

## Factory Master Data (Google Sheets 원본)

6개 공장, 36개 구역. 시드 파일: `backend/prisma/seed.ts`

| 공장 | 주요 구역 |
|------|---------|
| 이진공장 | A-1~A-2, B-1~B-4, 도장샵, RT ROOM-1~2, YARD-1~5 |
| 처용공장 | shop A~D, YARD-1~2, RT ROOM, 자재창고1~2 |
| 경주공장 | shop A~D, YARD |
| 고성공장 | shop A~B, YARD |
| 거제공장(임대) | shop A, YARD |
| 기계공장 | shop A |

## P3 완료: 간트 차트 + 자동 대체 시뮬레이션

**새 API 엔드포인트:**
- `GET /api/gantt/factory/:id?start=&end=` — 구역별 배치 목록 + 일별 부하율 통합 응답
- `POST /api/load/suggest-replacement` — `{ assignmentId }` → 동일 공장 내 대체 구역 추천 목록

**새 프론트엔드 컴포넌트:**
- `frontend/src/pages/GanttPage.tsx` — 공장·기간 선택 + 간트 렌더링 + 초과 경고
- `frontend/src/components/GanttChart.tsx` — div 기반 타임라인 (8px/day, 52px/row), 부하율 배경색, 배치 바, 오늘 선
- `frontend/src/components/AssignmentPopup.tsx` — 배치 바 클릭 시 상세 팝업 + "대체 구역 찾기" 버튼
- `frontend/src/components/ReplacementModal.tsx` — 추천 목록 + 간트 미리보기(React state) + 확정(PUT /api/assignments/:id)

**주요 동작:**
- 초과 구역(빨간 행) 클릭 → ReplacementModal
- 배치 바 클릭 → AssignmentPopup → "대체 구역 찾기" → ReplacementModal
- 대안 선택 → 간트에 점선 미리보기 즉시 반영 (DB 변경 없음)
- "확정" → PUT /api/assignments/:id → 간트 새로고침

## Next: Phase 4 (경영 대시보드)

- 전체 공장 × 월별 부하율 히트맵 매트릭스
- 드릴다운: 공장·월 클릭 → 일별 추이 차트
- KPI 카드: 전체 평균 가동률, 최고 부하 구역, 면적 위험 일수
- PDF 리포트 출력

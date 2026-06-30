# PPE Monitoring Dashboard

저장 영상 기반 PPE(안전모/안전조끼) 분석 시스템을 가정한 **프론트엔드 시연용 관리자 대시보드**입니다.

> 현재는 백엔드 없이 UI/UX 프로토타입에 집중한 버전입니다.

---

## 📌 프로젝트 목적

- 산업안전 현장에서 PPE 착용 여부를 모니터링하는 시스템의 화면을 설계
- 발표/시연에서 분석 흐름(업로드 → 분석 진행 → 결과 확인)을 직관적으로 전달

---

## ✨ 주요 기능

- 4분할 CCTV 모니터링 화면
- CAM별 개별 영상 업로드 (로컬 파일)
- 관리자 사이드 패널
  - 시스템 상태 카드
  - 알람 로그(필터/검색)
  - 운영 히스토리
- 상단 KPI 카드
  - 총 탐지 인원 / 위반 건수 / 준수율 / 조치 완료율
- 시나리오 A/B 전환
- 분석 진행률 UI (Mock)
- 분석 완료 모달
- 하단 이벤트 피드(Ticker)
- 조치 작성 페이지 + 로그인 게이트

---

## 🛠 Tech Stack

- React (Vite)
- Tailwind CSS

---

## 🚀 실행 방법

```bash
npm install
npm run dev
```

- 기본 접속: `http://localhost:5173`

### Production Build

```bash
npm run build
```

---

## 🧭 데모 시연 흐름 (추천)

1. 시나리오 A/B 전환
2. CAM 카드별 `영상 올리기` 버튼으로 로컬 영상 업로드
3. `분석 시작` 버튼 클릭
4. 진행률 증가 확인
5. 분석 완료 모달 및 KPI/로그 확인
6. 알람 상세에서 `확인/담당자 지정/사건 등록/해결 완료` 시연
7. `조치 작성 페이지`로 이동 후 로그인/조회/수정 시연

---

## 📸 화면 가이드 (작은 스크린샷 중심)

### 0) 전체 화면 (문맥 확인용)

![Dashboard Overview](docs/screenshots/01-dashboard-overview.png)

---

### 1) CAM별 `영상 올리기`

<img src="docs/screenshots/02-cam-upload-button.png" width="420" alt="CAM Upload Button" />

- **기능:** 특정 CAM 타일에 로컬 영상 연결
- **사용법:** `영상 올리기` 클릭 → 파일 선택
- **결과:** 해당 CAM에만 반영, `LOCAL VIDEO` 배지 표시

---

### 2) `분석 시작` / `결과`

<img src="docs/screenshots/03-analysis-start.png" width="420" alt="Start Analysis Button" />

- **기능:** 분석 시뮬레이션 실행 및 완료 후 결과 처리
- **사용법:** (선택) 시나리오 A/B → `분석 시작`
- **결과:** 진행률 바 동작, 완료 후 결과 버튼 활성화

---

### 3) 알람 조치 버튼

<img src="docs/screenshots/04-alert-action-buttons.png" width="420" alt="Alert Action Buttons" />

- **버튼:** `확인(ACK)` / `담당자 지정` / `사건 등록` / `해결 완료`
- **기능:** 알람 상태 전이 + 조치 이력 기록
- **결과:** 상태값/운영 히스토리 동기화

---

### 4) 조치 작성 페이지 로그인

<img src="docs/screenshots/05-action-page-login.png" width="420" alt="Action Page Login" />

- **기능:** 조치 페이지 접근 전 안전관리자 인증
- **데모 계정:** `safety-admin / admin1234`
- **결과:** 인증 성공 시 조치 테이블 화면 진입

---

### 5) 조치 작성 테이블 (`조회` / `수정 저장`)

<img src="docs/screenshots/06-action-page-table.png" width="420" alt="Action Page Table" />

- **기능:** 이벤트 조회 및 처리 상태 수정
- **사용법:** 이벤트ID/처리필터 입력 → `조회` → 체크 변경 → `수정 저장`
- **결과:** 처리/수정일자 갱신 (Demo)

---

## 🔘 버튼 인덱스 (Quick Reference)

- `영상 올리기` : CAM별 로컬 영상 업로드
- `분석 시작` : 분석 시뮬레이션 실행
- `결과` : 분석 완료 후 결과 출력/다운로드 트리거
- `확인(ACK)` : 알람 확인 처리
- `담당자 지정` : 담당자 배정 후 처리 진행
- `사건 등록` : 인시던트 생성 흐름 시작
- `해결 완료` : 조치 완료 상태 반영
- `조치 작성 페이지` : 로그인 기반 조치 관리 페이지 이동
- `로그인` : 안전관리자 인증
- `조회` : 이벤트 조건 검색
- `수정 저장` : 처리 상태 변경사항 저장

---

## 🧱 현재 코드 구조 (리팩터링 반영)

- `src/data/mockData.js` : 더미 데이터 분리
- `src/constants/statusStyles.js` : 알람 레벨 스타일 상수
- `src/components/`
  - `KpiCard`, `FilterButton`, `StateTile`
  - `ViolationActionPage` (로그인 + 조치 작성)
- `src/services/alertsApi.js` : API 호출 골격

## 🔌 API 연결 골격

현재 앱은 시작 시 아래 엔드포인트를 시도합니다.

- `GET /api/alerts/latest`
- `PATCH /api/alerts/:id/status`

성공 시 최신 알람/상태로 반영되고,
실패 시에는 **Mock 데이터 fallback** 으로 동작합니다.

## 🔮 추후 확장 (백엔드 연동 시)

- FastAPI + YOLO 기반 분석 API 연결
- 조치 작성 페이지 조회/수정 API 연동
- 분석 결과(JSON/CSV) 다운로드
- 결과 영상(mp4) 연동
- 실시간(WebSocket) 이벤트 반영

---

## 📎 참고

이 프로젝트는 **프론트 시연/포트폴리오 목적**으로 제작되었습니다.

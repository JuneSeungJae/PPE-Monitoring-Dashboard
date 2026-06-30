# 🦺 PPE Monitoring Dashboard

> CCTV 기반 실시간 안전 보호구(PPE) 착용 감지 및 모니터링 시스템

---

## 📌 프로젝트 개요

공사 현장 및 물류 창고 환경에서 CCTV 영상을 실시간으로 분석하여 작업자의 **안전모(Helmet)** 및 **안전조끼(Vest)** 미착용 여부를 자동으로 감지하고, 위반 사항을 알람으로 통보하는 시스템입니다.

---

## 🏗️ 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser (port 5173)                         │
│              React + Vite + TailwindCSS Dashboard                │
└───────────────┬─────────────────────────┬───────────────────────┘
                │ REST API / WebSocket      │ /live-detections (250ms)
                ▼ (port 8080)              ▼ (port 8000)
┌───────────────────────────┐  ┌──────────────────────────────────┐
│   Spring Boot Backend     │  │     FastAPI Detector             │
│  - REST API (/api/event)  │  │  - YOLOv8n 실시간 추론           │
│  - WebSocket (STOMP)      │  │  - 4개 카메라 병렬 처리          │
│  - MySQL (teampj DB)      │  │  - /live-detections 스트리밍     │
└───────────────────────────┘  └────────────┬─────────────────────┘
                                            │
                               ┌────────────▼─────────────────────┐
                               │         YOLOv8n Model            │
                               │  Classes: helmet / no-helmet /   │
                               │           vest / no-vest         │
                               └──────────────────────────────────┘
```

---

## 🛠️ 기술 스택

| 구분 | 기술 |
|------|------|
| **Frontend** | React 18, Vite, TailwindCSS, STOMP.js, SockJS |
| **Backend** | Spring Boot 3.4, Spring Data JPA, Spring WebSocket |
| **Detector** | FastAPI, YOLOv8n (Ultralytics), OpenCV, Python 3.10+ |
| **AI Model** | YOLOv8n - Construction Safety Dataset (Roboflow) |
| **Database** | MySQL 8.0 |

---

## 📁 프로젝트 구조

```
PPE-monitoring/
├── frontend/          # React 대시보드 (포트 5173)
│   ├── src/
│   │   ├── App.jsx                    # 메인 대시보드
│   │   ├── components/
│   │   │   └── ViolationActionPage.jsx  # 조치 관리 페이지
│   │   ├── data/mockData.js           # 카메라 설정
│   │   └── services/alertsApi.js      # API 호출
│   └── public/
│       └── cam1~4.mp4                 # 데모 영상
│
├── ppe/               # Spring Boot 백엔드 (포트 8080)
│   └── src/main/java/com/example/ppe/
│       ├── Event/                     # 이벤트 CRUD + WebSocket
│       └── user/                      # 로그인 인증
│
├── detector/          # FastAPI 감지 서버 (포트 8000)
│   └── main.py                        # YOLOv8 추론 + 이벤트 전송
│
└── AI/
    └── new_best_model/weights/best.pt  # 학습된 YOLOv8n 모델
```

---

## 🚀 실행 방법

### 사전 요구사항

- Java 17+
- Python 3.10+
- Node.js 18+
- MySQL 8.0

---

### 1. MySQL DB 설정

```sql
CREATE DATABASE teampj CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

### 2. Spring Boot 백엔드 실행

```bash
cd ppe
.\gradlew bootRun
```

> `application.properties`에서 DB 접속 정보 확인  
> 기본값: `localhost:3306/teampj`, user=`root`, password=`1234`

---

### 3. FastAPI Detector 실행

```bash
cd detector
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

> 포트 8000에서 실행  
> YOLOv8 모델 경로: `AI/new_best_model/weights/best.pt`

---

### 4. React 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

> 브라우저에서 http://localhost:5173 접속

---

## ✨ 주요 기능

### 📹 실시간 CCTV 모니터링
- 4개 카메라 동시 표시
- 실시간 바운딩 박스 오버레이 (재생 중에만 표시)
- 위반 감지 시 빨간색 박스 / 정상 착용 시 파란색 박스
- 영상 업로드 기능 (카메라별 영상 교체)

### 🚨 알람 로그
- WebSocket(STOMP) 기반 실시간 알람 수신
- 안전모 / 안전조끼 미착용 분류 필터
- 알람 확인(ACK) 및 해결 완료(RESOLVE) 처리
- 카메라별 · 시간대별 필터링

### 📊 시스템 현황 KPI
- 전체 CCTV 수 / 정상 / 오프라인 현황
- 탐지 건수 / 처리 완료 / 조치 완료율

### 🔐 조치 관리 페이지
- 안전관리자 로그인 (Spring Boot API 연동)
- 이벤트 목록 조회 및 처리 상태 관리
- 실시간 DB 반영

---

## 🤖 AI 모델

| 항목 | 내용 |
|------|------|
| 모델 | YOLOv8n |
| 학습 데이터 | Construction Safety Dataset (Roboflow) |
| 감지 클래스 | `helmet`, `no-helmet`, `vest`, `no-vest` |
| 신뢰도 임계값 | 0.45 이상 |
| 처리 속도 | 4 FPS (카메라당) |
| 이벤트 쿨다운 | 300초 (동일 카메라·위반 유형 기준) |

---

## 🌿 브랜치 구조

| 브랜치 | 내용 |
|--------|------|
| `main` | 전체 통합 프로젝트 |
| `frontend` | React 대시보드 |
| `backend` | Spring Boot 백엔드 |
| `detector` | FastAPI + YOLOv8 감지 서버 |

---

## 🔗 API 엔드포인트

### Spring Boot (`:8080`)

| Method | URL | 설명 |
|--------|-----|------|
| `GET` | `/api/event/latest` | 전체 이벤트 조회 |
| `POST` | `/api/event` | 이벤트 생성 |
| `PATCH` | `/api/event/{id}/status` | 처리 상태 변경 |
| `POST` | `/api/users/login` | 로그인 |
| `WS` | `/ws/events` → `/topic/events` | 실시간 이벤트 수신 |

### FastAPI (`:8000`)

| Method | URL | 설명 |
|--------|-----|------|
| `GET` | `/live-detections` | 실시간 바운딩 박스 조회 |
| `POST` | `/start` | 카메라 감지 시작 |
| `POST` | `/analyze-upload` | 업로드 영상 분석 |
| `POST` | `/stop` | 감지 중단 |
| `GET` | `/status` | 감지기 상태 확인 |

---

## 📸 화면 구성

- **대시보드**: 4분할 CCTV 화면 + 실시간 알람 로그 + 시스템 KPI
- **조치 페이지**: 이벤트 테이블 + 처리 상태 관리 (로그인 필요)
  - 데모 계정: `safety-admin` / `admin1234`

---

## 📄 라이선스

본 프로젝트는 팀 프로젝트 결과물입니다.

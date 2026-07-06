# 🦺 PPE Monitoring Dashboard

> CCTV 기반 실시간 안전 보호구(PPE) 착용 감지 및 모니터링 시스템

---

## 📌 프로젝트 개요

공사 현장 및 물류 창고 환경에서 CCTV 영상을 실시간으로 분석하여 작업자의 **안전모(Helmet)** 및 **안전조끼(Vest)** 미착용 여부를 자동으로 감지하고, 위반 사항을 알람으로 전달하는 전체 솔루션을 구현한 프로젝트입니다. 본 프로젝트는 AI 기반 Detection, 실시간 대시보드, 백엔드 API, DB 설계 및 관리자 처리 흐름을 통합적으로 연동하여 실무형 모니터링 시스템을 완성하는 것을 목표로 했습니다.

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

## 🗄️ DB 설계

### 1) 이벤트 저장 테이블: cctv_event
실시간으로 발생하는 PPE 위반 이벤트를 저장하기 위한 핵심 DB 스키마를 설계하고 구현했습니다. CCTV 번호, 탐지 코드, 탐지 시각, 신뢰도, 바운딩 박스 정보, 이미지 경로, 처리 상태를 저장하여 이벤트 이력 관리와 관리자 조치 흐름을 지원합니다.

| 컬럼 | 설명 |
|------|------|
| `event_id` | 이벤트 PK |
| `cctv_no` | CCTV 식별자 |
| `detected_code` | 탐지 결과 코드 (`helmet`, `no-helmet`, `vest`, `no-vest` 관련 분류) |
| `detected_at` | 탐지 발생 시각 |
| `confidence` | 탐지 신뢰도 |
| `bbox_json` | 바운딩 박스 JSON 데이터 |
| `image_path` | 저장된 위반 이미지 파일 경로 |
| `status` | 처리 상태 (`new`, `acked`, `in_progress`, `resolved`) |
| `action_notes` | 조치 메모 |
| `completed_flag` | 완료 여부 |
| `created_at` / `updated_at` | 생성/수정 시간 |

### 2) 관리자 계정 테이블: safety_managers
안전관리자 로그인 및 인증에 사용되는 테이블입니다.

| 컬럼 | 설명 |
|------|------|
| `employee_id` | 관리자 아이디 |
| `employee_name` | 관리자 이름 |
| `password` | BCrypt 해시 비밀번호 |
| `safety_manager_flag` | 관리자 권한 여부 |
| `created_at` / `updated_at` | 생성/수정 시간 |

### 3) 구현 포인트
- Spring Data JPA 기반으로 엔티티와 테이블 간 매핑을 구성했습니다.
- `cctv_event` 테이블에 조회 성능을 고려한 인덱스를 적용했습니다.
- `ddl-auto=update` 설정을 통해 엔티티 변경 사항이 DB에 반영되도록 구성했습니다.
- 관리자 인증용 `safety_managers` 테이블을 설계하고 초기 관리자 계정 데이터를 등록했습니다.

---

## 🔧 백엔드 구현 (REST API + JPA)

### 1) 구현한 핵심 내용
- `Event` 엔티티를 설계하고 JPA 매핑을 적용하여 위반 이벤트 데이터를 영속화했습니다.
- `User` 엔티티를 통해 관리자 계정을 DB와 연동하고 로그인 인증에 필요한 정보를 관리했습니다.
- `EventRepository`와 `UserRepository`를 구현하여 CRUD 기반 데이터 조회 및 저장 기능을 구성했습니다.

### 2) REST API 구현
백엔드 서버에서 이벤트와 관리자 인증 기능을 위한 REST API를 구현했습니다.

| Method | URL | 기능 |
|--------|-----|------|
| `GET` | `/api/event/latest` | 최근 이벤트 목록 조회 |
| `GET` | `/api/event/paged` | 페이지네이션 기반 이벤트 조회 |
| `POST` | `/api/event` | AI 서버로부터 이벤트 생성 |
| `PATCH` | `/api/event/{eventId}/status` | 상태 및 조치 메모 업데이트 |
| `GET` | `/api/event/{eventId}/image` | 저장된 위반 이미지 조회 |
| `POST` | `/api/users/login` | 관리자 로그인 및 JWT 발급 |

### 3) 서비스 로직 구현
- `EventService`에서 이벤트 생성, 상태 변경, 이미지 저장, 중복 탐지 방지, 실시간 WebSocket 전송 로직을 구현했습니다.
- AI 서버로부터 전달된 Base64 이미지 데이터를 저장하고, 저장된 파일 경로를 DB에 기록하도록 구성했습니다.
- 이벤트 상태가 `resolved`로 변경될 때 완료 여부와 완료 시각이 반영되도록 처리했습니다.
- 관리자 페이지에서 이벤트 상태를 조회하고 갱신할 수 있도록 API 흐름을 연결했습니다.

> 현재 구현은 생성, 조회, 수정 중심의 CRUD 기능을 기반으로 구성되었으며, 향후 확장 가능한 구조로 설계했습니다.

---

## �🚀 실행 방법

### 사전 요구사항

- Java 17+
- Python 3.10+
- Node.js 18+
- MySQL 8.0

---

### 빠른 실행 (Windows: start.bat)

Windows 환경에서는 프로젝트 루트의 `start.bat`를 실행하면 백엔드, 감지 서버, 프론트엔드를 한 번에 실행할 수 있습니다.

```bat
cd <프로젝트 루트>
start.bat
```

실행 순서:
1. MySQL이 실행 중인지 확인합니다.
2. Detector용 Python 가상환경이 준비되어 있어야 합니다. 없으면 먼저 아래 명령으로 생성합니다.

```bat
cd detector
python -m venv ..\.venv
..\.venv\Scripts\activate
pip install -r requirements.txt
```

3. `start.bat` 실행 시 Spring Boot(`:8080`), FastAPI Detector(`:8000`), React(`:5173`)가 각각 별도 창에서 실행됩니다.
4. 실행 후 브라우저에서 `http://localhost:5173`으로 접속합니다.

> 기본 로그인 계정: `safety-admin / admin1234`

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

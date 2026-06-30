from __future__ import annotations

import json
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import cv2
import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    if not MODEL_PATH.exists():
        raise RuntimeError(f"모델 파일 없음: {MODEL_PATH}")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    state.model = YOLO(str(MODEL_PATH))
    state.class_names = state.model.names if hasattr(state.model, "names") else {}
    yield
    # shutdown: 모든 감지 스레드 중단
    for ev in list(state.stop_events.values()):
        ev.set()
    state.stop_events.clear()
    state.running = False


app = FastAPI(title="PPE Detector Bridge", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_BASE = Path(__file__).resolve().parent.parent   # PPE-monitoring/ 루트
MODEL_PATH = _BASE / "AI" / "new_best_model" / "weights" / "best.pt"
SPRING_EVENT_API = "http://localhost:8080/api/event"
UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"


@dataclass
class DetectorState:
    running: bool = False
    source: str | int = 0
    camera_name: str = "CAM 04 - Warehouse"
    thread: threading.Thread | None = None
    stop_event: threading.Event | None = None
    model: YOLO | None = None
    class_names: dict[int, str] | None = None
    sent_count: int = 0
    last_error: str = ""
    latest_camera_name: str = ""
    latest_updated_at: float = 0.0
    latest_detections: list[dict[str, Any]] | None = None
    latest_by_camera: dict[str, dict[str, Any]] = field(default_factory=dict)
    stop_events: dict[str, threading.Event] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)


state = DetectorState()


def _normalize_box_xyxy(box: list[float], w: float, h: float) -> list[float]:
    x1, y1, x2, y2 = box
    if w <= 0 or h <= 0:
        return [0.0, 0.0, 0.0, 0.0]
    return [
        round(max(0.0, min(1.0, x1 / w)), 4),
        round(max(0.0, min(1.0, y1 / h)), 4),
        round(max(0.0, min(1.0, x2 / w)), 4),
        round(max(0.0, min(1.0, y2 / h)), 4),
    ]


def _center_inside(inner: list[float], outer: list[float]) -> bool:
    ix1, iy1, ix2, iy2 = inner
    ox1, oy1, ox2, oy2 = outer
    cx = (ix1 + ix2) / 2
    cy = (iy1 + iy2) / 2
    return ox1 <= cx <= ox2 and oy1 <= cy <= oy2


def _detect_violations_with_names(result: Any, names: dict) -> list[dict[str, Any]]:
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return []

    persons: list[dict[str, Any]] = []
    helmets: list[list[float]] = []
    vests: list[list[float]] = []
    raw_detections: list[dict[str, Any]] = []

    for box in boxes:
        cls_id = int(box.cls[0].item())
        conf = float(box.conf[0].item())
        xyxy = box.xyxy[0].tolist()
        cls_name = str(names.get(cls_id, cls_id)).lower()

        raw_detections.append({"cls": cls_name, "conf": conf, "box": xyxy})

        if "person" in cls_name:
            persons.append({"box": xyxy, "conf": conf})
        elif "helmet" in cls_name or "hardhat" in cls_name:
            helmets.append(xyxy)
        elif "vest" in cls_name:
            vests.append(xyxy)

    violations = []

    # Mode A: model has person class -> infer missing PPE per person.
    if len(persons) > 0:
        for p in persons:
            pbox = p["box"]
            has_helmet = any(_center_inside(h, pbox) for h in helmets)
            has_vest = any(_center_inside(v, pbox) for v in vests)

            if has_helmet and has_vest:
                continue

            if not has_helmet and not has_vest:
                detected_code = 3
            elif not has_helmet:
                detected_code = 1
            else:
                detected_code = 2

            violations.append({"detected_code": detected_code, "confidence": p["conf"], "person_box": pbox})
        return violations

    # Mode B: no-helmet / no-vest 직접 감지 (새 모델)
    for det in raw_detections:
        cls_name = det["cls"]
        if "no-helmet" in cls_name or "no_helmet" in cls_name:
            code = 1
        elif "no-vest" in cls_name or "no_vest" in cls_name:
            code = 2
        else:
            continue
        violations.append({"detected_code": code, "confidence": det["conf"], "person_box": det["box"]})

    return violations


# 하위 호환용 wrapper
def _detect_violations(result: Any) -> list[dict[str, Any]]:
    return _detect_violations_with_names(result, state.class_names or {})


def _extract_live_detections_with_names(result: Any, frame_w: int, frame_h: int, names: dict) -> list[dict[str, Any]]:
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return []

    out: list[dict[str, Any]] = []
    for box in boxes:
        cls_id = int(box.cls[0].item())
        conf = float(box.conf[0].item())
        xyxy = [float(v) for v in box.xyxy[0].tolist()]
        track_id = int(box.id[0].item()) if box.id is not None else None
        out.append({
            "classId": cls_id,
            "className": str(names.get(cls_id, cls_id)),
            "confidence": round(conf, 4),
            "bboxNorm": _normalize_box_xyxy(xyxy, frame_w, frame_h),
            "trackId": track_id,
        })

    return out


def _extract_live_detections(result: Any, frame_w: int, frame_h: int) -> list[dict[str, Any]]:
    return _extract_live_detections_with_names(result, frame_w, frame_h, state.class_names or {})


def _frame_to_base64(frame: Any, person_box: list[float] | None = None) -> str | None:
    """프레임을 JPEG base64로 인코딩. person_box가 있으면 위반 영역 하이라이트."""
    try:
        vis = frame.copy()
        if person_box is not None and len(person_box) == 4:
            x1, y1, x2, y2 = [int(v) for v in person_box]
            cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 0, 255), 3)
            cv2.putText(vis, "VIOLATION", (x1, max(y1 - 10, 20)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        ok, buf = cv2.imencode(".jpg", vis, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if not ok:
            return None
        import base64
        return base64.b64encode(buf.tobytes()).decode("utf-8")
    except Exception:
        return None


def _post_event(cctv_no: str, detected_code: int, confidence: float,
                person_box: list[float], frame_w: int, frame_h: int,
                frame: Any | None = None):
    norm_box = _normalize_box_xyxy(person_box, frame_w, frame_h)
    bbox = {"person": norm_box}

    image_base64 = _frame_to_base64(frame, person_box) if frame is not None else None

    payload = {
        "cctvNo": cctv_no,
        "detectedCode": detected_code,
        "confidence": round(confidence, 4),
        "bboxJson": json.dumps(bbox, ensure_ascii=False),
        "imageBase64": image_base64,
    }

    response = requests.post(SPRING_EVENT_API, json=payload, timeout=5)
    response.raise_for_status()
    state.sent_count += 1


def _run_loop(source: str | int, camera_name: str, stop_event: threading.Event):
    # 카메라마다 독립적인 모델 인스턴스 로드 (thread-safe)
    model = YOLO(str(MODEL_PATH))
    class_names = model.names if hasattr(model, "names") else {}

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        state.last_error = f"영상 소스를 열 수 없습니다: {source}"
        state.running = False
        return

    fps_limit = 4
    min_interval = 1.0 / fps_limit
    last_t = 0.0

    try:
        while not stop_event.is_set():
            ok, frame = cap.read()
            if not ok:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                time.sleep(0.05)
                continue

            now = time.time()
            if now - last_t < min_interval:
                time.sleep(0.02)
                continue
            last_t = now

            h, w = frame.shape[:2]
            results = model.track(source=frame, persist=True, verbose=False, conf=0.45, imgsz=640, tracker='bytetrack.yaml')
            if not results:
                continue

            live_detections = _extract_live_detections_with_names(results[0], w, h, class_names)
            now_ts = time.time()
            with state._lock:
                state.latest_camera_name = camera_name
                state.latest_detections = live_detections
                state.latest_updated_at = now_ts
                state.latest_by_camera[camera_name] = {
                    "updatedAt": now_ts,
                    "detections": live_detections,
                }

            violations = _detect_violations_with_names(results[0], class_names)
            for v in violations:
                try:
                    _post_event(
                        cctv_no=camera_name,
                        detected_code=v["detected_code"],
                        confidence=v["confidence"],
                        person_box=v["person_box"],
                        frame_w=w,
                        frame_h=h,
                        frame=frame,
                    )
                except Exception as e:
                    state.last_error = f"이벤트 전송 실패: {e}"
    finally:
        cap.release()
        with state._lock:
            # 현재 스레드의 stop_event가 아직 자신 것일 때만 제거 (새 스레드 등록 후엔 건드리지 않음)
            if state.stop_events.get(camera_name) is stop_event:
                state.stop_events.pop(camera_name, None)
            state.running = len(state.stop_events) > 0


class StartRequest(BaseModel):
    source: str = "0"
    cameraName: str = "CAM 04 - Warehouse"


@app.get("/health")
def health():
    return {"ok": True, "time": datetime.now().isoformat()}


@app.get("/status")
def status():
    return {
        "running": state.running,
        "source": state.source,
        "cameraName": state.camera_name,
        "sentCount": state.sent_count,
        "lastError": state.last_error,
        "classNames": state.class_names,
    }


@app.get("/live-detections")
def live_detections():
    with state._lock:
        return {
            "running": state.running,
            "cameraName": state.latest_camera_name,
            "updatedAt": state.latest_updated_at,
            "detections": list(state.latest_detections or []),
            "detectionsByCamera": {k: dict(v) for k, v in state.latest_by_camera.items()},
        }


@app.post("/start")
def start(req: StartRequest):
    src: str | int
    if req.source.isdigit():
        src = int(req.source)
    else:
        src = req.source

    with state._lock:
        prev = state.stop_events.get(req.cameraName)
        if prev:
            prev.set()
        state.latest_by_camera.pop(req.cameraName, None)
        stop_event = threading.Event()
        state.stop_events[req.cameraName] = stop_event
        state.running = True
        state.source = src
        state.camera_name = req.cameraName
        state.stop_event = stop_event
        state.last_error = ""
        state.latest_camera_name = req.cameraName
        state.latest_updated_at = 0.0
        state.latest_detections = []

    t = threading.Thread(target=_run_loop, args=(src, req.cameraName, stop_event), daemon=True)
    state.thread = t
    t.start()
    return {"ok": True, "running": True, "source": src, "cameraName": req.cameraName}


@app.post("/analyze-upload")
async def analyze_upload(
    file: UploadFile = File(...),
    cameraName: str = Form("CAM 04 - Warehouse"),
):
    suffix = Path(file.filename or "upload.mp4").suffix or ".mp4"
    save_path = UPLOAD_DIR / f"{int(time.time() * 1000)}{suffix}"

    with save_path.open("wb") as f:
        f.write(await file.read())

    with state._lock:
        prev = state.stop_events.get(cameraName)
        if prev:
            prev.set()
        state.latest_by_camera.pop(cameraName, None)
        stop_event = threading.Event()
        state.stop_events[cameraName] = stop_event
        state.running = True
        state.source = str(save_path)
        state.camera_name = cameraName
        state.stop_event = stop_event
        state.last_error = ""
        state.latest_camera_name = cameraName
        state.latest_updated_at = 0.0
        state.latest_detections = []

    def _run_and_cleanup():
        _run_loop(str(save_path), cameraName, stop_event)
        try:
            save_path.unlink(missing_ok=True)
        except Exception:
            pass

    t = threading.Thread(target=_run_and_cleanup, daemon=True)
    state.thread = t
    t.start()
    return {"ok": True, "running": True, "source": str(save_path), "cameraName": cameraName}


@app.post("/stop")
def stop():
    with state._lock:
        if not state.running and len(state.stop_events) == 0:
            return {"ok": True, "running": False}
        for ev in list(state.stop_events.values()):
            ev.set()
        state.stop_events.clear()
        state.running = False
    return {"ok": True, "running": False}

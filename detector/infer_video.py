from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import cv2
import requests
from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run PPE inference on a saved video")
    p.add_argument("--video", required=True, help="Input video path")
    p.add_argument("--model", default=str(Path(__file__).resolve().parent.parent / "AI" / "new_best_model" / "weights" / "best.pt"), help="YOLO model path")
    p.add_argument("--out-video", default="", help="Annotated output video path (optional)")
    p.add_argument("--out-jsonl", default="inference_results.jsonl", help="Output JSONL path")
    p.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    p.add_argument("--stride", type=int, default=1, help="Process every Nth frame")
    p.add_argument("--camera-name", default="CAM 04 - Warehouse", help="Camera name stored in DB")
    p.add_argument("--post-api", action="store_true", help="POST detections to Spring /api/event")
    p.add_argument("--api-url", default="http://localhost:8080/api/event", help="Spring event API URL")
    p.add_argument("--cooldown-sec", type=float, default=0.8, help="Skip duplicate posts in same area for N sec")
    return p.parse_args()


def ensure_parent(path: Path) -> None:
    if path.parent and not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)


def detect_code_from_class(class_name: str) -> int | None:
    n = class_name.lower()
    if "helmet" in n or "hardhat" in n:
        return 1  # NO_HELMET
    if "vest" in n:
        return 2  # NO_VEST
    if "both" in n:
        return 3  # NO_HELMET_AND_VEST
    return None


def key_for_cooldown(class_name: str, bbox_norm: list[float]) -> str:
    x1, y1, x2, y2 = bbox_norm
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    return f"{class_name.lower()}:{int(cx * 20)}:{int(cy * 20)}"


def main() -> None:
    args = parse_args()

    video_path = Path(args.video)
    model_path = Path(args.model)
    out_jsonl = Path(args.out_jsonl)

    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    ensure_parent(out_jsonl)

    model = YOLO(str(model_path))
    class_names: dict[int, str] = model.names if hasattr(model, "names") else {}

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)

    writer = None
    if args.out_video:
        out_video = Path(args.out_video)
        ensure_parent(out_video)
        writer = cv2.VideoWriter(
            str(out_video),
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps,
            (width, height),
        )

    frame_idx = 0
    processed = 0
    posted_count = 0
    last_post_times: dict[str, float] = {}

    with out_jsonl.open("w", encoding="utf-8") as jf:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            frame_idx += 1
            if args.stride > 1 and (frame_idx % args.stride != 0):
                if writer is not None:
                    writer.write(frame)
                continue

            results = model.predict(source=frame, conf=args.conf, verbose=False)
            if not results:
                if writer is not None:
                    writer.write(frame)
                continue

            r = results[0]
            boxes = r.boxes
            detections: list[dict[str, Any]] = []

            if boxes is not None and len(boxes) > 0:
                for b in boxes:
                    cls_id = int(b.cls[0].item())
                    conf = float(b.conf[0].item())
                    x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].tolist()]
                    label = str(class_names.get(cls_id, cls_id))

                    bbox_norm = [
                        round(max(0.0, min(1.0, x1 / width)), 4),
                        round(max(0.0, min(1.0, y1 / height)), 4),
                        round(max(0.0, min(1.0, x2 / width)), 4),
                        round(max(0.0, min(1.0, y2 / height)), 4),
                    ]

                    det = {
                        "classId": cls_id,
                        "className": label,
                        "confidence": round(conf, 4),
                        "bbox": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
                        "bboxNorm": bbox_norm,
                    }
                    detections.append(det)

                    if args.post_api:
                        code = detect_code_from_class(label)
                        if code is not None:
                            key = key_for_cooldown(label, bbox_norm)
                            now_ts = frame_idx / fps
                            if (now_ts - last_post_times.get(key, -9999)) >= args.cooldown_sec:
                                payload = {
                                    "cctvNo": args.camera_name,
                                    "detectedCode": code,
                                    "confidence": round(conf, 4),
                                    "bboxJson": json.dumps({"person": bbox_norm}, ensure_ascii=False),
                                }
                                try:
                                    resp = requests.post(args.api_url, json=payload, timeout=3)
                                    resp.raise_for_status()
                                    posted_count += 1
                                    last_post_times[key] = now_ts
                                except Exception as e:
                                    print(f"[WARN] post failed frame={frame_idx}: {e}")

                    if writer is not None:
                        cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 0, 255), 2)
                        cv2.putText(
                            frame,
                            f"{label} {conf:.2f}",
                            (int(x1), max(20, int(y1) - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.55,
                            (0, 255, 255),
                            2,
                            cv2.LINE_AA,
                        )

            row = {
                "frame": frame_idx,
                "timeSec": round(frame_idx / fps, 3),
                "detections": detections,
            }
            jf.write(json.dumps(row, ensure_ascii=False) + "\n")

            if writer is not None:
                writer.write(frame)

            processed += 1
            if processed % 100 == 0:
                print(f"Processed {processed} frames...")

    cap.release()
    if writer is not None:
        writer.release()

    print("Done")
    print(f"- video: {video_path}")
    print(f"- model: {model_path}")
    print(f"- jsonl: {out_jsonl}")
    if args.out_video:
        print(f"- out-video: {args.out_video}")
    if args.post_api:
        print(f"- posted-to-api: {posted_count}")


if __name__ == "__main__":
    main()

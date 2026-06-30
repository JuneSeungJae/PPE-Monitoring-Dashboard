package com.example.ppe.Event;

import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/event")
@RequiredArgsConstructor
public class EventController {

    private final EventService eventService;

    // GET /api/event/latest — 전체 목록 (기존 호환)
    @GetMapping("/latest")
    public ResponseEntity<List<EventResponse>> getLatestEvents() {
        List<EventResponse> responses = eventService.getLatestEvents().stream()
                .map(EventResponse::from)
                .collect(Collectors.toList());
        return ResponseEntity.ok(responses);
    }

    // GET /api/event/paged?page=0&size=20 — 페이지네이션
    @GetMapping("/paged")
    public ResponseEntity<Map<String, Object>> getEventsPaged(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, Math.min(size, 100)); // 최대 100건
        Page<Event> result = eventService.getEventsPaged(pageable);
        List<EventResponse> content = result.getContent().stream()
                .map(EventResponse::from)
                .collect(Collectors.toList());
        return ResponseEntity.ok(Map.of(
                "content",       content,
                "page",          result.getNumber(),
                "size",          result.getSize(),
                "totalElements", result.getTotalElements(),
                "totalPages",    result.getTotalPages(),
                "last",          result.isLast()
        ));
    }

    // POST /api/event — AI 서버에서 이벤트 등록 (PUBLIC — JWT 불필요)
    @PostMapping
    public ResponseEntity<EventResponse> createEvent(@RequestBody EventCreateRequest request) {
        Event created = eventService.createEvent(
                request.getCctvNo(),
                request.getDetectedCode(),
                request.getConfidence(),
                request.getBboxJson(),
                request.getImageBase64()
        );
        return ResponseEntity.ok(EventResponse.from(created));
    }

    // PATCH /api/event/{eventId}/status — 상태 + 메모 업데이트
    @PatchMapping("/{eventId}/status")
    public ResponseEntity<EventResponse> updateEventStatus(
            @PathVariable Integer eventId,
            @RequestBody EventStatusRequest request) {
        Event updated = eventService.updateEventStatus(eventId, request.getStatus(), request.getNotes());
        return ResponseEntity.ok(EventResponse.from(updated));
    }

    // GET /api/event/{eventId}/image — 위반 이미지 서빙 (findById로 최적화)
    @GetMapping("/{eventId}/image")
    public ResponseEntity<Resource> getEventImage(@PathVariable Integer eventId) {
        Event event;
        try {
            event = eventService.findById(eventId);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }

        if (event.getImagePath() == null || event.getImagePath().isBlank()) {
            return ResponseEntity.notFound().build();
        }

        Path imagePath = eventService.getImagePath(event.getImagePath());
        if (!Files.exists(imagePath)) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(imagePath);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .header(HttpHeaders.CACHE_CONTROL, "max-age=3600")
                .body(resource);
    }
}

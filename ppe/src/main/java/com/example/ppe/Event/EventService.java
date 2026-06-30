package com.example.ppe.Event;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EventService {

    private static final long EVENT_COOLDOWN_SECONDS = 30;
    private static final Set<String> VALID_STATUSES = Set.of("new", "acked", "in_progress", "resolved");
    private static final Path IMAGE_DIR = Paths.get(System.getProperty("user.home"), "ppe-images");

    private final EventRepository eventRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public List<Event> getLatestEvents() {
        return eventRepository.findAllByOrderByCreatedAtDesc();
    }

    public Page<Event> getEventsPaged(Pageable pageable) {
        return eventRepository.findAllByOrderByCreatedAtDesc(pageable);
    }

    public Event findById(Integer eventId) {
        return eventRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("이벤트를 찾을 수 없습니다. ID: " + eventId));
    }

    @Transactional
    public Event createEvent(String cctvNo, Integer detectedCode, Double confidence,
                             String bboxJson, String imageBase64) {
        String normalizedCctvNo = cctvNo == null ? "UNKNOWN" : cctvNo;
        Integer normalizedDetectedCode = detectedCode == null ? 0 : detectedCode;
        LocalDateTime now = LocalDateTime.now();

        // 쿨다운 체크 (30초)
        Event latest = eventRepository
                .findTopByCctvNoAndDetectedCodeOrderByDetectedAtDesc(normalizedCctvNo, normalizedDetectedCode)
                .orElse(null);

        if (latest != null && latest.getDetectedAt() != null) {
            LocalDateTime cooldownUntil = latest.getDetectedAt().plusSeconds(EVENT_COOLDOWN_SECONDS);
            if (now.isBefore(cooldownUntil)) {
                messagingTemplate.convertAndSend("/topic/events", EventResponse.from(latest));
                return latest;
            }
        }

        // 이미지 저장
        String imagePath = null;
        if (imageBase64 != null && !imageBase64.isBlank()) {
            imagePath = saveImage(imageBase64, normalizedCctvNo, now);
        }

        Event event = Event.builder()
                .cctvNo(normalizedCctvNo)
                .detectedCode(normalizedDetectedCode)
                .detectedAt(now)
                .confidence(confidence)
                .bboxJson(bboxJson)
                .imagePath(imagePath)
                .status("new")
                .completedFlag(false)
                .completedAt(null)
                .build();

        Event saved = eventRepository.save(event);
        messagingTemplate.convertAndSend("/topic/events", EventResponse.from(saved));
        return saved;
    }

    @Transactional
    public Event updateEventStatus(Integer eventId, String status, String notes) {
        if (eventId == null) throw new IllegalArgumentException("이벤트 ID가 null입니다.");

        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("이벤트를 찾을 수 없습니다. ID: " + eventId));

        String normalized = status != null ? status.toLowerCase() : "new";
        event.setStatus(VALID_STATUSES.contains(normalized) ? normalized : "new");

        if (notes != null && !notes.isBlank()) {
            event.setActionNotes(notes.trim());
        }

        if ("resolved".equals(normalized)) {
            event.setCompletedFlag(true);
            event.setCompletedAt(LocalDateTime.now());
        } else {
            event.setCompletedFlag(false);
            event.setCompletedAt(null);
        }

        Event saved = eventRepository.save(event);
        messagingTemplate.convertAndSend("/topic/events", EventResponse.from(saved));
        return saved;
    }

    // base64 JPEG → 파일 저장, 파일명 반환
    private String saveImage(String base64, String cctvNo, LocalDateTime ts) {
        try {
            Files.createDirectories(IMAGE_DIR);
            String sanitized = cctvNo.replaceAll("[^a-zA-Z0-9]", "_");
            String filename = sanitized + "_" + ts.format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss_SSS")) + ".jpg";
            Path dest = IMAGE_DIR.resolve(filename);

            String pure = base64.contains(",") ? base64.split(",", 2)[1] : base64;
            byte[] bytes = Base64.getDecoder().decode(pure);
            Files.write(dest, bytes);
            return filename;
        } catch (IOException | IllegalArgumentException e) {
            log.warn("이미지 저장 실패: {}", e.getMessage());
            return null;
        }
    }

    public Path getImagePath(String filename) {
        return IMAGE_DIR.resolve(filename);
    }
}

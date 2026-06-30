package com.example.ppe.Event;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(
    name = "cctv_event",
    indexes = {
        @Index(name = "idx_cctv_code_detected", columnList = "cctv_no, detected_code, detected_at DESC"),
        @Index(name = "idx_created_at", columnList = "created_at DESC")
    }
)
public class Event {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Integer id;

    @Column(name = "cctv_no", length = 20, nullable = false)
    private String cctvNo;

    @Column(name = "detected_code", nullable = false)
    private Integer detectedCode;

    @Column(name = "detected_at", nullable = false)
    private LocalDateTime detectedAt;

    @Column(name = "confidence")
    private Double confidence;

    @Lob
    @Column(name = "bbox_json")
    private String bboxJson;

    @Column(name = "image_path", length = 500)
    private String imagePath;

    @Builder.Default
    @Column(name = "status", length = 20, nullable = false)
    private String status = "new";

    @Lob
    @Column(name = "action_notes")
    private String actionNotes;

    @Builder.Default
    @Column(name = "completed_flag", columnDefinition = "TINYINT(1) DEFAULT 0")
    private boolean completedFlag = false;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
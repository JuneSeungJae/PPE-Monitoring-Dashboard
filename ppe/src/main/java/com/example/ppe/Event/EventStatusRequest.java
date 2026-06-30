package com.example.ppe.Event;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class EventStatusRequest {
    private String status;
    private String notes; // 조치 메모 (선택)
}

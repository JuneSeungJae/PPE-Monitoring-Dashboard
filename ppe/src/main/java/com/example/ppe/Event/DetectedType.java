package com.example.ppe.Event;

public enum DetectedType {
    NO_HELMET(1, "헬멧 미착용"),
    NO_VEST(2, "조끼 미착용"),
    NO_HELMET_AND_VEST(3, "헬멧+조끼 미착용");

    private final int code;
    private final String description;

    DetectedType(int code, String description) {
        this.code = code;
        this.description = description;
    }

    public int getCode() {
        return code;
    }

    public String getDescription() {
        return description;
    }

    public static DetectedType fromCode(int code) {
        for (DetectedType type : values()) {
            if (type.code == code) {
                return type;
            }
        }
        throw new IllegalArgumentException("알 수 없는 감지 코드: " + code);
    }
}

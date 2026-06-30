package com.example.ppe.user;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@AllArgsConstructor
@Builder
public class UserResponse {
    private String employeeId;
    private String employeeName;
    private boolean safetyManagerFlag;

    public static UserResponse from(User user) {
        return UserResponse.builder()
                .employeeId(user.getEmployeeId())
                .employeeName(user.getEmployeeName())
                .safetyManagerFlag(user.isSafetyManagerFlag())
                .build();
    }
}
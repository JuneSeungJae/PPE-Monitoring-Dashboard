package com.example.ppe.user;

import com.example.ppe.config.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final JwtUtil jwtUtil;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest loginRequest) {
        try {
            User user = userService.login(loginRequest.getEmployeeId(), loginRequest.getPassword());
            String token = jwtUtil.generateToken(user.getEmployeeId(), user.getEmployeeName());
            return ResponseEntity.ok(Map.of(
                    "token", token,
                    "employeeId", user.getEmployeeId(),
                    "employeeName", user.getEmployeeName(),
                    "safetyManagerFlag", user.isSafetyManagerFlag()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", e.getMessage()));
        }
    }
}

package com.example.ppe.config;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT 유틸리티.
 * 시크릿 키는 고정 문자열에서 파생 → 서버 재시작 후에도 기존 토큰 유효.
 * 운영 환경에서는 환경변수(JWT_SECRET)로 교체할 것.
 */
@Component
public class JwtUtil {

    private static final long EXPIRATION_MS = 1000L * 60 * 60 * 8; // 8시간

    // 최소 256-bit(32바이트) 고정 시크릿 — 재시작해도 토큰 유지
    private static final String SECRET =
            "PPE-Monitoring-JWT-SecretKey-2025-MUST-BE-32-BYTES!";
    private final SecretKey key =
            Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));

    public String generateToken(String employeeId, String employeeName) {
        return Jwts.builder()
                .subject(employeeId)
                .claim("name", employeeName)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + EXPIRATION_MS))
                .signWith(key)
                .compact();
    }

    public String extractEmployeeId(String token) {
        return parseClaims(token).getSubject();
    }

    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}

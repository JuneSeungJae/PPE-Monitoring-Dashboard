package com.example.ppe.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class JwtFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        // CORS preflight 는 항상 통과
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        // 공개 경로 체크
        if (isPublicPath(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        // JWT 검증
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            sendUnauthorized(response, "인증 토큰이 필요합니다.");
            return;
        }

        String token = authHeader.substring(7);
        if (!jwtUtil.validateToken(token)) {
            sendUnauthorized(response, "토큰이 유효하지 않거나 만료되었습니다.");
            return;
        }

        filterChain.doFilter(request, response);
    }

    /**
     * 인증 없이 허용할 경로 판단.
     * - WebSocket / actuator : 경로 prefix
     * - POST /api/users/login : 로그인
     * - POST /api/event       : AI 서버 이벤트 등록 (내부 통신, 토큰 없음)
     * - GET  /api/event/{id}/image : img 태그 직접 접근 → 쿠키/헤더 첨부 불가
     */
    private boolean isPublicPath(HttpServletRequest request) {
        String uri    = request.getRequestURI();
        String method = request.getMethod().toUpperCase();

        // WebSocket 핸드셰이크 / SockJS 경로
        if (uri.startsWith("/ws")) return true;

        // Spring Actuator
        if (uri.startsWith("/actuator")) return true;

        // 로그인
        if ("/api/users/login".equals(uri)) return true;

        // AI 서버 → 이벤트 등록 (POST only)
        if ("POST".equals(method) && "/api/event".equals(uri)) return true;

        // 이미지 서빙: GET /api/event/{숫자}/image
        // <img src> 는 Authorization 헤더를 설정할 수 없으므로 public 허용
        if ("GET".equals(method) && uri.matches("/api/event/\\d+/image")) return true;

        // 대시보드 조회용 GET 엔드포인트 (토큰 없는 메인 화면)
        if ("GET".equals(method) && uri.startsWith("/api/event")) return true;

        return false;
    }

    private void sendUnauthorized(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}

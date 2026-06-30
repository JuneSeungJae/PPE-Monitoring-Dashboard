package com.example.ppe.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

/**
 * STOMP CONNECT 프레임에서 JWT 검증.
 * 토큰이 없으면 허용 (Demo 모드 / 오프라인 fallback 지원).
 * 토큰이 있으면 유효성 검증 후 통과.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StompChannelInterceptor implements ChannelInterceptor {

    private final JwtUtil jwtUtil;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String authHeader = accessor.getFirstNativeHeader("Authorization");

            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);
                if (!jwtUtil.validateToken(token)) {
                    log.warn("WebSocket CONNECT 거부: 유효하지 않은 JWT");
                    // 토큰이 있는데 잘못된 경우만 거부
                    throw new org.springframework.messaging.MessagingException("유효하지 않은 토큰입니다.");
                }
                log.debug("WebSocket CONNECT 인증 성공: {}", jwtUtil.extractEmployeeId(token));
            }
            // 토큰 없음 → 허용 (Demo 모드)
        }
        return message;
    }
}

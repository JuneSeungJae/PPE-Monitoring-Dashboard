-- ================================================================
-- PPE-Monitoring DB 마이그레이션 스크립트
-- spring.jpa.hibernate.ddl-auto=update 가 정상 작동하면 불필요합니다.
-- MySQL 워크벤치 또는 CLI에서 수동 실행 시 사용하세요.
-- ================================================================

USE teampj;

-- cctv_event 테이블에 신규 컬럼 추가 (이미 존재하면 무시)
ALTER TABLE cctv_event
    ADD COLUMN IF NOT EXISTS image_path  VARCHAR(500)  NULL COMMENT '위반 스냅샷 이미지 파일명',
    ADD COLUMN IF NOT EXISTS action_notes TEXT          NULL COMMENT '조치 메모',
    ADD COLUMN IF NOT EXISTS status       VARCHAR(20)   NOT NULL DEFAULT 'new' COMMENT '이벤트 처리 상태 (new/acked/in_progress/resolved)';

-- safety_managers 테이블 password 컬럼 길이 확장 (BCrypt 60자 필요)
ALTER TABLE safety_managers
    MODIFY COLUMN password VARCHAR(255) NOT NULL COMMENT 'BCrypt 해시 비밀번호';

-- 인덱스 추가 (없으면 생성)
CREATE INDEX IF NOT EXISTS idx_cctv_code_detected
    ON cctv_event (cctv_no, detected_code, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_created_at
    ON cctv_event (created_at DESC);

-- 기본 관리자 계정 (BCrypt: admin1234)
INSERT INTO safety_managers (employee_id, employee_name, password, safety_manager_flag, created_at, updated_at)
VALUES ('safety-admin', 'admin', '$2b$10$MJVbp6F4E400AIxA3gdQaOHTeXCddwFb7G3.teqtrsHm9B2mx7242', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
    password   = '$2b$10$MJVbp6F4E400AIxA3gdQaOHTeXCddwFb7G3.teqtrsHm9B2mx7242',
    updated_at = NOW();

SELECT 'Migration completed.' AS result;

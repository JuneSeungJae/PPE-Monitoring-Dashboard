INSERT INTO safety_managers (employee_id, employee_name, password, safety_manager_flag, created_at, updated_at)
VALUES ('safety-admin', 'admin', '$2b$10$MJVbp6F4E400AIxA3gdQaOHTeXCddwFb7G3.teqtrsHm9B2mx7242', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE password = '$2b$10$MJVbp6F4E400AIxA3gdQaOHTeXCddwFb7G3.teqtrsHm9B2mx7242', updated_at = NOW();

package com.example.ppe.user;

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public List<User> findAllUsers() {
        return userRepository.findAll();
    }

    public User findUserById(String employeeId) {
        if (employeeId == null) throw new IllegalArgumentException("사원 번호가 null입니다.");
        return userRepository.findById(employeeId)
                .orElseThrow(() -> new IllegalArgumentException("사용자가 존재하지 않습니다: " + employeeId));
    }

    public User login(String employeeId, String password) {
        User user = findUserById(employeeId);
        // BCrypt 해시 비교 (평문 비밀번호도 하위 호환 지원)
        boolean matches;
        if (user.getPassword().startsWith("$2")) {
            matches = passwordEncoder.matches(password, user.getPassword());
        } else {
            // 평문 저장된 경우 — 일치하면 자동으로 BCrypt로 업그레이드
            matches = user.getPassword().equals(password);
            if (matches) {
                upgradePassword(user, password);
            }
        }
        if (!matches) throw new IllegalArgumentException("비밀번호가 일치하지 않습니다.");
        return user;
    }

    @Transactional
    public void upgradePassword(User user, String rawPassword) {
        user.setPassword(passwordEncoder.encode(rawPassword));
        userRepository.save(user);
    }

    @Transactional
    public User createUser(User user) {
        if (user == null) throw new IllegalArgumentException("사용자 정보가 null입니다.");
        if (!user.getPassword().startsWith("$2")) {
            user.setPassword(passwordEncoder.encode(user.getPassword()));
        }
        return userRepository.save(user);
    }

    @Transactional
    public void deleteUser(String employeeId) {
        if (employeeId == null) throw new IllegalArgumentException("사원 번호가 null입니다.");
        userRepository.deleteById(employeeId);
    }
}

package com.example.ppe.user;


import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "safety_managers")
public class User {

    @Id
    @Column(name = "employee_id", length = 50, nullable = false)
    private String employeeId;

    @Column(name = "employee_name", length = 20, nullable = false)
    private String employeeName;

    @Column(length = 255, nullable = false)
    private String password;

    @Builder.Default
    @Column(name = "safety_manager_flag", nullable = false, columnDefinition = "TINYINT(1) DEFAULT 1")
    private boolean safetyManagerFlag = true;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

}

package com.example.ppe.Event;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface EventRepository extends JpaRepository<Event, Integer> {
    List<Event> findAllByOrderByCreatedAtDesc();
    Page<Event> findAllByOrderByCreatedAtDesc(Pageable pageable);
    Optional<Event> findTopByCctvNoAndDetectedCodeOrderByDetectedAtDesc(String cctvNo, Integer detectedCode);
}
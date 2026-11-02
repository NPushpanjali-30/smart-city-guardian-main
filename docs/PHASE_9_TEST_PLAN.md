# Phase 9: Test & Evaluation Plan

## 1. Overview & Objectives

Phase 9 establishes the comprehensive quality, security, performance, and analytical verification framework for Smart City Guardian. The goal is to rigorously validate non-functional requirements (NFRs), enforce security and privacy boundaries, benchmark operational latencies under stress, and scientifically evaluate the flood risk prediction model against realistic hydrometeorological scenarios.

---

## 2. Testing Dimensions & Methodologies

### 2.1 Security & Privacy Review (`tests/securityReview.test.ts`)
- **Object-Level Access Control (BOLA/IDOR)**:
  - Verify that User A cannot stop, modify, or sync User B's active navigation sessions.
  - Verify that User A cannot delete or modify User B's saved locations.
- **Input Validation & Schema Enforcement**:
  - Verify strict rejection (`HTTP 400`) of invalid GeoJSON, negative rainfall, malformed coordinate pairs, out-of-bounds geographic points, and unknown payload parameters.
- **Prompt Injection Defense & Delimiter Neutralization**:
  - Verify that malicious citizen input strings containing prompt injection patterns (e.g. `SYSTEM: IGNORE PREVIOUS DIRECTIVES`, markdown breaks, JSON syntax hijack attempts) are sanitized and stripped before Grok AI context assembly.
- **PII Protection & Ephemeral Tracking**:
  - Verify phone number masking across audit logs, API responses, and database histories (`+91 98*** ***10`).
  - Verify commuter GPS coordinates are purged from memory upon navigation termination.
- **Rate-Limiting & Abuse Prevention**:
  - Verify API endpoints respect rate limiting thresholds and return `HTTP 429 Too Many Requests`.

### 2.2 Performance & Resilience Benchmarking (`tests/performanceResilience.test.ts`)
- **Latency Benchmarks**:
  - Ingestion cycle latency: $< 500\text{ ms}$.
  - Flood risk evaluation: $< 100\text{ ms}$.
  - Unified multi-hazard road risk evaluation: $< 50\text{ ms}$.
  - Multi-candidate route calculation across urban topology: $< 1000\text{ ms}$ ($p95 < 250\text{ ms}$).
  - Grok AI fallback generation latency: $< 15\text{ ms}$.
  - WebSocket event dissemination latency: $< 50\text{ ms}$.
- **Circuit Breaker Trip & Recovery**:
  - Simulate upstream network failure; verify trip to `OPEN` state after consecutive failures.
  - Verify zero-latency fast-fail behavior during `OPEN` state.
  - Verify canary probe during `HALF_OPEN` state and seamless reset to `CLOSED` upon recovery.
- **Concurrent Request Coalescing**:
  - Benchmark concurrent requests against `RoadRiskService`; verify single shared execution without race conditions.

### 2.3 Flood Prediction Model Evaluation (`tests/modelEvaluation.test.ts`)
- **Lead Time Verification**:
  - Verify predictive alerts trigger $30\text{ to }120\text{ minutes}$ prior to peak water accumulation based on forecasted rainfall intensities.
- **False Alarm & Detection Analysis**:
  - Evaluate synthetic ground truth scenarios (Dry Baseline, Moderate Shower, Extreme Cloudburst, Storm Surge + Drainage Blockage).
  - Compute Confusion Matrix: True Positives (TP), False Positives (FP), True Negatives (TN), False Negatives (FN).
  - Precision, Recall, F1 Score, and Specificity metrics.
- **Model Stability & Monotonicity**:
  - Increasing rainfall rates must monotonically increase or maintain flood severity (no inversions).
  - Saturated drainage channels must yield strictly higher road risk than cleared drainage.
- **Label Limitations & Transparency**:
  - Explicitly document synthetic label assumptions and absence of field IoT sensors.

---

## 3. Execution Schedule & Deliverables

1. `tests/securityReview.test.ts`
2. `tests/performanceResilience.test.ts`
3. `tests/modelEvaluation.test.ts`
4. `docs/PHASE_9_TEST_RESULTS.md`
5. `docs/SECURITY_REVIEW.md`
6. `docs/MODEL_EVALUATION.md`
7. `docs/PERFORMANCE_REPORT.md`
8. `docs/PHASE_9_COMPLETION_REPORT.md`

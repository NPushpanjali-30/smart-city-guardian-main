# Smart City Guardian: End-to-End Integration Scenarios (Phase 8)

This document formalizes the step-by-step validation of seven critical operating scenarios (Scenarios A through G) across the Smart City Guardian integrated platform.

---

## Scenario A: Severe Rainfall Flash Inundation -> Dynamic Commuter Rerouting -> Localized SMS

### Context & Initial State
- User `commuter-01` starts an active navigation route along Downtown Bay Street Boulevard to North Terminal.
- Route session version is `1`.
- Live weather report indicates sudden cloudburst: rainfall intensity accelerates from $5\text{ mm/h}$ to $52\text{ mm/h}$.

### Step-by-Step Flow
1. **Weather Ingest**: `DataAggregator` refreshes telemetry. `openMeteoAdapter` fetches live telemetry; values parsed into `WeatherObservation`.
2. **Flood Risk Evaluation**: `FloodIntelligenceService` processes high precipitation against soil absorption rates, computing high flood index ($88/100$) for Downtown Coastal Zone.
3. **Road Network Scoring**: `RoadFloodRiskService` maps flooded zone to `road-bay-st-001`. Water depth is modeled at $32\text{ cm}$. `RoadRiskService` marks segment as `BLOCKED`.
4. **Session Evaluation**: `ActiveRouteService.evaluateAllActiveRoutes()` flags segment `road-bay-st-001` on user's active route.
5. **Cooldown Bypass**: Because the segment is physically `BLOCKED`, the 90-second reroute cooldown is automatically bypassed.
6. **Detour Graph Calculation**: `RoutingEngine` recalculates a viable alternative route via Highland Parkway Bypass, updating session version to `2`.
7. **Localized Citizen Alert**: `NotificationPolicyService` verifies user's geofence ($\le 10\text{ km}$), opt-in, and severity threshold (`CRITICAL`). A localized alert is synthesized and enqueued:
   ```
   [CRITICAL] SmartCity Alert: Route blocked near Downtown Bay St. Detour active via Highland Pkwy (+6m). Stay safe!
   ```
8. **SMS Delivery & WebSocket Push**: SMS dispatched via `SmsProvider` with masked recipient `+91 98*** ***10`. Session update frame streamed to WebSocket topic `user:commuter-01`.

---

## Scenario B: Multi-Hazard Cascade (Flash Flood + Traffic Gridlock + Emergency Barrier)

### Context & Initial State
- Heavy flooding in sector `Downtown-East` causes water accumulation, forcing diverted traffic onto narrow secondary corridors (`Oak Street`).
- A vehicular stall blocks the remaining single lane on Oak Street.

### Step-by-Step Flow
1. **Multi-Hazard Fusion**:
   - Flood Engine reports: flood risk $70/100$.
   - Traffic Engine reports: Oak Street delay factor $4.2\times$, congestion score $92/100$.
   - Incident feed reports: blocking stall `inc-stall-89`.
2. **Composite Scoring**: `RoadRiskService` evaluates:
   $$\text{Composite Risk} = 0.55(70) + 0.30(92) + 0.15(90) = 38.5 + 27.6 + 13.5 = 79.6$$
   Because a blocking incident is present, `accessibility` immediately clamps to `BLOCKED`.
3. **Cascading Detour Calculation**: The router identifies that both primary and secondary corridors are impassable and computes a perimeter bypass via Ring Expressway.
4. **Authority Alert**: EOC dashboard receives high-priority cascade alert summarizing joint hazard indicators.

---

## Scenario C: Upstream Grok AI Outage -> Instantaneous Deterministic Fallback

### Context & Initial State
- EOC operator requests situational analysis and citizen advisory synthesis.
- xAI Grok API experiences an upstream DNS outage, HTTP 504 gateway timeout, or invalid token exception.

### Step-by-Step Flow
1. **Request Dispatch**: `GrokDecisionService` issues request to Grok provider with 8000ms circuit-breaker timeout.
2. **Failure Detection**: Provider throws `UpstreamConnectionError` or circuit breaker trips to `OPEN`.
3. **Zero-Downtime Fallback Hand-off**: `GrokDecisionService` catches failure and dispatches request to `GrokFallbackService`.
4. **Deterministic Synthesis**:
   - Fallback engine parses canonical metrics (active flood zones, blocked roads, weather metrics).
   - Generates structured `StoredAiDecision` with `fallback_used: true`, `validation_status: 'REJECTED_FALLBACK'`, and deterministic citizen instructions:
     - *"Avoid low-lying underpasses along Bay Street."*
     - *"Seek elevated ground if driving near river corridors."*
5. **Contract Continuity**: EOC Dashboard and citizen alerting system receive valid JSON payloads matching `GrokDecisionOutput` schema without application interruption or unhandled exceptions.

---

## Scenario D: Commuter Navigation Tenant Privacy & Object-Level Access Control

### Context & Initial State
- User A (`commuter-alice`) has an active route session (`session-alice-123`).
- User B (`commuter-bob`) attempts to inspect or terminate User A's session via API.

### Step-by-Step Flow
1. **Malicious / Erroneous Request**:
   - `POST /api/v1/routes/session-alice-123/stop`
   - Header: `x-user-id: commuter-bob`
2. **Access Control Verification**: `routing.router.ts` retrieves the session by ID and compares `session.userId` (`commuter-alice`) against authenticated request user (`commuter-bob`).
3. **Enforcement & Audit**:
   - Request is immediately rejected with `HTTP 403 Forbidden`:
     ```json
     {
       "success": false,
       "error": "Forbidden: You do not have authorization to modify or stop this navigation session"
     }
     ```
   - Warning event logged with correlation ID and client IP.
4. **Legitimate Action**:
   - When `commuter-alice` submits the identical stop request, ownership validates, session terminates cleanly, and resources are de-allocated (`HTTP 200 OK`).

---

## Scenario E: High-Volume Inundation Alerts & Anti-Spam Cooldown Thrashing Protection

### Context & Initial State
- Micro-burst storms cause water level sensor readings to fluctuate rapidly between $18\text{ cm}$ and $22\text{ cm}$ over 5 minutes.
- Multiple evaluations trigger in rapid succession.

### Step-by-Step Flow
1. **First Trigger**:
   - Initial flood warning triggers alert dispatch to opted-in users within 10 km.
   - `NotificationPolicyService` records alert timestamp in `userHistoryMap`.
2. **Subsequent Oscillations (at $t = +45\text{s}$)**:
   - Next evaluation detects water at $21\text{ cm}$.
   - Rerouting policy checks session cooldown: since road condition did not transition from clear to fully impassable blockage, 90-second cooldown applies. Route oscillation is suppressed.
   - Notification policy checks user cooldown: default 30-minute quiet cooldown blocks duplicate citizen SMS.
3. **Idempotency Guarantee**: Over a 5-minute period with 10 evaluation cycles, citizen receives exactly 1 actionable SMS alert, eliminating notification spam and fatigue.

---

## Scenario F: Multilingual Dynamic Localization Across 5 Languages

### Context & Initial State
- Flash flood event occurs near Highland Avenue.
- Five registered citizens are situated within the 5 km impact zone with distinct preferred languages:
  1. Citizen 1: English (`en`)
  2. Citizen 2: Spanish (`es`)
  3. Citizen 3: Hindi (`hi`)
  4. Citizen 4: Tamil (`ta`)
  5. Citizen 5: French (`fr`)

### Step-by-Step Flow
1. **Batch Evaluation**: `NotificationPolicyService` evaluates candidate alerts for all five users concurrently.
2. **Localized Template Rendering**: `@smartcity/shared/formatLocalizedAlert` loads curated templates per language:
   - `en`: `[CRITICAL] SmartCity Alert: Route blocked near Highland Ave. Detour active (+5m). Stay safe!`
   - `es`: `[CRITICO] Alerta SmartCity: Ruta bloqueada cerca de Highland Ave. Desvio activo (+5m). ¡Cuidado!`
   - `hi`: `[चेतावनी] स्मार्ट सिटी अलर्ट: Highland Ave के पास मार्ग अवरुद्ध। वैकल्पिक मार्ग (+5m)।`
   - `ta`: `[எச்சரிக்கை] ஸ்மார்ட் சிட்டி எச்சரிக்கை: Highland Ave அருகே சாலை மூடப்பட்டுள்ளது. மாற்றுப் பாதை (+5m).`
   - `fr`: `[CRITIQUE] Alerte SmartCity: Route bloquee pres de Highland Ave. Deviation active (+5m). Prudence!`
3. **GSM Character Length Validation**: Each rendered SMS payload is validated to ensure it fits within standard GSM-7/Unicode single-SMS boundaries ($< 160$ chars), preventing message splitting.

---

## Scenario G: Graceful Telemetry Network Degradation & Circuit Breaker Trip/Recovery

### Context & Initial State
- External traffic and weather APIs experience severe latency degradation ($> 5000\text{ ms}$) followed by complete connection drops.

### Step-by-Step Flow
1. **First Failure**: `CircuitBreaker` registers upstream network timeout. Logs structured warning and falls back to deterministic cached telemetry.
2. **Threshold Exceeded**: After 3 consecutive timeouts within 60 seconds, `CircuitBreaker` trips to `OPEN` state.
3. **Fast Fail Mode**: Subsequent requests for the next 30 seconds immediately short-circuit without attempting network I/O, preserving API responsiveness ($< 5\text{ ms}$).
4. **Half-Open Probe**: At $t = +30\text{s}$, circuit breaker enters `HALF_OPEN` state, allowing a single canary probe to upstream provider.
5. **Recovery**: If probe succeeds, circuit breaker resets to `CLOSED`; if probe fails, returns to `OPEN` state for another cooldown cycle.

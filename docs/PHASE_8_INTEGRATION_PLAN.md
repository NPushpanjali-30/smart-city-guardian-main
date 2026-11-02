# Phase 8 — End-to-End System Integration Plan

**Document Version**: 1.0.0  
**Status**: Approved Architecture  
**Scope**: Full Unified System Integration across Phases 1–7  

---

## 1. Executive Summary & Objective

SmartCity Guardian comprises seven foundational subsystems developed across Phases 1–7:
1. **Real-time Ingestion & Normalization**: Open-Meteo, TomTom, live flood state store, and circuit breakers.
2. **Real-time Streaming & Location Relevance**: WebSockets on `/ws`, single-flight coalescing, and 10 km proximity matching.
3. **Flood Intelligence & Prediction**: Physics-guided feature extraction, short-horizon nowcasting (15–60m), and road flood risk scoring.
4. **Grok AI Decision Support**: Context synthesis, multi-mode action planning, structured validation, and deterministic fallbacks.
5. **Traffic Intelligence & Flood-Aware Routing**: Candidate route generation, multi-factor cost scoring, active route monitoring, and dynamic rerouting.
6. **Unified Geospatial GIS & EOC Authority Dashboard**: 10 Leaflet GIS layers, non-color-only encoding, and operator incident verification.
7. **Trilingual SMS Notifications**: Eligibility policy engine, deduplication cooldowns, escalation bypass, and mock/Twilio SMS gateways.

**Phase 8 Objective**: Connect these discrete subsystems into one coherent, autonomous, resilient end-to-end pipeline. Eliminate architectural seams, verify user-level privacy and object access control, enforce idempotency, and eliminate silent failures.

---

## 2. End-to-End Pipeline Target Workflow

```text
[External Data Ingestion]
  Open-Meteo (Weather) | TomTom (Traffic) | Flood Basins (Catchments)
                           │
                           ▼
[Provider Normalization & Freshness Check]
  Zod schema boundary validation; TTL tagging (LIVE / DEGRADED / STALE)
                           │
                           ▼
[Flood Intelligence & Nowcasting Engine]
  Short-horizon rainfall feature extraction; Flood severity classification
                           │
                           ▼
[Unified Road Risk Evaluator]
  Multivariate scoring: Flood Depth + Traffic Congestion + Incidents
                           │
                           ▼
[Active Route Monitoring & Rerouting Policy]
  Evaluate active commuter sessions; Detect road blockages & hazards
                           │
          ┌────────────────┴────────────────┐
          ▼                                 ▼
[Deterministic Reroute Engine]      [Grok AI Decision Engine]
  Generate safer detour candidate      Advisory situational plan (optional)
          │                                 │
          └────────────────┬────────────────┘
                           ▼
[WebSocket Broadcast & User-Scoped Stream]
  realtime:routing & user:{userId} push to active commuter
                           │
                           ▼
[Notification Eligibility Policy Engine]
  Freshness (<=30m) + Severity Floor + Proximity (10km) + Cooldown Bypass
                           │
                           ▼
[Asynchronous Multilingual SMS Dispatch]
  English, Hindi, Kannada via ISmsProvider gateway with exponential retry
```

---

## 3. Integration Audit & Dependency Inventory

| Subsystem | Producer / Owner | Primary Consumer | Interface Contract | Storage / State | Fallback Mechanism |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Weather Ingestion** | `OpenMeteoAdapter` | `FloodIntelligenceService` | `WeatherObservation` | `LiveStateStore` (TTL 120s) | `MockWeatherAdapter` |
| **Traffic Ingestion** | `TrafficAdapter` | `RoadRiskService` | `TrafficObservation` | `LiveStateStore` (TTL 60s) | Mock traffic records |
| **Flood Nowcasting** | `FloodIntelligenceService` | `RoadRiskService`, EOC | `FloodEvaluationResult` | `LiveStateStore` (TTL 180s) | Heuristic rainfall predictor |
| **Road Risk Scoring** | `RoadRiskService` | `ActiveRouteService`, GIS | `RoadRiskRecord[]` | In-memory cache + Event bus | Historical baseline risk |
| **Route Navigation** | `RoutingEngineService` | Citizen Commuter, Map | `CandidateRouteOutput` | Active session store | Static safest corridor |
| **Dynamic Rerouting** | `ActiveRouteService` | Commuter, Notification | `ActiveRouteSession` | Versioned history store | Retain previous path if blocked alternative unavailable |
| **Grok AI Advice** | `GrokDecisionService` | EOC Operator, Commuter | `StoredAiDecision` | LRU Cache (max 500) | `GrokFallbackService` |
| **WebSocket Hub** | `RealtimeWebSocketServer` | Web UI (Map, Admin) | JSON message protocol | Subscriptions Set | HTTP REST polling |
| **Notification Engine**| `NotificationPolicyService` | Citizen Handset | `NotificationRecord` | In-memory FIFO queue | Suppress duplicate; retry transient |

---

## 4. Key Integration Seams to Bridge in Phase 8

1. **Autonomous Reroute $\rightarrow$ Notification Bridge**:
   - Ensure `ActiveRouteService` immediately hands off newly generated detours to `NotificationPolicyService` and `NotificationQueueService` for affected commuters.
2. **User-Scoped WebSocket Security**:
   - Add explicit support for `user:{userId}` topics so that route recalculations and private alerts are delivered strictly to the authorized client socket.
3. **Object-Level Access Control**:
   - Enforce authorization in `routing.router.ts` and `location.router.ts`: User A cannot stop, modify, or view User B's active navigation session or private commute anchors.
4. **Idempotency & Alert Spam Elimination**:
   - Verify that repeated identical environmental telemetry does not trigger redundant reroutes or spam duplicate SMS notifications.
5. **Multi-Failure Resilience Verification**:
   - Verify that simultaneous failure of Grok AI and Twilio SMS does not interrupt real-time route navigation or map rendering.

---

## 5. Verification Scenarios

- **Scenario A (Normal Baseline)**: Fresh weather, normal risk, route active, zero false notifications.
- **Scenario B (Flood Escalation)**: Heavy rain triggers flood escalation, road risk recalculation, dynamic reroute, and localized SMS.
- **Scenario C (Road Blockage)**: Confirmed closure rejects primary path, selects elevated detour, informs commuter.
- **Scenario D (Stale Data)**: Telemetry aging lowers confidence without reporting false `NORMAL` or `SAFE`.
- **Scenario E (Grok Offline)**: Deterministic routing and fallback advice continue without interruption.
- **Scenario F (SMS Offline)**: In-app route updates continue unaffected; SMS queue retries with backoff.
- **Scenario G (Tenant Privacy)**: User isolation enforced; cross-user data access rejected with HTTP 403.

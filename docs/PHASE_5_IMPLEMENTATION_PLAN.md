# SmartCity Guardian — Phase 5 Implementation Plan
## Traffic Intelligence, Flood-Aware Routing & Dynamic Rerouting Engine

**Document Version**: 1.0.0  
**Phase**: Phase 5  
**Date**: September 2026  
**Status**: Ready for Execution  

---

## 1. Executive Summary & Architecture Charter

Phase 5 delivers the core operational capability of SmartCity Guardian: **continuous, coupled evaluation of hydrological inundation risks and road-level traffic telemetry to calculate the safest practical commuter routes and dynamically reroute active journeys when conditions materially change**.

### 1.1 Inviolable Architectural Principles
1. **Deterministic Routing Supremacy**:
   - The **RoutingEngine** (supported by the Map/Graph provider abstraction) calculates, segments, evaluates, and selects candidate route geometries.
   - **Grok AI operates strictly as an advisory decision-support layer**. Grok may issue recommendations (`REROUTE_REQUIRED`, `CONSIDER_ALTERNATIVE`, `KEEP_ROUTE`), but Grok **never** synthesizes route geometry or overrides physical graph constraints.
   - If Grok is offline, degraded, or timing out, deterministic routing and rerouting rules continue executing without disruption.
2. **Safety Dominance Over Travel Time**:
   - During flooding events, personal life-safety strictly dominates travel-time optimization.
   - A faster route traversing submerged or hazardous corridors will never be selected over a slightly longer, elevated, flood-safe alternative.
3. **Hard Exclusion of Blocked Infrastructure**:
   - Any road segment with accessibility state `BLOCKED` (confirmed water depth $\ge 20\text{ cm}$ or official municipal closure) is assigned infinite cost ($\text{Cost} = \infty$) and excluded. Any route containing a blocked segment is marked `INVALID`.
4. **Conservative Uncertainty Principal**:
   - `UNKNOWN \neq SAFE`. Missing or expired telemetry forces elevated caution or conservative penalty multipliers rather than silently assuming zero risk.
5. **Anti-Oscillation Guardrails**:
   - Dynamic rerouting enforces strict hysteresis (minimum $\ge 15\%$ composite cost improvement) and cooldown intervals ($90\text{ seconds}$ default), except for imminent blockage events ($\le 500\text{ m}$ ahead) which trigger immediate safety diversions.

---

## 2. Research-Aligned Conceptual Basis

Phase 5 directly translates three peer-reviewed computational methodologies into student-scale production code:

1. **Smart Flood-Aware Routing (Smart FAS)**:
   - Road segment impedance is dynamically altered by local flood severity.
   - High-risk and flooded links receive exponential penalties or total exclusion.
   - Candidate alternative routes are compared using a normalized **Flood-Aware Route Index** ($\text{FRI} = \sum \text{penalty}_i \times \text{distance}_i$).
2. **Heterogeneous Traffic Management Research**:
   - Fuses multi-source speed observations, free-flow baselines, delay ratios, and incident records into road-level traffic states (`SMOOTH`, `SLOW`, `CONGESTED`, `SEVERELY_CONGESTED`).
3. **Flood-Traffic Coupled Resilience Research**:
   - Models physical road accessibility and moving traffic delays as coupled, non-linear inputs to urban mobility resilience and evacuation corridor management.

---

## 3. Component Architecture & Flow

```text
               LIVE TELEMETRY INGESTION
          ┌─────────────────┴─────────────────┐
          ▼                                   ▼
    WEATHER & FLOOD                     LIVE TRAFFIC &
   INTELLIGENCE (Ph 2-3)              INCIDENTS (Ph 2-5)
          │                                   │
          ▼                                   ▼
   RoadFloodRiskService           TrafficIntelligenceService
          │                                   │
          └─────────────────┬─────────────────┘
                            ▼
                     RoadRiskService
        (Preserves Traffic + Flood + Incident Components;
             Computes Operational Accessibility)
                            │
                            ▼
                     RoutingEngine
             (Fetches Candidate Routes from
             MapProvider / Graph Abstraction)
                            │
                            ▼
          Safety-Weighted Segment Cost Calculation
             & Flood-Aware Route Index (FRI)
                            │
                            ▼
           Candidate Route Ranking & Selection
         (Safe Detour preferred over Risky Speed)
                            │
       ┌────────────────────┴────────────────────┐
       ▼                                         ▼
ActiveRouteService                       GrokDecisionService
(Monitors Active Route)                  (Decision Support /
       │                                  Context Advisory)
       ▼                                         │
ReroutingPolicyService                           │
(Checks 7 Material Change Triggers,             │
 Cooldown & Hysteresis Margin) ◄─────────────────┘
       │
       ├── Condition Worse / Blocked ──► Trigger Recalculation
       │                                 Emit ROUTE_RECALCULATED
       └── Condition Stable ───────────► Maintain Route
```

---

## 4. Detailed Component Design

### 4.1 Traffic Intelligence Engine (`TrafficIntelligenceService`)
- **Inputs**:
  - `speedKmh`, `freeFlowSpeedKmh`, `delaySeconds`, `freeFlowTravelTime`
  - `congestionLevel` ($0 - 100$)
  - `incidents` (accidents, construction, closures, hazards)
  - `freshness` (`LIVE`, `RECENT`, `STALE`, `EXPIRED`, `MOCK`)
- **Computed Metrics**:
  - `speedRatio = currentSpeed / freeFlowSpeed` (guarded against zero division)
  - `delayRatio = currentTravelTime / freeFlowTravelTime`
  - `incidentRisk` ($0 - 100$) derived from incident severity (`LOW`=15, `MEDIUM`=40, `HIGH`=75, `CRITICAL`=100)
  - `trafficScore` ($0 - 100$): Explainable weighted combination:
    $$\text{TrafficScore} = w_{\text{speed}} \cdot (1 - \text{speedRatio}) \times 100 + w_{\text{delay}} \cdot \text{delayScore} + w_{\text{congestion}} \cdot \text{congestionLevel} + w_{\text{incident}} \cdot \text{incidentRisk}$$
    (Default weights: $w_{\text{speed}} = 0.35$, $w_{\text{delay}} = 0.25$, $w_{\text{congestion}} = 0.25$, $w_{\text{incident}} = 0.15$).
  - `trafficState`:
    - `SMOOTH`: $\text{TrafficScore} < 25$ and $\text{speedRatio} \ge 0.85$
    - `SLOW`: $25 \le \text{TrafficScore} < 50$
    - `CONGESTED`: $50 \le \text{TrafficScore} < 75$
    - `SEVERELY_CONGESTED`: $\text{TrafficScore} \ge 75$
    - `UNKNOWN`: Missing/stale data
  - `confidence`: Penalized when data freshness is degraded.

### 4.2 Combined Road Risk & State Service (`RoadRiskService`)
- Merges hydrological flood risk, traffic intelligence, and incident telemetry for every monitored road segment while **strictly preserving individual components**:
  ```json
  {
    "roadId": "road-bay-st-001",
    "traffic": {
      "score": 85.0,
      "state": "SEVERELY_CONGESTED",
      "delayRatio": 2.8
    },
    "flood": {
      "score": 88.0,
      "state": "CRITICAL"
    },
    "incident": {
      "score": 90.0,
      "activeIncidents": 1
    },
    "accessibility": "BLOCKED",
    "overallRisk": 87.2,
    "freshness": "LIVE",
    "updatedAt": "2026-09-22T06:00:00.000Z"
  }
  ```
- **Accessibility Logic**:
  - `BLOCKED`: Confirmed water depth $\ge 20\text{ cm}$, blocking incident, or official authority closure. $\text{Cost} = \infty$.
  - `HIGH_RISK`: Flood score $\ge 75$ or composite risk $\ge 75$. Severe penalty multiplier applied ($10\times$).
  - `CAUTION`: Flood score $\ge 50$ or traffic score $\ge 60$. Moderate penalty applied ($2\times$).
  - `OPEN`: Baseline conditions.
  - `UNKNOWN`: Missing telemetry. Handled with configurable conservative bias ($3\times$ penalty).

### 4.3 Routing Engine (`RoutingEngine`)
- **Map / Routing Provider Abstraction**:
  - Encapsulates route generation behind `MapProvider` / `RoutingProvider`.
  - Generates multiple candidate routes (`Route A - Direct`, `Route B - Elevated Safe Detour`, `Route C - Perimeter Arterial`).
  - Supports road geometry matching against known municipal corridors.
- **Segment Cost Formulation**:
  $$\text{Cost}(s) = \alpha \cdot T_{\text{base}}(s) + \beta \cdot \text{Penalty}_{\text{traffic}}(s) + \gamma \cdot \text{Penalty}_{\text{flood}}(s) + \delta \cdot \text{Penalty}_{\text{incident}}(s) + \epsilon \cdot \text{SafetyPenalty}$$
- **Flood-Aware Route Index (FRI) & Mobility Risk Index (MRI)**:
  $$\text{FRI} = \sum_{s \in P} (\text{floodScore}(s) \times \text{length}(s))$$
  $$\text{MRI} = \frac{\sum_{s \in P} (\text{compositeRisk}(s) \times \text{length}(s))}{\sum_{s \in P} \text{length}(s)}$$
- **Route Status Classification**:
  - `SAFE_TO_PROCEED`: All segments `OPEN`, $\text{MRI} < 30$, zero blocked or high-risk segments.
  - `CAUTION`: Minor water accumulation or congestion, $30 \le \text{MRI} < 60$.
  - `HIGH_RISK`: Route traverses high-risk zones, detours advised, $\text{MRI} \ge 60$.
  - `INVALID`: Contains at least one `BLOCKED` segment.
  - `UNKNOWN`: Degraded data.

### 4.4 Active Route Tracking & Dynamic Rerouting Engine
- **`ActiveRouteService`**:
  - Manages commuter active navigation sessions: `routeId`, `userId`, `origin`, `destination`, `currentRouteVersion`, `status`, `startedAt`, `lastEvaluatedAt`.
  - Centralized condition monitoring: evaluates in-transit routes on material telemetry changes without unscalable per-user polling.
- **`ReroutingPolicyService`**:
  - Implements the 7 Material Change Triggers:
    1. Upcoming segment transitions to `BLOCKED`.
    2. Remaining route flood risk increases by $\ge 20$ points.
    3. Segment transitions from `OPEN` to `HIGH_RISK`.
    4. Congestion increases expected transit time by $\ge 10\text{ minutes}$.
    5. New blocking incident reported on route corridor.
    6. Commuter deviates $\ge 300\text{ meters}$ from route line.
    7. Safer alternative route opens reducing composite cost by $\ge 15\%$.
  - **Cooldown Guard**: $90\text{ seconds}$ minimum between non-emergency recalculations.
  - **Hysteresis Guard**: Alternative route must provide $\ge 15\%$ composite cost improvement to prevent route flip-flopping.
  - **Emergency Override**: Segment blockage immediately ahead ($\le 500\text{ m}$) bypasses cooldown and hysteresis.
  - **Route Versioning**: Every active route recalculation creates an immutable version (`v1`, `v2`, `v3`) with full audit provenance (timestamp, triggering road, risk delta, reason).

### 4.5 Grok AI Decision Support Integration
- Grok receives normalized route context (`CanonicalAIContext.route`).
- Evaluates commuter safety advisory and returns structured decision (`KEEP_ROUTE`, `CONSIDER_ALTERNATIVE`, `REROUTE_REQUIRED`).
- If Grok recommends `REROUTE_REQUIRED`, the `RoutingEngine` validates physical graph conditions and selects the safest candidate.
- Deterministic fallback runs if Grok is unavailable.

### 4.6 Municipal Traffic Corridors & Authority Recommendations (`TrafficCorridorService`)
- Aggregates road segments into key arterial corridors (e.g., *Bay Street Waterfront Corridor*, *Highland Elevated Ridge*, *Harbor Expressway*).
- Generates corridor-level congestion metrics, flood impact, and advisory diversion recommendations for municipal emergency operators.

---

## 5. API & WebSocket Specifications

### 5.1 REST Endpoints
- `POST /api/v1/routes/calculate`: Calculate safety-weighted candidate routes with reasoning breakdown (supports `avoidFlood`, `avoidTraffic`, `emergencyMode`).
- `GET /api/v1/routes/:routeId`: Retrieve route geometry, status, segment risks, and reasoning.
- `POST /api/v1/routes/:routeId/start`: Initialize active navigation session for user.
- `POST /api/v1/routes/:routeId/stop`: Conclude or cancel navigation session.
- `POST /api/v1/routes/:routeId/recalculate`: Explicit route recalculation request.
- `GET /api/v1/routes/:routeId/versions`: Retrieve route version history and audit log.
- `GET /api/v1/traffic/roads`: List road-level normalized traffic states.
- `GET /api/v1/traffic/corridors`: List arterial corridors and authority diversion recommendations.
- `GET /api/v1/roads/risk`: Unified road risk endpoint with flood + traffic + incident components.

### 5.2 Real-Time WebSocket Topics (`/ws`)
- `realtime:routing`: Emits `ROUTE_CREATED`, `ROUTE_UPDATED`, `ROUTE_RECALCULATED`, `ROUTE_INVALIDATED`.
- `realtime:traffic`: Emits `TRAFFIC_STATE_UPDATED`.
- `realtime:roads`: Emits `ROAD_RISK_UPDATED`.

---

## 6. Frontend UI Integration (`apps/web`)

1. **Interactive Route Experience**:
   - Origin and Destination input with "Use My Current Location" button.
   - Preference selectors: "Prioritize Flood Safety", "Emergency Mode (Hospitals/Shelters)".
   - Multi-route display tabs: **Recommended (Flood-Safe)**, **Alternative 1**, **Alternative 2** showing ETA, distance, flood risk, traffic level, and status badge.
2. **Explainable "Why this route?" Panel**:
   - Transparent factor checklist:
     - $\checkmark$ *Lower flood exposure (0% flood corridor overlap)*
     - $\checkmark$ *Avoids submerged Bay Street Underpass*
     - $\checkmark$ *Elevated Highland Avenue ridge route*
     - $\Delta$ *+3 minutes travel time for guaranteed safety*
3. **Live Rerouting Alert Banner**:
   - In-transit reroute modal: *"Conditions on your route have changed. Floodwaters detected ahead on Segment B. A safer route is ready (+4 min). [Use New Route]"*.
4. **Enhanced Live Map Layers**:
   - Distinct visual polyline rendering for Recommended (Cyan/Green), Alternative (Amber), and Impassable/Blocked roads (Dashed Red).
   - Traffic congestion heatmap styling along road segments.

---

## 7. Deterministic Demonstration Scenario (Section 69)

A deterministic, reproducible end-to-end verification script:
1. **Initial State (Route A Selection)**:
   - Commuter navigates from Sector 1 to Sector 5.
   - Route A is direct (30 min, low flood risk, moderate traffic). Route A selected as Recommended.
2. **Phase Transition 1 (Flood Escalation on Route A)**:
   - Flood risk surges on Route A corridor (`road-bay-st-001` becomes submerged / `BLOCKED`).
   - `ReroutingPolicyService` traps blockage trigger.
   - Evaluates alternatives -> Route B (Highland Elevated, +6 min, zero flood risk).
   - Route B selected; version updated to `v2`; `ROUTE_RECALCULATED` emitted.
3. **Phase Transition 2 (Traffic Congestion on Route B)**:
   - Route B experiences severe traffic stall ($>15\text{ min}$ delay).
   - Route engine evaluates alternatives -> Route C (Market Street bypass).
   - Second reroute triggered; version updated to `v3`.

---

## 8. Verification Matrix & Non-Regression Mandate

1. **Unit & Calculation Tests**:
   - Traffic intelligence scoring, state transitions, delay factors, stale data degradation.
   - Combined road risk, component preservation, and accessibility state determination.
   - Safety-weighted routing calculations, blocked road exclusion, high-risk penalties.
   - Cooldown and hysteresis behavior.
2. **Integration Tests**:
   - End-to-end route calculation, candidate route ranking, active route tracking, version history.
   - REST endpoints and WebSocket domain event broadcasts.
3. **Failure & Resilience Tests**:
   - Map/Traffic/Flood provider failure handling (graceful fallback).
   - Grok AI failure handling (system operates deterministically).
4. **Regression Guarantee**:
   - All 113 existing tests from Phases 1-4 must continue to pass 100%.

---

## 9. Deliverables & Documentation

- `docs/PHASE_5_IMPLEMENTATION_PLAN.md` (this document)
- `packages/shared/src/types/index.ts` & `packages/shared/src/schemas/index.ts` (Phase 5 models)
- `packages/shared/src/calculators/routing.ts` & `traffic.ts` (algorithmic formulas)
- `apps/api/src/services/traffic/trafficIntelligence.service.ts`
- `apps/api/src/services/roads/roadRisk.service.ts`
- `apps/api/src/services/routing/routingEngine.service.ts`
- `apps/api/src/services/routing/activeRoute.service.ts`
- `apps/api/src/services/routing/reroutingPolicy.service.ts`
- `apps/api/src/services/traffic/trafficCorridor.service.ts`
- `apps/api/src/modules/routing/` & `apps/api/src/modules/traffic/` (expanded routers)
- `apps/web/src/pages/MapPage.tsx` & `DashboardPage.tsx` (UI route experience)
- `tests/traffic.test.ts`, `tests/routing.test.ts`, `tests/rerouting.test.ts`
- `docs/PHASE_5_RESEARCH_ALIGNMENT.md`
- `docs/PHASE_5_COMPLETION_REPORT.md`

# SmartCity Guardian — Phase 3 Implementation Plan
## Flood Intelligence & Short-Horizon Prediction Engine

**Document Version**: 1.0.0  
**Phase**: Phase 3 — Flood Intelligence & Prediction Engine  
**Status**: DRAFT FOR ARCHITECTURAL REVIEW  
**Author**: Lead Software Architect / AI Engineering  

---

## 1. Executive Summary & Core Objective

The primary mission of **Phase 3** is to transform the real-time environmental, meteorological, and infrastructure telemetry collected in Phase 2 into a **trustworthy, explainable, geographically-aware Flood Intelligence & Short-Horizon Prediction Engine**.

This engine serves as the authoritative mathematical source for flood risk, spatial risk zones, road impact assessments, and short-horizon hazard nowcasting.

### Non-Goals for Phase 3 (Strict Safety Boundaries)
- **Zero IoT Hardware**: The system relies on software-ingested weather feeds, open spatial networks, and citizen reports; no physical probes or microcontrollers are simulated as physical hardware.
- **Zero Data Fabrication (Rule 2 & Rule 18)**: We will **never** synthesize fake water-level measurements (e.g. "water depth = 1.23 m") or infer exact water depth without an authoritative observation. Missing data will degrade confidence rather than assert false safety.
- **No Grok Replacement**: Grok AI will **not** replace the deterministic flood calculation engine; Grok will act strictly as an advisory consumer in Phase 4.
- **No Production Dynamic Rerouting**: Emergency route recalculation and turn-by-turn navigation depend on this engine and belong to Phase 4.

---

## 2. Phase 2 Live Data Audit & Telemetry Inventory

Before designing predictive features, we conduct an empirical audit of telemetry currently ingested:

| Data Stream | Provider Adapter | Live / Mock Status | Cadence | Available Fields | Missing / Limitations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Current Weather** | `OpenMeteoAdapter` | **LIVE** (`https://api.open-meteo.com`) | 300s | `rainfallRateMmh`, `rainfall1hMm`, `rainfall24hMm`, `temperatureC`, `humidityPercent`, `windSpeedKmh`, `observedAt` | Ground soil moisture probes; 1-minute flash flood radar scans. |
| **Weather Forecast** | `OpenMeteoAdapter` | **LIVE** | 300s | 24-hour hourly intervals: `forecastFor`, `precipitationAmountMm`, `precipitationProbability` | Minute-level high-resolution nowcast radar reflectivity. |
| **Traffic Flow** | `TrafficAdapter` | **LIVE / SIM** (Key dependent) | 180s | `speedKmh`, `freeFlowSpeedKmh`, `delaySeconds`, `congestionLevel` (0-100) | Full municipal CCTV feeds. |
| **Traffic Incidents** | `TrafficAdapter` | **LIVE / SIM** | 180s | `type` (`ACCIDENT`, `HAZARD`, `CLOSURE`), `isBlocking`, `latitude`, `longitude` | None. |
| **Catchment Basins** | `FloodAdapter` | **MOCK** (Explicitly stamped) | 300s | `zoneId`, `polygon`, `waterDepthCm`, `severity`, `isHistoricallyFloodProne`, `drainageCapacityPercent` | Open real-time municipal hydrology API feeds do not exist; marked `freshness: 'MOCK'`. |
| **Road Network** | `MapAdapter` | **LOCAL / OSM** | Static / On-demand | `id`, `name`, `roadClass`, `lengthMeters`, `speedLimitKmh`, `coordinates`, `isHistoricallyFloodProne` | Live sensor loops per lane. |
| **Citizen Reports** | `reportsRouter` | **IN-MEMORY / DB** | On-demand | `category`, `description`, `location`, `status` (`PENDING_REVIEW`, `VERIFIED`, `DISMISSED`) | Unverified reports require verification weighting. |

---

## 3. Architecture & Modular Pipeline

```text
                  Phase 2 Telemetry (Weather, Traffic, Flood Basins, Reports)
                                              ↓
                        [Data Validation & Freshness Audit]
                                              ↓
                           [FloodFeatureEngine]
             ┌─────────────────────────────────────────────────┐
             │ - rainfallFeatures (Rate, 15m, 30m, 1h, Trend)   │
             │ - forecastFeatures (Intensity, Prob, Persistence)│
             │ - historicalFeatures (Catchment Elevation/Basin) │
             │ - crowdsourcedFeatures (Cluster density, Age)    │
             │ - confidenceFeatures (Freshness, Corroboration)  │
             └─────────────────────────────────────────────────┘
                                              ↓
                          [Current Flood Risk Engine]
                      (Numerical Score ∈ [0,100] + Explanations)
                                              ↓
                       [Short-Horizon Predictor (15–30m)]
           ┌────────────────────────────────────────────────────────┐
           │ Layer 1: Deterministic Drainage Exhaustion Rules       │
           │ Layer 2: Explainable Baseline Hazard Trajectory Model   │
           │ Fallback: Deterministic Trend -> Degraded State        │
           └────────────────────────────────────────────────────────┘
                                              ↓
                   [State Classification & Hysteresis Engine]
              (NORMAL [0-24], WATCH [25-49], WARNING [50-74], CRITICAL [75-100])
                                              ↓
                  [Geographic Risk Units & Road Impact Mapper]
             ┌──────────────────────────────────────────────────┐
             │ - Active Flood Zones (Observed vs Predicted)     │
             │ - Road Segment Accessibility (OPEN, CAUTION,     │
             │   HIGH_RISK, BLOCKED, UNKNOWN)                   │
             └──────────────────────────────────────────────────┘
                                              ↓
                        [Event Generation & Deduplication]
             (FLOOD_RISK_UPDATED, FLOOD_STATE_CHANGED, ROAD_RISK_UPDATED)
                                              ↓
                          [FloodAIContextBuilder]
                     (Structured Traceable Context for Grok)
                                              ↓
                 [WebSocket Broadcast & High-Performance Redis Store]
```

---

## 4. Key Components to Build

### 4.1 Feature Engineering (`packages/shared/src/flood/features/` & `apps/api/src/services/flood/`)
- **`rainfallFeatures`**: Evaluates supported accumulation windows (15m, 30m, 1h, 3h), rate acceleration ($\Delta R / \Delta t$), persistence duration, and cumulative soil saturation.
- **`forecastFeatures`**: Normalized forecast precipitation rate, probability weighting, and duration.
- **`historicalFeatures`**: Catchment depression markers and historical flood frequency indices.
- **`crowdsourcedFeatures`**: Verified vs unverified citizen hazard report clustering with spatial distance decay ($e^{-d / d_0}$).
- **`confidenceFeatures`**: Multi-stream freshness penalties (`LIVE`, `RECENT`, `STALE`, `EXPIRED`, `MOCK`, `UNAVAILABLE`) and cross-source corroboration metrics.

### 4.2 Explainable Flood Risk Engine
- Score calculation:
  $$S_{\text{composite}} = \left(w_{\text{rain}} S_{\text{rain}} + w_{\text{trend}} S_{\text{trend}} + w_{\text{forecast}} S_{\text{forecast}} + w_{\text{hist}} S_{\text{hist}} + w_{\text{reports}} S_{\text{reports}}\right) \times C_{\text{confidence}}$$
- Configurable weights via `config/floodRisk.config.ts`.
- Structured machine-readable reasons array for transparent explainability.

### 4.3 Short-Horizon Prediction Model (15–30 Minutes)
- Horizon configurable via `PREDICTION_HORIZON_MINUTES=30`.
- Estimating probability of entering higher flood risk state within $T_{\text{horizon}}$.
- Trend direction: `INCREASING`, `STABLE`, `DECREASING`.
- Complete metadata versioning: `model_version`, `training_timestamp`, `feature_version`, `metrics`.
- Graceful degradation: If predictive models encounter missing variables, fallback to deterministic trend engine and lower confidence score.

### 4.4 Spatial Units & Road Flood Risk Service (`RoadFloodRiskService`)
- Geographic risk units: zones (`zoneId`) and spatial bounding cells.
- Visual & data classification:
  - `OBSERVED_CONFIRMED`: Real-time catchment basin water level or verified on-ground hazard report.
  - `PREDICTED_RISK`: Statistically/meteorologically projected high risk zone for the upcoming 30 minutes.
  - `HISTORICAL_HOTSPOT`: Vulnerable basin without active flood trigger.
- Road accessibility separation:
  - Flood risk: Environmental hazard score ($0-100$).
  - Accessibility state: `OPEN`, `CAUTION`, `HIGH_RISK`, `BLOCKED`, `UNKNOWN`.

### 4.5 State Transitions & Hysteresis
- Hysteresis margins: Enter `WARNING` at score $\ge 50$; recover to `WATCH` only when score falls $< 45$.
- Confirmation window: Minimum persistence interval prevents rapid oscillating state flapping.
- Emits standard domain events via `EventEmitter` and bridges to WebSocket `/ws`.

### 4.6 Grok Decision Context Builder (`FloodAIContextBuilder`)
- Generates canonical JSON payload for Phase 4 Grok consumption.
- Traceability guarantee: Every value includes source adapter, timestamp, freshness, and calculation reference.

---

## 5. API Endpoints & Contracts

- `GET /api/v1/flood/risk` — City-wide or coordinate-filtered current flood risk and explainability.
- `GET /api/v1/flood/risk/:areaId` — Zone-specific risk score and factors.
- `GET /api/v1/flood/predictions` — Active 15–30 min short-horizon predictions.
- `GET /api/v1/flood/events` — Active flood events with state change history.
- `GET /api/v1/flood/zones` — Geographic polygons distinguished by `OBSERVED`, `PREDICTED`, and `HISTORICAL`.
- `GET /api/v1/flood/history` — Historical prediction audit records.
- `GET /api/v1/roads/flood-risk` — Road-level flood hazard scores and accessibility states.

---

## 6. Verification & Test Plan

1. **Feature Engineering Tests**: Rolling rainfall windows, trend acceleration, forecast weighting, freshness decay.
2. **Risk Scoring Tests**: Monotonicity (increasing rain increases score), factor explainability, missing data handling.
3. **State Transition & Hysteresis Tests**: Anti-flapping verification across threshold boundaries (50 / 45).
4. **Prediction & Fallback Tests**: 30-minute horizon projection, missing feature fallback, degraded state validation.
5. **Spatial & Road Network Tests**: Point-in-polygon and road segment intersection, accessibility assignment.
6. **Synthetic Scenarios**:
   - Scenario A: Normal baseline conditions $\to$ `NORMAL`.
   - Scenario B: Heavy rain onset $\to$ `WATCH` / `WARNING`.
   - Scenario C: Sustained downpour $\to$ `CRITICAL`.
   - Scenario D: Recovery $\to$ gradual step-down to `NORMAL`.
7. **Regression Guarantee**: Ensure all 61 existing Phase 1 & 2 tests continue to pass 100%.

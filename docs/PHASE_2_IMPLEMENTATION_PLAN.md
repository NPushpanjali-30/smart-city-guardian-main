# Phase 2 Implementation Plan: Real-Time Data Intelligence Layer

**Document Version**: 1.0.0  
**Phase**: Phase 2 — Real-Time Data Intelligence Layer  
**Status**: Plan Draft Pending User Review  
**Project**: SmartCity Guardian  

---

## 1. Context & Objective

Phase 1 established the system foundation: 14 architectural specifications, modular monolith structure, pure domain scoring models (explainable flood risk, safety-weighted routing, Grok AI fallback), backend health/version API, frontend command-center shell, canonical mock contracts, and 21 automated unit tests.

The objective of Phase 2 is to build the **Real-Time Data Intelligence Layer**:
Connecting SmartCity Guardian to external real-world data sources (Open-Meteo for live weather, live traffic telemetry/incidents, flood feeds/simulation models, and mapping APIs), creating a resilient background ingestion pipeline with validation, normalization, freshness detection, in-memory/Redis caching, PostgreSQL/PostGIS history storage, event change detection, and real-time WebSocket streaming to the frontend.

### Strict Boundaries for Phase 2:
- **NO IoT Hardware**: Strictly software-first.
- **NO Fake Live Data**: Explicit status flags (`LIVE`, `CACHED`, `STALE`, `MOCK`, `UNAVAILABLE`).
- **NO Advanced AI/Routing Execution in Phase 2**: The flood prediction engine, Grok decision orchestrator, and SMS dispatch remain decoupled and will be connected in Phase 3. Phase 2 builds the trusted data foundation.

---

## 2. Component Architecture for Phase 2

```text
                 EXTERNAL SOURCES
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
     Open-Meteo      Traffic API    Flood Feeds
    (Live Weather)   (Flow/Incidents) (Alerts/Mock)
         │              │              │
         └──────────────┼──────────────┘
                        ▼
                PROVIDER ADAPTERS
         (OpenMeteo, Traffic, Flood, Mock)
                        ▼
                 DATA VALIDATION
              (Zod boundary schemas)
                        ▼
                  NORMALIZATION
          (Metric units: mm, mm/h, km/h, WGS84)
                        ▼
               FRESHNESS DETECTION
         (LIVE, RECENT, STALE, EXPIRED, MOCK)
                        ▼
             ┌──────────┴──────────┐
             ▼                     ▼
        REDIS CACHE           POSTGRESQL
        (Live State)          (Observations)
             │                     │
             └──────────┬──────────┘
                        ▼
                 EVENT EMITTER
           (Meaningful change filter)
                        ▼
                WEBSOCKET SERVER
             (Topic-based broadcast)
                        ▼
               FRONTEND LIVE STORE
                        ▼
        ┌───────────────┴───────────────┐
        ▼                               ▼
  LIVE DASHBOARD                    LIVE MAP
 (Status badges & cards)       (Toggled vector layers)
```

---

## 3. Detailed Step-by-Step Implementation Steps

### Step 1: Canonical Data Models & Schemas (`packages/shared`)
- Enhance `packages/shared/src/types/index.ts` and `schemas/index.ts` with canonical Phase 2 types:
  - `WeatherObservation`, `WeatherForecast`
  - `TrafficObservation`, `TrafficIncident`
  - `FloodObservation`, `FloodEvent`
  - `RoadState`
  - `ProviderStatus` (`HEALTHY`, `DEGRADED`, `DOWN`, `UNKNOWN`)
  - `FreshnessState` (`LIVE`, `RECENT`, `STALE`, `EXPIRED`, `MOCK`, `UNAVAILABLE`)
  - Standard API Envelope: `{ success: boolean, data: T, meta: { source, retrievedAt, freshness, dataAgeSeconds } }`

### Step 2: Resilient Provider Adapters & Circuit Breakers (`apps/api/src/providers/`)
- `providers/common/circuitBreaker.ts`: Timeout handling (5s), exponential backoff with jitter (3 attempts), and circuit breaker (trips on 5 consecutive failures, 30s cooldown).
- `providers/common/freshness.ts`: Generic freshness calculator computing age from `source_timestamp` and evaluating per-provider TTL.
- `providers/weather/openMeteoAdapter.ts`: Live weather adapter querying Open-Meteo API (free, open, no API key required, reliable global precipitation, forecast, wind, humidity).
- `providers/weather/mockWeatherAdapter.ts`: Deterministic mock weather fallback.
- `providers/traffic/trafficAdapter.ts`: Live traffic flow & incident adapter with fallback to realistic corridor simulation.
- `providers/floods/floodAdapter.ts`: Hydrological flood alert adapter with explicit MOCK/SIMULATION labeling when live city sensor feeds are unavailable.
- `providers/maps/mapAdapter.ts`: Geographic geocoding and road network coordinate adapter.

### Step 3: Centralized Scheduler & Ingestion Workers (`apps/api/src/services/`)
- `services/dataAggregator.ts`: Central background ingestion scheduler.
- Polling cadences:
  - Weather: every 300s (5m)
  - Traffic: every 180s (3m)
  - Flood: every 300s (5m)
- Isolated failure: failure in traffic does not block weather or flood ingestion.
- Request coalescing: multiple concurrent requests share in-flight promises.

### Step 4: Live State Cache & History Persistence
- `services/stateStore.ts`: In-memory & Redis live state cache with key TTLs (`weather:current`, `traffic:flows`, `flood:events`, `provider:status`).
- Repository interface for PostgreSQL persistence, storing historical observations and provider health metrics with graceful in-memory storage fallback when external database is offline.

### Step 5: Real-Time WebSocket Engine (`apps/api/src/websocket/`)
- Native WebSocket server integrated into the Express HTTP server instance (`/ws`).
- Topic channels: `realtime:weather`, `realtime:traffic`, `realtime:flood`, `realtime:system`.
- Broadcast on meaningful change events and telemetry refresh.
- Client heartbeat and graceful reconnection handling.

### Step 6: Backend API Endpoints (`apps/api/src/modules/data/`)
- `GET /api/v1/weather/current`
- `GET /api/v1/weather/forecast`
- `GET /api/v1/traffic/live`
- `GET /api/v1/traffic/incidents`
- `GET /api/v1/flood/events`
- `GET /api/v1/roads/state`
- `GET /api/v1/data/providers/status`
- `GET /api/v1/realtime/state`
- All responses wrapped in canonical metadata envelope (`source`, `freshness`, `retrievedAt`).

### Step 7: Frontend Real-Time Store & Live Map (`apps/web`)
- WebSocket client service (`useRealtimeStore.ts` / context) with auto-reconnection and connection status indicator.
- Live telemetry cards with explicit data freshness indicators (`LIVE • 45s ago`, `STALE • 12m ago`, `MOCK / SIMULATION`).
- Interactive Live Map with 5 independent toggleable vector layers:
  1. Base Map
  2. Traffic Congestion Layer
  3. Flood Hazard Polygons
  4. Road Incident Barricades
  5. User Geolocation Pin (with browser permission prompt)

### Step 8: Comprehensive Automated Tests (`tests/`)
- Provider unit tests (valid response, malformed response, timeout, fallback).
- Data normalization & unit conversion tests.
- Freshness state evaluation tests (`LIVE`, `RECENT`, `STALE`, `EXPIRED`).
- Circuit breaker & retry backoff tests.
- Change detection & event deduplication tests.
- WebSocket subscription & broadcast tests.
- Live API response format validation tests.

### Step 9: Documentation & Completion Report (`docs/`)
- `docs/PHASE_2_DATA_CONTRACTS.md`
- `docs/PHASE_2_FAILURE_HANDLING.md`
- `docs/PHASE_2_TESTING.md`
- `docs/PHASE_2_COMPLETION_REPORT.md`
- Update existing Phase 1 docs with Phase 2 integrations.

---

## 4. Acceptance Verification Criteria

- [ ] Open-Meteo live weather adapter functional with fallback.
- [ ] Traffic and flood adapters functional with explicit freshness states.
- [ ] No IoT hardware or physical sensor code.
- [ ] Centralized polling with request coalescing and zero client-to-provider direct calls.
- [ ] WebSocket streaming delivers live telemetry to browser without page refresh.
- [ ] 100% automated test suite passing.
- [ ] Clean TypeScript compilation across `@smartcity/shared`, `@smartcity/api`, `@smartcity/web`.
- [ ] Phase 2 Completion Report created before stopping.

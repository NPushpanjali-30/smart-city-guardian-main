# SmartCity Guardian

> **AI-Powered Real-Time Flood Prediction, Traffic Optimization & Emergency Response Platform**

SmartCity Guardian is a real-time Smart City Decision Support Platform that integrates live environmental and transportation data to assess flood-related mobility risk, dynamically recommend safer routes, support traffic and emergency-response decisions, and communicate personalized action plans to citizens through SMS.

---

## 1. Problem Statement

Traditional commercial navigation tools (such as Google Maps or Waze) optimize almost exclusively for minimal travel duration. During extreme hydrological events (such as flash floods, severe cloudbursts, or urban river swelling), this paradigm fails dangerously. Drivers are directed into inundated underpasses and submerged roads because those streets appear empty of traffic and computationally faster, resulting in stranded passenger vehicles and life-safety hazards.

SmartCity Guardian inverts this paradigm: **Personal safety strictly dominates travel duration**. When flood risks emerge, the platform aggressively penalizes hazardous corridors and completely excludes submerged road segments from the active routing graph.

---

## 2. Core Operational Loop

SmartCity Guardian operates on an autonomous, closed-loop event cycle:

```text
LIVE ENVIRONMENTAL DATA (Precipitation radar, 1h/24h rain, weather alerts)
          ↓
   FLOOD RISK ANALYSIS (Antecedent soil saturation + transparent multi-factor scoring)
          ↓
     ROAD RISK UPDATE (Corridor accessibility: OPEN, CAUTION, HIGH_RISK, BLOCKED)
          ↓
    TRAFFIC ANALYSIS (Congestion index + incident bottlenecks)
          ↓
   FLOOD-AWARE ROUTING (Safety-weighted cost function; blocked roads excluded)
          ↓
    GROK DECISION SUPPORT (Contextual synthesis + action plan recommendations)
          ↓
   CITIZEN ACTION PLAN (Plain-language guidelines + alternate corridors)
          ↓
       SMS ALERT (Location-targeted, deduplicated 160-character mobile broadcast)
          ↓
      LIVE MAP UPDATE (Real-time geospatial vector push to web dashboards)
          ↓
    CONTINUOUS MONITORING
```

---

## 3. Technology Stack

- **Monorepo Architecture**: npm Workspaces
- **Backend API**: Node.js (v20+), Express, TypeScript, Zod, Structured JSON Logging (RFC 7807 problem details)
- **Frontend Web**: React 18, Vite, TypeScript, Vanilla CSS (Deep Cyber Dark theme, Glassmorphism, Responsive Command Center)
- **Shared Domain Core**: TypeScript pure calculation engines for flood scoring, road risk evaluation, safety-weighted routing, and Grok AI deterministic fallbacks
- **Persistence Architecture (Target)**: PostgreSQL 16 with PostGIS 3.4 for spatial geometry queries, Redis 7 / In-memory live state cache with TTL & request coalescing
- **Real-Time Streaming**: Native WebSocket server (`/ws`) with topic subscriptions and ping/pong heartbeats
- **Containerization**: Docker & Docker Compose
- **Testing Engine**: Vitest (39 automated unit, integration, and real-time streaming tests passing)

---

## 4. Implementation Status Matrix

To maintain rigorous engineering honesty, features are explicitly demarcated:

| Feature / Subsystem | Status | Description |
| :--- | :--- | :--- |
| **System Architecture & Specifications** | **IMPLEMENTED** | 18 comprehensive specifications in `docs/` covering requirements, DB design, providers, risk & routing models, AI contracts. |
| **Monorepo Foundation** | **IMPLEMENTED** | `packages/shared`, `apps/api`, `apps/web` building cleanly with TypeScript. |
| **Multi-Factor Flood Risk Engine** | **IMPLEMENTED** | Pure mathematical scoring ($S_{\text{rain}}, S_{\text{antecedent}}, S_{\text{forecast}}, S_{\text{evidence}}, C_{\text{confidence}}$) with transparent factor explanations. |
| **Safety-Weighted Routing Cost Engine** | **IMPLEMENTED** | Cost function $C = \alpha T + \beta \text{Traffic} + \gamma \text{Flood} + \delta \text{Incident}$ with strict `BLOCKED` road exclusion. |
| **Grok AI Contract & Deterministic Fallback**| **IMPLEMENTED** | Strict Zod validation schema + deterministic rule engine for guaranteed high availability when Grok is unreachable. |
| **Backend Health & Version API** | **IMPLEMENTED** | `GET /health`, `GET /api/v1/health`, `GET /api/v1/version` with component readiness probes. |
| **Live External Weather API (Open-Meteo)** | **LIVE** | Live HTTP fetch from Open-Meteo with circuit breaker, timeout, exponential backoff, and unit normalization. |
| **Traffic Telemetry & Incidents** | **LIVE / SIMULATED**| Flow metrics (speed, congestion, delay) & incidents; falls back to deterministic simulation when credentials absent. |
| **Flood Sensor Catchment Telemetry** | **MOCK (DISCLOSED)**| Explicitly labeled `freshness: 'MOCK'`, `isLive: false` to avoid fabricating live data for corridors lacking public hydrology APIs. |
| **Data Freshness Engine** | **IMPLEMENTED** | Microsecond-accurate age tracking stamping observations as `LIVE`, `RECENT`, `STALE`, `EXPIRED`, `MOCK`, or `UNAVAILABLE`. |
| **Live State Store & Request Coalescing** | **IMPLEMENTED** | In-memory cache with TTLs, single-flight deduplication to eliminate thundering herd, and meaningful change detection. |
| **Real-Time WebSocket Server (`/ws`)** | **IMPLEMENTED** | Native WebSocket server supporting topic-based subscriptions (`weather`, `traffic`, `flood`, `providers`, `all`) with 30s heartbeat. |
| **Frontend Disaster-Awareness Dashboard**| **IMPLEMENTED** | Real-time telemetry cards with data freshness badges, provider latency monitors, and WebSocket auto-reconnect. |
| **Interactive Live Map with 5 GIS Layers** | **IMPLEMENTED** | Leaflet-based map with toggleable Base Map, Traffic Flow Corridors, Flood Basins, Barricades/Incidents, and GPS location. |
| **Automated Testing Suite** | **IMPLEMENTED** | 39 Vitest unit & integration tests covering config, risk models, routing functions, AI fallbacks, circuit breakers, freshness, and WebSockets. |
| **Full Grok AI Decision Synthesis** | **PHASE 3** | Advanced multi-stream prompt synthesis scheduled for Phase 3. |
| **Personalized SMS Dispatch Engine** | **PHASE 3** | Location-targeted citizen alerting pipeline scheduled for Phase 3. |
| **Hardware IoT Sensors (ESP32 / Pi)** | **EXCLUDED** | **Explicit non-goal**. SmartCity Guardian is strictly software-first. |

---

## 5. Folder Structure

```text
smartcity-guardian/
├── apps/
│   ├── api/                     # Express + TypeScript Modular Monolith
│   │   ├── src/
│   │   │   ├── config/          # Environment configuration loader
│   │   │   ├── middleware/      # Request tracing & RFC 7807 error handler
│   │   │   ├── modules/         # Domain modules (data, health, auth, weather, traffic, floods, roads, routing, ai, alerts, reports, admin)
│   │   │   ├── providers/       # Hexagonal Adapters (circuit breaker, freshness, Open-Meteo, traffic, flood, maps)
│   │   │   ├── services/        # LiveStateStore, background DataAggregator
│   │   │   ├── websocket/       # Real-time WebSocket server (/ws) with topic subscriptions
│   │   │   ├── utils/           # Structured JSON logger
│   │   │   ├── app.ts           # Express application setup
│   │   │   └── index.ts         # Server entry point
│   │   ├── Dockerfile
│   │   └── tsconfig.json
│   │
│   └── web/                     # React + Vite + TypeScript Web Command Center
│       ├── src/
│       │   ├── components/      # Navigation header with crisis ticker & role switcher
│       │   ├── pages/           # 8 views: Home, Login, Register, Dashboard, Map, Alerts, Profile, Admin
│       │   ├── services/        # Reconnecting WebSocket client (realtimeClient.ts)
│       │   ├── styles/          # Cyber dark disaster design tokens
│       │   ├── App.tsx          # Application shell router
│       │   └── main.tsx         # React root mount
│       ├── public/              # Favicon & brand assets
│       ├── Dockerfile
│       ├── index.html
│       └── vite.config.ts
│
├── packages/
│   └── shared/                  # Core domain logic & schemas
│       ├── src/
│       │   ├── calculators/     # Pure calculators (risk.ts, routing.ts, grokFallback.ts)
│       │   ├── schemas/         # Zod schemas (Grok AI output, health, reports, telemetry)
│       │   ├── types/           # Core domain TypeScript types & freshness contracts
│       │   └── index.ts
│       └── tsconfig.json
│
├── mock/                        # Canonical mock data contracts
│   ├── weather.json
│   ├── traffic.json
│   ├── flood.json
│   ├── roads.json
│   └── incidents.json
│
├── docs/                        # Complete Architecture & Requirements Suite
│   ├── ARCHITECTURE.md
│   ├── DATABASE_DESIGN.md
│   ├── DATA_PROVIDERS.md
│   ├── REALTIME_PIPELINE.md
│   ├── EVENT_MODEL.md
│   ├── RISK_MODEL.md
│   ├── ROUTING_MODEL.md
│   ├── REROUTING_POLICY.md
│   ├── GROK_INTEGRATION.md
│   ├── PHASE_1_AUDIT.md
│   ├── PHASE_1_COMPLETION_REPORT.md
│   ├── PHASE_2_IMPLEMENTATION_PLAN.md
│   ├── PHASE_2_DATA_CONTRACTS.md
│   ├── PHASE_2_FAILURE_HANDLING.md
│   ├── PHASE_2_TESTING.md
│   └── PHASE_2_COMPLETION_REPORT.md
│
├── tests/                       # Automated Test Suite (39 tests passing)
│   ├── config.test.ts
│   ├── freshness.test.ts
│   ├── grokFallback.test.ts
│   ├── health.test.ts
│   ├── providers.test.ts
│   ├── realtime.test.ts
│   ├── risk.test.ts
│   └── routing.test.ts
│
├── docker-compose.yml           # PostgreSQL PostGIS, Redis, API, and Web containers
├── .env.example                 # Environment configuration template
├── package.json                 # Root monorepo workspace configuration
├── tsconfig.base.json           # Base TypeScript configuration
└── vitest.config.ts             # Vitest test runner configuration
```

---

## 6. Quickstart & Local Setup

### Prerequisites
- Node.js $\ge 20.0.0$
- npm $\ge 10.0.0$

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Automated Test Suite
```bash
npm test
```

### 3. Build All Packages
```bash
npm run build
```

### 4. Start Local Development Servers
To run the Backend API (listening on `http://localhost:4000` and WebSocket on `ws://localhost:4000/ws`):
```bash
npm run dev:api
```

To run the Frontend Web App (listening on `http://localhost:5173`):
```bash
npm run dev:web
```

---

## 7. Development Roadmap

- **Phase 1: Requirements + System Foundation (COMPLETE)**
  - Repository audit, full documentation suite, domain calculators, backend skeleton, frontend shells, mock contracts, automated test suite.
- **Phase 2: Real-Time Data Intelligence Layer (COMPLETE)**
  - Open-Meteo live weather adapter, traffic flow & incident telemetry, flood catchment simulation with strict disclosure, circuit breakers, freshness engine, LiveStateStore with request coalescing, real-time WebSocket server (`/ws`), live dashboard telemetry, and 5-layer interactive GIS map.
- **Phase 3: Decision Engine & Intelligent Rerouting (NEXT)**
  - Dynamic multi-factor flood risk calculations, road accessibility state transitions, Grok AI decision integration, and personalized SMS alerts.
- **Phase 4: Production Hardening & E2E Validation (PLANNED)**
  - Load testing, rate-limiting stress testing, multi-city boundary configuration, E2E disaster simulation drills.


# SmartCity Guardian — Project File Structure (Frontend & Backend)

This document provides a clean structural mapping of the **Frontend** and **Backend** subsystems of the **SmartCity Guardian** platform.

---

## 🏗️ Top-Level Overview

```text
smartcity-guardian/
├── frontend/               # 🌐 Frontend Web Application (React 18 + Vite + Leaflet GIS)
│   └── (points to apps/web)
├── backend/                # 🛡️ Backend Micro-Engine & API (Express + Node.js + WebSocket)
│   └── (points to apps/api)
├── packages/
│   └── shared/             # 🔄 Shared Domain Core (Types, Schemas, Calculators, Graph Engines)
├── docs/                   # 📄 Comprehensive Architecture & Mathematical Specifications
├── tests/                  # 🧪 Automated Test Suite (34 suites, 360 unit/integration tests)
├── mock/                   # 📊 Canonical Mock Telemetry Data (weather, traffic, flood, roads)
├── scripts/                # ⚡ Operations & Incident Drill Simulations
└── package.json            # 📦 Root Workspace Manifest & Command Orchestrator
```

---

## 🌐 1. FRONTEND ARCHITECTURE (`frontend/` or `apps/web/`)

The frontend is a high-performance **React 18 Single Page Application (SPA)** powered by **Vite** and **Tailwind CSS**, designed for emergency command center operations and citizen mobility.

```text
frontend/
├── index.html                           # Single-page application root HTML5 container
├── vite.config.ts                       # Vite build bundler, reverse proxy & path aliases
├── package.json                         # Frontend dependencies (React, Leaflet, Capacitor)
├── tsconfig.json                        # Frontend TypeScript compiler options
├── capacitor.config.ts                  # Capacitor native mobile bridge configuration
├── public/                              # Static public assets (icons, logos, favicons)
├── android/                             # Native Android Studio project container
│
└── src/
    ├── main.tsx                         # React 18 DOM mount entry point
    ├── App.tsx                          # Client-side router & navigation state layout
    │
    ├── components/                      # Reusable UI Widgets & Shell Elements
    │   ├── Navbar.tsx                   # Top navigation bar, crisis status indicator & language switch
    │   └── TeacherEvaluationGuideModal.tsx # Interactive academic evaluator guidance modal
    │
    ├── pages/                           # 8 Core Operational Views & Dashboards
    │   ├── HomePage.tsx                 # Public crisis ticker, readiness overview & emergency contacts
    │   ├── DashboardPage.tsx            # Multi-hazard telemetry dashboard, weather gauges & water levels
    │   ├── MapPage.tsx                  # Interactive Leaflet GIS command map with dynamic safety overlays
    │   ├── AlertsPage.tsx               # Emergency broadcast dispatcher with sovereign SMS transceiver
    │   ├── ProfilePage.tsx              # Citizen emergency radius settings, SMS opt-in & saved locations
    │   ├── AdminPage.tsx                # Emergency Operations Center (EOC) audit & circuit breaker console
    │   ├── LoginPage.tsx                # Role-based citizen/authority JWT authentication
    │   ├── RegisterPage.tsx             # New user onboarding & emergency coordinates registration
    │   ├── mapHelpers.ts                # GIS map utilities, coordinate parsers & high-res basemap configs
    │   └── historicalFloodMaps.ts       # Bangalore historical inundation polygons & waterlogging zones
    │
    ├── services/                        # Real-Time Data Streaming Clients
    │   └── realtimeClient.ts            # Resilient WebSocket client with automatic reconnection & heartbeat
    │
    ├── i18n/                            # Multilingual Localization Engine (3 Languages)
    │   ├── I18nContext.tsx              # Internationalization React Context Provider
    │   ├── en/common.json               # English language bundle
    │   ├── hi/common.json               # Hindi language bundle (हिंदी)
    │   └── kn/common.json               # Kannada language bundle (ಕನ್ನಡ)
    │
    └── styles/                          # Cyber-Dark Disaster UI Design System
        └── index.css                    # Tailwind CSS directives & emergency color tokens
```

---

## 🛡️ 2. BACKEND ARCHITECTURE (`backend/` or `apps/api/`)

The backend is an **Express.js + TypeScript Modular Architecture** hosting pure mathematical calculation engines, external data adapters, and real-time WebSocket push channels.

```text
backend/
├── package.json                         # Backend runtime dependencies (Express, Zod, ws, tsx)
├── tsconfig.json                        # Backend TypeScript configuration
├── Dockerfile                           # Standalone multi-stage API container configuration
│
└── src/
    ├── index.ts                         # HTTP & WebSocket runtime server bootstrapper
    ├── app.ts                           # Express application setup, Helmet security & CORS whitelist
    │
    ├── config/                          # Centralized Environment & Risk Thresholds
    │   ├── index.ts                     # Environment loader with validated defaults
    │   └── floodRisk.config.ts          # Hydrological basin thresholds & rainfall weighting constants
    │
    ├── modules/                         # API HTTP Route Controllers & Endpoints
    │   ├── routing/routing.router.ts    # Multi-algorithm routing endpoints (/routes/calculate, /routes/active)
    │   ├── floods/floods.router.ts      # Hydrological risk scores & 60-min predictive horizons
    │   ├── weather/weather.router.ts    # Current weather telemetry & 24h precipitation forecasts
    │   ├── traffic/traffic.router.ts    # Arterial corridor speeds, congestion indices & incidents
    │   ├── roads/roads.router.ts        # Unified multi-hazard road segment safety scoring
    │   ├── alerts/alerts.router.ts      # Multilingual emergency alerts & cellular SMS dispatch
    │   ├── location/location.router.ts  # Bangalore landmark geosearch & proximity evaluation
    │   ├── auth/auth.router.ts          # Secure JWT authentication & user sessions
    │   ├── reports/reports.router.ts    # Citizen crowdsourced road hazard reports
    │   ├── admin/admin.router.ts        # System telemetry, provider overrides & circuit breaker states
    │   ├── health/health.router.ts      # Liveness (/health/live) & readiness (/health/ready) probes
    │   └── data/data.router.ts          # Consolidated multi-stream state snapshot
    │
    ├── services/                        # Business Logic, AI & Routing Algorithms
    │   ├── routing/
    │   │   ├── routingEngine.service.ts # Unified routing engine: OSRM + HD* Lite + H-STAR + DMC-A*
    │   │   ├── activeRoute.service.ts   # Active navigation session management & real-time telemetry
    │   │   └── reroutingPolicy.service.ts # Intelligent deviation detection & hazard avoidance trigger
    │   ├── flood/
    │   │   ├── floodIntelligence.service.ts # Multi-factor hydrological risk scoring coordinator
    │   │   ├── floodRiskEngine.ts       # Mathematical risk engine: S_rain, S_antecedent, S_evidence
    │   │   ├── shortHorizonPredictor.ts # Predictive water level & flash flood horizon models
    │   │   ├── roadFloodRisk.service.ts # Spatial correlation between roads and flood catchment basins
    │   │   └── floodAIContextBuilder.ts # Context aggregator for AI emergency assessments
    │   ├── traffic/
    │   │   ├── trafficIntelligence.service.ts # Congestion scoring & incident analysis
    │   │   └── trafficCorridor.service.ts # Arterial corridor monitoring & bottleneck alerts
    │   ├── roads/
    │   │   └── roadRisk.service.ts      # Multi-hazard risk aggregator (Flood + Traffic + Incidents)
    │   ├── locationRelevance.service.ts # Geo-spatial proximity calculation & alert radius filters
    │   ├── notifications/
    │   │   ├── notificationPolicy.service.ts # Notification frequency throttling & severity gating
    │   │   ├── notificationQueue.service.ts  # Persistent queue worker, retry exponential backoff
    │   │   └── userPreference.service.ts     # User-specific alert preferences & SMS opt-in state
    │   ├── ai/
    │   │   ├── GrokClient.ts            # xAI Grok-2 API client with streaming & timeout guarantees
    │   │   ├── GrokAIContextBuilder.ts  # Structured prompt context builder
    │   │   ├── GrokPromptBuilder.ts     # Crisis prompt synthesizer
    │   │   ├── GrokResponseValidator.ts # Runtime Zod schema validator for AI responses
    │   │   ├── GrokFallbackService.ts   # Guaranteed deterministic emergency rule-engine fallback
    │   │   └── GrokDecisionService.ts   # Hybrid AI decision manager with circuit breaker
    │   ├── stateStore.ts                # Atomic in-memory live state cache with request coalescing
    │   └── dataAggregator.ts            # Autonomous background scheduler polling live telemetry
    │
    ├── providers/                       # Hexagonal External Adapters & Circuit Breakers
    │   ├── weather/openMeteoAdapter.ts  # Live Open-Meteo REST API weather integration
    │   ├── weather/mockWeatherAdapter.ts# Deterministic mock weather provider
    │   ├── traffic/trafficAdapter.ts    # Real-time traffic ingestion adapter
    │   ├── floods/floodAdapter.ts       # Hydrological sensor telemetry adapter
    │   ├── maps/mapAdapter.ts           # OpenStreetMap / OSRM navigation adapter
    │   ├── sms/twilioSmsAdapter.ts      # Twilio cellular SMS gateway adapter
    │   ├── sms/fast2SmsAdapter.ts       # Fast2SMS Indian cellular gateway adapter
    │   ├── sms/genericHttpSmsAdapter.ts # Generic HTTP SMS gateway adapter
    │   ├── sms/mockSmsProvider.ts       # Sovereign zero-cost in-memory cellular transceiver
    │   ├── ai/grokProvider.ts           # Grok AI inference adapter
    │   ├── common/circuitBreaker.ts     # Resilient 3-state Circuit Breaker (CLOSED, OPEN, HALF_OPEN)
    │   └── common/freshness.ts          # High-precision observation timestamp & freshness tracker
    │
    ├── websocket/
    │   └── wsServer.ts                  # Native WebSocket server (/ws) with topic subscriptions
    │
    ├── middleware/
    │   ├── auth.ts                      # JWT bearer verification & role-based access control
    │   ├── rateLimiter.ts               # IP-based sliding window rate limiter
    │   ├── requestLogger.ts             # Correlation ID tracking & HTTP audit logging
    │   └── errorHandler.ts              # RFC 7807 compliant Problem Details error handler
    │
    └── utils/
        ├── logger.ts                    # Production JSON logger
        ├── jwt.ts                       # Token signing & verification
        ├── sanitizer.ts                 # PII & credential masking for logs
        └── mockPath.ts                  # Resilient filesystem path resolver
```

---

## 🔄 3. SHARED DOMAIN CORE (`packages/shared/`)

Both Frontend and Backend share single-source-of-truth TypeScript types, validation schemas, and mathematical routing calculations:

```text
packages/shared/
├── src/
│   ├── types/                           # Core domain interfaces (telemetry, hazards, routes, users)
│   ├── schemas/                         # Zod schemas (API requests, route payloads, Grok AI models)
│   ├── calculators/                     # Pure algorithms (risk scoring, cost evaluation, fallback rules)
│   ├── graph/                           # HD* Lite, H-STAR, DMC-A* graph mathematics & priority queues
│   ├── templates/                       # Localized SMS templates (English, Hindi, Kannada)
│   └── index.ts                         # Shared library public exports
├── package.json                         # Shared package metadata (@smartcity/shared)
└── tsconfig.json                        # Shared compiler settings
```

---

## 🚀 4. Convenient Command Reference

You can run commands directly for **frontend** or **backend** from the repository root:

| Command | Action | Subsystem |
| :--- | :--- | :--- |
| `npm run dev:frontend` | Starts Vite React frontend development server (`http://localhost:5173`) | **Frontend** |
| `npm run dev:backend` | Starts Express API & WebSocket backend server with auto-reload (`port 4000`) | **Backend** |
| `npm run build:frontend` | Compiles and builds production web bundle to `dist/` | **Frontend** |
| `npm run build:backend` | Compiles TypeScript API services to `dist/` | **Backend** |
| `npm run build` | Builds all packages (Shared + Backend + Frontend) | **Fullstack** |
| `npm test` | Runs all 34 Vitest test suites (360 tests passing) | **Verification** |
| `./run-demo.sh` | 1-Click launcher starting the web demo in your browser | **Demo** |

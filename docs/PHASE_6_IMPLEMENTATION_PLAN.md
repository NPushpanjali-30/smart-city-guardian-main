# SmartCity Guardian — Phase 6 Implementation Plan
## Full Live Map, Citizen Experience & Authority Control Center

**Project:** SmartCity Guardian  
**Phase:** Phase 6 — Operational GIS Live Map, Citizen Safety Experience & Authority Control Center  
**Target Completion:** October 2026  
**Status:** DRAFTING / IN PROGRESS  
**Prerequisites:** Phase 1–5 Complete & Verified (18/18 test suites passing, `docs/PHASE_5_COMPLETION_REPORT.md` signed off).

---

## 1. Executive Summary & Objectives

Phase 6 delivers the complete, production-grade, user-facing operational experience for both citizens and emergency authorities:
1. **Interactive GIS Disaster Map (`MapPage.tsx`)**:
   - Multi-layer visual rendering with independent layer controls.
   - Rigorous visual differentiation between **Observed/Confirmed Hazards** (solid fills, caution stripes, barrier markers), **30-Min Predicted Risk Contours** (dashed outlines, semi-transparent overlays, horizon badges), **Historical Vulnerability Basins** (dotted contours), and **Stale/Unavailable Data** (patterned neutral overlays).
   - Dynamic road segments reflecting real-time accessibility (`OPEN`, `CAUTION`, `HIGH_RISK`, `BLOCKED`, `UNKNOWN`) with distinct geometric stroke patterns (non-color-only encoding).
   - Traffic corridor congestion heatlines (`SMOOTH`, `SLOW`, `CONGESTED`, `SEVERELY_CONGESTED`).
   - Emergency facilities layer (verified hospitals, medical centers, emergency shelters, staging depots).
   - 10 km configurable alert radius ring centered on user location.

2. **Location & Destination UX**:
   - Transparent browser geolocation permission flow with clear justification and status indicators (`PROMPT`, `REQUESTING`, `GRANTED`, `DENIED`, `UNSUPPORTED`).
   - Ephemeral client-side GPS handling with data-freshness timestamps ("Updated 12s ago"); zero retention of precise coordinates.
   - 3-Way Independent Risk Visualization:
     - **Current Location Risk** (localized catchment basin threat)
     - **Destination Risk** (destination hazard score, distance, nearest active event)
     - **Route Risk** (composite travel impedance, flood route index FRI, mobility risk index MRI)
   - Quick destination selector and custom address/POI search.

3. **Navigation & Dynamic Reroute Presentation**:
   - Integration with Phase 5 candidate routes: `RECOMMENDED` (safety-weighted detour), `ALTERNATIVE` (perimeter bypass), and `DIRECT_BLOCKED` (submerged arterial displayed with explanation for total transparency).
   - Metrics cards: Travel time (ETA), distance (km), flood exposure score, traffic congestion, and composite safety status (`SAFE_TO_PROCEED`, `CAUTION`, `HIGH_RISK`, `INVALID`).
   - Plain-language explanation cards detailing Advantages, Cautions, and Trade-Offs.
   - Dynamic Rerouting Banner: Prompt notification when active route conditions degrade or an upcoming segment is blocked; requires user confirmation to switch paths.
   - "No Suitable Route Found" empty state when all paths are impassable.

4. **Localized Citizen Safety Panel**:
   - Area risk severity (`NORMAL`, `WATCH`, `WARNING`, `CRITICAL`) and temporal trend (`INCREASING`, `STABLE`, `DECREASING`).
   - 30-min predictive nowcast horizon with probability and contributing factors.
   - Nearby flood events with radial distance in km and direction.
   - Actionable citizen guidance with verified Phase 4 Grok AI recommendations and deterministic safety fallback.
   - Real-time data freshness badge (`LIVE`, `SIMULATION`, `STALE`).

5. **Authority Control Center (`AdminPage.tsx`)**:
   - Role-protected dashboard for Emergency Operations Center (EOC) staff.
   - Configured study area boundary banner (e.g. Metro Central Study Area: 25 km²; non-citywide disclaimer).
   - Active and escalating risk events table with severity, source, and timestamps.
   - Observed vs Predicted flood zones analytical matrix.
   - Municipal corridor congestion and road accessibility table with recommended authority diversions.
   - Telemetry provider health and circuit breaker status monitor.
   - AI decision audit log & fallback tracker.
   - Live route recalculation stream.
   - Incident report queue with verification and dismissal controls.
   - Event and road filtering (by area, risk state, event type, time range) with pagination.
   - Prominent disclaimer: Decision support only; does not control physical traffic signals or claim official emergency command.

6. **Accessibility, Performance & Multilingual Foundation**:
   - Trilingual localization: Complete English (`en`), Hindi (`hi`), and Kannada (`kn`) support without hard-coded UI strings.
   - Non-color-only encoding (icons, badges, line dash styles, distinct shapes).
   - Mobile and desktop responsive layouts.
   - WebSocket streaming (`realtimeClient`) with automatic reconnect and HTTP fallback.

---

## 2. Architecture & Existing Component Inventory

### Reused Modules
- **Backend Routing Engine**: `apps/api/src/services/routing/routingEngine.service.ts` & `activeRoute.service.ts`
- **Backend Flood Intelligence**: `apps/api/src/services/flood/floodIntelligence.service.ts`
- **Backend Traffic Intelligence**: `apps/api/src/services/traffic/trafficIntelligence.service.ts`
- **Backend Data Aggregator**: `apps/api/src/services/dataAggregator.ts`
- **Backend Admin Overview API**: `apps/api/src/modules/admin/admin.router.ts`
- **Frontend Realtime Client**: `apps/web/src/services/realtimeClient.ts`
- **Frontend I18n Context**: `apps/web/src/i18n/I18nContext.tsx`
- **Frontend Core Layout**: `apps/web/src/components/Navbar.tsx` & `apps/web/src/App.tsx`

### Components to Enhance
1. `apps/web/src/pages/MapPage.tsx`: Upgrade into full interactive GIS disaster map with comprehensive layers, legend, route presentation, and localized safety panel.
2. `apps/web/src/pages/AdminPage.tsx`: Upgrade into full-featured EOC Authority Control Center with filters, pagination, corridor diversion analysis, and telemetry health.
3. `apps/web/src/i18n/en/common.json`, `hi/common.json`, `kn/common.json`: Add comprehensive dictionary keys for all Phase 6 GIS layers, legend, navigation states, and authority controls.
4. `apps/api/src/modules/admin/admin.router.ts`: Extend with endpoints for filtered incident history, corridor status, and recalculation event logs.

---

## 3. Step-by-Step Implementation Roadmap

### Step 1: Extend Multilingual Localization Strings (`en`, `hi`, `kn`)
Add translation keys for:
- Map layer toggles (Base Map, User Location, Alert Radius, Route Detours, Traffic Congestion, Observed Floods, Predicted Zones, Historical Basins, Road Incidents, Emergency Facilities).
- Map legend descriptions (Observed/Confirmed, Predicted, Historical, Road states: Open, Caution, High Risk, Blocked, Unknown).
- Navigation states & candidate route tabs (Recommended Detour, Alternate Bypass, Blocked Direct Route, No Suitable Route).
- Safety panel items (Current Location Risk, Destination Risk, Route Risk, Grok Recommendations, Deterministic Fallback).
- Authority Control Center labels, filter controls, pagination, and disclaimers.

### Step 2: Enhance Backend Admin Router
Extend `apps/api/src/modules/admin/admin.router.ts`:
- Support query parameters for filtering events: `riskState`, `areaId`, `page`, `limit`.
- Expose corridor status, road accessibility summary, and recent route recalculation logs.
- Add endpoint for citizen report status management (`POST /api/v1/admin/reports/:id/verify`, `POST /api/v1/admin/reports/:id/dismiss`).

### Step 3: Upgrade Interactive GIS Map (`MapPage.tsx`)
- Implement comprehensive SVG map rendering with dynamic viewBox, zoom controls, and layer toggles.
- Add visual indicators for:
  - 10 km alert radius ring around user location.
  - Emergency facilities markers (Hospitals, Emergency Shelters, Fire/Rescue Stations).
  - Explicit visual styling distinguishing Observed (diagonal caution hatch + high opacity) vs Predicted (dashed contour + 30-min forecast badge) vs Historical (dotted outline).
  - Non-color-only road markers (double solid for Blocked, dashed for Caution, dotted for Unknown).
- Implement interactive inspection tooltips on roads and flood zones upon click.
- Add "No Suitable Route Found" fallback when candidate paths fail safety thresholds.
- Enhance Dynamic Reroute Alert banner with confirmation buttons ("Accept Safer Detour", "Dismiss").

### Step 4: Upgrade Citizen Safety Panel (`DashboardPage.tsx` & `MapPage.tsx`)
- Present 3-way risk breakdown: Current Location, Destination, Route.
- Display verified Phase 4 Grok AI recommendations with clear label ("AI Decision Advisory • Model grok-2-latest") and deterministic fallback badge ("Deterministic Safety Rules Active") when offline.
- Display nearby flood events with radial distance and direction.

### Step 5: Upgrade Authority Control Center (`AdminPage.tsx`)
- Implement role-protection gate: check user role, show access denied / prompt to switch to Admin EOC.
- Configured study area boundary banner with coordinates and surface area disclaimer.
- Real-time corridor overview with authority diversion recommendations.
- Interactive filtering (area, risk state, event type, time range) and pagination for reports and risk events.
- Telemetry provider health matrix with live data age and circuit breaker statuses.
- Route recalculation stream and decision audit logs.

### Step 6: Testing & Quality Assurance
- Add unit and integration tests:
  - `tests/citizenMap.test.ts`: Verify map layer toggles, legend items, location permission states, route presentation, and "no suitable route" state.
  - `tests/authorityDashboard.test.ts`: Verify admin overview metrics, role protection, incident filters, pagination, and corridor states.
  - `tests/multilingualPhase6.test.ts`: Verify translation key parity across English, Hindi, and Kannada for all Phase 6 keys.
- Run workspace typecheck, lint, and build (`npm run build`).

### Step 7: Phase 6 Documentation & Completion Report
- Create `docs/MAP_LAYERS.md`
- Create `docs/CITIZEN_EXPERIENCE.md`
- Create `docs/AUTHORITY_CONTROL_CENTER.md`
- Create `docs/PHASE_6_COMPLETION_REPORT.md`
- Report executive sign-off status and stop before Phase 7.

# SmartCity Guardian — EOC Authority Control Center & Operational Console

**Project:** SmartCity Guardian  
**Document:** Emergency Operations Center (EOC) Authority Control Center Specification  
**Phase:** Phase 6 — Full Live Map, Citizen Experience & Authority Control Center  
**Status:** IMPLEMENTED & VERIFIED  

---

## 1. Executive Purpose & Operational Boundaries

The **EOC Authority Control Center (`AdminPage.tsx`)** provides municipal disaster managers, emergency dispatchers, and traffic authority operators with unified situational awareness during extreme hydrological events.

### Strict Operational Boundaries
1. **Decision Support Prototype**: The console provides algorithmic and AI-assisted recommendations. It **does not** physically control traffic signals, actuate automated storm gates, or replace official statutory emergency command.
2. **Configured Study Area Scope**: Operations are strictly localized to the configured study area (**Metro Central Study Basin**: $40.700^\circ\text{N}\text{--}40.750^\circ\text{N}, 74.030^\circ\text{W}\text{--}73.980^\circ\text{W}$, $25\text{ km}^2$). The platform clearly disclaims citywide authority when operating on a configured study sector.
3. **Role Protection**: Only users authenticated with the `ADMIN` role can access the control center. Unauthorized attempts are intercepted with an explicit access restricted gate.

---

## 2. Key Modules & Functional Capabilities

### 2.1 Executive Situational Snapshot
High-level KPIs summarize citywide operational resilience:
- **Active Risk Tier**: e.g., `WARNING` (Score: 68.5/100, Escalating trend).
- **Blocked Road Corridors**: Real-time count of impassable segments (e.g., Bay Street Boulevard, 28 cm water depth).
- **Monitored Catchment Basins**: Water level and discharge status across 4 municipal basins.
- **Dynamic Reroute Events**: Real-time count of commuter navigation sessions currently being rerouted away from hazards.

### 2.2 Filterable & Paginated Risk Events Registry
A multi-criteria incident table reflecting live sensor data and official EOC advisories:
- **Interactive Filters**:
  - *By Area*: `ALL`, `Sector 4 Lowlands`, `Sector 1 Central Core`, `Sector 3 East River`.
  - *By Severity*: `ALL`, `CRITICAL`, `WARNING`, `CAUTION`.
  - *By Event Type*: `ALL`, `FLOOD`, `TRAFFIC`, `CLOSURE`.
- **Pagination**: Supports clean page-based navigation with Previous/Next controls and page indicators.
- **Evidence Provenance**: Explicitly labels whether each event is backed by `OBSERVED` field telemetry or `PREDICTED` nowcast simulations.

### 2.3 Municipal Corridors & Road Accessibility Matrix
Monitors arterial corridors and issues municipal diversion advisories:
- **Bay Street Waterfront Arterial**: `BLOCKED` (Speed: 0 km/h, Delay: +11.3 min, Flood: 88/100, 28 cm water).  
  *Authority Advisory*: "Mandatory detour onto Highland Avenue Ridge via North Ramp."
- **Highland Avenue Elevated Ridge**: `OPEN • PRIORITY` (Speed: 42 km/h, Delay: +0.7 min, Flood: 10/100, 0 cm water).  
  *Authority Advisory*: "Recommended primary diversion corridor. Keep dedicated lanes clear for hospital transit."
- **Market Street Commercial Corridor**: `CAUTION` (Speed: 24 km/h, Delay: +1.88 min, Flood: 54/100, 8 cm water).  
  *Authority Advisory*: "Minor pooling in curb lanes. Recommend 25 km/h transit limit."

### 2.4 Live Route Recalculation Stream
Real-time audit log of active navigation sessions rerouted due to shifting hazards:
- Records recalculation trigger (`ROAD_BLOCKED`, `FLOOD_RISK_SURGE`, `TRAFFIC_SURGE`).
- Captures old route name vs new safe detour, travel time impact (+3 min), and session correlation ID.

### 2.5 Grok AI Decision Support & Audit Trail
Synthesizes multi-factor telemetry into structured municipal mitigation plans:
- **Operational Situation Summary**: Contextual narrative of watershed runoff and arterial vulnerabilities.
- **Decision Confidence Harmonization**: Displays ground sensor evidence confidence ($88\%$), Grok AI interpretation confidence ($85\%$), and enforced decision confidence ($84\%$).
- **Municipal Authority Recommendations**: Concrete action items (e.g., "Deploy mobile pumping assets to Sector 4 lowlands", "Pre-position physical warning barriers").
- **Audit Trail Table**: Records timestamp, mode, risk level, confidence, and fallback status for all recent AI invocations.

### 2.6 Telemetry Ingestion Health & Circuit Breakers
Monitors upstream provider stability:
- Tracks provider name, category (weather, traffic, flood, map), health status (`HEALTHY`, `DEGRADED`, `OFFLINE`).
- Distinguishes `LIVE` versus `MOCK / SIMULATION` adapter modes.
- Reports round-trip response latency and consecutive failure counts.

### 2.7 Citizen Field Reports Verification Queue
Enables municipal operators to review crowd-sourced flood observations:
- Displays submitted category, user description, timestamp, and GPS coordinates.
- **Verify & Apply**: Promotes community reports to verified hazards, triggering map and route updates.
- **Dismiss**: Removes erroneous or spam submissions.

---

## 3. REST API Contract Reference

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/admin/overview` | `GET` | Admin | High-level situational snapshot, study area bounds, and provider health |
| `/api/v1/admin/events` | `GET` | Admin | Filterable, paginated list of municipal risk events (`severity`, `areaId`, `type`, `page`, `limit`) |
| `/api/v1/admin/corridors` | `GET` | Admin | Corridor accessibility, congestion speeds, and diversion advisories |
| `/api/v1/admin/reroutes` | `GET` | Admin | Dynamic route recalculation event stream |
| `/api/v1/admin/reports` | `GET` | Admin | Citizen hazard report verification queue |
| `/api/v1/admin/reports/:id/verify` | `POST` | Admin | Verify a citizen report and mark as confirmed hazard |
| `/api/v1/admin/reports/:id/dismiss` | `POST` | Admin | Dismiss an unverified citizen hazard report |

# Functional Requirements Specification (FRS)

**Document Version**: 1.0.0  
**Status**: Approved Specification  
**Project**: SmartCity Guardian  

---

## 1. Scope & Overview

This document formalizes the functional requirements (FR-001 through FR-014) governing the SmartCity Guardian platform. These requirements define the business logic, behavioral contracts, inputs, outputs, and system interactions.

---

## 2. Detailed Functional Requirements

### FR-001 — User Registration & Profile Management
- **Description**: The system shall allow citizens and administrators to create and maintain accounts with communication preferences.
- **Minimum Data Attributes**:
  - Full Name
  - Phone Number (E.164 formatted, e.g., `+1234567890`)
  - Email address (unique, normalized)
  - Securely hashed password
  - Notification preferences (SMS opt-in status, severity threshold for alerts)
  - Explicit consent timestamp for emergency SMS
  - Optional saved geographical locations (Home, Work, Frequent Corridors)
- **Validation**: Strict validation on phone format, email structure, and password complexity.

### FR-002 — Authentication & Role-Based Access Control (RBAC)
- **Description**: The system shall authenticate identities and authorize actions based on discrete roles.
- **Supported Workflows**: User registration, login with token issuance, session refresh, secure logout, and password modification.
- **Roles**:
  - `CITIZEN`: Can view public risk maps, request routes, report incidents, receive personalized SMS alerts, and manage profile settings.
  - `ADMIN`: Emergency Operations Center personnel. Can view city-wide telemetry, verify citizen reports, trigger system-wide alerts, inspect AI reasoning logs, and modify system operational parameters.
- **Extensibility**: The RBAC engine must permit adding future roles (e.g., `FIRST_RESPONDER`, `TRANSIT_OPERATOR`) without altering data models.

### FR-003 — Live Environmental Data Ingestion
- **Description**: The system shall retrieve, validate, and normalize environmental meteorological data across configurable urban bounding boxes.
- **Data Ingested**:
  - Current precipitation rate (mm/h)
  - 1-hour, 3-hour, and 24-hour accumulated rainfall
  - Precipitation forecast radar intervals
  - Atmospheric temperature, relative humidity, and wind velocity
  - Severe weather alerts issued by authoritative meteorological agencies
- **Architecture**: Ingestion must occur exclusively via provider adapters (`WeatherProvider`), decoupling domain logic from specific third-party APIs.

### FR-004 — Live Traffic Data Ingestion
- **Description**: The system shall retrieve, validate, and normalize real-time road traffic telemetry.
- **Data Ingested**:
  - Road segment congestion index (0.0 to 1.0)
  - Current speed vs. free-flow baseline speed
  - Estimated transit delays per segment
  - Active traffic incidents, work zones, and road closures reported by traffic authorities
- **Architecture**: Decoupled behind `TrafficProvider` adapter interfaces.

### FR-005 — Multi-Factor Flood Risk Assessment
- **Description**: The system shall calculate transparent, explainable flood-risk scores (0–100) and classify them into discrete operational severity levels.
- **Severity Levels**:
  - `NORMAL` (0–24): Standard conditions, no impediment to mobility.
  - `WATCH` (25–49): Moderate rain; low-lying intersections monitored.
  - `WARNING` (50–74): Significant accumulation; high-risk corridors dangerous.
  - `CRITICAL` (75–100): Severe flash flooding; life safety threat; major arteries impassable.
- **Configuration**: Score thresholds must be loaded from external configuration and never hard-coded into domain logic.
- **Inputs**: Current rainfall rate, antecedent rainfall (soil saturation factor), forecast accumulation, active severe weather bulletins, historical catchment vulnerability, and validated citizen reports.

### FR-006 — Dynamic Road Risk & Accessibility Assessment
- **Description**: The system shall map computed flood risk and live traffic data to discrete urban road segments.
- **Attributes per Road Segment**:
  - Segment ID & GeoJSON geometry (`LineString`)
  - Traffic score (0–100)
  - Flood score (0–100)
  - Composite risk score (0–100)
  - Accessibility State: `OPEN`, `CAUTION`, `HIGH_RISK`, `BLOCKED`, `UNKNOWN`
  - Last updated timestamp and confidence rating
- **State Semantics**:
  - `OPEN`: Fully passable.
  - `CAUTION`: Minor standing water or moderate congestion.
  - `HIGH_RISK`: Water levels rising rapidly; impassable to passenger vehicles.
  - `BLOCKED`: Road submerged, physically impassable, or officially closed.
  - `UNKNOWN`: Insufficient recent telemetry; handled with conservative safety defaults.

### FR-007 — Flood-Aware & Safety-Weighted Routing
- **Description**: The system shall calculate optimal navigation routes between origin and destination prioritizing personal safety over speed.
- **Cost Function Formulation**:
  $$\text{Route Cost} = \alpha \cdot (\text{Travel Time}) + \beta \cdot (\text{Traffic Penalty}) + \gamma \cdot (\text{Flood Risk Penalty}) + \delta \cdot (\text{Incident Penalty})$$
- **Hard Constraints**:
  - Segments marked `BLOCKED` must be completely excluded from the routing graph.
  - Segments marked `HIGH_RISK` shall incur severe exponential penalty weight ($\gamma \gg \alpha$).
  - When hazardous conditions exist, the system must offer a safer alternative route even if it incurs greater travel duration.

### FR-008 — Dynamic Real-Time Rerouting
- **Description**: The system shall monitor in-transit routes against real-time hazard updates and trigger rerouting calculations when material changes occur.
- **Trigger Conditions**:
  - An upcoming segment on the active route transitions to `BLOCKED` or `HIGH_RISK`.
  - Composite flood risk of the active route increases across a defined delta threshold ($\Delta \text{Risk} \ge 20\%$).
  - An alternative route offering significant safety improvement ($\ge 30\%$ risk reduction) becomes viable.
- **Anti-Oscillation Guard**: Reroute evaluations must enforce a configurable cooldown period (e.g., 60 seconds) to prevent navigational flapping.

### FR-009 — Grok AI Decision Support
- **Description**: The system shall leverage Grok via API to synthesize structured environmental and mobility data into reasoned action plans.
- **Input Context**: Normalized weather metrics, flood risk levels, affected road segments, active route metadata, citizen report summaries, and telemetry freshness.
- **Output Schema**:
  ```json
  {
    "risk_level": "NORMAL" | "WATCH" | "WARNING" | "CRITICAL",
    "confidence": 0.88,
    "affected_zones": ["Downtown Corridor", "South Riverway"],
    "roads_to_avoid": ["Bay St / Mile 4", "Harbor Overpass"],
    "recommended_action": "Avoid low-lying underpasses; utilize eastern high-elevation detour.",
    "authority_actions": ["Deploy drainage pumps to Sector 4", "Pre-position traffic barricades on Bay St"],
    "citizen_actions": ["Delay non-essential travel", "Follow Route B via Highland Ave"],
    "sms_summary": "FLASH FLOOD WARNING: Bay St closed due to water accumulation. Use Highland Ave detour. Avoid low-lying underpasses."
  }
  ```
- **Fallback Rule**: If Grok AI is unavailable, times out, or produces invalid schema data, the system must immediately and transparently fall back to deterministic rule-based decisions.

### FR-010 — Citizen Action Plans
- **Description**: The system shall provide actionable, context-aware protective guidelines to citizens.
- **Content Guidelines**: Recommendations must be plain-language, pragmatic, and non-sensationalized (e.g., "Avoid Mile 4 underpass", "Elevate personal vehicles in Sector 3").
- **Disclaimer**: Advisories must explicitly include a standard disclaimer stating that recommendations supplement, but do not replace, instructions from civil defense authorities.

### FR-011 — Location-Targeted SMS Alerting
- **Description**: The system shall deliver concise emergency alerts via SMS to subscribed citizens whose saved locations or active routes intersect risk zones.
- **Requirements**:
  - Enforce explicit opt-in consent.
  - Intelligent deduplication: Suppress identical alert dispatches within a sliding time window unless risk tier escalates.
  - Delivery tracking: Log outbound delivery attempts, provider message IDs, timestamps, and receipt statuses.
  - Concise format: Payload constrained to 160 characters (or concatenated 320 max) containing: risk tier, affected corridor, recommended action.

### FR-012 — Real-Time Citizen Web Dashboard
- **Description**: The system shall provide a web dashboard presenting interactive geospatial hazard and route awareness.
- **Components**:
  - Live map rendering flood-risk polygon heatmaps and colored road risk segments.
  - Interactive route planner displaying primary safe route vs. standard shortest route.
  - Active alerts feed and weather telemetry widget.
  - Low-latency real-time updates via WebSocket or Server-Sent Events (SSE).

### FR-013 — Authority & EOC Admin Command Center
- **Description**: The system shall provide municipal operators with an administrative console for disaster coordination.
- **Capabilities**:
  - City-wide flood risk and traffic congestion metrics.
  - Ingestion status and data freshness health monitors.
  - Citizen hazard report review, validation, and status escalation queue.
  - Grok AI decision log inspection with manual override switches.
  - System-wide broadcast alert dispatcher.

### FR-014 — Citizen Hazard & Flood Reporting
- **Description**: The system shall allow registered citizens to report localized flood incidents and obstructions.
- **Report Payload**: Category (`FLOOD`, `ROAD_BLOCKED`, `ACCIDENT`, `HEAVY_TRAFFIC`, `OTHER_HAZARD`), precise GPS coordinates, text description, optional photo URL, and submission timestamp.
- **Verification Workflow**: Submissions enter a `PENDING_REVIEW` state, with clustering algorithms aggregating adjacent reports to calculate confidence prior to administrative verification.

### FR-015 — Active Location-Based Proximity Alerts
- **Description**: The system shall evaluate whether a citizen is within a configurable perimeter of an active flood or road closure event.
- **Requirements**:
  - Configurable perimeter governed by `ALERT_RADIUS_KM` (defaults to 10 km).
  - Explicit browser geolocation permission prompt. Graceful degradation to city center defaults upon denial.
  - Mobile client location update throttling: updates sent only when elapsed time $\ge 60\text{s}$ or movement $\ge 250\text{m}$.
  - Strict spatial privacy: GPS coordinates are never broadcast publicly; location relevance responses are transmitted strictly to the individual client socket.
  - Deduplication and escalation: identical severity events are suppressed within a 60-minute window, with immediate bypass upon severity escalation (`WATCH` $\to$ `WARNING` $\to$ `CRITICAL`).

### FR-016 — Entered & Saved Destination Hazard Monitoring
- **Description**: The system shall allow citizens to enter or select travel destinations to evaluate end-point and corridor accessibility before embarking on a journey.
- **Requirements**:
  - Support saved locations (`HOME`, `WORK`, `HOSPITAL`, `COLLEGE`, `CUSTOM`).
  - Destination geocoding resolving textual queries into WGS84 coordinates.
  - Spatial intersection search identifying nearby active hazards within the monitored radius.
  - Corridors affected and clear, actionable travel recommendations presented alongside current location risk.

### FR-017 — Multilingual Application Foundation & Notification Fallbacks
- **Description**: The system shall provide full multi-language localization for web presentation and emergency notification templates.
- **Requirements**:
  - Native support for English (`en`), Hindi (`hi`), and Kannada (`kn`).
  - Presentation-layer translation: Internal severity codes remain invariant enums (`NORMAL`, `WATCH`, `WARNING`, `CRITICAL`), mapped dynamically in the UI.
  - Deterministic notification template fallbacks ensuring that emergency SMS delivery is guaranteed even when upstream AI services are unavailable or timed out.
  - Strict compliance with the 160-character single-segment GSM SMS limit across all languages.
  - AI contract preparation accepting citizen's `preferred_language`.


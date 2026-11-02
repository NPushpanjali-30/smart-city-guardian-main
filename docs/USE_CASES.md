# System Use Cases Specification

**Document Version**: 1.0.0  
**Status**: Approved Specification  
**Project**: SmartCity Guardian  

---

## 1. Actors

1. **Citizen (End User)**: Residents and commuters navigating urban areas during adverse weather.
2. **Admin (Municipal / Emergency Operations Center Operator)**: City officials and disaster response coordinators monitoring city-wide risks and dispatching guidance.
3. **System (Automated Engine / Background Worker)**: Autonomous scheduling workers, risk engines, routing solvers, AI orchestrators, and notification pipelines.

---

## 2. Citizen Use Cases

### UC-C01: User Registration
- **Actor**: Citizen
- **Trigger**: Citizen visits portal and selects Register.
- **Preconditions**: Citizen has a valid email and phone number.
- **Flow**:
  1. Citizen enters name, email, phone number, password, and communication preferences.
  2. Citizen selects whether to opt-in to SMS emergency notifications.
  3. System validates format, hashes password, records consent timestamp, and creates user profile.
  4. System issues JWT session and redirects to dashboard.

### UC-C02: User Login & Session Initialization
- **Actor**: Citizen / Admin
- **Flow**: User submits credentials $\rightarrow$ System verifies hash $\rightarrow$ Returns JWT access token and user role.

### UC-C03: View Live City Hazard Map
- **Actor**: Citizen
- **Flow**:
  1. Citizen accesses `/map`.
  2. System fetches current flood risk polygons, road accessibility states (`OPEN`, `CAUTION`, `HIGH_RISK`, `BLOCKED`), and traffic congestion.
  3. Client renders color-coded geospatial layers with live hazard overlays.

### UC-C04: Calculate Flood-Aware Safe Route
- **Actor**: Citizen
- **Flow**:
  1. Citizen enters origin and destination coordinates/addresses.
  2. System evaluates road segments between points, applying the safety cost function:
     $$\text{Cost} = \alpha T + \beta \text{Traffic} + \gamma \text{Flood} + \delta \text{Incident}$$
  3. System strictly filters out `BLOCKED` roads and penalizes `HIGH_RISK` corridors.
  4. System returns both the recommended Safe Route and an informational reference route.
  5. UI displays turn-by-turn preview, hazard warnings, and total risk index.

### UC-C05: Receive Dynamic In-Transit Reroute
- **Actor**: Citizen
- **Preconditions**: Citizen is following an active route.
- **Flow**:
  1. System detects downstream segment has transitioned to `BLOCKED` or escalated to `HIGH_RISK`.
  2. System automatically recalculates an alternative route.
  3. Client displays reroute prompt with clear rationale: *"Ahead on Bay St: Severe flooding reported. Tap to take Highland Ave detour (+4 min, Safe)"*.
  4. Citizen accepts detour; navigation updates.

### UC-C06: Receive Emergency SMS Alert
- **Actor**: Citizen
- **Preconditions**: Citizen has opted in to SMS alerts and has saved a location or active route in an affected sector.
- **Flow**:
  1. System triggers alert for Sector 4 due to `CRITICAL` flood risk.
  2. Deduplication engine confirms no identical alert sent to this citizen within 60 minutes.
  3. SMS gateway delivers concise message: *"SmartCity Guardian: FLASH FLOOD WARNING in Sector 4. Bay St blocked. Reroute via High St. Avoid underpasses."*

### UC-C07: Submit Citizen Flood Report
- **Actor**: Citizen
- **Flow**:
  1. Citizen navigates to report view, tags GPS location, selects hazard category (`FLOOD`, `ROAD_BLOCKED`), adds description and photo.
  2. System accepts report with state `PENDING_REVIEW` and emits `USER_REPORT_CREATED` event.

---

## 3. Admin (Authority / EOC) Use Cases

### UC-A01: View City-Wide Emergency Dashboard
- **Actor**: Admin
- **Flow**: Admin views `/admin` showing high-level status: aggregate city flood risk gauge, total closed roads, active alerts count, and ingestion health.

### UC-A02: Monitor Flood & Traffic Events
- **Actor**: Admin
- **Flow**: Admin tracks real-time event feed: rainfall surges, stream gage levels, localized traffic jams, and newly obstructed intersections.

### UC-A03: Review & Verify Citizen Reports
- **Actor**: Admin
- **Flow**:
  1. Admin inspects queue of incoming citizen hazard reports.
  2. Admin reviews location, description, and attached images.
  3. Admin selects `VERIFY` (which escalates road segment to `BLOCKED` or `HIGH_RISK`) or `DISMISS`.

### UC-A04: Inspect Grok AI Decision Logs & Overrides
- **Actor**: Admin
- **Flow**:
  1. Admin views AI decision history containing input telemetry, Grok reasoning output, confidence score, and recommended authority/citizen actions.
  2. If needed, Admin issues manual override to lock down or reopen a road corridor.

### UC-A05: Inspect System Telemetry & Data Freshness
- **Actor**: Admin
- **Flow**: Admin checks latency and freshness for all providers (Open-Meteo, TomTom, Grok, Twilio). Stale telemetry indicators alert operator to upstream provider delays.

---

## 4. System (Autonomous Core) Use Cases

### UC-S01: Retrieve & Normalize Environmental Telemetry
- **Frequency**: Configurable cron/interval (e.g., every 5–15 minutes).
- **Flow**: Worker calls `WeatherProvider.getCurrentWeather()` and `.getForecast()`, validates payload, transforms into normalized internal model, and caches in Redis.

### UC-S02: Calculate Multi-Factor Flood Risk
- **Flow**: System executes pure calculation algorithm combining rainfall intensity, soil saturation, forecast trend, and historical vulnerability to update flood risk scores.

### UC-S03: Update Road Accessibility States
- **Flow**: Spatial engine intersects flood risk polygons with road segments. Segments with water levels exceeding safety thresholds transition to `HIGH_RISK` or `BLOCKED`. Emits `ROAD_RISK_CHANGED`.

### UC-S04: Invoke Grok AI Decision Support with Deterministic Fallback
- **Flow**:
  1. System compiles structured context snapshot (weather, road states, affected sectors).
  2. System invokes Grok AI API with strict JSON schema instructions.
  3. System parses response with Zod.
  4. If Grok fails or schema fails: System immediately invokes deterministic rule fallback template, logs error, and continues without disruption.

### UC-S05: Trigger Targeted Alerts & Broadcast Real-Time Updates
- **Flow**:
  1. When risk transitions to `WARNING` or `CRITICAL`, Alert Engine queries citizens with matching geographical tags.
  2. Dispatches SMS via `SmsProvider` queue.
  3. Pushes updated geospatial risk state over WebSocket/SSE to connected web dashboards.
  4. Records event in persistent audit log.

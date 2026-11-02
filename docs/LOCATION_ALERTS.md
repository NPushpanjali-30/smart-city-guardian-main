# Location-Based Alerts & Mobility Relevance Specification

**Document Version**: 1.0.0  
**Status**: Implemented & Verified  
**Feature**: Phase 2 Add-On — Active Proximity & Destination Hazard Monitoring  
**Default Radius**: 10 km (Configurable via `ALERT_RADIUS_KM`)  

---

## 1. Overview & Operational Principles

The Location-Based Alerts & Mobility Relevance layer evaluates whether citizens or critical trips intersect with active environmental hazards (such as localized water accumulation or traffic gridlock).

Key architectural principles:
1. **Configurable Alert Radius**: Governed by `ALERT_RADIUS_KM` (defaults to 10 km). Never hard-coded.
2. **Explicit Geolocation Permission**: Browsers request location permission explicitly. If denied, the application degrades gracefully using city center defaults without crashing.
3. **Throttled Location Updates**: Mobile clients do not flood the backend with GPS coordinates. Coordinates are evaluated when:
   - Time elapsed $\ge \text{LOCATION\_UPDATE\_INTERVAL\_SECONDS}$ (default 60s)
   - OR distance moved $\ge \text{LOCATION\_MIN\_MOVEMENT\_METERS}$ (default 250m)
   - OR critical environmental events escalate.
4. **Spatial Privacy**: User GPS coordinates are never broadcast to public WebSocket topics or exposed in public feeds. Individual proximity alerts are pushed directly to the specific requesting client socket.
5. **Separation of Concerns**: The platform maintains two distinct risk displays:
   - **Current Location Risk** (Where the citizen currently stands)
   - **Destination Risk** (Where the citizen plans to travel)

---

## 2. Geo-Spatial Matching & Relevance Scoring

### 2.1 Distance Calculation
Spherical geographic distance is computed using the **Haversine Formula**:
$$d = 2R \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
Where $R = 6,371\text{ km}$, $\phi$ is latitude, and $\lambda$ is longitude.

### 2.2 Relevance Thresholds
An event is geographically relevant if:
$$\text{distance}(\text{user}, \text{event}) \le \text{ALERT\_RADIUS\_KM}$$
Relevance incorporates:
- Distance ($\text{km}$)
- Event Severity (`NORMAL`, `WATCH`, `WARNING`, `CRITICAL`)
- Freshness State (`LIVE`, `RECENT`, `STALE`, `MOCK`)
- Measured peak water depth / congestion score.

---

## 3. Alert Deduplication & Severity Escalation

To prevent citizen alert fatigue during fluctuating telemetry:
1. **Deduplication Identity**:
   $$\text{Key} = \text{userId} + \text{eventId} + \text{alertType} + \text{severity}$$
2. **Cooldown Policy**:
   - Identical severity within the 60-minute window is suppressed (`deduplicated: true`, `shouldNotify: false`).
3. **Escalation Exception**:
   - If conditions worsen (e.g., `WATCH` $\to$ `WARNING` or `WARNING` $\to$ `CRITICAL`), the cooldown is immediately bypassed, and a new high-priority alert is generated.

---

## 4. Destination-Based Monitoring Workflow

```text
User enters destination / selects saved location
                    ↓
Geocoded via MapAdapter (WGS84 Coordinates)
                    ↓
Spatial search for active flood basins within ALERT_RADIUS_KM
                    ↓
Inspect intersecting & adjoining road corridors (mock/roads.json)
                    ↓
Evaluate Destination Risk & Recommended Safe Actions
                    ↓
JSON API Response & Targeted WebSocket Push
```

### Destination Categories Supported:
- `HOME`
- `WORK`
- `HOSPITAL`
- `COLLEGE`
- `CUSTOM` (arbitrary query e.g. "Whitefield Central")

---

## 5. REST API Endpoints

- `GET /api/v1/location/relevance` — Query params: `lat`, `lon`, `destination`, `language`, `radius`
- `POST /api/v1/location/relevance` — JSON payload: `{ latitude, longitude, destination, destinationCoordinates, userId, language }`
- `GET /api/v1/location/saved` — Returns user's saved locations.
- `POST /api/v1/location/saved` — Persists a new destination.

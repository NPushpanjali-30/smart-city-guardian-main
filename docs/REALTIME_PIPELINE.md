# Real-Time Data Pipeline Specification

**Document Version**: 1.0.0  
**Status**: Approved Architecture  
**Project**: SmartCity Guardian  

---

## 1. Pipeline Overview

The real-time data pipeline is the central nervous system of SmartCity Guardian. It autonomously ingests, validates, normalizes, scores, reasons, and disseminates critical city-wide safety data.

```text
       ┌──────────────────────┐
       │    EXTERNAL APIS     │  (Open-Meteo, TomTom, Citizen Reports)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │  SCHEDULED WORKERS   │  (Background Cron / BullMQ / Interval Jobs)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │   PROVIDER ADAPTER   │  (Interface normalization & rate limiting)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │   DATA VALIDATION    │  (Zod boundary schema verification)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │    NORMALIZATION     │  (Standard units: mm/h, km/h, WGS84 coordinates)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │   FRESHNESS CHECK    │  (TTL evaluation: tag STALE if expired)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │   REDIS LIVE STATE   │  (Sub-millisecond access for real-time routing)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │  POSTGRESQL HISTORY  │  (Immutable historical audit & analytics)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │     RISK ENGINE      │  (Deterministic flood & road risk scoring)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │    ROUTING ENGINE    │  (Dynamic graph update, reroute evaluations)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │  GROK AI DECISIONS   │  (Synthesizes recommendations & action plans)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │ WEBSOCKET BROADCAST  │  (Real-time geospatial push to web dashboards)
       └──────────┬───────────┘
                  │
                  ▼
       ┌──────────────────────┐
       │  NOTIFICATION QUEUE  │  (Deduplicated SMS dispatch to affected users)
       └──────────────────────┘
```

---

## 2. Ingestion Cadence & Polling Strategy

Aggressive polling risks rate-limit exhaustion and exorbitant API bills. The system enforces configurable, adaptive polling intervals:

| Stream | Default Interval | Peak Weather Surge Interval | Quota Safeguard |
| :--- | :--- | :--- | :--- |
| **Weather Observations** | 300 s (5 min) | 120 s (2 min) | Cache response in Redis for 90 s. |
| **Precipitation Radar** | 600 s (10 min) | 300 s (5 min) | Cache response in Redis for 180 s. |
| **Traffic Flow Telemetry** | 180 s (3 min) | 60 s (1 min) | Bounded to active monitored corridors. |
| **Traffic Incidents / Closures** | 120 s (2 min) | 60 s (1 min) | Event-driven webhook preferred where supported. |
| **Citizen Reports** | Event-driven | Immediate upon submission | Clustered within 200m spatial buffer. |

---

## 3. Data Freshness & Stale Data Policy

Every observation is timestamped with `observed_at`. The pipeline validates data against defined TTLs:

```typescript
const FRESHNESS_THRESHOLDS = {
  WEATHER_MAX_AGE_MS: 30 * 60 * 1000,    // 30 minutes
  TRAFFIC_MAX_AGE_MS: 10 * 60 * 1000,    // 10 minutes
  INCIDENT_MAX_AGE_MS: 60 * 60 * 1000,   // 60 minutes
};
```

### Stale Policy Rules:
1. **Fresh Telemetry ($t < \text{Threshold}$)**: High confidence factor ($1.0$). Computed risk directly reflects live data.
2. **Degraded Telemetry ($\text{Threshold} \le t < 2 \times \text{Threshold}$)**: Confidence degraded ($0.5$). System logs `DATA_DEGRADED` warning. UI flags telemetry with amber "Aging Data" tag.
3. **Stale Telemetry ($t \ge 2 \times \text{Threshold}$)**: Confidence falls to $0.1$. The system switches to a conservative safety fallback: road status remains at its highest recorded risk level until fresh data verifies clearance.

---

## 4. Retries, Circuit Breaking & Graceful Degradation

- **Timeout**: Maximum 5000 ms per outbound adapter request.
- **Retry Schedule**: 3 attempts with exponential backoff and jitter:
  $$\text{Delay} = \min(4000\text{ ms}, 500\text{ ms} \times 2^{\text{attempt}}) \pm \text{jitter}$$
- **Circuit Breaker**: Trips after 5 consecutive failures within a 60-second window. While open, requests immediately fall back to Redis cache or mock simulation. Resets to half-open after 30 seconds.

---

## 5. Event Deduplication & Notification Rate-Limiting

To protect citizens from spam during fluctuating sensor readings:
1. **Sliding Window Deduplication**: An SMS alert for a specific geographical zone is suppressed if an alert of equal or lesser severity was dispatched to that recipient within the past 60 minutes.
2. **Escalation Exception**: If the risk escalates (e.g., from `WARNING` to `CRITICAL`), the deduplication window is bypassed immediately.
3. **Quiet Period Cooldown**: Citizens receive no more than 3 non-critical alerts per 24-hour cycle.

---

## 6. Phase 2 Real-Time Streaming Architecture

### 6.1 WebSocket Server (`/ws`)
- **Protocol**: Raw WebSocket with JSON protocol.
- **Heartbeat**: 30-second ping/pong liveness verification with auto-pruning of dead sockets.
- **Topics**: Clients subscribe to discrete topics (`weather`, `traffic`, `flood`, `providers`, `all`).
- **Initial State**: Upon connecting and subscribing, clients receive an immediate snapshot of the current state store without waiting for the next polling cycle.

### 6.2 Single-Flight Request Coalescing
To eliminate the "Thundering Herd" problem when multiple concurrent client requests query external adapters:
- The `LiveStateStore` wraps asynchronous fetching with a promise deduplication map.
- If a fetch for `weather:current` is already in flight, all subsequent requests join the active promise rather than firing redundant HTTP requests to external APIs.

### 6.3 Meaningful Change Detection
Downstream events are only broadcast over WebSockets when telemetry changes exceed noise thresholds:
- **Temperature**: $\Delta \ge 0.5^\circ\text{C}$
- **Rainfall Rate**: $\Delta \ge 0.2\text{ mm/h}$
- **Traffic Congestion**: $\Delta \ge 5.0\%$
- **Water Depth**: $\Delta \ge 2.0\text{ cm}$

---

## 7. Location Relevance & Proximity Alerts Pipeline

### 7.1 Throttled Citizen Location Updates
- Coordinates are evaluated when time elapsed $\ge 60\text{s}$ or distance moved $\ge 250\text{m}$.
- Browser sends `location_update` over WebSocket.
- The server evaluates spatial relevance against active flood basins and returns an immediate response strictly to the requesting socket, protecting private GPS coordinates from broadcast channels.

### 7.2 Proximity Boundary
- Default monitoring perimeter: $\text{ALERT\_RADIUS\_KM} = 10\text{ km}$.
- Distance evaluated using the Haversine equation.
- Matches are deduplicated using $\text{user} + \text{event} + \text{severity}$ keys with a 60-minute cooldown window, permitting immediate bypass upon severity escalation (`WATCH` $\to$ `WARNING` $\to$ `CRITICAL`).



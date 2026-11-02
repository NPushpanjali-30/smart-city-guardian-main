# Domain Event Model Specification

**Document Version**: 1.0.0  
**Status**: Approved Architecture  
**Project**: SmartCity Guardian  

---

## 1. Event-Driven Architecture Overview

SmartCity Guardian employs an **Event-Driven Architecture (EDA)** across domain boundaries. Changes in environmental conditions, road accessibility, route validity, and citizen reporting emit strongly typed domain events. These events trigger risk recalculations, dynamic reroutes, and notification pipelines.

---

## 2. Standard Domain Event Envelope

Every event adheres to a standardized envelope structure:

```typescript
export interface DomainEventEnvelope<T = Record<string, unknown>> {
  event_id: string;             // UUID v4 unique event identifier
  event_type: SystemEventType;  // Strongly typed event identifier
  timestamp: string;            // ISO 8601 UTC timestamp
  source: string;               // Emitting module (e.g., 'weather.service', 'roads.engine')
  correlation_id: string;       // Distributed tracing identifier propagating across the causal chain
  location?: {                  // Optional spatial context
    latitude: number;
    longitude: number;
    zone_id?: string;
    road_id?: string;
  };
  payload: T;                   // Strongly typed event-specific payload
}
```

---

## 3. System Event Catalog

### 3.1 Environmental Events

#### `WEATHER_UPDATED`
- **Emitted By**: `weather` module
- **Payload**:
  ```json
  {
    "provider": "open-meteo",
    "rainfall_rate_mmh": 45.2,
    "rainfall_1h_mm": 38.0,
    "rainfall_24h_mm": 110.5,
    "temperature_c": 22.4,
    "wind_speed_kmh": 35.0
  }
  ```

#### `FLOOD_RISK_CHANGED`
- **Emitted By**: `floods` module
- **Payload**:
  ```json
  {
    "zone_id": "zone-corridor-east",
    "previous_score": 38.5,
    "new_score": 78.2,
    "previous_severity": "WATCH",
    "new_severity": "CRITICAL",
    "primary_driver": "Rapid precipitation surge exceeding soil saturation threshold"
  }
  ```

---

### 3.2 Transportation & Road Network Events

#### `TRAFFIC_UPDATED`
- **Emitted By**: `traffic` module
- **Payload**:
  ```json
  {
    "segment_id": "road-bay-st-001",
    "congestion_score": 85.0,
    "current_speed_kmh": 8.5,
    "delay_seconds": 720
  }
  ```

#### `ROAD_RISK_CHANGED`
- **Emitted By**: `roads` module
- **Payload**:
  ```json
  {
    "road_id": "road-bay-st-001",
    "road_name": "Bay Street Corridor",
    "previous_risk": 42.0,
    "new_risk": 82.5,
    "previous_state": "CAUTION",
    "new_state": "HIGH_RISK",
    "trigger_reason": "Water depth estimated at 25cm; passenger vehicle stall hazard"
  }
  ```

#### `ROAD_BLOCKED`
- **Emitted By**: `roads` module
- **Payload**:
  ```json
  {
    "road_id": "road-bay-st-001",
    "road_name": "Bay Street Corridor",
    "geometry": { "type": "LineString", "coordinates": [[-73.985, 40.748], [-73.982, 40.749]] },
    "trigger_reason": "Submerged road section; verified by municipal authority",
    "is_hard_closure": true
  }
  ```

---

### 3.3 Routing & Navigation Events

#### `ROUTE_INVALIDATED`
- **Emitted By**: `routing` module
- **Payload**:
  ```json
  {
    "route_id": "route-user-9912",
    "user_id": "user-uuid-1234",
    "obstructed_segment_id": "road-bay-st-001",
    "reason": "Upcoming corridor transitioned to BLOCKED"
  }
  ```

#### `REROUTE_REQUIRED`
- **Emitted By**: `routing` module
- **Payload**:
  ```json
  {
    "route_id": "route-user-9912",
    "original_route_risk": 84.0,
    "suggested_alternative_route_id": "route-ver-2",
    "suggested_route_risk": 15.0,
    "delta_duration_seconds": 240,
    "divergence_waypoint": [-73.987, 40.746]
  }
  ```

---

### 3.4 AI & Decision Support Events

#### `AI_ANALYSIS_COMPLETED`
- **Emitted By**: `ai` module
- **Payload**:
  ```json
  {
    "decision_id": "ai-dec-551",
    "risk_level": "WARNING",
    "confidence": 0.91,
    "recommended_action": "Divert traffic away from low-lying underpasses.",
    "is_fallback": false
  }
  ```

---

### 3.5 Citizen Alerting Events

#### `ALERT_TRIGGERED`
- **Emitted By**: `alerts` module
- **Payload**:
  ```json
  {
    "alert_id": "alert-882",
    "severity": "CRITICAL",
    "affected_zone": "East Harbor Sector",
    "targeted_users_count": 1450,
    "sms_summary": "FLASH FLOOD CRITICAL: Bay St closed. Divert via Highland Ave."
  }
  ```

#### `SMS_SENT` & `SMS_FAILED`
- **Emitted By**: `alerts` module
- **Payload**:
  ```json
  {
    "alert_id": "alert-882",
    "user_id": "user-uuid-1234",
    "recipient_phone_masked": "+1 (***) ***-5678",
    "provider_message_id": "SMxxxxxxxx",
    "dispatched_at": "2026-09-08T09:20:00Z"
  }
  ```

---

### 3.6 Citizen Report Events

#### `USER_REPORT_CREATED` & `USER_REPORT_VERIFIED`
- **Emitted By**: `reports` module
- **Payload**:
  ```json
  {
    "report_id": "rep-3310",
    "category": "FLOOD",
    "latitude": 40.7485,
    "longitude": -73.9850,
    "description": "Severe water accumulation up to car tires near intersection",
    "status": "VERIFIED",
    "verified_by": "admin-uuid-001"
  }
  ```

---

### 3.7 Provider Health & Data Lifecycle Events

#### `PROVIDER_DEGRADED` & `PROVIDER_RECOVERED`
- **Emitted By**: `stateStore` / Circuit Breaker
- **Payload**:
  ```json
  {
    "provider": "open-meteo",
    "status": "DEGRADED",
    "consecutive_failures": 4,
    "last_error": "ETIMEDOUT",
    "timestamp": "2026-09-08T10:00:00Z"
  }
  ```

#### `DATA_BECAME_STALE` & `DATA_REFRESHED`
- **Emitted By**: `freshness` engine
- **Payload**:
  ```json
  {
    "stream": "weather:current",
    "previous_freshness": "LIVE",
    "current_freshness": "STALE",
    "age_seconds": 1850,
    "stale_threshold_seconds": 1800
  }
  ```

---

### 3.8 Proximity & Destination Hazard Events

#### `LOCATION_ALERT_TRIGGERED`
- **Emitted By**: `locationRelevance` service
- **Payload**:
  ```json
  {
    "user_id": "user-uuid-1234",
    "event_id": "zone-bay-basin-01",
    "distance_km": 4.2,
    "severity": "WARNING",
    "language": "hi",
    "sms_summary": "स्मार्टसिटी चेतावनी: 4.2 किमी दूर बाढ़ का खतरा (बे बेसिन)। निचले रास्तों से बचें।"
  }
  ```

#### `DESTINATION_ALERT_TRIGGERED`
- **Emitted By**: `locationRelevance` service
- **Payload**:
  ```json
  {
    "user_id": "user-uuid-1234",
    "destination": "City Memorial Hospital",
    "nearest_event_distance_km": 3.8,
    "severity": "WARNING",
    "affected_roads": ["Bay Street Underpass", "Harbor Boulevard Corridor"],
    "recommended_action": "Check alternative routes before traveling."
  }
  ```



# Phase 2 Data Contracts Specification

**Document Version**: 2.0.0  
**Phase**: Phase 2 — Real-Time Data Intelligence Layer  
**Project**: SmartCity Guardian  

---

## 1. Core Rule: Never Fabricate Live Data

In strict adherence to Rule 2 of the SmartCity Guardian architecture, the system **never fabricates live data**. If an external provider does not expose a field (e.g., municipal stream depth gauges in certain city sectors), the system explicitly records that field or observation as `MOCK`, `SIMULATION`, or `UNAVAILABLE`.

### Explicit Data Freshness States:
- `LIVE`: Telemetry retrieved from an external live API within its primary interval threshold.
- `RECENT`: Telemetry retrieved from live API but between primary interval and stale threshold.
- `STALE`: Telemetry exceeding freshness threshold; confidence degraded.
- `EXPIRED`: Telemetry exceeding maximum allowable TTL; conservative safety fallbacks enforced.
- `MOCK`: Synthesized simulation data for development, demonstration, or unsupported sectors.
- `UNAVAILABLE`: Telemetry stream currently offline or unresolvable.

---

## 2. Canonical Data Models

### 2.1 Weather Observation (`WeatherObservation`)
```json
{
  "id": "wx_om_1725798000000",
  "source": "open-meteo",
  "timestamp": "2026-09-08T11:20:00.000Z",
  "receivedAt": "2026-09-08T11:20:05.120Z",
  "location": {
    "name": "Metro Sector (40.71, -74.01)",
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "temperatureC": 21.5,
  "humidityPercent": 94.0,
  "rainfallRateMmh": 42.5,
  "rainfall1hMm": 34.2,
  "rainfall24hMm": 98.6,
  "windSpeedKmh": 45.0,
  "freshness": "LIVE",
  "dataAgeSeconds": 15
}
```

### 2.2 Traffic Flow Telemetry (`TrafficObservation`)
```json
{
  "segmentId": "road-bay-st-001",
  "roadName": "Bay Street Boulevard",
  "timestamp": "2026-09-08T11:20:00.000Z",
  "receivedAt": "2026-09-08T11:20:02.450Z",
  "speedKmh": 7.5,
  "freeFlowSpeedKmh": 50.0,
  "delaySeconds": 680,
  "congestionLevel": 85.0,
  "source": "metro-traffic-adapter",
  "freshness": "LIVE",
  "dataAgeSeconds": 24
}
```

### 2.3 Traffic Incident (`TrafficIncident`)
```json
{
  "id": "inc-001",
  "type": "CLOSURE",
  "severity": "CRITICAL",
  "latitude": 40.7150,
  "longitude": -74.0080,
  "roadSegmentId": "road-bay-st-001",
  "description": "Flash flood barrier deployed at Bay Street Underpass",
  "isBlocking": true,
  "startedAt": "2026-09-08T10:45:00.000Z",
  "source": "metro-traffic-adapter",
  "freshness": "LIVE"
}
```

### 2.4 Hydrological Flood Observation (`FloodObservation`)
```json
{
  "id": "fld_obs_zone-bay-basin-01",
  "zoneId": "zone-bay-basin-01",
  "zoneName": "Bay Basin Lowlands",
  "waterDepthCm": 28.0,
  "severity": "CRITICAL",
  "observedAt": "2026-09-08T11:20:00.000Z",
  "source": "metro-flood-adapter",
  "isLive": false,
  "freshness": "MOCK",
  "dataAgeSeconds": 0
}
```

---

## 3. Standard API Response Envelope

All read endpoints emit the uniform envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "source": "open-meteo",
    "retrievedAt": "2026-09-08T11:20:05.120Z",
    "freshness": "LIVE",
    "dataAgeSeconds": 15,
    "isMock": false,
    "correlationId": "a95e0c52-7901-4475-b442-999335ef001"
  }
}
```

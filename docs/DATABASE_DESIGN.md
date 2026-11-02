# Database Design Specification

**Document Version**: 1.0.0  
**Status**: Approved Architecture  
**Database Engine**: PostgreSQL 16+ with PostGIS 3.4+ Extension  
**Project**: SmartCity Guardian  

---

## 1. Overview & Spatial Strategy

SmartCity Guardian requires robust relational modeling coupled with native geospatial processing. We leverage **PostgreSQL** enhanced with **PostGIS** for:
- Efficient spatial queries (indexing road vectors and flood polygons via GiST indexes).
- Coordinate systems: Standard World Geodetic System 1984 (`SRID=4326`, GPS standard WGS 84).
- Geospatial functions for point-in-polygon intersection (`ST_Contains`, `ST_Intersects`) and distance calculations (`ST_DistanceSphere`).

---

## 2. Entity-Relationship Conceptual Schema

```text
┌──────────────┐         ┌──────────────────────────────┐
│    users     │────1:N──│        user_locations        │
└──────┬───────┘         └──────────────────────────────┘
       │
      1:1
       │
┌──────▼───────────────────────────┐         ┌──────────────────────────────┐
│  user_notification_preferences   │         │       weather_forecasts      │
└──────────────────────────────────┘         └──────────────┬───────────────┘
                                                            │
┌──────────────────────────────┐                            │
│     weather_observations     │                            │
└──────────────┬───────────────┘                            │
               │                                            │
               └───────────────────┬────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────┐       ┌──────────────────────────────┐
│        flood_reports         │       │         flood_events         │
└──────────────┬───────────────┘       └──────────────┬───────────────┘
               │                                      │
               └───────────────────┬──────────────────┘
                                   │
                                   ▼
┌──────────────────────────────┐       ┌──────────────────────────────┐
│      traffic_incidents       │       │     traffic_observations     │
└──────────────┬───────────────┘       └──────────────┬───────────────┘
               │                                      │
               └───────────────────┬──────────────────┘
                                   │
                                   ▼
┌──────────────────────────────┐       ┌──────────────────────────────┐
│            roads             │────1:1│          road_risk           │
└──────────────┬───────────────┘       └──────────────┬───────────────┘
               │                                      │
               └───────────────────┬──────────────────┘
                                   │
                                   ▼
┌──────────────────────────────┐       ┌──────────────────────────────┐
│            routes            │────1:N│        route_versions        │
└──────────────┬───────────────┘       └──────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐       ┌──────────────────────────────┐
│         ai_decisions         │────1:N│            alerts            │
└──────────────────────────────┘       └──────────────┬───────────────┘
                                                      │
                                                     1:N
                                                      │
                                       ┌──────────────▼───────────────┐
                                       │       alert_deliveries       │
                                       └──────────────────────────────┘
```

---

## 3. Detailed Table Definitions & DDL

### 3.1 User & Access Management

```sql
-- Roles enumeration
CREATE TYPE user_role AS ENUM ('CITIZEN', 'ADMIN');

-- Core Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role user_role NOT NULL DEFAULT 'CITIZEN',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone_number);

-- User Saved Geographical Locations (Home, Work, Frequent corridors)
CREATE TABLE user_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL, -- 'Home', 'Work', 'School'
    address TEXT,
    location GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_locations_geom ON user_locations USING GIST(location);

-- User Notification Preferences
CREATE TABLE user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sms_consent_given_at TIMESTAMPTZ,
    min_severity_threshold VARCHAR(20) NOT NULL DEFAULT 'WARNING', -- 'WATCH', 'WARNING', 'CRITICAL'
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 Environmental Telemetry

```sql
-- Weather Observations (Ingested from Weather Provider)
CREATE TABLE weather_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    location_name VARCHAR(100) NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    rainfall_rate_mmh NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    rainfall_1h_mm NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    rainfall_24h_mm NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    temperature_c NUMERIC(4, 1),
    humidity_percent NUMERIC(4, 1),
    wind_speed_kmh NUMERIC(5, 2),
    observed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_weather_obs_time ON weather_observations(observed_at DESC);
CREATE INDEX idx_weather_obs_geom ON weather_observations USING GIST(location);

-- Weather Forecast Intervals
CREATE TABLE weather_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    forecast_for TIMESTAMPTZ NOT NULL,
    expected_rainfall_mm NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    precipitation_probability NUMERIC(4, 1) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_weather_forecast_time ON weather_forecasts(forecast_for);
```

### 3.3 Traffic & Incident Monitoring

```sql
-- Traffic Observations
CREATE TABLE traffic_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    road_segment_id UUID REFERENCES roads(id) ON DELETE SET NULL,
    congestion_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00, -- 0.0 (free flow) to 100.0 (gridlock)
    current_speed_kmh NUMERIC(5, 1) NOT NULL,
    free_flow_speed_kmh NUMERIC(5, 1) NOT NULL,
    delay_seconds INTEGER NOT NULL DEFAULT 0,
    observed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_traffic_obs_time ON traffic_observations(observed_at DESC);

-- Traffic Incidents & Road Closures
CREATE TYPE incident_type AS ENUM ('ACCIDENT', 'ROAD_WORK', 'HAZARD', 'CLOSURE', 'CONGESTION');

CREATE TABLE traffic_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    incident_type incident_type NOT NULL,
    description TEXT,
    location GEOMETRY(Point, 4326) NOT NULL,
    is_blocking BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMPTZ NOT NULL,
    cleared_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_traffic_incidents_geom ON traffic_incidents USING GIST(location);
```

### 3.4 Flood Risk & Citizen Reports

```sql
CREATE TYPE flood_severity AS ENUM ('NORMAL', 'WATCH', 'WARNING', 'CRITICAL');

-- Historical & Active Flood Zones / Events
CREATE TABLE flood_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name VARCHAR(100) NOT NULL,
    boundary GEOMETRY(Polygon, 4326) NOT NULL,
    severity flood_severity NOT NULL DEFAULT 'NORMAL',
    flood_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00, -- 0 to 100
    peak_water_depth_cm NUMERIC(6, 1),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_flood_events_boundary ON flood_events USING GIST(boundary);

-- Citizen Incident & Flood Reports
CREATE TYPE report_category AS ENUM ('FLOOD', 'ROAD_BLOCKED', 'ACCIDENT', 'HEAVY_TRAFFIC', 'OTHER_HAZARD');
CREATE TYPE report_status AS ENUM ('PENDING_REVIEW', 'VERIFIED', 'DISMISSED');

CREATE TABLE flood_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    category report_category NOT NULL,
    description TEXT NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    photo_url VARCHAR(500),
    status report_status NOT NULL DEFAULT 'PENDING_REVIEW',
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_flood_reports_geom ON flood_reports USING GIST(location);
CREATE INDEX idx_flood_reports_status ON flood_reports(status);
```

### 3.5 Road Network & Dynamic Segment Risk

```sql
CREATE TYPE road_accessibility AS ENUM ('OPEN', 'CAUTION', 'HIGH_RISK', 'BLOCKED', 'UNKNOWN');

-- Physical Road Segments
CREATE TABLE roads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    osm_id VARCHAR(50),
    name VARCHAR(150) NOT NULL,
    road_class VARCHAR(50) NOT NULL, -- 'primary', 'secondary', 'residential'
    geometry GEOMETRY(LineString, 4326) NOT NULL,
    length_meters NUMERIC(8, 2) NOT NULL,
    speed_limit_kmh INTEGER NOT NULL DEFAULT 50,
    elevation_m NUMERIC(5, 1),
    is_historically_flood_prone BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_roads_geom ON roads USING GIST(geometry);

-- Dynamic Computed Risk per Road Segment
CREATE TABLE road_risk (
    road_id UUID PRIMARY KEY REFERENCES roads(id) ON DELETE CASCADE,
    flood_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    traffic_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    composite_risk NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    accessibility_state road_accessibility NOT NULL DEFAULT 'OPEN',
    confidence_score NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_road_risk_state ON road_risk(accessibility_state);
CREATE INDEX idx_road_risk_composite ON road_risk(composite_risk DESC);

-- Road Events Log (State transitions: e.g., OPEN -> BLOCKED)
CREATE TABLE road_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    road_id UUID NOT NULL REFERENCES roads(id) ON DELETE CASCADE,
    previous_state road_accessibility NOT NULL,
    new_state road_accessibility NOT NULL,
    trigger_reason VARCHAR(255) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_road_events_road ON road_events(road_id, occurred_at DESC);
```

### 3.6 Navigation & Dynamic Rerouting

```sql
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    origin_name VARCHAR(150),
    destination_name VARCHAR(150),
    origin GEOMETRY(Point, 4326) NOT NULL,
    destination GEOMETRY(Point, 4326) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE route_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    route_geometry GEOMETRY(LineString, 4326) NOT NULL,
    distance_meters NUMERIC(10, 2) NOT NULL,
    duration_seconds INTEGER NOT NULL,
    total_risk_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    is_safe_alternative BOOLEAN NOT NULL DEFAULT FALSE,
    change_reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_route_versions_route ON route_versions(route_id, version_number);
```

### 3.7 Grok AI Decisions & Notification Engine

```sql
-- AI Decision Records
CREATE TABLE ai_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_context JSONB NOT NULL,
    raw_response JSONB NOT NULL,
    structured_output JSONB NOT NULL,
    confidence NUMERIC(4, 2) NOT NULL,
    risk_level flood_severity NOT NULL,
    recommended_action TEXT NOT NULL,
    is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    fallback_reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_decisions_time ON ai_decisions(created_at DESC);

-- Alerts Emitted
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_decision_id UUID REFERENCES ai_decisions(id) ON DELETE SET NULL,
    severity flood_severity NOT NULL,
    headline VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    affected_zone VARCHAR(150) NOT NULL,
    sms_summary VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_alerts_severity ON alerts(severity, created_at DESC);

-- Alert Deliveries (SMS Dispatch Log)
CREATE TYPE delivery_status AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED');

CREATE TABLE alert_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_phone_masked VARCHAR(20) NOT NULL,
    provider_message_id VARCHAR(100),
    status delivery_status NOT NULL DEFAULT 'QUEUED',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_alert_deliveries_user ON alert_deliveries(user_id, created_at DESC);
```

### 3.8 Audit Trails

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- e.g., 'ADMIN_MANUAL_ROAD_BLOCK', 'SYSTEM_REROUTE_DISPATCH'
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);
```

### 3.9 Data Provider Health & Status Monitoring

```sql
CREATE TYPE provider_health_status AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN');

CREATE TABLE data_provider_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) UNIQUE NOT NULL, -- 'open-meteo', 'tomtom-traffic', 'catchment-flood-mock', 'osm-maps'
    status provider_health_status NOT NULL DEFAULT 'UNKNOWN',
    last_success TIMESTAMPTZ,
    last_failure TIMESTAMPTZ,
    last_response_time_ms INTEGER NOT NULL DEFAULT 0,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_provider_status ON data_provider_status(status);
```

### 3.10 Location-Based Alert History & Audit

```sql
CREATE TYPE location_alert_type AS ENUM ('LOCATION_ALERT', 'DESTINATION_ALERT');

CREATE TABLE location_alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_id VARCHAR(100) NOT NULL,
    distance_km NUMERIC(5, 2) NOT NULL,
    risk_state flood_severity NOT NULL,
    alert_type location_alert_type NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'DISPATCHED'
);
CREATE INDEX idx_loc_alert_user_event ON location_alert_history(user_id, event_id, risk_state);
CREATE INDEX idx_loc_alert_time ON location_alert_history(triggered_at DESC);
```



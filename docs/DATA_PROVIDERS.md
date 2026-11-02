# Data Provider Adapter Specifications

**Document Version**: 1.0.0  
**Status**: Approved Architecture  
**Project**: SmartCity Guardian  

---

## 1. Architectural Strategy: Hexagonal Adapter Pattern

To prevent vendor lock-in and decouple business logic from external API quirks, rate limits, and schema variations, SmartCity Guardian strictly mandates the **Hexagonal (Ports and Adapters)** architecture.

Domain services never invoke third-party SDKs directly:
```text
[Domain Service] ──► [Provider Interface (Port)] ◄── [Concrete Adapter (Open-Meteo / TomTom / Grok / Mock)]
```

Every adapter must:
1. Normalize vendor-specific JSON into canonical internal domain models.
2. Enforce strict outbound timeouts ($\le 5000\text{ ms}$).
3. Implement circuit breaking and exponential backoff retry policies.
4. Support seamless substitution with a local **Mock Adapter** for development, automated testing, and disconnected demonstration environments.

---

## 2. Core Provider Interfaces & Contracts

### 2.1 Weather Provider (`WeatherProvider`)

```typescript
export interface WeatherObservation {
  provider: string;
  locationName: string;
  latitude: number;
  longitude: number;
  rainfallRateMmh: number;
  rainfall1hMm: number;
  rainfall24hMm: number;
  temperatureC: number;
  humidityPercent: number;
  windSpeedKmh: number;
  observedAt: Date;
}

export interface WeatherForecastInterval {
  forecastFor: Date;
  expectedRainfallMm: number;
  precipitationProbability: number;
}

export interface WeatherAlert {
  id: string;
  severity: 'WATCH' | 'WARNING' | 'CRITICAL';
  event: string;
  headline: string;
  description: string;
  effective: Date;
  expires: Date;
}

export interface WeatherProvider {
  name: string;
  getCurrentWeather(lat: number, lon: number): Promise<WeatherObservation>;
  getForecast(lat: number, lon: number): Promise<WeatherForecastInterval[]>;
  getAlerts(lat: number, lon: number): Promise<WeatherAlert[]>;
}
```

- **Target Implementations**: `OpenMeteoWeatherAdapter`, `NoaaWeatherAdapter`, `MockWeatherAdapter`.

---

### 2.2 Traffic Provider (`TrafficProvider`)

```typescript
export interface TrafficFlowMetrics {
  segmentId: string;
  currentSpeedKmh: number;
  freeFlowSpeedKmh: number;
  congestionScore: number; // 0.0 (free flow) to 100.0 (gridlock)
  delaySeconds: number;
  observedAt: Date;
}

export interface TrafficIncident {
  id: string;
  type: 'ACCIDENT' | 'ROAD_WORK' | 'HAZARD' | 'CLOSURE' | 'CONGESTION';
  description: string;
  latitude: number;
  longitude: number;
  isBlocking: boolean;
  startedAt: Date;
}

export interface TrafficProvider {
  name: string;
  getTrafficFlow(bbox: [number, number, number, number]): Promise<TrafficFlowMetrics[]>;
  getIncidents(bbox: [number, number, number, number]): Promise<TrafficIncident[]>;
}
```

- **Target Implementations**: `TomTomTrafficAdapter`, `HereTrafficAdapter`, `MockTrafficAdapter`.

---

### 2.3 Map & Routing Provider (`MapProvider`)

```typescript
export interface RouteWaypoint {
  latitude: number;
  longitude: number;
}

export interface RouteCalculationRequest {
  origin: RouteWaypoint;
  destination: RouteWaypoint;
  excludedSegmentIds?: string[];
  avoidRiskThreshold?: number; // 0-100
}

export interface RouteGeometry {
  coordinates: [number, number][]; // [lon, lat]
  distanceMeters: number;
  durationSeconds: number;
  traversedSegmentIds: string[];
}

export interface MapProvider {
  name: string;
  calculateRoute(request: RouteCalculationRequest): Promise<RouteGeometry>;
  getRoadDetails(segmentId: string): Promise<Record<string, unknown>>;
}
```

- **Target Implementations**: `OsrmRoutingAdapter`, `MapboxRoutingAdapter`, `MockRoutingAdapter`.

---

### 2.4 Flood Data Provider (`FloodDataProvider`)

```typescript
export interface WaterCatchmentStatus {
  zoneId: string;
  waterDepthCm: number;
  floodRiskIndex: number; // 0-100
  drainageCapacityPercent: number;
  observedAt: Date;
}

export interface FloodDataProvider {
  name: string;
  getCatchmentStatus(zoneId: string): Promise<WaterCatchmentStatus>;
  getActiveFloodZones(): Promise<Array<{ zoneId: string; polygon: [number, number][]; riskLevel: string }>>;
}
```

- **Target Implementations**: `UsgsHydrologyAdapter`, `CityCatchmentApiAdapter`, `MockFloodDataAdapter`.

---

### 2.5 SMS Provider (`SmsProvider`)

```typescript
export interface SmsDispatchPayload {
  toPhoneNumber: string;
  message: string;
  priority: 'NORMAL' | 'URGENT';
  language?: 'en' | 'hi' | 'kn';
  alertType?: string;
}

export interface SmsDispatchResult {
  providerMessageId: string;
  status: 'SENT' | 'QUEUED' | 'FAILED';
  dispatchedAt: Date;
  error?: string;
}

export interface SmsProvider {
  name: string;
  sendSms(payload: SmsDispatchPayload): Promise<SmsDispatchResult>;
}
```

- **Target Implementations**: `TwilioSmsAdapter`, `AwsSnsAdapter`, `MockSmsAdapter` (logs to console/mock log in dev, supports localized templates).

---

### 2.6 AI Decision Provider (`AiProvider`)

```typescript
export interface AiRiskAnalysisContext {
  timestamp: string;
  location: { name: string; coordinates: [number, number] };
  weather: Record<string, unknown>;
  traffic: Record<string, unknown>;
  floodRisk: Record<string, unknown>;
  roads: Array<Record<string, unknown>>;
  route?: Record<string, unknown>;
  dataFreshness: Record<string, number>;
  confidence: Record<string, number>;
  preferred_language?: 'en' | 'hi' | 'kn';
}

export interface AiDecisionOutput {
  risk_level: 'NORMAL' | 'WATCH' | 'WARNING' | 'CRITICAL';
  confidence: number;
  affected_zones: string[];
  roads_to_avoid: string[];
  recommended_action: string;
  authority_actions: string[];
  citizen_actions: string[];
  sms_summary: string;
  language?: 'en' | 'hi' | 'kn';
}

export interface AiProvider {
  name: string;
  analyzeRisk(context: AiRiskAnalysisContext): Promise<AiDecisionOutput>;
}
```

- **Target Implementations**: `GrokAiProvider` (calling xAI Grok endpoints with multilingual context), `DeterministicFallbackAiProvider`, `MockAiProvider`.

---

## 3. Phase 2 Implemented Providers & Source Classifications

| Provider Category | Concrete Adapter | Primary External Endpoint | Data Classification | Rate Limits & Ingestion Cadence | Fallback Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Weather** | `OpenMeteoAdapter` | `https://api.open-meteo.com/v1/forecast` | **LIVE** | 10,000 req/day free; polled every 300s | `MockWeatherAdapter` with circuit breaker |
| **Traffic Flow & Incidents** | `TrafficAdapter` | Live API / Deterministic Corridor Feeds | **LIVE / SIMULATED** (toggleable) | Polled every 180s | Cached state $\to$ Fallback corridor metrics |
| **Flood Sensors** | `FloodAdapter` | Municipal catchment basin depth feeds | **MOCK** (Explicitly labeled) | Polled every 300s | Transparently marked `freshness: 'MOCK'`, `isLive: false` |
| **Map & Geocoding** | `MapAdapter` | OpenStreetMap / Nominatim / Local Graph | **LIVE / STATIC CACHE** | On-demand with single-flight request coalescing | Cached local geometry & predefined destination coordinates (`hospital`, `college`, `whitefield`, `work`, `home`) |
| **Notifications** | `SmsNotificationProvider` | SMS Gateway / Mock Dispatcher | **DETERMINISTIC / MULTILINGUAL** | Immediate on threshold event | Fallback templates in `en`, `hi`, and `kn` ($\le 160$ chars) |

> [!IMPORTANT]
> **Strict No-Fabrication Mandate (Rule 2)**:
> In accordance with project governance, because open municipal hydrology sensor feeds are unavailable for the target corridor, flood observations are never fabricated or misrepresented as live telemetry. They are explicitly tagged with `freshness: 'MOCK'` and `source: 'catchment-depth-sensor-sim'`.


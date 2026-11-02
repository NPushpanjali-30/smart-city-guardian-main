# Grok AI Decision Support Integration Specification

**Document Version**: 2.0.0  
**Phase**: Phase 4 — Grok AI Decision Support & Action-Plan Engine  
**Status**: APPROVED & IMPLEMENTED  
**Provider**: xAI Grok API (`grok-2-latest`) / `MockAiProvider`  
**Project**: SmartCity Guardian  

---

## 1. Architectural Role of Grok AI

Grok serves as an **advanced reasoning and contextual synthesis agent**. It evaluates pre-calculated deterministic telemetry (NWP weather metrics, radar nowcasts, flood risk indices, traffic congestion scores, road corridor states) and synthesizes:
1. **Coherent, Natural-Language Situation Summaries** for citizens and EOC commanders.
2. **Prioritized Municipal Operational Action Plans** (culvert inspections, barrier deployments, mobile pumping).
3. **Plain-Language Protective Action Plans** for commuters avoiding low-elevation underpasses.
4. **Route-Related Transit Advisories** (`KEEP_ROUTE`, `CONSIDER_ALTERNATIVE`, `REROUTE_REQUIRED`).
5. **Multilingual Emergency Messaging** in English (`en`), Hindi (`hi`), and Kannada (`kn`).

### Strict AI Boundaries (Non-Negotiable)
- **Grok NEVER invents telemetry**: It cannot fabricate rainfall numbers, invent traffic jams, or create flood observations.
- **Grok NEVER overrides confirmed road closures**: If the backend marks a road as `BLOCKED`, Grok cannot reclassify it as open or advise continuing on it.
- **Grok NEVER directly calculates route geometry**: Route computation remains the exclusive responsibility of the routing engine (Phase 5).
- **Grok NEVER directly dispatches cellular SMS**: Notification policy and deduplication govern all outbound messaging.
- **Fail-Safe Deterministic Fallback**: The entire application operates without interruption using localized deterministic templates (`GrokFallbackService`) if Grok is unreachable or returns invalid payloads.

---

## 2. Decision Modes Breakdown

1. `CITY_OVERVIEW`: Citywide flood score, weather radar, catchment basins, traffic index $\to$ Macro situation brief and municipal operations checklist.
2. `CITIZEN_SAFETY`: User GPS coordinates, 10km hazard proximity, destination, preferred language $\to$ Plain-language protective steps and roads to avoid.
3. `ROUTE_ASSESSMENT`: Traversed segments, flood polygon intersections, traffic flow $\to$ Route advisory (`KEEP_ROUTE` / `CONSIDER_ALTERNATIVE` / `REROUTE_REQUIRED`).
4. `EVENT_SUMMARY`: Triggered on state transitions (`FLOOD_STATE_CHANGED`) $\to$ Escalation brief, affected corridors, municipal dispatch orders.
5. `ALERT_GENERATION`: Event severity, user location, language $\to$ Localized push notification and 160-char SMS copy.

---

## 3. Data Contracts & Schemas

### 3.1 Canonical AI Context Schema (`CanonicalAIContext`)
```typescript
export interface CanonicalAIContext {
  timestamp: string;
  mode: AiDecisionMode;
  location: { latitude: number; longitude: number; cityName?: string };
  userContext?: {
    userId?: string;
    preferredLanguage: LanguageCode;
    destination?: { latitude: number; longitude: number; name?: string };
  };
  environment: {
    rainfall: ProvenancedValue<number>;
    forecast?: ProvenancedValue<Record<string, unknown>>;
    weatherAlerts: string[];
  };
  flood: {
    currentRisk: { score: number; severity: FloodSeverity };
    prediction: { predictedSeverity: FloodSeverity; probability: number; horizonMinutes: number };
    trend: 'INCREASING' | 'STABLE' | 'DECREASING';
    confidence: number;
    zones: Array<{ name: string; risk: string }>;
  };
  traffic: {
    conditions: Array<{ segmentId: string; speedKmh: number; congestionLevel: number }>;
    incidents: Array<{ incidentId: string; type: string; severity: string; description: string }>;
  };
  roads: {
    affected: Array<{
      id: string;
      name: string;
      state: RoadAccessibility;
      waterDepthCm?: number;
      source: string;
      freshness: string;
    }>;
  };
  route?: {
    current?: { routeId: string; origin: string; destination: string };
    risk?: { compositeRisk: number; isBlocked: boolean };
    affectedSegments: string[];
  };
  dataQuality: {
    freshness: Record<string, string>;
    confidence: { systemConfidence: number; telemetryHealth: string };
  };
  activeEvents?: Array<{ eventId: string; eventType: string; severity: string; description: string }>;
}
```

### 3.2 Strict Output Schema (`GrokDecisionOutputSchema`)
```typescript
export const GrokDecisionOutputSchema = z.object({
  risk_level: z.enum(['NORMAL', 'WATCH', 'WARNING', 'CRITICAL', 'UNKNOWN']),
  confidence: z.number().min(0.0).max(1.0),
  situation_summary: z.string(),
  affected_zones: z.array(z.string()),
  roads_to_avoid: z.array(z.string()),
  citizen_actions: z.array(z.string()),
  authority_actions: z.array(z.string()),
  recommended_actions: z.array(z.string()).optional(),
  route_recommendation: z.object({
    action: z.enum(['KEEP_ROUTE', 'CONSIDER_ALTERNATIVE', 'REROUTE_REQUIRED', 'NO_ROUTE_RECOMMENDATION']),
    reason: z.string(),
  }),
  notification: z.object({
    should_notify: z.boolean(),
    priority: z.enum(['INFO', 'WARNING', 'URGENT', 'NONE']),
    language: z.enum(['en', 'hi', 'kn']),
    message: z.string(),
  }),
  uncertainties: z.array(z.string()),
  sms_summary: z.string().optional(),
  language: z.enum(['en', 'hi', 'kn']).optional(),
  decision_confidence: z.number().min(0.0).max(1.0).optional(),
  unverified_claims: z.array(z.string()).optional(),
});
```

---

## 4. Provider Abstraction & Execution Modes

The engine implements the `AiProvider` interface:
```text
                  ┌── GrokProvider (Live xAI API / grok-2-latest)
AiProvider ───────┤
                  └── MockAiProvider (Deterministic offline generator for test/dev)
```

- **Live Production Mode**: When `GROK_ENABLED=true` and valid `GROK_API_KEY` is set.
- **Offline / Mock Mode**: When `MOCK_MODE=true` or key is mock. Guarantees 100% deterministic test execution without external network latency or costs.

---

## 5. Decision Caching & Rate Limiting

- **Context Hashing**: SHA-256 hash over normalized context features.
- **TTL Cache**: 60-second TTL in `LiveStateStore`. Reuses cached decisions for unchanged environmental contexts.
- **Material Change Guard**: AI analysis is triggered only on material flood state transitions (`FLOOD_STATE_CHANGED`), significant route changes, or explicit user requests.

---

## 6. REST & WebSocket Endpoints

- `POST /api/v1/ai/analyze`: Execute structured AI decision analysis across any mode.
- `GET /api/v1/ai/latest`: Retrieve latest decision by mode and language.
- `GET /api/v1/ai/decisions/:id`: Retrieve stored decision audit record by UUID.
- `GET /api/v1/ai/decisions`: Retrieve recent decisions audit log.
- `POST /api/v1/ai/decide`: Legacy decision endpoint with deterministic fallback.
- `WebSocket /ws` (`realtime:ai` topic): Live broadcast of `AI_ANALYSIS_COMPLETED` and `AI_DECISION_UPDATED` events.

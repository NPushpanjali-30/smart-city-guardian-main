# AI Decision Support Model Specification

**Document Version**: 1.0.0  
**Phase**: Phase 4 — Grok AI Decision Support & Action-Plan Engine  
**Date**: September 2026  
**Status**: APPROVED  

---

## 1. Objective & Architectural Role

The **Grok AI Decision Support Engine** transforms verified, multi-modal urban telemetry (NWP rainfall observations, radar nowcasts, catchment basin depth estimates, road corridor intersections, and traffic flow metrics) into actionable, plain-language operational decisions.

In accordance with the SmartCity Guardian Safety Charter:
- **Zero Hallucination Grounding**: The LLM never invents telemetry, coordinates, or official warnings.
- **Deterministic Supremacy**: Backend deterministic calculations (Phase 2 & Phase 3) remain authoritative. Grok operates as an advisory interpretation and reasoning layer.
- **Dual-Confidence Harmonization**: Decision confidence is derived using $C_{\text{decision}} = \min(C_{\text{system}}, C_{\text{ai}})$.

---

## 2. Decision Modes Breakdown

| Decision Mode | Primary Intended Audience | Core Input Envelope | Primary Synthesis Objective |
| :--- | :--- | :--- | :--- |
| `CITY_OVERVIEW` | EOC Incident Commanders & Public Dashboard | Citywide composite risk score, rainfall rate, catchment basins, critical traffic corridors, active weather warnings | Macro situation summary, prioritized municipal operations checklist, affected sector highlights |
| `CITIZEN_SAFETY` | Commuters & Residents | User GPS coordinates, 10km hazard proximity, destination coordinates, preferred language (`en`, `hi`, `kn`) | Hyper-local protective action steps, specific roads to avoid, plain-language explanations |
| `ROUTE_ASSESSMENT` | Active Commuters & Navigation App | Traversed road corridors, polygon flood intersections, corridor accessibility states | Corridor recommendation (`KEEP_ROUTE`, `CONSIDER_ALTERNATIVE`, `REROUTE_REQUIRED`) with fact-based justification |
| `EVENT_SUMMARY` | Operations Dispatchers & Push Pipelines | Flood risk transition events (`WARNING` $\to$ `CRITICAL`), delta metrics, affected basin polygons | Rapid event interpretation, severity classification, municipal resource mobilization guidance |
| `ALERT_GENERATION` | Push Notification & SMS Engines | Event severity, user proximity, localized template dictionary | Concise, high-urgency advisory text and 160-character emergency SMS summaries |

---

## 3. Canonical AI Context Contract

The engine accepts a strongly-typed `CanonicalAIContext`:

```json
{
  "timestamp": "2026-09-08T12:00:00.000Z",
  "mode": "CITIZEN_SAFETY",
  "location": {
    "latitude": 40.7128,
    "longitude": -74.006,
    "cityName": "Metro Central"
  },
  "userContext": {
    "preferredLanguage": "en",
    "destination": {
      "latitude": 40.73,
      "longitude": -73.99,
      "name": "General Hospital"
    }
  },
  "environment": {
    "rainfall": {
      "value": 42.5,
      "unit": "mm/h",
      "source": "open-meteo",
      "observedAt": "2026-09-08T11:58:30.000Z",
      "freshness": "LIVE"
    },
    "weatherAlerts": ["Severe Flash Flood Warning in effect"]
  },
  "flood": {
    "currentRisk": { "score": 78.5, "severity": "CRITICAL" },
    "prediction": {
      "predictedSeverity": "CRITICAL",
      "probability": 0.84,
      "horizonMinutes": 30
    },
    "trend": "INCREASING",
    "confidence": 0.88,
    "zones": [{ "name": "Bay Basin Lowlands", "risk": "CRITICAL (OBSERVED_CONFIRMED)" }]
  },
  "traffic": {
    "conditions": [{ "segmentId": "seg-bay-st", "speedKmh": 12.0, "congestionLevel": 85.0 }],
    "incidents": []
  },
  "roads": {
    "affected": [
      {
        "id": "rd-bay-01",
        "name": "Bay Street Boulevard",
        "state": "BLOCKED",
        "source": "road-corridor-service",
        "freshness": "LIVE"
      }
    ]
  },
  "route": {
    "current": { "routeId": "rt-01", "origin": "Current Location", "destination": "General Hospital" },
    "risk": { "compositeRisk": 95.0, "isBlocked": true },
    "affectedSegments": ["Bay Street Boulevard"]
  },
  "dataQuality": {
    "freshness": { "weather": "LIVE", "flood": "LIVE", "traffic": "LIVE", "roads": "LIVE" },
    "confidence": { "systemConfidence": 0.88, "telemetryHealth": "HEALTHY" }
  }
}
```

---

## 4. Structured Output Contract

The AI response strictly conforms to `GrokDecisionOutputSchema`:

```json
{
  "risk_level": "CRITICAL",
  "confidence": 0.88,
  "situation_summary": "Severe water accumulation and active corridor blockages detected near Bay Basin Lowlands.",
  "affected_zones": ["Bay Basin Lowlands"],
  "roads_to_avoid": ["Bay Street Boulevard"],
  "citizen_actions": [
    "Avoid Bay Street Boulevard and low underpasses.",
    "Follow the high-elevation alternate route shown on the map.",
    "Delay non-essential transit."
  ],
  "authority_actions": [
    "Deploy mobile pumping units to Bay Basin discharge points.",
    "Place physical detour barricades at Bay Street intersections."
  ],
  "route_recommendation": {
    "action": "REROUTE_REQUIRED",
    "reason": "Direct corridor closure detected on Bay Street Boulevard due to inundation."
  },
  "notification": {
    "should_notify": true,
    "priority": "URGENT",
    "language": "en",
    "message": "FLASH FLOOD CRITICAL: Avoid Bay Street Boulevard. Safer detour available on map."
  },
  "uncertainties": [],
  "decision_confidence": 0.88,
  "unverified_claims": []
}
```

---

## 5. Decision Lifecycle Flow

```text
Incoming Request / Event
         ↓
GrokAIContextBuilder (Assemble verified facts + provenance)
         ↓
Context Hash Computation (SHA-256) & Cache Lookup (60s TTL)
         ↓
Active Provider Invocation (GrokClient or MockAiProvider)
         ↓
GrokResponseValidator (JSON -> Zod Schema -> Business Rules -> Safety Gate)
   ├── Success → Validated Output + Confidence Harmonization
   └── Failure → GrokFallbackService (Deterministic localized rule template)
         ↓
Decision Persistence & Event Bus Emission (realtime:ai)
         ↓
Client UI & EOC Operator Updates
```

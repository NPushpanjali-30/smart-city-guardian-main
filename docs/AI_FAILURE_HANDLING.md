# AI Failure Handling & Resilience Architecture

**Document Version**: 1.0.0  
**Phase**: Phase 4 — Grok AI Decision Support & Action-Plan Engine  
**Date**: September 2026  
**Status**: APPROVED  

---

## 1. Resilience Philosophy: Zero-Disruption Failover

Grok AI is an **enhancement layer**, not a single point of failure. If the xAI API is unreachable, times out, exceeds rate limits, or returns non-compliant schemas, the platform continues functioning without interruption using deterministic fallback templates.

The real-time data ingestion pipeline (weather polling, hydrological feature computation, road risk evaluation, WebSocket event dispatching) runs asynchronously and is **never** blocked by AI latency or network timeouts.

---

## 2. Failure Modes & Automated Recovery Strategies

| Failure Scenario | Trigger Condition | Automated System Response | Commuter & Operator Impact |
| :--- | :--- | :--- | :--- |
| **Timeout** | Network latency $> 5000\text{ ms}$ | `AbortSignal.timeout(5000)` aborts HTTP request; triggers `GrokFallbackService`. | Instant deterministic localized action plan; no UI freeze. |
| **HTTP 429 Rate Limit** | xAI API rate limit exceeded | Exponential backoff ($1000\text{ms} \to 2000\text{ms}$) up to `GROK_MAX_RETRIES=2`; falls back if limit persists. | Automatic retry; fails safe if quota exhausted. |
| **HTTP 5xx Server Error** | xAI infrastructure disruption | Fast retry with 500ms backoff; fails over to deterministic fallback on second failure. | Transparent failover to localized template. |
| **Malformed JSON** | Non-JSON text or truncated response | Tier 1 JSON parse fails; emits `AI_RESPONSE_REJECTED` event; triggers fallback. | Safe fallback action plan; audit log records raw response. |
| **Schema Validation Error** | Missing fields or invalid enums | Tier 2 Zod validation fails (`safeParse`); triggers fallback. | Safe fallback action plan; invalid payload quarantined. |
| **Safety Constraint Violation** | AI contradicts backend road state | Tier 3 validator overrides unsafe advice (e.g. `KEEP_ROUTE` $\to$ `REROUTE_REQUIRED`). | Safety guaranteed; road closure strictly enforced. |
| **Disabled Provider** | `GROK_ENABLED=false` | Direct dispatch to deterministic fallback or `MockAiProvider`. | System operates in offline/mock mode seamlessly. |

---

## 3. Deterministic Fallback Engine (`GrokFallbackService`)

The fallback engine implements deterministic decision trees grounded exclusively in backend telemetry:

```text
IF current flood score >= 75:
    risk_level = CRITICAL
    route_action = (has_blocked_roads ? REROUTE_REQUIRED : CONSIDER_ALTERNATIVE)
    notification_priority = URGENT
ELSE IF current flood score >= 50:
    risk_level = WARNING
    notification_priority = WARNING
ELSE IF current flood score >= 25:
    risk_level = WATCH
    notification_priority = INFO
ELSE:
    risk_level = NORMAL
    notification_priority = NONE
```

### Multilingual Fallback Templates
The fallback service incorporates pre-validated, localized templates across the 3 supported languages:
- **English (`en`)**: `"FLASH FLOOD CRITICAL: High water near [Road]. Avoid underpasses. Follow safe route."`
- **Hindi (`hi`)**: `"बाढ़ चेतावनी: [Road] के पास भारी जलभराव। सुरक्षित मार्ग का उपयोग करें।"`
- **Kannada (`kn`)**: `"ಪ್ರವಾಹ ಎಚ್ಚರಿಕೆ: [Road] ಬಳಿ ನೀರು ತುಂಬಿದೆ. ಸುರಕ್ಷಿತ ಮಾರ್ಗ ಬಳಸಿ."`

All internal operational enums (`CRITICAL`, `WARNING`, `REROUTE_REQUIRED`) remain strictly English-coded, ensuring backend consumers receive invariant types.

---

## 4. Decision Caching & Rate Limiting

To prevent redundant API consumption and protect against rate limits:
1. **Context Hashing**: An MD5/SHA-256 hash is generated over the normalized context tuple:
   $$\text{Hash} = H(\text{mode}, \text{language}, \text{rounded\_risk\_score}, \text{blocked\_roads}, \text{zones})$$
2. **TTL Decision Cache**: Validated decisions are cached in `LiveStateStore` for 60 seconds. Identical context states reuse cached decisions immediately with $0\text{ ms}$ external latency.
3. **Event-Driven Triggering**: AI decisions are re-evaluated asynchronously only upon material environmental state transitions (`FLOOD_STATE_CHANGED`).

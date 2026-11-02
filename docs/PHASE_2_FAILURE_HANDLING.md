# Phase 2 Provider Failure Handling & Resilience

**Document Version**: 1.0.0  
**Phase**: Phase 2 — Real-Time Data Intelligence Layer  
**Project**: SmartCity Guardian  

---

## 1. Resilience Philosophy: Failure is Expected

External APIs will inevitably experience rate limits, HTTP 5xx outages, DNS timeouts, network partitions, and malformed responses. In life-critical disaster routing, a failure in an external provider must **never crash the system or stall navigation**.

---

## 2. Circuit Breaker & Retry Strategy

Each provider adapter is guarded by a dedicated `CircuitBreaker` instance:

```text
       ┌────────────────────────┐
       │   REQUEST INITIATED    │
       └───────────┬────────────┘
                   │
           Is Circuit OPEN?
           ├── YES ──► Fast-Fail / Immediately Return Cached or Mock Fallback
           └── NO
                   │
         Execute Outbound HTTP Call
         (Timeout: 5000ms via AbortSignal)
                   │
           Did Request Fail?
           ├── NO  ──► Success: Reset Failure Counter, Return Result
           └── YES
                   │
         Retry with Backoff? (Max 2 retries)
         Delay = min(3000ms, 300ms * 2^attempt) + jitter
                   │
           All Retries Failed?
           ├── YES ──► Increment Consecutive Failures
           │           If Failures >= 4: Trip Breaker to OPEN
           │           Fallback to Mock Data & Log Alert
           └── NO  ──► Succeeded on Retry
```

### Circuit Breaker States:
1. **`CLOSED`**: Normal operation. Calls pass through directly.
2. **`OPEN`**: Tripped after 4 consecutive failures. Requests fast-fail immediately to avoid hammering the failing API.
3. **`HALF_OPEN`**: After 30 seconds, a probe request is permitted through. If successful twice consecutively, the breaker resets to `CLOSED`. If the probe fails, the breaker returns to `OPEN`.

---

## 3. Telemetry Freshness & Stale Degradation

Observations carry an exact `source_timestamp`. The freshness engine continuously evaluates data age:

| Age Range | State | System Response |
| :--- | :--- | :--- |
| $\le 300\text{s}$ | `LIVE` | High confidence ($1.0$). Data directly drives decision engine. |
| $301\text{s} - 900\text{s}$ | `RECENT` | Moderate confidence ($0.85$). Standard navigation active. |
| $901\text{s} - 2700\text{s}$ | `STALE` | Low confidence ($0.50$). UI displays amber "Aging Telemetry" badge. Background worker retries ingestion. |
| $> 2700\text{s}$ | `EXPIRED` | Confidence drops to $0.10$. Conservative safety policy locks road status at highest recorded risk level until fresh data verifies safety. |

---

## 4. Provider Health Monitoring

The central `LiveStateStore` maintains an operational health registry for all adapters:

- `HEALTHY`: 0 consecutive failures; responses $< 500\text{ms}$.
- `DEGRADED`: 3-4 consecutive failures or responses $> 3000\text{ms}$.
- `DOWN`: $\ge 5$ consecutive failures; circuit breaker OPEN.
- `UNKNOWN`: Initial startup before first probe.

Exposed directly to municipal operators at `GET /api/v1/data/providers/status`.

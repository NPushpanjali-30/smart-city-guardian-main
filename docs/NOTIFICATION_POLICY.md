# Notification Eligibility & Deduplication Policy Specification

## 1. Executive Summary & Purpose
In emergency municipal management, citizen notifications must achieve two equally vital objectives:
1. **Critical Urgency**: Delivering life-safety hazard warnings and mandated rerouting instructions rapidly.
2. **Alert Fatigue Prevention**: Strictly suppressing duplicate alerts, stale observations, out-of-radius hazards, and unconsented dispatches.

The SmartCity Guardian Notification Policy Engine enforces authoritative backend rules governing when, how, and in what format SMS and in-app alerts may be delivered.

---

## 2. Notification Eligibility Pipeline

Every prospective alert candidate must satisfy five sequential policy gates before being admitted to the dispatch queue:

```
[Candidate Alert]
       │
       ▼
[Gate 1: Freshness] ──────> Older than 30m? ─────────────> [REJECT: STALE_DATA]
       │
       ▼
[Gate 2: Active Severity] ─> Severity == NORMAL? ─────────> [REJECT: SEVERITY_NORMAL]
       │
       ▼
[Gate 3: User Consent] ───> smsOptIn == false? ──────────> [REJECT: OPT_OUT]
       │                   SMS channel disabled? ────────> [REJECT: CHANNEL_DISABLED]
       │                   Missing/invalid phone? ───────> [REJECT: MISSING_RECIPIENT_PHONE]
       ▼
[Gate 4: Severity Floor] ─> Severity < user.minSeverity? ─> [REJECT: SEVERITY_BELOW_THRESHOLD]
       │
       ▼
[Gate 5: Geographic Radius] > 10 km from Location, ──────> [REJECT: BEYOND_ALERT_RADIUS]
       │                   Destination, & Route?
       ▼
[Gate 6: Deduplication] ──> Sent within 60m cooldown ────> Severity escalated?
                                                           ├── Yes ──> [BYPASS COOLDOWN & DISPATCH]
                                                           └── No  ──> [SUPPRESS: SUPPRESSED_COOLDOWN]
```

---

## 3. Policy Rules in Detail

### Rule 1: Environmental Data Freshness
- Telemetry timestamps (`eventUpdatedAt`) are compared against system epoch `nowMs`.
- If observation age exceeds **30 minutes** (`1,800,000 ms`), the alert is rejected with code `STALE_DATA`.
- Stale flood predictions or obsolete water depth readings are never dispatched to citizens.

### Rule 2: Active Severity Requirement
- Events classified as `NORMAL` are considered benign baseline conditions. No emergency SMS or push notifications are generated.
- `UNKNOWN` is fundamentally treated with caution: if certainty is indeterminate, it cannot be assumed safe or `NORMAL`, but requires advisory verification.

### Rule 3: User Consent & Channel Configuration
- Dispatches via `SMS` require:
  - `user.smsOptIn === true` (explicit consent under municipal communication guidelines).
  - `SMS` enabled in `user.channels`.
  - A validated international **E.164** formatted phone number (e.g. `+919876543210` or `+14155552671`).

### Rule 4: Citizen Severity Threshold Floor
- Citizens configure a minimum severity threshold: `WATCH`, `WARNING`, or `CRITICAL`.
- If an event is `WATCH` but the citizen configured `WARNING`, it is suppressed to prevent unwanted low-priority interruptions.

### Rule 5: 10 km Geographic Proximity Relevance
- Proximity is evaluated across three spatial dimensions using the spherical Haversine formula:
  1. **Current Citizen Location**: Distance from current coordinates to hazard center <= configured radius (default 10 km).
  2. **Saved Commute Destination**: Distance from destination anchor (Work, Campus, Hospital) <= 10 km.
  3. **Active Route Geometry**: Distance from any waypoint along the current navigation polyline <= 10 km.
- If the hazard lies further than 10 km from all three anchors, it is rejected with code `BEYOND_ALERT_RADIUS`.

---

## 4. Deduplication & Escalation Bypass Engine

### Stable Deduplication Key
Deduplication state is tracked using a composite identity key:
$$\text{DedupKey} = \text{userId} : \text{eventId} : \text{triggerType} : \text{channel}$$

### Standard 60-Minute Cooldown
- When an alert is successfully dispatched, the timestamp and severity rank are recorded.
- If a candidate with the **identical severity** arrives within **60 minutes** (`3,600,000 ms`), the candidate is suppressed with code `SUPPRESSED_COOLDOWN` and marked `status: 'SUPPRESSED'`.

### Severity Escalation Bypass
- Severe weather and urban floods evolve dynamically. When a hazard escalates:
  - `WATCH` $\rightarrow$ `WARNING`
  - `WARNING` $\rightarrow$ `CRITICAL`
  - `WATCH` $\rightarrow$ `CRITICAL`
- The policy engine **immediately bypasses the 60-minute cooldown**, increments the `escalationBypassCount` telemetry metric, and enqueues the urgent life-safety warning without delay.

---

## 5. Status Semantics & Non-Negotiables

| Status | Definition |
| :--- | :--- |
| `QUEUED` | Candidate passed all policy checks and sits in memory queue awaiting worker dispatch. |
| `SENT_TO_PROVIDER` | Successfully handed off to telecom SMS provider gateway (e.g., Twilio HTTP API). |
| `DELIVERED` | Explicit delivery receipt confirmed by upstream carrier / handset handshake. |
| `FAILED` | Provider returned error, unallocated number, or retries were exhausted. |
| `SUPPRESSED` | Policy engine rejected dispatch due to active 60-minute cooldown. |
| `UNKNOWN` | Status cannot be determined; never equated to `DELIVERED` or `NORMAL`. |

> [!CRITICAL]
> **Authoritative Invariant**: `SENT_TO_PROVIDER` is strictly distinguished from `DELIVERED`. The backend never assumes an SMS has reached a citizen's handset until confirmed by delivery callback or provider receipt.

---

## 6. Citizen Privacy Guarantees
1. **Masked Recipient Display**: Phone numbers are masked across all audit tables, HTTP responses, and logs (e.g. `+91 98*** ***10`). Unmasked numbers exist solely in transient heap memory during gateway dispatch.
2. **Ephemeral Coordinate Processing**: Precise citizen GPS coordinates are never persisted alongside dispatch audit records. Only relative distance in kilometers and general sector names are recorded.

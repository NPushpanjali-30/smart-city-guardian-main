# Flood Domain Events, State Transitions & Hysteresis

**Document Version**: 1.0.0  
**Status**: Implemented & Verified Architecture  
**Phase**: Phase 3 — Flood Intelligence & Prediction Engine  
**Project**: SmartCity Guardian  

---

## 1. Domain Event Architecture

The SmartCity Guardian Flood Intelligence Engine uses strongly-typed domain events emitted over Node.js `EventEmitter` and bridged in real-time to WebSockets (`/ws`):

```text
[DataAggregator] ──► [FloodIntelligenceService] ──► [wsServer] ──► [Connected Browser Clients]
```

### 1.1 Core Flood Domain Events

| Event Type | Trigger Condition | Payload Summary | WebSocket Channel |
| :--- | :--- | :--- | :--- |
| **`FLOOD_RISK_UPDATED`** | Telemetry processed; risk score updated | `{ riskScore, severity, prediction, latencyMs }` | `realtime:flood` |
| **`FLOOD_STATE_CHANGED`** | Operational severity transition detected | `{ transition: 'WARNING -> CRITICAL', currentRisk, prediction }` | `realtime:flood` |
| **`FLOOD_PREDICTION_UPDATED`**| Short-horizon nowcast updated | `{ horizonMinutes, probability, predictedState, trend }` | `realtime:flood` |
| **`FLOOD_ZONE_UPDATED`** | Spatial risk zone polygon reclassified | `{ zoneId, zoneType, severity, floodScore }` | `realtime:flood` |
| **`ROAD_FLOOD_RISK_UPDATED`**| Road accessibility or flood penalty changed | `{ roadId, floodScore, accessibilityState }` | `realtime:flood` |

---

## 2. State Transition Finite State Machine & Operational Tiers

Operational severity is partitioned into four application-level tiers (distinct from official civil defense classifications):

```text
       ┌───────────┐  score ≥ 25  ┌───────────┐  score ≥ 50  ┌───────────┐  score ≥ 75  ┌──────────────┐
       │  NORMAL   │─────────────►│   WATCH   │─────────────►│  WARNING  │─────────────►│   CRITICAL   │
       │  [0, 24]  │◄─────────────│  [25, 49] │◄─────────────│  [50, 74] │◄─────────────│  [75, 100]   │
       └───────────┘  score < 20  └───────────┘  score < 45  └───────────┘  score < 70  └──────────────┘
```

---

## 3. Anti-Flapping Hysteresis Dynamics

In meteorological disasters, precipitation rates fluctuate rapidly around decision boundaries. Without hysteresis, a sensor jittering between $49.5$ and $50.5$ would cause rapid "flapping" between `WATCH` and `WARNING`, triggering repeated user notifications and UI instability.

SmartCity Guardian mandates an anti-flapping margin:
$$\Delta_{\text{hysteresis}} = 5.0\text{ points}$$

### Transition Rules:
1. **Entry Rule**: The system requires crossing the full threshold to escalate:
   - Escalation to `WATCH`: $S \ge 25$
   - Escalation to `WARNING`: $S \ge 50$
   - Escalation to `CRITICAL`: $S \ge 75$
2. **Recovery / Step-Down Rule**: The score must drop below the threshold minus the margin before de-escalating:
   - De-escalation from `CRITICAL` $\to$ `WARNING`: $S < 70$
   - De-escalation from `WARNING` $\to$ `WATCH`: $S < 45$
   - De-escalation from `WATCH` $\to$ `NORMAL`: $S < 20$

---

## 4. Event Persistence & Confirmation Window

Isolated 10-second data spikes do not instantly trigger emergency state transitions. An escalation requires:
- **Confirmation Window**: Sustained evidence across a configurable confirmation duration (`confirmationWindowSeconds: 60`).
- **Deduplication Identity**: Emitted notifications require unique state progression (`user + event + alertType + riskState`).

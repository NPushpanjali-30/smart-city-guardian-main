# Dynamic Rerouting Policy & Anti-Oscillation Specification

**Document Version**: 1.0.0  
**Status**: Approved Architecture  
**Project**: SmartCity Guardian  

---

## 1. Objective

Dynamic rerouting ensures in-transit commuters are actively steered away from evolving floodwaters and newly impassable roads. However, re-evaluating routes indiscriminately causes "navigation jitter" (rapidly oscillating route suggestions that confuse drivers and degrade safety).

This specification formalizes the **Material Change Criteria** and **Anti-Oscillation Guardrails** required for production rerouting.

---

## 2. Decision Flow Architecture

```text
               ACTIVE ROUTE IN-TRANSIT
                          │
                          ▼
            NEW TELEMETRY INGESTED (Weather/Traffic/Report)
                          │
                          ▼
             DID ACTIVE ROUTE RISK CHANGE?
             ├── NO  ──► Maintain Current Route
             └── YES ──► Compute Candidate Alternative Route
                               │
                               ▼
                    MATERIAL CHANGE CRITERIA MET?
                    ├── NO  ──► Maintain Current Route
                    └── YES ──► CHECK COOLDOWN GUARD
                                     │
                                     ├── ACTIVE COOLDOWN ──► Suppress Minor Recalculation
                                     │                       (Exception: Imminent Hazard)
                                     │
                                     └── COOLDOWN CLEAR  ──► PROMPT CITIZEN REROUTE
                                                             (Audio/Visual + Explanation)
```

---

## 3. Material Change Triggers

An active route recalculation is considered "material" only if at least one of the following deterministic thresholds is met:

### Trigger 1: Critical Obstruction Ahead (`IMMEDIATE_BLOCKAGE`)
- **Condition**: An upcoming road segment on the active route transitions to `BLOCKED` or is closed by emergency authorities.
- **Action**: Immediate mandatory reroute. Overrides all cooldowns.

### Trigger 2: Risk Escalation Threshold (`RISK_ESCALATION`)
- **Condition**: The composite flood risk score along the remaining route path increases by $\ge 20$ points (e.g., transitions from `WATCH` to `WARNING`).
- **Action**: Calculate alternative path. If an alternative reduces risk by $\ge 30\%$, trigger reroute prompt.

### Trigger 3: Severe Traffic/Hydrological Delay (`SEVERE_DELAY`)
- **Condition**: Water accumulation or congestion increases expected transit time by $\ge 10\text{ minutes}$ ($600\text{ seconds}$).
- **Action**: Evaluate alternative route. If alternative saves $\ge 5\text{ minutes}$ without compromising safety, suggest detour.

### Trigger 4: Safety-Dominant Alternative Viable (`SAFETY_ARBITRAGE`)
- **Condition**: A safer path opens (e.g., flood barrier cleared on high-elevation avenue) that lowers risk by $\ge 40\%$ with duration penalty $\le 5\text{ minutes}$.
- **Action**: Proactively suggest alternative.

---

## 4. Anti-Oscillation & Cooldown Policy

To prevent the routing engine from ping-ponging the driver between two parallel streets:

1. **Minimum Time Cooldown**:
   A citizen cannot be prompted with a non-critical reroute more frequently than once every **90 seconds**.
2. **Minimum Hysteresis Margin**:
   A proposed alternative route must offer at least a **$15\%$ reduction in composite cost** compared to the current route to justify a switch.
3. **Imminent Obstruction Exception**:
   If the active segment immediately ahead ($\le 500\text{ meters}$) becomes `BLOCKED`, the cooldown and hysteresis rules are immediately suspended, and an emergency detour is enforced.

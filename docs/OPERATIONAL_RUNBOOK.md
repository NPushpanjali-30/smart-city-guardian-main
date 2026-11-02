# Smart City Guardian: EOC Operational Runbook & Incident Response

## 1. Overview & Operational Principles

This runbook defines the standard operating procedures (SOPs), emergency triage playbooks, and incident response workflows for Emergency Operations Center (EOC) staff, platform administrators, and incident commanders managing Smart City Guardian during flood crises.

### Core Operational Principles
1. **Human-in-the-Loop Authority**: Automated AI recommendations and safety rerouting remain subservient to manual operator overrides from authorized EOC personnel.
2. **Zero Route Loss**: Citizens en route must never be abandoned without guidance; if an external provider or AI engine fails, the system immediately drops to local deterministic routing without dropping active sessions.
3. **Audited Actions**: Every manual road closure, emergency alert broadcast, and state override is cryptographically logged with operator ID, reason, and UTC timestamp.

---

## 2. Emergency Operations Center (EOC) Roles

```
               +-----------------------------+
               |     Incident Commander      |
               |  (Overall Crisis Authority) |
               +--------------+--------------+
                              |
       +----------------------+----------------------+
       |                                             |
       v                                             v
+-----------------------------+               +-----------------------------+
|    EOC Tactical Operator    |               |  Platform Reliability Eng.  |
|  - Real-time Map Monitoring |               |  - Health Probes & Logs     |
|  - Road Blockage Overrides  |               |  - Circuit Breaker Status   |
|  - SMS Evacuation Triggers  |               |  - Queue Draining & Latency |
+-----------------------------+               +-----------------------------+
```

| Role | Responsibilities | Key Tools |
|---|---|---|
| **Incident Commander** | Declares city flood warning stages; authorizes mass SMS broadcasts; coordinates with civil defense. | Authority Dashboard, Emergency Broadcast Panel |
| **Tactical Operator** | Monitors real-time road accessibility; inputs manual roadblock overrides based on field radio reports; tracks active citizen evacuees. | Tactical Map View, Road Override API, Active Route Inspector |
| **Platform Reliability Engineer (SRE)** | Monitors system liveness/readiness; validates queue depths; manages provider circuit breakers; executes DR failovers. | Prometheus/Grafana, `/health/ready`, `scripts/eoc-drill.ts` |

---

## 3. Automated Crisis Simulation Drill (`scripts/eoc-drill.ts`)

The repository includes an end-to-end operational readiness rehearsal script designed to train EOC staff and validate system integrity under crisis pressure:

### 3.1 Executing the Drill
```bash
npx tsx scripts/eoc-drill.ts
```

### 3.2 Drill Stages & Verification Steps

| Stage | Name | Simulated Event | Expected System Response | Success Verification Criteria |
|---|---|---|---|---|
| **Stage 1** | Baseline Health Audit | Initial system probe under nominal weather conditions. | Probes return HTTP 200; road segments indexed; queue active. | All checks show `[PASS]`, readiness probe confirms >= 3 road segments. |
| **Stage 2** | Flash Flood Inundation | Sudden cloudburst triggers severe precipitation (78mm/hr). | Flood intelligence transitions state from `WARNING` to `CRITICAL`. | Composite risk reaches `CRITICAL`; domain event `FLOOD_RISK_CHANGED` emitted. |
| **Stage 3** | Road Submersion | Critical artery segment (e.g., `seg-101`) exceeds safe water depth (water level > 40cm). | Segment marked `BLOCKED`; Dijkstra weight set to $\infty$; active routes flagged. | Route reroute candidate identified; reason indicates water submersion. |
| **Stage 4** | Autonomous Evacuation Rerouting | Active citizen en route approaches newly flooded zone. | Routing engine calculates dry detour bypassing `seg-101`; session updated. | Detour calculated in $< 20\text{ms}$; waypoint updated; bypass verified. |
| **Stage 5** | Multilingual SMS Alert | Evacuation advisory dispatched to citizen's device in preferred language (e.g., Kannada). | Queue processes message, applies rate-limiting policy, translates into Kannada. | Record status transitions to `DELIVERED`; SMS segment count validated. |
| **Stage 6** | EOC Manual Override | Tactical operator manually unblocks road segment following field water pump deployment. | Road status cleared to `OPEN`; traffic flow re-established; notification dispatched. | Segment accessibility reflects `OPEN`; audit event recorded with operator identity. |
| **Stage 7** | Flood Subsidence Recovery | Rain stops, water recedes, system returns to nominal baseline. | Risk engine transitions state back to `NORMAL`; alert cooldown resets. | Global state returns to `NORMAL`; drill completes with zero errors. |

---

## 4. Standard Operating Procedures (SOPs)

### SOP-01: Manual Road Blockage Override
**Trigger**: Field emergency crew radio reports a submerged underpass, fallen tree, or emergency barrier before telemetry sensors report it.

1. **Navigate to EOC Authority Console** -> **Roads Management**.
2. **Locate Segment**: Search by road name or click road geometry on map.
3. **Execute Override via API**:
   ```bash
   curl -X POST http://localhost:4000/api/v1/authority/roads/override \
     -H "Content-Type: application/json" \
     -H "x-operator-id: op-eoc-442" \
     -d '{
       "roadId": "seg-101",
       "action": "BLOCK",
       "reason": "Water depth 55cm reported by Engine 4 field unit"
     }'
   ```
4. **Verification**: Observe that the segment turns red on the operator map and active routes navigating through `seg-101` automatically receive proactive reroute prompts.

---

### SOP-02: Mass Emergency Broadcast Dispatch
**Trigger**: Incident Commander authorizes immediate evacuation notification for low-lying coastal or riverfront sectors.

1. **Verify Notification Queue Depth**:
   ```bash
   curl http://localhost:4000/health/ready
   ```
   *Ensure `pendingQueueJobs` $< 500$ before injecting large batch broadcasts.*
2. **Dispatch Targeted Alert via API**:
   ```bash
   curl -X POST http://localhost:4000/api/v1/authority/alerts/broadcast \
     -H "Content-Type: application/json" \
     -H "x-operator-id: ic-01" \
     -d '{
       "zoneId": "zone-south-riverfront",
       "severity": "CRITICAL",
       "title": "FLASH FLOOD EVACUATION NOTICE",
       "messageEn": "Flash flood warning: River levels rising rapidly. Evacuate via Highline Expressway immediately.",
       "targetRadiusKm": 15
     }'
   ```
3. **Track Delivery Metrics**:
   ```bash
   curl http://localhost:4000/api/v1/notifications/metrics
   ```
   *Check `deliveredRatio >= 98%` within 60 seconds.*

---

### SOP-03: Grok AI Decision Engine Outage Triage
**Trigger**: Prometheus alerts indicate Grok API timeouts, HTTP 504s, or circuit breaker trips.

1. **Assess Breaker State**:
   Inspect API logs for `Circuit breaker [GrokAI] TRIPPED to OPEN state`.
2. **Verify Deterministic Fallback**:
   Confirm that route requests are completing within $< 10\text{ms}$ with:
   `"decisionEngine": "deterministic_fallback"` in the response payload.
3. **Manual Disablement (if upstream unstable)**:
   Set `GROK_ENABLED=false` in environment or execute config toggle via EOC:
   The system will skip external LLM calls and generate instant heuristic safety explanations.
4. **Re-enabling Upstream**:
   Once xAI services recover, the circuit breaker automatically probes with canary requests (`HALF_OPEN` state) and restores live AI reasoning after 2 consecutive successes.

---

### SOP-04: Third-Party SMS Provider Failure & Fallback
**Trigger**: Twilio reports downstream carrier congestion or authentication outage.

1. **Inspect Delivery Status**:
   ```bash
   curl http://localhost:4000/api/v1/notifications/health
   ```
2. **Switch to Secondary SMS Gateway / Mock Fail-Safe**:
   If primary SMS provider is exhausted, configure fallback gateway or switch to in-app WebSocket push broadcast to preserve battery and channel bandwidth.
3. **Audit Suppressed Notifications**:
   Inspect suppression logs to verify anti-spam deduplication was preserved during carrier retransmissions.

---

## 5. Incident Severity & Escalation Matrix

| Severity Level | Definition | Response Time | Action Plan |
|---|---|---|---|
| **SEV-1 (Critical)** | Core routing engine offline OR database unavailable OR active citizen session loss. | Immediate ($< 5\text{ mins}$) | Engage Disaster Recovery Plan; engage systemd/K8s restart; alert Incident Commander. |
| **SEV-2 (Major)** | Grok AI unreachable OR SMS gateway failing OR live weather provider down (operating on safe fallback). | $< 15\text{ mins}$ | Verify circuit breakers; engage backup SMS provider; monitor memory and queue depth. |
| **SEV-3 (Moderate)** | Single citizen telemetry latency $> 10\text{s}$ OR map tile loading degraded. | $< 1\text{ hour}$ | Clear edge CDN cache; inspect network ingress bandwidth; check client device logs. |
| **SEV-4 (Low)** | Non-blocking telemetry warning or minor UI rendering cosmetic issue. | Next Business Day | Log ticket in maintenance backlog. |

# Smart City Guardian: Business Continuity & Disaster Recovery (BCDR) Plan

## 1. Executive Summary & Continuity Objectives

The Smart City Guardian platform is critical urban life-safety infrastructure. During major meteorological catastrophes (e.g., severe typhoons, storm surges, or flash inundations), public telecommunications, third-party cloud APIs, and municipal power grids may experience partial or complete disruption.

This Disaster Recovery Plan codifies the operational mechanisms, architecture designs, and recovery protocols that guarantee mission-critical routing and alert continuity under catastrophic failure scenarios.

### 1.1 Recovery SLAs

| Metric | Target SLA | Engineering Mechanism |
|---|---|---|
| **Recovery Time Objective (RTO)** | **$< 60$ seconds** | Automated container health probes, systemd automatic restarts, and multi-node Kubernetes pod self-healing. |
| **Recovery Point Objective (RPO)** | **$0$ lost active routes** | In-memory atomic route state mirroring, Redis session journaling, and client-side PWA local storage persistence. |
| **Routing Determinism SLA** | **$100\%$ availability** | Zero external API runtime hard-dependencies. If all external APIs fail, routing drops seamlessly to local Dijkstra algorithms with zero downtime. |
| **Alert Delivery Survival** | **$> 99.5\%$ critical alerts** | Multi-channel failover (WSS push -> SMS -> Low-bandwidth text summary). |

---

## 2. Multi-Tier Graceful Degradation Ladder

The platform operates across four deterministic tiers of degradation. The system automatically shifts between tiers without requiring human intervention or platform restarts:

```
+--------------------------------------------------------------------------+
|  Tier 1: Nominal Full-Capability Operation                              |
|  - Real-time OpenMeteo/TomTom telemetry feeds active                     |
|  - Grok-2 LLM natural language hazard synthesis & routing advice        |
|  - High-throughput WebSocket live tracking & map visualization           |
|  - Dual-provider SMS dispatch (Twilio + secondary)                       |
+------------------------------------+-------------------------------------+
                                     | Network latency > 5s or HTTP 5xx
                                     v
+--------------------------------------------------------------------------+
|  Tier 2: Cloud Telemetry & AI Fallback Operation                         |
|  - External weather/traffic circuit breakers trip to OPEN               |
|  - Deterministic historical flood matrix & sensor baselines engage       |
|  - Heuristic explainable safety scorer substitutes for Grok LLM         |
|  - WebSocket streaming remains active at reduced broadcast frequency     |
+------------------------------------+-------------------------------------+
                                     | Cloud WAN severed / Edge isolation
                                     v
+--------------------------------------------------------------------------+
|  Tier 3: Minimal Autonomous Edge Operation (Island Mode)                |
|  - EOC running local standalone Docker container on emergency generator  |
|  - Local Dijkstra routing on embedded city road graph                    |
|  - Manual operator hazard injection replaces cloud sensors               |
|  - Local mesh / LAN connectivity for emergency responders                |
+------------------------------------+-------------------------------------+
                                     | Cellular towers saturated / 2G only
                                     v
+--------------------------------------------------------------------------+
|  Tier 4: Extreme Low-Bandwidth Survival Mode                            |
|  - Web UI disabled; telemetry streaming halted                           |
|  - Ultra-compressed alphanumeric SMS dispatch (< 160 GSM chars)          |
|  - Critical evacuation corridors communicated via synthesized voice/SMS  |
+--------------------------------------------------------------------------+
```

---

## 3. High Availability Architecture & Disaster Topologies

### 3.1 Primary Cloud Architecture (Availability Zones)
- **Multi-AZ Deployment**: API containers deployed across three independent AWS/GCP availability zones behind an Application Load Balancer (ALB).
- **PostgreSQL PostGIS**: Primary instance with synchronous streaming replication to an in-region standby replica ($< 5\text{s}$ failover).
- **Redis Cluster**: 3-node Redis cluster with automatic master failover.

### 3.2 Edge EOC Station ("Island Mode" Fallback)
In the event that undersea fiber, national internet backbones, or public cloud endpoints are severed:
1. **Hardware**: Dedicated ruggedized EOC workstation running on uninterruptible power supply (UPS) / diesel generator.
2. **Software Stack**: Pre-built Docker images loaded with `smartcity-guardian/api:latest` and `smartcity-guardian/web:latest`.
3. **Data Package**: Embedded offline road network topology (`mock/roads.json`) and baseline historical flood elevation model (`mock/floodZones.json`).
4. **Local Mesh Wi-Fi**: Broadcasts an open municipal emergency Wi-Fi network allowing citizens within line-of-sight to access evacuation routing without internet access.

---

## 4. Failure Scenarios & Recovery Procedures

### Scenario A: Catastrophic Database Loss / Corruption
1. **Immediate Action**: API automatically switches to read-only in-memory route caching.
2. **Restoration from Backup**:
   ```bash
   # 1. Stop active API instances
   docker compose stop api

   # 2. Restore PostgreSQL PostGIS latest hourly snapshot
   pg_restore -h localhost -U smartcity -d smartcity_db /backups/smartcity_db_latest.dump

   # 3. Verify schema and table integrity
   psql -h localhost -U smartcity -d smartcity_db -c "SELECT COUNT(*) FROM road_segments;"

   # 4. Restart API
   docker compose up -d api
   ```
3. **Verification**: Query `curl http://localhost:4000/health/ready` to confirm road segments are indexed.

---

### Scenario B: Cloud Network Partition (Split-Brain Prevention)
1. **Cluster Consensus**: If a worker node loses contact with Redis for $> 10\text{ seconds}$, it enters read-only local evaluation mode.
2. **Traffic Redirection**: Ingress controller removes partitioned pods based on failing `/health/live` probes.
3. **Session Reconnection**: Reconnecting citizen clients transmit their last known waypoint (`activeRouteId`, `lastLat`, `lastLon`); the receiving healthy node rebuilds the route state immediately without session loss.

---

### Scenario C: Complete Telecommunications Blackout (Cellular Saturated)
1. **Activate Low-Bandwidth SMS Throttle**:
   Adjust notification policy in `apps/api/src/services/notifications/notificationPolicy.service.ts`:
   - Increase minimum alert cooldown from 15 minutes to 45 minutes.
   - Enforce single-segment SMS message length ($<= 160$ GSM-7 characters).
2. **Compress Message Templates**:
   Multilingual templates automatically strip non-essential verbiage and emit coordinates and route instructions in ultra-concise format:
   ```
   [EOC ALERT] FLOOD RISING. Safe route: Highline Expy. Avoid Main St. Stay above 10m elevation.
   ```

---

## 5. Backup & Recovery Schedule

| Asset | Mechanism | Frequency | Retention | Verification Schedule |
|---|---|---|---|---|
| **PostgreSQL Datastore** | Full WAL archive + `pg_dump` | Hourly snapshots, Continuous WAL | 30 days off-site | Weekly automated restore test |
| **System Configuration** | GitOps repository + Docker images | Every commit/tag | Indefinite | Automated CI/CD build test |
| **Road Network Geometry** | GeoJSON export + SHA-256 hash | Weekly audit | Versioned | Included in container image |
| **Redis Session State** | RDB snapshot (`BGSAVE`) | Every 15 minutes | 24 hours | On node reboot |

---

## 6. Disaster Recovery Drill Schedule

To maintain operational readiness, the EOC executes the following rehearsals:
1. **Monthly Automated Drill**: Execution of `scripts/eoc-drill.ts` during scheduled maintenance windows to verify zero code regressions.
2. **Quarterly Simulated Black-Sky Exercise**: Simulated total disconnection of external internet connection; validation of local edge Docker container routing.
3. **Annual Failover Validation**: Unannounced primary availability zone termination to measure real-world RTO and RPO against target SLAs.

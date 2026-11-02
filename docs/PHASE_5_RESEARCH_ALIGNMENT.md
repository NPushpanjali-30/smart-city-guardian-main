# SMARTCITY GUARDIAN — PHASE 5 RESEARCH ALIGNMENT

**Project**: SmartCity Guardian  
**Phase**: Phase 5 — Traffic Intelligence, Flood-Aware Routing & Dynamic Rerouting Engine  
**Status**: Formal Architectural Alignment Document  
**Date**: September 2026  

---

## 1. Executive Summary & Research Foundation

SmartCity Guardian Phase 5 implements a real-time, coupled flood-traffic intelligence and dynamic commuter rerouting system. The algorithmic and architectural foundations of this phase draw inspiration from three bodies of academic research:

1. **Smart Flood Assessment Systems (Smart FAS)**: Inundation-weighted routing penalties, exclusion of submerged links, and flood route indexing.
2. **Heterogeneous Urban Traffic Management Research**: Sensor fusion across speed degradation, delay ratios, density telemetry, and incident hazards.
3. **Coupled Flood-Traffic Transportation Network Resilience**: Dynamic network accessibility modeling, dual-hazard exposure minimization, and automated rerouting hysteresis under non-stationary environmental disruptions.

> [!IMPORTANT]
> **Implementation Scope**: SmartCity Guardian is a student-scale, practical software implementation inspired by these theoretical and empirical models. It adapts their core mathematical and operational principles into an event-driven TypeScript/Node.js/React full-stack architecture. It does not claim an exact reproduction of the numerical hydrodynamic differential equations or macroscopic dynamic traffic assignment solvers presented in the original academic papers.

---

## 2. Research Concept 1: Smart Flood Assessment System (Smart FAS)

### Academic Concept
The Smart FAS research models road networks as directed spatial graphs where edges represent road segments subjected to varying degrees of inundation. The paper demonstrates that:
1. Traditional routing engines (e.g., Dijkstra or $A^*$ prioritizing distance or free-flow travel time) route vehicles directly through flooded or hazardous road links, creating severe passenger entrapment risks.
2. Road impedance can be transformed dynamically by assigning flood severity penalties to affected edges:
   $$\text{Cost}(e) = \text{TravelTime}(e) \times (1 + \omega_f \cdot \text{FloodSeverity}(e))$$
3. Critical submerged links exceeding physical vehicle clearance must be assigned infinite impedance ($\infty$) to guarantee complete avoidance.
4. Route safety across alternatives can be quantitatively compared using a distance-weighted **Flood Route Index (FRI)**:
   $$\text{FRI} = \frac{\sum_{i=1}^n \text{Penalty}_i \cdot \text{Distance}_i}{\sum_{i=1}^n \text{Distance}_i}$$

### SmartCity Guardian Software Implementation
* **Infinite Cost Exclusion (`calculateSegmentCost`)**: Any road segment classified as `BLOCKED` (water depth $\ge 25\text{ cm}$ or official EOC barricade) is assigned $\text{Cost} = \infty$ and `isExcluded = true`. Any candidate route intersecting a blocked road receives a composite cost of $\infty$ and is classified with status `INVALID`.
* **Non-Linear Flood Weight Multipliers**: For traversable roads, flood penalties scale non-linearly using severity multipliers ($\text{Multiplier} = 10.0$ for `HIGH_RISK`, $2.0$ for `CAUTION`, and $3.0$ for conservative `UNKNOWN` sensor states).
* **Flood Route Index Formulation (`calculateFloodRouteIndex`)**:
  $$\text{FRI} = \frac{\sum (\text{Penalty}_i \cdot L_i)}{\sum L_i}$$
  where $L_i$ is segment length in meters. The computed index is exposed directly in the candidate route payload and visualized in the user-facing route comparison drawer.

---

## 3. Research Concept 2: Heterogeneous Urban Traffic Management

### Academic Concept
Urban transportation research highlights the danger of relying on single traffic metrics (e.g., nominal speed limit or raw probe counts). Instead, modern traffic management fuses heterogeneous data streams:
1. **Speed Degradation**: Relative loss of velocity compared to baseline free-flow velocity:
   $$\text{Ratio}_v = \frac{v_{\text{current}}}{v_{\text{free-flow}}}$$
2. **Travel-Time Delay Ratio**: Ratio of actual transit duration to unimpeded free-flow travel time:
   $$\text{Ratio}_t = \frac{t_{\text{current}}}{t_{\text{free-flow}}}$$
3. **Congestion Density**: Real-time traffic volume and density relative to corridor saturation capacity.
4. **Verified Incident Hazards**: External physical disruptions such as multi-vehicle collisions, construction, or stalled vehicles that degrade lane capacity.

### SmartCity Guardian Software Implementation
* **Explainable Factor Score Decomposition (`calculateTrafficScore`)**: Rather than calculating an opaque number, the traffic score ($[0, 100]$) is computed as an explainable, weighted linear combination with documented configuration weights:
  $$\text{TrafficScore} = w_s \cdot S_{\text{speed}} + w_d \cdot S_{\text{delay}} + w_c \cdot S_{\text{density}} + w_i \cdot S_{\text{incident}}$$
  Defaults: $w_s = 0.35$, $w_d = 0.25$, $w_c = 0.25$, $w_i = 0.15$.
* **Discrete Operational States (`TrafficState`)**: Evaluated roads are classified into discrete operational states: `SMOOTH`, `SLOW`, `CONGESTED`, `SEVERELY_CONGESTED`, and `UNKNOWN`.
* **Corridor-Level Aggregation (`TrafficCorridorService`)**: Road segments are aggregated into arterial municipal corridors (e.g., Waterfront Arterial vs. Highland Ridge Detour) to provide transit authorities with diversion advisories and emergency corridor preservation alerts.

---

## 4. Research Concept 3: Coupled Flood-Traffic Resilience & Dynamic Rerouting

### Academic Concept
Recent transportation resilience literature emphasizes that flood hazards and urban traffic dynamics cannot be evaluated in isolation:
1. When low-elevation roads submerge, commuters organically divert to adjacent elevated corridors, inducing severe secondary traffic congestion on high ground.
2. A navigation engine that only optimizes for flood avoidance may send thousands of vehicles into gridlocked chokepoints. Conversely, a pure traffic engine might divert cars directly into flood-prone depressions.
3. Continuous recalculation in dynamic networks suffers from **route flapping (oscillation)** if tiny variations in travel time trigger constant recalculations.
4. System stability requires:
   * **Hysteresis Margins**: An alternative route must offer a material improvement threshold before triggering a reroute.
   * **Temporal Cooldown Windows**: Minimum durations between non-emergency recalculations to preserve driver predictability.
   * **Emergency Safety Bypass**: Absolute priority to immediately recalculate if upcoming segments submerge.

### SmartCity Guardian Software Implementation
* **Composite Mobility Risk Index (`calculateMobilityRiskIndex`)**:
  $$\text{MRI} = 0.55 \cdot \text{FloodRisk} + 0.30 \cdot \text{TrafficRisk} + 0.15 \cdot \text{IncidentRisk}$$
  Individual sub-scores are strictly preserved in the domain model and database records to guarantee full algorithmic transparency.
* **Safety Dominance Over Travel Time**: Candidate routes are ranked by composite cost:
  $$\text{RouteCost} = \alpha \cdot \text{TimeCost} + \beta \cdot \text{TrafficCost} + \gamma \cdot \text{FloodCost} + \delta \cdot \text{IncidentCost}$$
  With $\gamma = 3.0$ and $\beta = 1.5$, safety heavily penalizes flood-prone shortcuts in favor of elevated detours.
* **Anti-Oscillation Guardrails (`ReroutingPolicyService`)**:
  * **Cooldown**: 90-second minimum duration between non-emergency reroutes.
  * **Hysteresis**: An alternative route must provide at least a 15% reduction in composite cost before a recalculation is authorized.
  * **Emergency Override**: Physical road closures (`BLOCKED` within upcoming segments) immediately bypass cooldown and hysteresis to protect human life.

---

## 5. Architectural Rule: Deterministic Supremacy vs. Grok AI

In accordance with Section 1 of the Phase 5 specification:
* **Grok AI Role**: Strictly high-level contextual decision support and natural language summarization (`REROUTE_REQUIRED`, `CONSIDER_ALTERNATIVE`, `KEEP_ROUTE`).
* **Routing Engine Role**: Strict deterministic ownership over route generation, coordinate polylines, graph segmentation, cost computation, and candidate ranking.
* **Safety Rule**: If Grok AI is offline or unreachable, the deterministic engine executes 100% of all routing and rerouting operations without degradation. Grok is never permitted to emit raw coordinates or bypass safety constraints.

---

## 6. Research Summary Matrix

| Research Dimension | Theoretical Paper Principle | SmartCity Guardian Implementation | Verification Method |
| :--- | :--- | :--- | :--- |
| **Edge Cost Modification** | Road cost increases with inundation severity | $\text{Cost}(e) = t_e + \text{Penalty}_{\text{traffic}} + \text{Penalty}_{\text{flood}}$ | `tests/routing.test.ts` |
| **Hazard Exclusion** | Inundated links receive infinite impedance | `accessibilityState = 'BLOCKED'` $\rightarrow \text{Cost} = \infty$ | `tests/routing.test.ts` |
| **Heterogeneous Traffic** | Fuses speed, travel time delay, density & hazards | 4-factor explainable linear decomposition | `tests/traffic.test.ts` |
| **Route Comparison Metric** | Distance-weighted Flood Route Index ($\text{FRI}$) | $\text{FRI} = \frac{\sum (\text{Penalty}_i \cdot L_i)}{\sum L_i}$ | `tests/routing.test.ts` |
| **Anti-Oscillation** | Damps route flapping in dynamic networks | 90s cooldown + 15% hysteresis margin + emergency override | `tests/rerouting.test.ts` |
| **Explainable AI Integration** | LLMs used for advisory decision support | Grok AI recommends; RoutingEngine calculates & validates | `tests/ai.test.ts`, `tests/scenario.test.ts` |

---

## 7. Citation & Conceptual Attribution

The design of SmartCity Guardian Phase 5 is conceptually guided by the following published literature:
1. *Smart Flood Assessment Systems (Smart FAS) for Urban Flood Evacuation Planning and Dynamic Routing.*
2. *Heterogeneous Traffic Management and Congestion Detection in Smart Municipalities.*
3. *Resilience-Driven Transportation Systems Under Coincident Flood Inundation and Traffic Disruptions.*

SmartCity Guardian adapts these methodologies into a modular, production-ready TypeScript enterprise architecture suitable for modern municipal deployment.

# Project Definition: SmartCity Guardian

**Document Version**: 1.0.0  
**Status**: Frozen Baseline  
**Classification**: Core Architecture  

---

## 1. Official Core Definition

> **SmartCity Guardian** is a real-time Smart City Decision Support Platform that integrates live environmental and transportation data to assess flood-related mobility risk, dynamically recommend safer routes, support traffic and emergency-response decisions, and communicate personalized action plans to citizens through SMS.

---

## 2. Core Philosophy & Unified Platform Concept

SmartCity Guardian is intentionally designed as **one unified, closed-loop urban resilience platform**, rather than two disjointed tools for weather and maps. 

In modern urban crises, flooding and transportation cannot be handled in isolation. Heavy precipitation causes localized flash floods; water accumulates on roads with poor drainage; flooded roads trigger sudden traffic congestion or gridlock; gridlock prevents emergency evacuations and traps citizens. SmartCity Guardian models and addresses this exact chain reaction in real-time.

### The Primary Cause-and-Effect Relationship

```text
  ┌──────────────────────────────┐
  │ WEATHER / FLOOD CONDITIONS   │ (Precipitation, forecast, river/catchment state)
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │         FLOOD RISK           │ (Multi-factor hydrological & spatial calculation)
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │         ROAD IMPACT          │ (Water accumulation, impassable segments, blocked lanes)
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │      TRAFFIC DISRUPTION      │ (Bottlenecks, congestion diversion, speed drops)
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │         ROUTE CHANGE         │ (Safety-weighted dynamic rerouting excluding blocked roads)
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │       USER ACTION PLAN       │ (Grok AI contextual synthesis + deterministic guidelines)
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │          SMS ALERTS          │ (Targeted, deduplicated, low-bandwidth direct citizen broadcast)
  └──────────────────────────────┘
```

---

## 3. High-Level System Capabilities

1. **Environmental Ingestion & Hydrological Risk Assessment**:
   Ingests meteorological observations, short-term precipitation radar forecasts, and elevation/topological risk zones to compute transparent flood scores.
2. **Transportation Network Modeling**:
   Continuously overlays flood risk onto discrete urban road segments, computing dynamic road risk and accessibility states (`OPEN`, `CAUTION`, `HIGH_RISK`, `BLOCKED`).
3. **Safety-Weighted Routing Engine**:
   Computes origin-to-destination navigation prioritizing citizen safety over pure travel duration. Excludes impassable segments and applies severe cost penalties to flood-prone corridors.
4. **Dynamic Event-Driven Rerouting**:
   Monitors active trips and evaluates incoming conditions against material risk thresholds to prompt rerouting before vehicles enter danger zones.
5. **Grok AI Decision-Support Layer**:
   Synthesizes complex multi-variable urban conditions into structured, human-readable situation reports, authority checklists, and concise citizen advisories.
6. **Multi-Channel Alerting & Low-Bandwidth SMS**:
   Dispatches location-targeted, deduplicated SMS alerts with clear citizen action steps, ensuring reachability during severe cellular bandwidth degradation.
7. **Role-Tailored Visual Command Interfaces**:
   Provides an intuitive, map-first citizen dashboard for travel planning alongside an Emergency Operations Center (EOC) admin interface for municipal monitoring.

---

## 4. System Boundaries & Non-Goals

To maintain high engineering discipline and realistic execution, the following boundaries are strictly enforced:

- **Strictly Software-First (Zero IoT Hardware)**:
  There are no physical sensor deployments, microcontrollers (ESP32 / Arduino / Raspberry Pi), or physical telemetry gateways. Ingestion utilizes public environmental APIs, municipal open datasets, citizen-submitted reports, and calibrated simulation models.
- **Decision Support, Not Automated Actuation**:
  SmartCity Guardian does not directly actuate traffic signals or manipulate physical road barriers. It supplies verified recommendations to municipal operators and citizens.
- **Advisory Status, Not Official Evacuation Command**:
  Citizen action plans are protective mobility advisories. Official disaster declarations or mandatory evacuation orders remain the sole legal authority of municipal emergency agencies.
- **Deterministic Supremacy Over AI**:
  Grok AI acts strictly as an advisory reasoning engine. Hard physical constraints (e.g., road closures, mathematical flood boundaries, cost functions) are deterministically executed by the backend. The platform must function seamlessly even if AI services experience total outage.

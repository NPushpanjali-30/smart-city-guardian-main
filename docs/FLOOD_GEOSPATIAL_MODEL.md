# Flood Geospatial Model & Road Impact Mapping

**Document Version**: 1.0.0  
**Status**: Implemented & Verified Architecture  
**Phase**: Phase 3 — Flood Intelligence & Prediction Engine  
**Project**: SmartCity Guardian  

---

## 1. Spatial Units & Geographic Strategy

SmartCity Guardian models flood hazards geographically using **Geographic Risk Zones** and coordinate bounding envelopes. The city is partitioned into hydrological drainage sectors and catchment lowlands rather than treating the urban environment as a single scalar value.

---

## 2. Tri-Partite Risk Zone Classification

A critical tenet of the platform is that **predicted risk must never be disguised as confirmed on-ground flooding**. The system enforces three distinct zone types:

```text
┌─────────────────────────┬────────────────────────────┬─────────────────────────────┐
│ 1. OBSERVED_CONFIRMED   │ 2. PREDICTED_RISK          │ 3. HISTORICAL_HOTSPOT       │
│ Solid Boundary (#EF4444)│ Dashed Boundary (#F97316)  │ Dotted Boundary (#F59E0B)   │
│ Inundation confirmed by │ Projected 15–30m nowcast   │ Topographically vulnerable  │
│ telemetry / reports.    │ from rainfall acceleration │ lowlands without active rain│
└─────────────────────────┴────────────────────────────┴─────────────────────────────┘
```

| Zone Type | Visual Styling on Map | Semantic Meaning | Operational Impact |
| :--- | :--- | :--- | :--- |
| **`OBSERVED_CONFIRMED`** | Solid red line, blue depth label | Confirmed active water accumulation or verified barrier deployment | Corridor marked `BLOCKED` if water depth $\ge 20\text{ cm}$; emergency reroute enforced |
| **`PREDICTED_RISK`** | Dashed orange line, nowcast badge | High probability ($P \ge 0.65$) of severe water hazard in 15–30 mins | Precautionary speed reduction (`CAUTION`), advisory detour proposed |
| **`HISTORICAL_HOTSPOT`** | Dotted amber line, depression marker | Topographically depressed basin susceptible to flash runoff | Monitored baseline; standard navigation permitted |

---

## 3. Road Impact Mapping (`RoadFloodRiskService`)

The road network is modeled as vector line strings (`LineString`) intersecting spatial risk zones:
```text
[Road Corridor Coordinates] ──► Intersects ──► [Active Risk Zone Polygon]
                                                    ↓
                                         Compute Corridor Risk
                                                    ↓
                  Separate Environmental Flood Score from Operational Accessibility
```

### 3.1 Spatial Intersection Algorithm
A road corridor is considered geographically impacted if:
1. Any vertex in the road coordinate line string lies inside the zone polygon (Point-in-Polygon ray casting); **OR**
2. The corridor centroid lies within the $800\text{-meter}$ spatial intersection buffer of the zone polygon centroid.

### 3.2 Flood Risk vs. Road Accessibility Separation (Rule 30)
The platform strictly decouples environmental severity from physical road drivability:

- **Environmental Flood Score ($0-100$)**: Reflects surrounding hydrological and rainfall hazard.
- **Operational Road Accessibility**:
  - `OPEN`: Corridor clear; normal transit permitted.
  - `CAUTION`: Minor water pooling ($< 15\text{ cm}$) or heavy congestion; reduce speed to $25\text{ km/h}$.
  - `HIGH_RISK`: Water pooling approaching passenger vehicle limits ($15-19\text{ cm}$); detour strongly advised.
  - `BLOCKED`: Road physically impassable ($waterDepth \ge 20\text{ cm}$) or closed by official EOC barricade. Hard-excluded from routing ($C = \infty$).
  - `UNKNOWN`: Telemetry degraded or unconfirmed.

# SmartCity Guardian — GIS Map Layers & Visual Hierarchy

**Project:** SmartCity Guardian  
**Document:** GIS Map Layers Specification & Visual Encodings  
**Phase:** Phase 6 — Full Live Map, Citizen Experience & Authority Control Center  
**Status:** IMPLEMENTED & VERIFIED  

---

## 1. Overview & Architecture

The SmartCity Guardian interactive GIS disaster map (`MapPage.tsx`) provides high-fidelity, real-time spatial awareness for commuters and emergency operators. To prevent confusion and false security during extreme weather events, the map enforces strict visual differentiation between observed ground truths, predictive hydrological models, historical vulnerability, and telemetry statuses.

### Architectural Rules
1. **Frontend Does Not Directly Call Third-Party Providers**: All spatial layers, candidate routes, and telemetry are fetched from authoritative internal backend endpoints (`/api/v1/routes/*`, `/api/v1/floods/*`, `/api/v1/traffic/*`, `/api/v1/admin/*`).
2. **Predicted Risks Must Never Impersonate Confirmed Inundation**: A 30-minute predictive flood zone is styled with dashed borders, high transparency, and a horizon badge, ensuring users never confuse predicted accumulation with physical road closure barriers.
3. **Unknown is Not Safe (`UNKNOWN != SAFE`)**: Any road or catchment with stale or missing telemetry applies a conservative caution penalty and is marked with a distinct pattern.

---

## 2. Supported Layer Hierarchy & Toggle Controls

The interface exposes independent layer toggles enabling users to customize their viewport:

| Layer Identifier | Layer Name | Visual Treatment | Data Source & Meaning |
| :--- | :--- | :--- | :--- |
| `layerBaseMap` | **Base Map** | Dark radial gradient `#0F172A` with 40px grid | Reference urban grid backdrop and arterial corridors |
| `layerUser` | **My Location (GPS)** | Cyan pulse circle with coordinates badge | Ephemeral client-side GPS coordinates (only active after explicit permission) |
| `layerRadius` | **10 km Alert Radius** | Dashed cyan perimeter ring (420px diameter) | Boundary defining proximity hazard relevance and SMS alert threshold |
| `layerRoutes` | **Candidate Routes** | Multi-colored SVG vector paths with glow filters | Calculated routes: Recommended detour, Alternative bypass, and Direct blocked |
| `layerTraffic` | **Live Traffic Flow** | Green/Amber/Red corridor speed overlays | Live traffic speed and congestion index per road segment |
| `layerObserved` | **Observed Flood Hazards** | Solid red fill (`rgba(239, 68, 68, 0.18)`), 2px solid border, caution stripes, pulse dot | Field-verified flood inundation (e.g. Bay Street 28 cm water depth, EOC barrier) |
| `layerPredicted` | **30m Predicted Zones** | Dashed orange border (`#F97316`), 8% fill, horizon badge | Hydrological nowcasting model projecting runoff over a 30-minute horizon |
| `layerHistorical` | **Historical Basins** | Dotted amber outline (`#F59E0B`), 5% fill | Geomorphological and topographically vulnerable lowland catchment basins |
| `layerIncidents` | **Verified Closures** | Barrier icons, EOC police caution tape markers | Confirmed physical road closures and barricades |
| `layerFacilities` | **Emergency Facilities** | Distinct SVG badges (🏥 Hospitals, 🏠 Shelters, 🚒 Fire/Rescue) | Verified medical centers, community evacuation shelters, and staging bases |

---

## 3. Visual Distinctions & Non-Color-Only Accessibility

To ensure accessibility for color-blind individuals and readability in bright or degraded environments, every feature employs geometric shape and stroke encoding in addition to color:

```text
Hazard Level           Color         Line Style / Stroke       Symbol / Marker
-------------------------------------------------------------------------------
Observed Inundation    #EF4444 Red   Solid + Caution Hatch     Red Pulse Dot + 🚫
30m Predicted Zone     #F97316 Org   Dashed ('6 4')            ⏱️ Horizon Tag
Historical Basin       #F59E0B Amb   Dotted ('2 4')            Depression Outline
Stale / Offline        #94A3B8 Gry   Dashed-Dotted             Patterned Neutral
Road: OPEN             #10B981 Grn   Solid Line (4px)          ✓ Checkmark
Road: CAUTION          #F59E0B Amb   Dashed Line (4px)         ⚠ Warning Triangle
Road: HIGH_RISK        #F97316 Org   Dash-Dot Line (5px)       ◆ Hazard Diamond
Road: BLOCKED          #EF4444 Red   Double Solid / Dashed     🚫 Barricade
Road: UNKNOWN          #94A3B8 Gry   Dotted Line               ? Question Mark
```

---

## 4. Route Geometric Polylines & Candidate Presentation

When evaluating transit from Origin to Destination, three distinct candidate routes are visually projected:

1. **Recommended Flood-Safe Detour (`route-elevated`)**:
   - *Geometry*: Solid Cyan `#38BDF8`, stroke width `6px`, with glowing outer drop-shadow.
   - *Meaning*: Preferred route selected by the composite safety cost function. Avoids all submerged segments by routing through elevated topography.
2. **Alternative Peripheral Bypass (`route-perimeter`)**:
   - *Geometry*: Dashed Amber `#F59E0B`, stroke width `5px`, stroke dasharray `'6 4'`.
   - *Meaning*: Passable alternative detour via municipal ringway; incurs moderate commercial congestion.
3. **Direct Blocked Arterial (`route-direct`)**:
   - *Geometry*: Dashed Red `#EF4444`, stroke width `5px`, stroke dasharray `'8 6'`.
   - *Meaning*: The geographically direct line displayed with explicit blockage rationale (`Water depth: 28 cm`) so commuters understand why detours are enforced.

---

## 5. Performance & Rendering Guardrails

- **Dynamic SVG Rendering**: Geometric route polylines and hazard basins are drawn inside high-performance responsive SVG overlays with zero DOM re-render thrashing.
- **Microsecond H-STAR Deflections**: Local potential gradient deflections execute in sub-millisecond time ($< 0.2\text{ ms}$) without requiring full graph recalculation.
- **WebSocket Event Integration**: Subscribed to `realtime:routing` and `realtime:floods`. State updates trigger localized delta updates rather than full map reconstruction.

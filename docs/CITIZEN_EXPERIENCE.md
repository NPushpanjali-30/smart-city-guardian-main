# SmartCity Guardian — Citizen Safety Experience & Navigation UX

**Project:** SmartCity Guardian  
**Document:** Citizen Mobile & Desktop Operational Experience  
**Phase:** Phase 6 — Full Live Map, Citizen Experience & Authority Control Center  
**Status:** IMPLEMENTED & VERIFIED  

---

## 1. Overview

The Citizen Experience in SmartCity Guardian delivers an intuitive, calm, and actionable interface for commuters during severe weather and urban flood emergencies. Rather than presenting overwhelming technical raw telemetry, the application translates complex hydrological and traffic models into plain-language safety guidance across **English (`en`)**, **Hindi (`hi`)**, and **Kannada (`kn`)**.

---

## 2. Geolocation Flow & Privacy Architecture

### Explicit Permission Dialog
Commuters are greeted with a clear, transparent permission explanation before requesting browser geolocation:
- **Purpose**: "SmartCity Guardian uses your location solely to calculate proximity to flood hazards within a 10 km alert radius."
- **Privacy Guarantee**: Coordinates are processed **client-side only** in ephemeral memory. The backend never stores user location history, tracks commuters over time, or exposes precise coordinates to other users.
- **Graceful Fallbacks**:
  - `PROMPT`: Explains the safety value and requests user consent.
  - `GRANTED`: Renders live GPS pin with real-time update timestamp ("Updated 12s ago").
  - `DENIED`: Gracefully falls back to default city center coordinates without degrading map or routing functionality.
  - `UNSUPPORTED`: Notifies user if running on legacy browser and enables manual POI selection.

---

## 3. 3-Way Independent Risk Breakdown

A core innovation in the citizen experience is the **3-Way Independent Risk Breakdown**:

```text
+-----------------------+   +-----------------------+   +-----------------------+
| CURRENT LOCATION RISK |   |   DESTINATION RISK    |   |  SELECTED ROUTE RISK  |
|      Tier: WATCH      |   |     Tier: WARNING     |   | Tier: SAFE_TO_PROCEED |
|       28 / 100        |   |       62 / 100        |   |       10 / 100        |
|  Elevated watershed   |   |  3.8 km from nearest  |   |  Elevated ridge road  |
|  catchment runoff     |   |  active flood event   |   |  guarantees 0cm water |
+-----------------------+   +-----------------------+   +-----------------------+
```

1. **Current Location Risk**: Evaluates localized catchment basin runoff in the commuter's immediate vicinity.
2. **Destination Risk**: Evaluates flood hazards near the target point of arrival (e.g. hospital lowlands).
3. **Route Risk**: Evaluates composite flood, traffic, and incident impedance across the traversed path.

This separation prevents the dangerous cognitive error of assuming a route is hazardous simply because the destination is in a watch zone, or assuming transit is safe because the origin is dry.

---

## 4. Navigation & Route Presentation

### Multi-Candidate Route Comparison
When a commuter checks a route, the system presents three distinct candidate tabs:
- **Recommended Detour (★ Highland Avenue Elevated)**: 8 min • 2.8 km • Flood Risk 10/100 • Traffic 15% • `SAFE_TO_PROCEED`.
- **Alternative Bypass (Northern Perimeter)**: 11 min • 3.4 km • Flood Risk 18/100 • Traffic 35% • `CAUTION`.
- **Direct Blocked Arterial (Bay Street Direct)**: 5 min • 2.4 km • Flood Risk 88/100 • Traffic 85% • `INVALID` (Water depth: 28 cm).

### Plain-Language Explainability
Each route card features a dedicated reasoning engine panel detailing:
- **Key Advantages**: e.g., "Strictly avoids submerged Bay Street corridor (Water depth: 28 cm)".
- **Hazards & Cautions**: e.g., "Moderate commercial traffic near university campus".
- **Calculated Trade-Offs**: e.g., "+3 min travel time for guaranteed personal safety".
- **Segment Evidence Badges**: Every corridor displays its evidence provenance (`OBSERVED`, `PREDICTED`, `UNKNOWN`).

### In-Transit Dynamic Rerouting Alerts
During navigation, if live sensors detect rising floodwaters or an official barricade on the active path:
1. The system plays an attention cue and renders an alert banner:
   - "ROUTE UPDATE — CONDITIONS ON CURRENT ROUTE HAVE CHANGED"
   - Shows reason: "Water depth reached 28 cm on Bay Street corridor."
   - States ETA impact: "+3 min duration • Guaranteed Zero Water Hazard".
2. Commuter is provided two clear actions:
   - `[ Accept Safer Detour ]`: Seamlessly transitions to the pre-calculated elevated route.
   - `[ Dismiss ]`: Dismisses notification while maintaining in-transit warnings.

### "No Suitable Route Found" Fallback
If catastrophic flooding engulfs all candidate paths:
- The UI displays a prominent warning: "No safe or passable route found to destination."
- Advises immediate shelter-in-place: "All evaluated corridors exceed critical flood thresholds or are physically blocked. Please shelter in place and await official emergency advisories."

---

## 5. Localized Citizen Safety Panel

Located on the citizen dashboard and map overview:
- **Nowcasting Horizon**: 30-minute predictive forecast with probability percentage ($76\%$) and contributing meteorological factors.
- **Nearby Events Radar**: Distances to active hazards in km with compass direction (e.g., "Bay Basin Lowlands • 4.2 km North-West").
- **AI Decision Advisory**: Phase 4 Grok AI synthesized recommendations with explicit attribution (`grok-2-latest`).
- **Zero-Downtime Deterministic Fallback**: If Grok AI is offline or rate-limited, the badge displays `DETERMINISTIC SAFETY RULES ACTIVE` with rule-based safety instructions.
- **Telemetry Freshness**: Displays `LIVE SENSOR DATA`, `SIMULATION DATA`, or `STALE TELEMETRY`.

---

## 6. Accessibility & Responsive Implementation

- **Keyboard Navigation & Visible Focus**: All buttons, layer toggles, and dropdowns support full `Tab` and `Shift+Tab` traversal with high-visibility cyan focus rings.
- **Non-Color-Only Status Indicators**: Every status pair includes color, textual label, and distinct geometric icon/badge (`✓`, `⚠`, `◆`, `🚫`).
- **Mobile Responsive Design**: Fluid CSS grid and flex layouts wrap seamlessly on handheld screens ($360\text{px}\text{--}768\text{px}$) and wide desktop displays ($1920\text{px}$).

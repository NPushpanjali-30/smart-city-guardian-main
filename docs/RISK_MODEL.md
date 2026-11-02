# Risk Model & Scoring Engine Specification

**Document Version**: 1.0.0  
**Status**: Approved Architecture  
**Project**: SmartCity Guardian  

---

## 1. Principles of Explainable Risk

A critical requirement of SmartCity Guardian is **total algorithmic transparency**. 

Black-box machine learning models that generate opaque probabilities are unacceptable for life-critical disaster routing. When a commuter is instructed to take an 8-minute detour, or an EOC operator reviews an automated road closure advisory, the system must provide an exact, human-understandable breakdown of contributing factors.

Every score ranges from $0$ to $100$.

---

## 2. Component Sub-Scores

### 2.1 Rainfall Intensity Score ($S_{\text{rain}}$)
Reflects current downpour intensity calibrated against flash-flood thresholds:
$$S_{\text{rain}} = \min\left(100, \left(\frac{R_{\text{current}}}{50}\right) \times 100\right)$$
- $R_{\text{current}}$ = current precipitation rate in $\text{mm/h}$.
- At $\ge 50\text{ mm/h}$ (violent tropical downpour), $S_{\text{rain}} = 100$.

### 2.2 Antecedent Precipitation Score ($S_{\text{antecedent}}$)
Models soil saturation and drainage exhaustion from sustained rainfall:
$$S_{\text{antecedent}} = \min\left(100, \left(\frac{R_{\text{1h}}}{30}\right) \times 50 + \left(\frac{R_{\text{24h}}}{100}\right) \times 50\right)$$
- Saturated ground cannot absorb new rain, directly causing immediate surface runoff.

### 2.3 Forecast Radar Score ($S_{\text{forecast}}$)
Proactive risk weighting based on short-term predictive radar:
$$S_{\text{forecast}} = \min\left(100, P_{\text{prob}} \times \left(\frac{R_{\text{expected}}}{40}\right) \times 100\right)$$
- $P_{\text{prob}}$: Probability of precipitation ($0.0$ to $1.0$).
- $R_{\text{expected}}$: Projected rainfall in next 60 minutes.

### 2.4 Flood Evidence Score ($S_{\text{evidence}}$)
Physical and historical vulnerability factors:
$$S_{\text{evidence}} = w_{\text{historical}} \cdot E_{\text{hist}} + w_{\text{reports}} \cdot E_{\text{reports}}$$
- $E_{\text{hist}} \in \{0, 100\}$: Historical flood-basin/low-elevation marker ($100$ if flood-prone, else $0$).
- $E_{\text{reports}} \in [0, 100]$: Validated citizen hazard reports within a 500-meter radius.

### 2.5 Data Freshness & Confidence Multiplier ($C_{\text{confidence}}$)
$$C_{\text{confidence}} = \max(0.2, 1.0 - \text{Penalty}_{\text{age}})$$
- Penalizes telemetry older than its configured TTL.

---

## 3. Composite Risk Equations

### 3.1 Flood Risk Score ($R_{\text{flood}}$)
Synthesizes environmental and hydrological factors:
$$R_{\text{flood}} = \left(0.35 \cdot S_{\text{rain}} + 0.25 \cdot S_{\text{antecedent}} + 0.20 \cdot S_{\text{forecast}} + 0.20 \cdot S_{\text{evidence}}\right) \times C_{\text{confidence}}$$

### 3.2 Road Risk Score ($R_{\text{road}}$)
Evaluates danger on a specific road segment:
$$R_{\text{road}} = \min\left(100, 0.60 \cdot R_{\text{flood}} + 0.25 \cdot S_{\text{traffic}} + 0.15 \cdot S_{\text{incident}}\right)$$
- If the segment is physically submerged or officially closed, $R_{\text{road}} = 100$ and accessibility state is locked to `BLOCKED`.

---

## 4. Severity Classifications & Operational Thresholds

| Severity Tier | Range | Semantics & Operational Response |
| :--- | :--- | :--- |
| **`NORMAL`** | $0 \le R < 25$ | Safe operating baseline. Green map markers. Standard navigation routing. |
| **`WATCH`** | $25 \le R < 50$ | Elevated caution. Low-lying corridors monitored. Yellow map markers. Advisory speed reduction. |
| **`WARNING`** | $50 \le R < 75$ | Severe water hazards likely. Orange map markers. Strong penalty applied in routing; alternative route advised. |
| **`CRITICAL`** | $75 \le R \le 100$ | Flash flood imminent/active. Red map markers. Affected corridors marked `BLOCKED` or excluded from passenger navigation; emergency SMS triggered. |

---

## 5. Explainable Reasoning Schema

Every calculated risk object contains an explicit explanation array:

```json
{
  "composite_score": 78.5,
  "severity": "CRITICAL",
  "confidence": 0.95,
  "factors": [
    {
      "name": "Rainfall Intensity",
      "contribution": 35.0,
      "description": "Violent rain measured at 48.0 mm/h"
    },
    {
      "name": "Soil Saturation",
      "contribution": 22.5,
      "description": "Antecedent 24h rainfall of 85.0 mm has exhausted soil absorption"
    },
    {
      "name": "Historical Vulnerability",
      "contribution": 15.0,
      "description": "Segment located in low-elevation flood basin Sector 4"
    },
    {
      "name": "Citizen Validation",
      "contribution": 6.0,
      "description": "2 verified citizen flood reports within 300 meters"
    }
  ],
  "human_summary": "Road marked CRITICAL due to violent 48mm/h rainfall, saturated ground, and historical low-elevation flooding."
}
```

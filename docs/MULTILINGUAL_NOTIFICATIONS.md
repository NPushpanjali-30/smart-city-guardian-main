# Trilingual Multilingual Notifications & SMS Encoding Specification

## 1. Scope & Linguistic Objectives
SmartCity Guardian serves diverse citizen communities across urban and peri-urban sectors. The notification subsystem provides native trilingual emergency alerts across:
1. **English (`en`)**: Primary municipal administrative standard.
2. **हिंदी Hindi (`hi`)**: National language utilizing Devanagari Unicode script.
3. **ಕನ್ನಡ Kannada (`kn`)**: State language utilizing Dravidian Kannada Unicode script.

All notification templates are pre-authored by human linguistic standards to ensure clear life-safety guidance without awkward machine translations.

---

## 2. SMS Character Encoding & Segment Rules

Mobile telecom carriers transmit SMS using one of two primary encodings:

### 1. GSM 7-bit Default Alphabet
- Used for standard Latin alphanumeric text (`en`).
- **Single Segment Capacity**: 160 characters.
- **Concatenated Segment Capacity**: 153 characters per segment (7 characters reserved for telecom User Data Header / UDH segment assembly).

### 2. UCS-2 16-bit Unicode Alphabet
- Triggered automatically whenever characters outside the GSM-7 set are present (including all Hindi Devanagari `\u0900-\u097F` and Kannada `\u0C80-\u0CFF` code points).
- **Single Segment Capacity**: 70 characters.
- **Concatenated Segment Capacity**: 67 characters per segment (3 characters / 6 bytes reserved for UDH segment assembly).

### Non-Negotiable Life-Safety Rule
> [!CRITICAL]
> **Zero-Truncation Policy**: The notification engine **never silently truncates life-safety instructions, hazard depths, or uncertainty caveats** to fit within a single 70-character or 160-character boundary. If safety instructions exceed single segment capacity, concatenated multi-segment SMS delivery is always used.

---

## 3. Template Catalog by Alert Context

### 3.1 ROUTE_ALERT (Active Route Inundation & Detour)

| Language | Severity | Transmitted SMS Payload | Encoding | Segments |
| :--- | :--- | :--- | :--- | :--- |
| **English** | `CRITICAL` | `SMARTCITY CRITICAL: Road submerged on route. Detour via {routeDetourName}. Do not attempt flooded crossing.` | GSM-7 | 1 |
| **English** | `WARNING` | `SMARTCITY WARNING: Flood hazard on route. Safer detour: {routeDetourName} (+{travelTimeDeltaMin}m). Avoid flooded roads.` | GSM-7 | 1 |
| **Hindi** | `CRITICAL` | `स्मार्टसिटी आपातकाल: मार्ग जलमग्न है। {routeDetourName} से अनिवार्य मोड़ लें। जलभराव में वाहन न ले जाएं।` | UCS-2 | 2 |
| **Hindi** | `WARNING` | `स्मार्टसिटी चेतावनी: मार्ग पर बाढ़ का खतरा। सुरक्षित मोड़: {routeDetourName} (+{travelTimeDeltaMin} मिनट)।` | UCS-2 | 2 |
| **Kannada** | `CRITICAL` | `ಸ್ಮಾರ್ಟ್‌ಸಿಟಿ ತುರ್ತು: ಮಾರ್ಗ ಜಲಾವೃತವಾಗಿದೆ. {routeDetourName} ಮೂಲಕ ಕಡ್ಡಾಯ ತಿರುವು ಪಡೆಯಿರಿ.` | UCS-2 | 2 |
| **Kannada** | `WARNING` | `ಸ್ಮಾರ್ಟ್‌ಸಿಟಿ ಎಚ್ಚರಿಕೆ: ಮಾರ್ಗದಲ್ಲಿ ಪ್ರವಾಹ ಅಪಾಯ. ಸುರಕ್ಷಿತ ತಿರುವು: {routeDetourName} (+{travelTimeDeltaMin} ನಿಮಿಷ).` | UCS-2 | 2 |

### 3.2 LOCATION_ALERT (Proximity to Monitored Basin Hazard)

| Language | Severity | Transmitted SMS Payload | Encoding | Segments |
| :--- | :--- | :--- | :--- | :--- |
| **English** | `CRITICAL` | `SMARTCITY CRITICAL: Flash flood {distanceKm}km away. Submerged roads. Avoid travel immediately.` | GSM-7 | 1 |
| **English** | `WARNING` | `SMARTCITY WARNING: Flood hazard {distanceKm}km away near {eventName}. Avoid low underpasses.` | GSM-7 | 1 |
| **English** | `WATCH` | `SMARTCITY ADVISORY: Potential waterlogging {distanceKm}km away. Monitor local updates.` | GSM-7 | 1 |
| **Hindi** | `CRITICAL` | `स्मार्टसिटी आपातकाल: {distanceKm} किमी दूर भारी बाढ़। सड़कें जलमग्न। यात्रा तुरंत रोकें।` | UCS-2 | 2 |
| **Hindi** | `WARNING` | `स्मार्टसिटी चेतावनी: {distanceKm} किमी दूर बाढ़ का खतरा ({eventName})। निचले रास्तों से बचें।` | UCS-2 | 2 |
| **Hindi** | `WATCH` | `स्मार्टसिटी सलाह: आपके स्थान से {distanceKm} किमी दूर जलभराव संभव। सतर्क रहें।` | UCS-2 | 2 |
| **Kannada** | `CRITICAL` | `ಸ್ಮಾರ್ಟ್‌ಸಿಟಿ ತುರ್ತು: {distanceKm} ಕಿಮೀ ದೂರದಲ್ಲಿ ತೀವ್ರ ಪ್ರವಾಹ. ತಕ್ಷಣ ಪ್ರಯಾಣ ತಪ್ಪಿಸಿ.` | UCS-2 | 2 |
| **Kannada** | `WARNING` | `ಸ್ಮಾರ್ಟ್‌ಸಿಟಿ ಎಚ್ಚರಿಕೆ: {eventName} ಬಳಿ {distanceKm} ಕಿಮೀ ದೂರದಲ್ಲಿ ಪ್ರವಾಹ ಅಪಾಯ. ತಗ್ಗು ರಸ್ತೆಗಳನ್ನು ತಪ್ಪಿಸಿ.` | UCS-2 | 2 |
| **Kannada** | `WATCH` | `ಸ್ಮಾರ್ಟ್‌ಸಿಟಿ ಸಲಹೆ: {distanceKm} ಕಿಮೀ ದೂರದಲ್ಲಿ ನೀರು ನಿಲ್ಲುವ ಸಾಧ್ಯತೆ. ಎಚ್ಚರಿಕೆಯಿಂದಿರಿ.` | UCS-2 | 2 |

### 3.3 DESTINATION_ALERT (Anchor Destination Risk)

| Language | Severity | Transmitted SMS Payload | Encoding | Segments |
| :--- | :--- | :--- | :--- | :--- |
| **English** | `CRITICAL` | `SMARTCITY CRITICAL: Flooding at {destination} ({distanceKm}km). Access blocked. Do not travel.` | GSM-7 | 1 |
| **English** | `WARNING` | `SMARTCITY: Flood alert {distanceKm}km from {destination}. Check safer alternatives.` | GSM-7 | 1 |
| **Hindi** | `CRITICAL` | `स्मार्टसिटी आपातकाल: {destination} के पास भारी बाढ़ ({distanceKm} किमी)। इस क्षेत्र में न जाएं।` | UCS-2 | 2 |
| **Kannada** | `CRITICAL` | `ಸ್ಮಾರ್ಟ್‌ಸಿಟಿ ತುರ್ತು: {destination} ಬಳಿ ತೀವ್ರ ಪ್ರವಾಹ ({distanceKm} ಕಿಮೀ). ಆ ಪ್ರದೇಶಕ್ಕೆ ಹೋಗಬೇಡಿ.` | UCS-2 | 2 |

---

## 4. Software API & Segment Calculator Usage

The `@smartcity/shared` package exposes `calculateSmsSegments(text)` for real-time client and server analysis:

```typescript
import { calculateSmsSegments } from '@smartcity/shared';

const analysis = calculateSmsSegments('ಸ್ಮಾರ್ಟ್‌ಸಿಟಿ ತುರ್ತು: ಮಾರ್ಗ ಜಲಾವೃತವಾಗಿದೆ.');
console.log(analysis);
// Output:
// {
//   encoding: 'UCS-2',
//   characterCount: 43,
//   segmentCount: 1,
//   maxCharsPerSegment: 70,
//   remainingInCurrentSegment: 27
// }
```

# Multilingual Application Foundation & Notification Localization

**Document Version**: 1.0.0  
**Status**: Implemented & Verified  
**Feature**: Phase 2 Add-On — Internationalization (i18n) & Localized Fallbacks  
**Supported Languages**:
- English (`en`) — Default
- Hindi (`hi`) — हिन्दी
- Kannada (`kn`) — ಕನ್ನಡ

---

## 1. Internationalization Architecture

SmartCity Guardian delivers critical life-safety guidance across India's diverse linguistic corridor. The internationalization architecture enforces a strict boundary between internal system state and presentation-layer localization:

1. **Language-Independent Internal Models**:
   - Severity codes are stored in the database as invariant ASCII enums: `NORMAL`, `WATCH`, `WARNING`, `CRITICAL`.
   - Internal states are never stored as localized strings (e.g. `WARNING` is stored, not `चेतावनी` or `ಎಚ್ಚರಿಕೆ`).
2. **Dynamic UI Presentation**:
   - The frontend loads localized JSON dictionaries (`common.json`) under `apps/web/src/i18n/<lang>/`.
   - The reactive `I18nProvider` hook (`useI18n`) allows immediate UI re-rendering upon language selection without page reloads or session termination.
3. **Persisted Citizen Preferences**:
   - Citizen language preference (`preferred_language`) is stored in `localStorage` and mapped to the user profile schema.

---

## 2. Localized Severity Label Mapping

| Internal Enum | English (`en`) | Hindi (`hi`) | Kannada (`kn`) |
| :--- | :--- | :--- | :--- |
| `NORMAL` | NORMAL | सामान्य | ಸಾಮಾನ್ಯ |
| `WATCH` | WATCH | निगरानी | ವೀಕ್ಷಣೆ |
| `WARNING` | WARNING | चेतावनी | ಎಚ್ಚರಿಕೆ |
| `CRITICAL` | CRITICAL | गंभीर | ತುರ್ತು |

---

## 3. Multilingual SMS & Notification Templates

To safeguard citizens when external AI services (e.g., Grok) experience network timeouts or outages, the platform maintains deterministic, pre-approved emergency templates in `packages/shared/src/templates/notificationTemplates.ts`.

### 3.1 Character Count Safety Mandate
All localized SMS summaries are verified to stay strictly within the **160-character single-segment GSM limit**:

- **English Sample**: `SMARTCITY WARNING: Flood hazard 4.2km away near Bay Basin. Avoid low underpasses.` (82 chars)
- **Hindi Sample**: `स्मार्टसिटी चेतावनी: 4.2 किमी दूर बाढ़ का खतरा (बे बेसिन तराई)। निचले रास्तों से बचें।` (88 chars)
- **Kannada Sample**: `ಸ್ಮಾರ್ಟ್ ಸಿಟಿ ತುರ್ತು: 2.5 ಕಿ.ಮೀ ದೂರದಲ್ಲಿ ಭಾರಿ ಪ್ರವಾಹ. ರಸ್ತೆಗಳು ಮುಳುಗಿವೆ. ಪ್ರಯಾಣ ನಿಲ್ಲಿಸಿ.` (88 chars)

---

## 4. Grok AI Multilingual Contract Preparation

The Grok decision integration contracts (`GrokInputContext` and `GrokDecisionOutput`) in `packages/shared/src/types/` now incorporate language awareness:
- `GrokInputContext.preferred_language?: 'en' | 'hi' | 'kn'`
- `GrokDecisionOutput.language?: 'en' | 'hi' | 'kn'`

This allows future AI synthesis pipelines in Phase 3 to generate contextual, natural-language guidance in the citizen's native tongue while validating against strict schema invariants.

# SmartCity Guardian — Phase 7 Implementation Plan
## SMS Notifications & Personalized Multilingual Alerts

**Project:** SmartCity Guardian  
**Phase:** Phase 7 — SMS Notifications & Personalized Multilingual Alerts  
**Target Completion:** October 2026  
**Status:** DRAFTING / IN PROGRESS  
**Prerequisites:** Phases 1–6 Complete & Verified (21/21 test suites passing, `docs/PHASE_6_COMPLETION_REPORT.md` signed off).

---

## 1. Executive Objectives & Architecture

Phase 7 builds a reliable, asynchronous, privacy-preserving notification and SMS delivery subsystem. The system delivers **relevant, deduplicated, localized emergency alerts** to citizens and commuters when verified flood and traffic hazards threaten their current location, saved destination, or active transit route.

### Authoritative Architecture Flow

```text
Risk / Route / Flood Event Update
                ↓
    Notification Eligibility Policy
    (Freshness, Severity, Active Event, Unknown != Safe)
                ↓
    Recipient Relevance Engine
    (10 km Proximity, Saved Destination, Active Route Trajectory)
                ↓
    User Preference & Consent Check
    (SMS Opt-In, Phone Verified, Channel Enabled, Min Severity)
                ↓
    Deduplication & Escalation Engine
    (Stable Idempotency Key, 60-min Cooldown, Material Escalation Bypass)
                ↓
    Multilingual Localization & Template Engine
    (English, Hindi, Kannada, Grok Advisory with Deterministic Fallback)
                ↓
    Unicode & SMS Segmentation Engine
    (GSM-7 vs UCS-2 character budget, segment counting, length safety)
                ↓
    Asynchronous Notification Queue & Worker
    (Non-blocking ingestion, exponential backoff retries, dead-letter state)
                ↓
    SMS Provider Abstraction
    (MockSmsProvider & Twilio Adapter abstraction)
                ↓
    Delivery Status Tracking & Masked Audit Trail
    (PENDING -> QUEUED -> SENT_TO_PROVIDER -> DELIVERED / FAILED)
```

---

## 2. Core Non-Negotiable Rules

1. **Backend Policy is Authoritative**: Notifications are never sent solely because an LLM or citizen suggests it. The backend eligibility policy owns the decision to notify.
2. **Never Block Real-Time Ingestion**: SMS dispatch and third-party telecom calls must occur asynchronously via an in-memory queue. Ingestion loops and routing APIs must never stall waiting for telecom networks.
3. **Unknown is Not Safe**: Missing or stale telemetry must not be treated as "NORMAL". However, non-verified warnings are labeled as advisories or predictions, never official statutory evacuations.
4. **Privacy & Masking**: Precise GPS coordinates and full phone numbers are never stored in public logs, broadcast events, or transmitted in unmasked form (e.g. `+91 98*** ***10`).
5. **Accurate Delivery Status Semantics**: `SENT_TO_PROVIDER` does **not** mean `DELIVERED`. Only explicit delivery receipts or provider confirmations can mark a notification `DELIVERED`.
6. **Zero SMS Spam via Deduplication**: Unchanged provider telemetry suppresses repeat SMS dispatches within a 60-minute cooldown window, unless severity materially escalates (e.g., `WATCH` $\rightarrow$ `WARNING` $\rightarrow$ `CRITICAL`).

---

## 3. Step-by-Step Implementation Roadmap

### Step 1: Shared Models & Template Extensions (`@smartcity/shared`)
- Extend `packages/shared/src/types/index.ts` with notification and SMS types:
  - `SmsDeliveryStatus`: `PENDING`, `QUEUED`, `SENT_TO_PROVIDER`, `DELIVERED`, `FAILED`, `CANCELLED`, `UNKNOWN`.
  - `NotificationTriggerType`: `FLOOD_ESCALATION`, `PROXIMITY_HAZARD`, `DESTINATION_HAZARD`, `ROUTE_INVALIDATED`, `ROUTE_REROUTE`, `RECOVERY_UPDATE`.
  - `UserPreferences`: User notification settings, language (`en`, `hi`, `kn`), phone number, min severity threshold, radius km.
- Extend `packages/shared/src/templates/notificationTemplates.ts` with `ROUTE_ALERT` across `en`, `hi`, and `kn` for all severity levels (`NORMAL`, `WATCH`, `WARNING`, `CRITICAL`).
- Implement Unicode and SMS segmentation calculator in `@smartcity/shared`:
  - Detects GSM-7 vs UCS-2 encoding.
  - Returns character count, segment count, and encoding type.

### Step 2: SMS Provider Abstraction & Deterministic Mock Provider
- Define `ISmsProvider` interface:
  - `sendSms(params: SmsSendParams): Promise<SmsSendResult>`
  - `getDeliveryStatus(messageId: string): Promise<SmsStatusResult>`
- Implement `MockSmsProvider`:
  - Deterministic in-memory delivery tracker with realistic mock message IDs.
  - Configurable simulation modes: `SUCCESS`, `TRANSIENT_FAILURE`, `PERMANENT_FAILURE`, `RATE_LIMITED`.
  - Latency simulation for realistic queue testing.
- Define `TwilioSmsAdapter` scaffold with `.env.example` placeholders; marks status `NOT_CONFIGURED` if credentials are absent.

### Step 3: Notification Eligibility Policy & Relevance Engine
- Implement `NotificationPolicyService` in `apps/api/src/services/notifications/`:
  - Evaluates event active status and freshness.
  - Verifies location relevance using `LocationRelevanceService` (10 km radius for location, destination, active route).
  - Checks user consent, channel enablement, and severity threshold.
  - Evaluates deduplication key (`userId + eventId + alertType + severity`).
  - Allows escalation bypass when severity increases.

### Step 4: Asynchronous Notification Queue & Worker
- Implement `NotificationQueueService`:
  - Manages in-memory FIFO queue with worker processing loop.
  - Handles transient error retries with exponential backoff.
  - Tracks delivery states and transitions.
  - Maintains delivery audit log with privacy-masked recipient records.

### Step 5: User Preferences & History Service
- Implement `UserPreferenceService`:
  - In-memory store for user notification preferences, language, and phone numbers.
  - Phone validation using E.164 standards and masking utilities (`+1 (***) ***-2834` / `+91 98*** ***10`).

### Step 6: REST APIs & Admin Endpoints
- In `apps/api/src/modules/alerts/alerts.router.ts`:
  - `GET /api/v1/notifications/preferences`
  - `PUT /api/v1/notifications/preferences`
  - `GET /api/v1/notifications/history`
  - `POST /api/v1/notifications/dispatch`
  - `POST /api/v1/notifications/simulate`
  - `GET /api/v1/admin/notifications/health`
  - `POST /api/v1/admin/notifications/retry/:id`

### Step 7: Frontend Upgrades (`AlertsPage.tsx` & `ProfilePage.tsx`)
- Enhance `AlertsPage.tsx`:
  - Live broadcast feed with delivery status pills (`DELIVERED`, `QUEUED`, `FAILED`).
  - Interactive SMS simulator supporting language selection (`en`, `hi`, `kn`) and live Unicode character/segment counting.
- Enhance `ProfilePage.tsx`:
  - Save and load notification preferences (SMS opt-in, phone number, language, min severity, alert radius).

### Step 8: Comprehensive Verification & Testing
- Write `tests/notifications.test.ts`:
  - Test notification eligibility policy, radius checks, and cooldown suppression.
  - Test escalation bypass.
  - Test mock SMS provider in all simulation modes.
  - Test Unicode segmentation for Hindi and Kannada.
  - Test phone number privacy masking.
  - Test queue asynchronous processing and retry backoff.

### Step 9: Phase 7 Documentation Deliverables
- `docs/NOTIFICATION_POLICY.md`
- `docs/SMS_PROVIDER_SETUP.md`
- `docs/MULTILINGUAL_NOTIFICATIONS.md`
- `docs/PHASE_7_COMPLETION_REPORT.md`

# Phase 4 Implementation Plan — Grok AI Decision Support & Action-Plan Engine

**Document Version**: 1.0.0  
**Phase**: Phase 4  
**Date**: September 2026  
**Status**: IN_PROGRESS  

---

## 1. Executive Overview & Mission

Phase 4 builds the **Grok AI Decision Support Engine** for SmartCity Guardian. The engine accepts verified, structured telemetry and analytical products from the existing data pipelines (Phase 2 real-time feeds, Phase 2 Add-On location/destination/multilingual services, and Phase 3 flood intelligence/predictions) and synthesizes them into:
1. **Contextual Risk Interpretation**: Plain-language synthesis of multi-factor hazards.
2. **Situation Summaries**: High-level operational awareness for commuters and emergency managers.
3. **Citizen Action Plans**: Prioritized, protective safety steps and avoidance instructions.
4. **Authority Action Recommendations**: Actionable municipal guidance (drainage checks, mobile barriers, traffic diversion).
5. **Route-Related Advisories**: `KEEP_ROUTE`, `CONSIDER_ALTERNATIVE`, `REROUTE_REQUIRED` without usurping graph geometry computation.
6. **Multilingual Emergency Messaging**: Concise, localized advisories for push notifications and 160-character SMS in English (`en`), Hindi (`hi`), and Kannada (`kn`).
7. **Explainable AI Justifications**: Fact-anchored reasoning derived strictly from verified telemetry.

### Core Architectural Principle: AI Safety Supremacy
```text
LIVE DATA
   ↓
PHASE 3 FLOOD & TRAFFIC ANALYSIS (Authoritative Deterministic Truth)
   ↓
STRUCTURED SYSTEM CONTEXT (Provenanced & Bounded)
   ↓
GROK AI (Interpretation, Reasoning & Multilingual Communication)
   ↓
BACKEND VALIDATION (Schema, Business Rules, Road Safety Gate)
   ↓
APPLICATION DECISION (Authoritative Enforced State)
   ↓
MAP / CITIZEN UI / EOC OPERATORS / NOTIFICATION PIPELINE
```

**Non-Negotiable Safety Invariants**:
- Grok is **never** the source of physical reality: it cannot invent weather, rainfall, road closures, water depths, or official warnings.
- Grok **cannot** override confirmed backend road closure states (if backend says `BLOCKED`, Grok cannot declare it open).
- Grok **cannot** directly compute or mutate route geometry.
- Grok **cannot** directly dispatch cellular SMS or trigger irreversible municipal sirens.
- Missing data **must** yield `risk_level: "UNKNOWN"` with explicit uncertainty declarations. Unknown is never converted to safe `NORMAL`.
- Stale data **must** degrade confidence and be explicitly flagged.

---

## 2. Component Architecture

### 2.1 Provider Abstraction Layer (`apps/api/src/providers/ai/`)
- `AiProvider`: Pluggable interface for AI decision engines.
- `GrokProvider`: Live production adapter communicating with xAI REST API (`https://api.x.ai/v1/chat/completions`) using Node `fetch`, retry with exponential backoff, timeout abort signals, and circuit breaker protection.
- `MockAiProvider`: Fully deterministic, offline provider generating realistic, schema-valid synthetic responses across all 5 decision modes in `en`, `hi`, and `kn` for automated test suites and mock mode.

### 2.2 Core AI Engine Services (`apps/api/src/services/ai/`)
- `GrokClient`: Low-level HTTP transport to xAI with connection pooling, timeouts, and rate-limiting backoff (HTTP 429).
- `GrokPromptBuilder`: Builds isolated system instructions, provenanced context summaries, and mode-specific user prompts. Enforces strict prompt injection boundaries by isolating untrusted citizen text.
- `GrokResponseValidator`: 4-stage validation pipeline:
  1. *JSON Parsing*: Rejection of malformed or non-JSON payloads.
  2. *Schema Validation*: Strict Zod parsing verifying enums, types, and array lengths.
  3. *Business Rule Validation*: Verifying road state consistency against backend ground truth.
  4. *Safety Gating*: Flagging unverified claims (`AI_UNVERIFIED_CLAIM`) and calculating reconciled `decision_confidence = min(system_confidence, ai_confidence)`.
- `GrokFallbackService`: Deterministic rule-based fallback generator producing localized action plans in `en`, `hi`, and `kn` if Grok is offline, times out, or fails validation.
- `GrokAIContextBuilder`: Compiles canonical system context from Phase 2 and Phase 3 services with full provenance tracking and freshness classification (`LIVE`, `RECENT`, `STALE`, `EXPIRED`, `MOCK`).
- `GrokDecisionService`: Primary orchestrator coordinating context construction, context hashing (`SHA-256`), TTL caching (60s), provider invocation, validation, database persistence, and event broadcasting.

### 2.3 Shared Type System & Schemas (`packages/shared/src/`)
- `AiDecisionMode`: `'CITY_OVERVIEW' | 'CITIZEN_SAFETY' | 'ROUTE_ASSESSMENT' | 'EVENT_SUMMARY' | 'ALERT_GENERATION'`
- `RouteRecommendationAction`: `'KEEP_ROUTE' | 'CONSIDER_ALTERNATIVE' | 'REROUTE_REQUIRED' | 'NO_ROUTE_RECOMMENDATION'`
- `NotificationPriority`: `'INFO' | 'WARNING' | 'URGENT' | 'NONE'`
- `CanonicalAIContext`: Standardized context envelope with source provenance.
- `GrokDecisionOutputSchema`: Strict Zod schema enforcing typed outputs, bounded strings, and valid enums.

### 2.4 REST & WebSocket API
- Endpoints:
  - `POST /api/v1/ai/analyze`: Execute structured AI decision analysis across any of the 5 modes.
  - `POST /api/v1/ai/decide`: Legacy/standard endpoint with automatic fallback.
  - `GET /api/v1/ai/latest`: Retrieve most recent decision for city overview or current user.
  - `GET /api/v1/ai/decisions/:id`: Retrieve historical decision by UUID for auditing.
- WebSocket Streaming:
  - Topic: `realtime:ai`
  - Events: `AI_ANALYSIS_REQUESTED`, `AI_ANALYSIS_COMPLETED`, `AI_ANALYSIS_FAILED`, `AI_DECISION_UPDATED`.
  - Asynchronous background processing: AI analysis is triggered on material flood state transitions (`FLOOD_STATE_CHANGED`) without blocking the real-time data pipeline.

### 2.5 User Interface Enhancements
- **Citizen Dashboard** (`DashboardPage.tsx`):
  - "AI Safety Summary" card displaying current synthesized risk, situation overview, plain-language explanation ("Why"), citizen protective actions, and route advisories in citizen's selected language.
  - Excludes raw prompts, API tokens, and internal technical debug fields.
- **Admin/EOC Dashboard** (`AdminPage.tsx`):
  - "Grok Decision Support & Audit" panel displaying risk interpretation, municipal action recommendations, roads to avoid, dual-confidence metrics (`system` vs `ai`), telemetry freshness, model version, execution latency, and fallback status.

---

## 3. Decision Modes Breakdown

| Mode | Target Audience | Primary Inputs | Core Output |
| :--- | :--- | :--- | :--- |
| `CITY_OVERVIEW` | EOC Operators & General Public | Citywide flood score, rainfall rate, catchment basins, traffic index, active events | Situation overview, high-risk sectors, municipal operations checklist |
| `CITIZEN_SAFETY` | Commuters & Residents | User GPS coordinates, 10km radius hazard intersection, saved destination, preferred language | Plain-language safety instructions, roads to avoid, localized guidance |
| `ROUTE_ASSESSMENT` | Active Commuters | Traversed road segments, flood polygon intersections, traffic congestion | `KEEP_ROUTE`, `CONSIDER_ALTERNATIVE`, or `REROUTE_REQUIRED` with factual reasons |
| `EVENT_SUMMARY` | Operations & Push Pipeline | State change event (`WARNING` $\to$ `CRITICAL`), delta metrics, affected basin | Rapid situational brief, escalation priority, notification requirement |
| `ALERT_GENERATION` | Multilingual Alerting | Event severity, user location, language (`en`, `hi`, `kn`) | 160-char emergency SMS and rich push notification text |

---

## 4. Verification & Testing Strategy

1. **Schema & Validation Tests**: Verify valid JSON acceptance, malformed JSON rejection, invalid enum rejection, and string length bounds.
2. **Safety Invariant Tests**: Verify backend road closure state cannot be overridden by AI; verify missing telemetry forces `risk_level: UNKNOWN`.
3. **Fallback Tests**: Verify deterministic fallback activation on network timeout, HTTP 500, HTTP 429, or schema validation failure.
4. **Multilingual Tests**: Verify accurate prompt generation and localized fallback templates in `en`, `hi`, and `kn`.
5. **Cache & Rate-Limit Tests**: Verify identical contexts reuse cached decisions via SHA-256 hash without invoking the provider.
6. **Prompt Injection Tests**: Verify malicious strings in citizen reports are treated strictly as data, not instructions.
7. **Regression Guarantee**: Ensure all 86 tests from Phases 1, 2, and 3 continue to pass 100%.

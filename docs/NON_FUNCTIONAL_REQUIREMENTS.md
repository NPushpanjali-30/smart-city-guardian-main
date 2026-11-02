# Non-Functional Requirements (NFR) Specification

**Document Version**: 1.0.0  
**Status**: Approved Specification  
**Project**: SmartCity Guardian  

---

## 1. Overview

Non-Functional Requirements establish the operational qualities, architectural constraints, security benchmarks, and performance standards required for the SmartCity Guardian platform.

---

## 2. Performance & Responsiveness

| Metric | Target SLA | Strategy / Enforcement |
| :--- | :--- | :--- |
| **API Response Time** | $< 500\text{ ms}$ (95th percentile) for core synchronous endpoints (`/health`, `/roads`, `/alerts`). | Efficient database indexing, Redis query caching, zero synchronous calls to blocking external APIs. |
| **Route Calculation Latency** | $< 1000\text{ ms}$ for safety-weighted path calculation across urban graph. | Pre-weighted segment graph cached in memory or fast spatial query. |
| **Real-Time Map Streaming** | $< 2\text{ s}$ latency from event ingestion to client UI rendering. | WebSocket broadcast or Server-Sent Events (SSE) with selective payload delta compression. |
| **External API Ingestion** | Fully asynchronous background workers. | Scheduled background jobs isolate API latency from citizen request-response loops. |

---

## 3. Reliability & Fault Tolerance

- **Provider Failure Isolation**:
  A failure or timeout in an external weather, traffic, SMS, or AI provider must never crash the application or prevent core navigation services from functioning.
- **Circuit Breaking & Exponential Backoff**:
  Outbound HTTP calls to external adapters must implement timeouts (max 5000 ms), circuit breakers, and exponential backoff with jitter (initial delay 500 ms, max 3 retries).
- **Stale Data Detection & Degradation**:
  Every observation carries a freshness timestamp. If weather or traffic telemetry exceeds configurable TTL (e.g., weather > 60 min, traffic > 15 min), the system tags data as `STALE`, degrades confidence scores, logs a warning, and surfaces an `UNKNOWN` or conservative risk posture.
- **Deterministic AI Fallback**:
  If the Grok API returns an HTTP 5xx, times out, or yields malformed JSON failing Zod validation, the system falls back to a deterministic rule-based template action plan within $< 10\text{ ms}$.
- **Graceful Shutdown**:
  The application handles `SIGTERM` and `SIGINT`, draining active HTTP connections and flushing logging buffers before process exit.

---

## 4. Security Architecture

- **Password Security**:
  All user credentials must be hashed using `bcrypt` (work factor $\ge 12$) or `Argon2id`. Plaintext passwords must never be logged or persisted.
- **Token & Session Management**:
  Stateless JSON Web Tokens (JWT) signed with HMAC-SHA256 or RS256. Access tokens must feature a short lifespan (15–60 minutes); refresh tokens must be securely stored with rotation and revocation capabilities.
- **Request Validation & Sanitization**:
  Every inbound HTTP request body, query parameter, and path parameter must be parsed and strictly validated using declarative schema engines (Zod). Unknown fields must be stripped.
- **Rate Limiting & Abuse Prevention**:
  Tiered rate limiting enforced at the API gateway layer (e.g., 100 req/min for authenticated users, 20 req/min for anonymous registration/login endpoints).
- **Credential & Secret Protection**:
  Zero secrets or API keys in source control. Environment variables loaded via strict configuration models, with immediate process termination if mandatory production secrets are absent.
- **Audit Logging**:
  Administrative actions (overrides, manual alerts, user role changes) and AI invocations must be immutably recorded in audit logs with timestamp, actor ID, and IP address.

---

## 5. Privacy & Data Minimization

- **Location Data Minimization**:
  Citizen GPS coordinates collected during live routing must be processed in ephemeral memory and discarded upon trip termination. Historical routes must be anonymized or aggregated.
- **PII Protection**:
  Phone numbers and email addresses must be encrypted at rest or masked in non-essential views. SMS logs must display redacted phone numbers (e.g., `+1 (***) ***-1234`) in administrative interfaces.
- **Opt-In & Consent Compliance**:
  SMS dispatch requires affirmative opt-in consent recorded with an audit timestamp and IP address. Opt-out (STOP) requests must immediately halt SMS dispatch.

---

## 6. Scalability & Extensibility

- **Modular Monolith Foundation**:
  Phase 1 deploys as a cohesive modular monolith with explicit boundaries, facilitating future containerized extraction into independent microservices if traffic demands warrant.
- **Geographic Extensibility**:
  Data models and ingestion routines must support multi-city configurations via spatial boundary polygons without requiring code refactoring.
- **Provider Pluggability**:
  All external integrations (Open-Meteo, TomTom, Twilio, Grok) must implement generic TypeScript interfaces, allowing plug-and-play provider substitution.

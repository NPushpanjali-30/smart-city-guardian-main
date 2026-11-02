# System Architecture Specification

**Document Version**: 1.0.0  
**Status**: Approved Architecture  
**Project**: SmartCity Guardian  

---

## 1. Architectural Style: Modular Monolith

For this production-grade academic project, SmartCity Guardian adopts a **Modular Monolith** architecture. 

A distributed microservices architecture introduces significant operational overhead (distributed transactions, service discovery, network latency, distributed tracing) without providing immediate benefits during the initial development lifecycle. Conversely, a tightly coupled monolithic codebase degrades maintainability.

A Modular Monolith provides the optimal balance:
- **Strict Boundary Enforcement**: Each domain module maintains its own services, models, and interfaces.
- **In-Process Communication**: High-throughput, zero-network-latency inter-module function calls.
- **Single Deployment Artifact**: Simplified deployment, debugging, and testing.
- **Microservices-Ready**: Module interfaces are designed with clean DTO contracts, enabling seamless extraction into independent microservices if organizational or scaling requirements emerge in the future.

---

## 2. Logical Architecture Diagram

```text
                                CLIENTS
                                   │
               ┌───────────────────┴───────────────────┐
               │                                       │
          CITIZEN WEB                              ADMIN WEB
        (Map / Safe Route)                     (EOC Command Center)
               │                                       │
               └───────────────────┬───────────────────┘
                                   │
                              API GATEWAY
                     (Auth, Rate Limit, Logging)
                                   │
               ┌───────────────────┼───────────────────┐
               │                   │                   │
            AUTH API            CORE API        WEBSOCKET / SSE
               │                   │                   │
               └───────────────────┼───────────────────┘
                                   │
                            DOMAIN SERVICES
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
  DATA AGGREGATOR             RISK ENGINE              ROUTING ENGINE
(Weather/Traffic Worker)   (Multi-Factor Score)   (Safety-Weighted Solver)
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
                          AI DECISION ENGINE
                                   │
                            GROK API CLIENT
                        (Zod Schema Validation)
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        │                                                     │
   NOTIFICATION SERVICE                                MAP / CLIENT
   (Deduplicated SMS)                                    BROADCAST
        │                                                     │
   Twilio / SMS                                         WebSocket Client
                                   │
                         PERSISTENCE & STATE
                                   │
               ┌───────────────────┴───────────────────┐
               │                                       │
      PostgreSQL + PostGIS                           Redis
 (Spatial Geometries, History)               (Live State & Caches)
```

---

## 3. Module Boundaries & Responsibilities

The backend is structured into decoupled domain modules under `apps/api/src/modules/`:

| Module | Core Responsibility | Key Inbound / Outbound Dependencies |
| :--- | :--- | :--- |
| **`auth`** | User registration, JWT creation, password hashing, RBAC middleware. | Depends on: Database. Used by: All protected endpoints. |
| **`users`** | Citizen profile management, saved geographic locations, notification opt-in. | Depends on: Database, `auth`. |
| **`weather`** | Ingests and normalizes meteorological observations and forecasts via `WeatherProvider`. | Ingests from external provider; stores raw state in Redis/DB; feeds `floods`. |
| **`traffic`** | Ingests road congestion, average speeds, and incidents via `TrafficProvider`. | Ingests from external provider; feeds `roads` and `routing`. |
| **`floods`** | Executes multi-factor hydrological risk scoring; tracks flood zones. | Consumes `weather` and `reports`; feeds `roads`, `ai`, `alerts`. |
| **`roads`** | Maintains road segments with spatial geometries, computing accessibility state (`OPEN`, `CAUTION`, `HIGH_RISK`, `BLOCKED`). | Consumes `floods` and `traffic`; feeds `routing` and `ai`. |
| **`routing`** | Solves safety-weighted paths between origin and destination; performs dynamic rerouting. | Consumes `roads`; computes cost function; filters blocked segments. |
| **`ai`** | Prepares structured environmental context, queries Grok API, validates schema, handles fallback. | Consumes `floods`, `roads`, `traffic`; feeds `alerts` and `admin`. |
| **`alerts`** | Manages notification queues, deduplication windows, and SMS dispatches via `SmsProvider`. | Consumes `ai` and `floods`; dispatches via SMS. |
| **`reports`** | Handles citizen flood and hazard submissions; manages review lifecycle. | Feeds `floods` and `roads`. |
| **`admin`** | Provides EOC operators with city-wide metrics, system health, and manual overrides. | Aggregates all domain modules. |
| **`health`** | Provides system health checks, version information, and readiness probes. | Standalone diagnostics. |

---

## 4. Cross-Cutting Concerns

1. **Configuration System**:
   Centralized typed configuration module (`apps/api/src/config/`) validating environment variables at startup via Zod. Gracefully enables safe development mock modes when external credentials are not supplied.
2. **Structured Observability**:
   Unified logger producing structured JSON output with `timestamp`, `request_id`, `correlation_id`, `service`, `level`, and execution duration (`duration_ms`).
3. **Error Handling Strategy**:
   RFC 7807 compliant problem details JSON for client error responses, preventing internal stack traces from leaking to clients while logging full forensic contexts internally.
4. **Data Isolation**:
   No module directly queries another module's raw database tables. Inter-module communication occurs strictly via exported TypeScript service interfaces and strongly typed DTOs.

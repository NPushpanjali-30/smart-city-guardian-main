# Smart City Guardian: Production Deployment Guide

## 1. Architectural Overview & Deployment Topologies

Smart City Guardian is engineered as a cloud-native, software-first resilient platform designed for zero-downtime urban flood mobility and emergency routing. The deployment architecture guarantees deterministic route continuity, real-time alert broadcasting, and multi-factor explainable AI safety scoring under harsh network conditions.

```
                      +-----------------------------+
                      |   Citizen Browser / Mobile   |
                      |   EOC Operator Dashboard    |
                      +--------------+--------------+
                                     |
                                     | HTTPS / WSS (Port 80/443)
                                     v
                  +-----------------------------------+
                  |         Nginx Ingress / Web       |
                  |  - Static Assets Cache (1-year)   |
                  |  - Reverse Proxy /api/ -> :4000   |
                  |  - WebSocket Upgrade /ws -> :4000 |
                  |  - Security & Anti-Sniff Headers  |
                  +------------------+----------------+
                                     |
                                     | Internal HTTP/WS Network
                                     v
                  +-----------------------------------+
                  |      Smart City Guardian API      |
                  |  - Express 4.21 Application Core  |
                  |  - Real-Time WS Server (/ws)      |
                  |  - Dijkstra Routing & Flood Graph |
                  |  - Grok AI Engine & Fallbacks     |
                  |  - Notification SMS Queue & Dedup |
                  +------------------+----------------+
                                     |
                       +-------------+-------------+
                       |                           |
                       v                           v
        +----------------------------+   +----------------------------+
        |     PostgreSQL / PostGIS   |   |        Redis Broker        |
        |  (Geospatial & Active Log) |   | (Pub/Sub & Token Storage)  |
        +----------------------------+   +----------------------------+
```

### Supported Topologies

| Topology | Use Case | Components | Target SLA |
|---|---|---|---|
| **Docker Compose** | Single-host server, Edge EOC workstation, Stage/QA | API + Nginx Web + Mock/Postgres | 99.9% availability |
| **Kubernetes (K8s)** | Highly-available multi-zone cloud cluster | Ingress-Nginx, Deployment (API), Deployment (Web), StatefulSet (DB/Redis) | 99.99% availability |
| **Bare-Metal Node.js** | Low-overhead dedicated command center hardware | Systemd services (`api`, `web`) with local Nginx | 99.95% availability |

---

## 2. Environment Variables & Secret Specification

The platform utilizes strong compile-time and runtime validation through Zod schemas defined in [apps/api/src/config/index.ts](file:///Volumes/maha/smart%20city%20guardian/apps/api/src/config/index.ts). Invalid production configurations prevent application boot to avoid misconfigured or insecure states.

| Variable | Type | Default | Description | Required in Prod? |
|---|---|---|---|---|
| `NODE_ENV` | String | `development` | Runtime environment (`development`, `test`, `production`). | **Yes** (`production`) |
| `PORT` | Number | `4000` | Port on which the API Express server and WebSocket listener bind. | Optional |
| `HOST` | String | `0.0.0.0` | Network interface binding. Must be `0.0.0.0` in containerized environments. | Recommended |
| `CORS_ORIGIN` | String | `http://localhost:5173` | Allowed CORS origins for browser fetch/API calls. Comma-separated or single domain. | **Yes** |
| `MOCK_MODE` | Boolean | `true` | `false` in production to engage live databases and production third-party APIs. | **Yes** (`false` / `true` during rehearsal) |
| `DATABASE_URL` | String | `postgresql://...` | Connection URI for PostgreSQL/PostGIS geospatial datastore. | Required if `MOCK_MODE=false` |
| `REDIS_URL` | String | `redis://...` | Connection URI for Redis broker (pub/sub & caching). | Required if `MOCK_MODE=false` |
| `JWT_SECRET` | String | *Min 16 chars* | Cryptographic key for citizen authentication and operator session signing. | **Yes** (Strictly >= 32 chars recommended) |
| `GROK_API_KEY` | String | `mock-grok-api-key` | xAI Grok API key for natural-language routing reasoning and explainable hazard summaries. | Optional (Falls back deterministically if omitted) |
| `GROK_MODEL` | String | `grok-2-latest` | Model version for AI inference. | Optional |
| `GROK_TIMEOUT_MS` | Number | `5000` | Timeout window before engaging deterministic local heuristic scoring. | Optional |
| `GROK_MAX_RETRIES`| Number | `2` | Retry attempts before circuit breaker engagement. | Optional |
| `GROK_ENABLED` | Boolean | `true` | Master toggle for Grok AI calls. When `false`, uses local deterministic engine. | Optional |
| `AI_PROVIDER` | String | `mock` | `grok` or `mock`. | Recommended |
| `WEATHER_PROVIDER`| String| `mock` | `open_meteo` or `mock`. | Recommended |
| `TRAFFIC_PROVIDER`| String| `mock` | `tomtom`, `mock`. | Recommended |
| `SMS_PROVIDER` | String | `mock` | `twilio` or `mock`. | Recommended |
| `TWILIO_ACCOUNT_SID`| String| None | Twilio account identifier. | Required if `SMS_PROVIDER=twilio` |
| `TWILIO_AUTH_TOKEN` | String| None | Twilio authentication token. | Required if `SMS_PROVIDER=twilio` |
| `TWILIO_FROM_NUMBER`| String| None | Authorized originating phone number or sender ID. | Required if `SMS_PROVIDER=twilio` |
| `ALERT_RADIUS_KM` | Number | `10` | Default geographic radial envelope for geo-targeted emergency alerts. | Optional |
| `LOCATION_UPDATE_INTERVAL_SECONDS` | Number | `60` | Minimum throttle interval between citizen GPS telemetry syncs. | Optional |
| `LOCATION_MIN_MOVEMENT_METERS` | Number | `250` | Distance delta threshold required before triggering route re-calculation. | Optional |
| `DEFAULT_LANGUAGE` | String | `en` | Fallback language for SMS alerts (`en`, `hi`, `kn`). | Optional |

---

## 3. Containerization Architecture

The repository provides multi-stage, hardened Docker configurations adhering to CIS Docker Benchmarks:

### 3.1 API Container: `Dockerfile.api`
- **Builder Stage**: Node 20 Alpine. Installs all monorepo dependencies, compiles TypeScript packages (`@smartcity/shared`, `@smartcity/api`), and strips development tooling.
- **Runtime Stage**: Node 20 Alpine minimal base.
- **Least Privilege**: Runs as unprivileged system user `smartcity` (UID 10001, GID 10001). No root processes permitted.
- **Embedded Health Probe**: Executes `curl -f http://localhost:4000/health/live || exit 1` every 15 seconds.

### 3.2 Web Frontend Container: `Dockerfile.web`
- **Builder Stage**: Node 20 Alpine. Builds the React/TypeScript/Vite web application bundle into production minified HTML/JS/CSS assets.
- **Runtime Stage**: Nginx 1.27 Alpine. Copies pre-built assets to `/usr/share/nginx/html` and mounts the custom reverse proxy configuration [nginx/nginx.conf](file:///Volumes/maha/smart%20city%20guardian/nginx/nginx.conf).
- **Embedded Health Probe**: Queries `curl -f http://localhost:80/health || exit 1` every 15 seconds.

### 3.3 Reverse Proxy & WebSocket Upgrades: `nginx/nginx.conf`
- **Static Assets**: Implements 1-year immutable caching (`max-age=31536000, immutable`) for content-hashed `.js`, `.css`, `.woff2`, and image artifacts.
- **SPA Routing**: Resolves client-side navigation via `try_files $uri $uri/ /index.html`.
- **API Proxy**: Routes `/api/` directly to backend container `http://api:4000/api/` with proxy buffering disabled for streaming responses.
- **WebSocket Gateway**: Routes `/ws` with headers `Upgrade $http_upgrade` and `Connection "upgrade"` with extended `proxy_read_timeout 3600s` to prevent connection drops on persistent telemetry channels.
- **Hardened Security Headers**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `X-XSS-Protection: "1; mode=block"`
  - `Referrer-Policy: "strict-origin-when-cross-origin"`

---

## 4. Kubernetes Probing Specifications

To ensure zero downtime deployments and automatic cluster self-healing, the API exposes differentiated probe endpoints:

### 4.1 Liveness Probe (`GET /health/live`)
- **Purpose**: Verifies that the Node.js event loop is responsive and HTTP thread pool is not deadlocked.
- **Execution Budget**: $< 5\text{ms}$.
- **Failure Consequence**: Kubernetes restarts the pod (Kubelet sends SIGTERM followed by SIGKILL).
- **Recommended Pod Spec**:
  ```yaml
  livenessProbe:
    httpGet:
      path: /health/live
      port: 4000
    initialDelaySeconds: 5
    periodSeconds: 10
    timeoutSeconds: 2
    failureThreshold: 3
  ```

### 4.2 Readiness Probe (`GET /health/ready`)
- **Purpose**: Verifies that the internal road graph topology is populated, Dijkstra routing tables are loaded, and the notification dispatch queue is initialized.
- **Execution Budget**: $< 50\text{ms}$.
- **Failure Consequence**: Kubernetes temporarily removes the pod from the Service load-balancing pool without restarting it. Traffic resumes once readiness condition returns HTTP 200.
- **Recommended Pod Spec**:
  ```yaml
  readinessProbe:
    httpGet:
      path: /health/ready
      port: 4000
    initialDelaySeconds: 5
    periodSeconds: 5
    timeoutSeconds: 3
    failureThreshold: 2
  ```

---

## 5. Deployment Step-by-Step Execution

### 5.1 Docker Compose Deployment (Recommended for Quick Production)

1. **Clone & Configure**:
   ```bash
   git clone <repository_url>
   cd "smart city guardian"
   cp .env.example .env
   # Edit .env with production credentials (JWT_SECRET, TWILIO_*, GROK_API_KEY)
   ```

2. **Build and Launch Orchestrated Stack**:
   ```bash
   docker compose up -d --build
   ```

3. **Verify Service Health**:
   ```bash
   docker compose ps
   # Inspect container logs
   docker compose logs -f api
   ```

4. **Test External Connectivity**:
   ```bash
   curl -i http://localhost/health
   curl -i http://localhost/api/v1/health
   curl -i http://localhost/health/ready
   ```

5. **Stop / Restart Gracefully**:
   ```bash
   docker compose down
   ```

---

### 5.2 Bare-Metal Node.js Deployment (Systemd)

1. **Install Prerequisites**: Node.js >= 20.10.0, npm >= 10.0.0.
2. **Build Workspace**:
   ```bash
   npm ci
   npm run build
   ```
3. **Configure Systemd Unit** (`/etc/systemd/system/smartcity-api.service`):
   ```ini
   [Unit]
   Description=Smart City Guardian API Server
   After=network.target

   [Service]
   Type=simple
   User=smartcity
   WorkingDirectory=/opt/smartcity-guardian
   ExecStart=/usr/bin/node apps/api/dist/server.js
   Restart=always
   RestartSec=5
   Environment=NODE_ENV=production
   Environment=PORT=4000
   LimitNOFILE=65536

   [Install]
   WantedBy=multi-user.target
   ```
4. **Enable & Start**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable smartcity-api
   sudo systemctl start smartcity-api
   ```

---

## 6. Resource Sizing & Capacity Guidelines

| Component | Minimum (Idle/Baseline) | Recommended (Crisis Operations) | Scaling Metric |
|---|---|---|---|
| **API Container** | 0.5 vCPU, 512 MB RAM | 2.0 vCPU, 2048 MB RAM | Scale out at > 70% CPU or > 100 active WS connections/pod |
| **Web Container** | 0.2 vCPU, 128 MB RAM | 0.5 vCPU, 256 MB RAM | Static Nginx serving; 1 pod per 5,000 req/sec |
| **Redis Broker** | 0.5 vCPU, 256 MB RAM | 1.0 vCPU, 1024 MB RAM | Scale memory if route state cache exceeds 100k active sessions |
| **PostgreSQL** | 1.0 vCPU, 1024 MB RAM | 4.0 vCPU, 8192 MB RAM | IOPS >= 3,000 for high-frequency GPS coordinate persistence |

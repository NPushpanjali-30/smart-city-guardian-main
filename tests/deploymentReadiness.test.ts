import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config/index.js';
import { dataAggregator } from '../apps/api/src/services/dataAggregator.js';
import { RealtimeWebSocketServer } from '../apps/api/src/websocket/wsServer.js';

describe('Phase 10: Production Readiness, Deployment & Container Health Probes', () => {
  let server: http.Server;
  let wsServer: RealtimeWebSocketServer;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp();
    server = http.createServer(app);
    wsServer = new RealtimeWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    wsServer.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('1. Kubernetes Liveness & Readiness Probes', () => {
    it('GET /health/live should return 200 OK for container liveness check', async () => {
      const res = await fetch(`${baseUrl}/health/live`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.probe).toBe('liveness');
      expect(body.service).toBe('smartcity-guardian-api');
      expect(body.timestamp).toBeDefined();
    });

    it('GET /health/ready should return 200 OK and confirm readiness of road network and routing engine', async () => {
      const res = await fetch(`${baseUrl}/health/ready`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('ready');
      expect(body.probe).toBe('readiness');
      expect(body.details.roadNetworkSegments).toBeGreaterThan(0);
      expect(body.details.routingEngineReady).toBe(true);
      expect(body.details.notificationQueueActive).toBe(true);
    });

    it('GET /api/v1/health should provide operational health metrics across dependencies', async () => {
      const res = await fetch(`${baseUrl}/api/v1/health`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(body.components.grokAi.status).toBe('up');
    });

    it('GET /api/v1/version should report runtime environment and capability inventory', async () => {
      const res = await fetch(`${baseUrl}/api/v1/version`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.service).toBe('smartcity-guardian-api');
      expect(body.nodeVersion).toBeDefined();
      expect(body.capabilities).toContain('multi_factor_flood_scoring');
      expect(body.capabilities).toContain('safety_weighted_routing');
      expect(body.capabilities).toContain('grok_ai_decision_support_with_fallback');
      expect(body.capabilities).toContain('deduplicated_sms_alerts');
    });
  });

  describe('2. Containerization Artifacts & Orchestration Integrity', () => {
    it('Dockerfile.api should exist and specify multi-stage non-root build with healthcheck', () => {
      const dockerfilePath = path.resolve(process.cwd(), 'Dockerfile.api');
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      const content = fs.readFileSync(dockerfilePath, 'utf-8');
      expect(content).toContain('FROM node:20-alpine AS builder');
      expect(content).toContain('FROM node:20-alpine AS runner');
      expect(content).toContain('USER smartcity');
      expect(content).toContain('HEALTHCHECK');
      expect(content).toContain('/health/live');
    });

    it('Dockerfile.web should exist and specify Nginx static serving with healthcheck', () => {
      const dockerfilePath = path.resolve(process.cwd(), 'Dockerfile.web');
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      const content = fs.readFileSync(dockerfilePath, 'utf-8');
      expect(content).toContain('FROM nginx:1.27-alpine AS runner');
      expect(content).toContain('HEALTHCHECK');
      expect(content).toContain('/etc/nginx/conf.d/default.conf');
    });

    it('docker-compose.yml should orchestrate API and Web services with resource limits', () => {
      const composePath = path.resolve(process.cwd(), 'docker-compose.yml');
      expect(fs.existsSync(composePath)).toBe(true);

      const content = fs.readFileSync(composePath, 'utf-8');
      expect(content).toContain('smartcity-guardian-api');
      expect(content).toContain('smartcity-guardian-web');
      expect(content).toContain('smartcity-net');
      expect(content).toContain('healthcheck');
      expect(content).toContain('resources');
    });

    it('nginx/nginx.conf should configure reverse proxy for /api/, /ws, and SPA routing', () => {
      const nginxPath = path.resolve(process.cwd(), 'nginx/nginx.conf');
      expect(fs.existsSync(nginxPath)).toBe(true);

      const content = fs.readFileSync(nginxPath, 'utf-8');
      expect(content).toContain('proxy_pass http://api:4000/api/');
      expect(content).toContain('proxy_pass http://api:4000/ws;');
      expect(content).toContain('Upgrade $http_upgrade;');
      expect(content).toContain('try_files $uri $uri/ /index.html;');
      expect(content).toContain('gzip on;');
    });
  });

  describe('3. Production Configuration & Environment Validation', () => {
    it('should validate core production configurations with safe fallback parameters', () => {
      expect(config.PORT).toBeGreaterThan(0);
      expect(config.HOST).toBeDefined();
      expect(config.ALERT_RADIUS_KM).toBeGreaterThan(0);
      expect(config.DEFAULT_LANGUAGE).toMatch(/^(en|hi|kn)$/);
      expect(config.JWT_SECRET.length).toBeGreaterThanOrEqual(16);
      expect(typeof config.MOCK_MODE).toBe('boolean');
    });
  });

  describe('4. Graceful Shutdown & Connection Draining', () => {
    it('dataAggregator background workers should cleanly start and stop without dangling handles', () => {
      dataAggregator.startBackgroundWorkers();
      expect(() => dataAggregator.stopBackgroundWorkers()).not.toThrow();
    });
  });
});

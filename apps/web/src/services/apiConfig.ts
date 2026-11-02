import { Capacitor } from '@capacitor/core';

export const DEFAULT_GLOBAL_CLOUD_URL = 'https://cleaner-certificates-nuclear-labour.trycloudflare.com';
export const DEFAULT_HOST_IP = '192.168.0.120';
export const DEFAULT_HOST_PORT = '4000';
export const DEFAULT_EMULATOR_IP = '10.0.2.2';

// Automatic cache sanitization: if any stale local IP or localhost URL was cached on mobile, purge it
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('scg_api_server_url');
    if (saved && (saved.includes('localhost') || saved.includes('127.0.0.1') || saved.includes('192.168.') || saved.includes('10.0.2.'))) {
      localStorage.removeItem('scg_api_server_url');
    }
  } catch {}
}

/**
 * Retrieves user-configured server URL from localStorage if set
 */
export function getConfiguredServerUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem('scg_api_server_url') || '').trim();
  } catch {
    return '';
  }
}

/**
 * Persists user-configured server URL in localStorage
 */
export function setConfiguredServerUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = (url || '').trim().replace(/\/+$/, '');
    if (trimmed) {
      localStorage.setItem('scg_api_server_url', trimmed);
    } else {
      localStorage.removeItem('scg_api_server_url');
    }
  } catch {}
}

/**
 * Resolves the backend API base URL dynamically based on environment:
 * - Capacitor Android (Native / Emulator / Physical device)
 * - Vite Local Dev (port 5173 -> proxies to 4000)
 * - Production / Deployed environment
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_GLOBAL_CLOUD_URL;

  // 1. User configured server URL in localStorage (highest priority for physical devices)
  try {
    const custom = localStorage.getItem('scg_api_server_url');
    if (custom && custom.trim()) {
      const clean = custom.trim().replace(/\/+$/, '');
      // If user accidentally configured localhost on a native phone, redirect to cloud endpoint
      const isNative = Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android';
      if (isNative && (clean.includes('localhost') || clean.includes('127.0.0.1'))) {
        return DEFAULT_GLOBAL_CLOUD_URL;
      }
      return clean;
    }
  } catch {}

  // 2. Explicit env variable (if injected at build time)
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl) return envUrl;

  // 3. Capacitor Native Android Detection (Works across Cellular 4G/5G, Wi-Fi, and Emulators)
  if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
    const host = window.location.hostname;
    // Android emulator uses 10.0.2.2; physical phones on ANY network default to Universal Global Cloud URL
    if (!host || host === 'localhost' || host === '127.0.0.1') {
      return DEFAULT_GLOBAL_CLOUD_URL;
    }
    return `http://${host}:${DEFAULT_HOST_PORT}`;
  }

  // 4. Web Browser Dev Port
  if (window.location.port === '5173') {
    return `http://${window.location.hostname}:${DEFAULT_HOST_PORT}`;
  }

  // 5. Standard relative URL for same-origin production hosting
  return '';
}

/**
 * Resolves the WebSocket URL dynamically with zero-latency fallback
 */
export function getWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    const clean = DEFAULT_GLOBAL_CLOUD_URL.replace(/^https?:\/\//, '');
    return `wss://${clean}/ws`;
  }

  // 1. User configured ws or api server in localStorage
  try {
    const customWs = localStorage.getItem('scg_ws_server_url');
    if (customWs && customWs.trim()) return customWs.trim();

    const customApi = localStorage.getItem('scg_api_server_url');
    if (customApi && customApi.trim()) {
      const clean = customApi.trim().replace(/\/+$/, '');
      const isNative = Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android';
      const effective = (isNative && (clean.includes('localhost') || clean.includes('127.0.0.1')))
        ? DEFAULT_GLOBAL_CLOUD_URL
        : clean;
      const wsProtocol = effective.startsWith('https://') ? 'wss://' : 'ws://';
      const hostPart = effective.replace(/^https?:\/\//, '');
      return `${wsProtocol}${hostPart}/ws`;
    }
  } catch {}

  const envWs = (import.meta as any).env?.VITE_WS_URL;
  if (envWs) return envWs;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
    const host = window.location.hostname;
    if (!host || host === 'localhost' || host === '127.0.0.1') {
      const clean = DEFAULT_GLOBAL_CLOUD_URL.replace(/^https?:\/\//, '');
      return `wss://${clean}/ws`;
    }
    return `ws://${host}:${DEFAULT_HOST_PORT}/ws`;
  }

  if (window.location.port === '5173') {
    return `${protocol}//${window.location.hostname}:${DEFAULT_HOST_PORT}/ws`;
  }

  return `${protocol}//${window.location.host}/ws`;
}

// Global fetch patch for Capacitor Native Android so relative /api/... calls resolve to the target host IP
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      const base = getApiBaseUrl();
      if (base) {
        input = `${base}${input}`;
      }
    }
    return originalFetch.call(this, input, init);
  };
}

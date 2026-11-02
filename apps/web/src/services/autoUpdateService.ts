import { getApiBaseUrl } from './apiConfig';

export interface AppVersionInfo {
  version: string;
  versionCode: number;
  releaseNotes?: string;
  mandatory?: boolean;
}

export type UpdateListener = (info: AppVersionInfo) => void;

class AutoUpdateService {
  public readonly CURRENT_VERSION = '2.0.0';
  private latestVersion: AppVersionInfo | null = null;
  private listeners: Set<UpdateListener> = new Set();
  private checkInterval?: any;
  private isUpdating = false;

  constructor() {
    this.init();
  }

  public init(): void {
    // Disabled as requested: no auto-update reloads or notifications
  }

  public onUpdateAvailable(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    if (this.latestVersion) {
      listener(this.latestVersion);
    }
    return () => this.listeners.delete(listener);
  }

  public async checkForUpdates(): Promise<void> {
    try {
      const apiBase = getApiBaseUrl();
      const timestamp = Date.now();

      // Check version from API or static version.json
      let res = await fetch(`${apiBase}/api/v1/app/version?_t=${timestamp}`, {
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch(`/version.json?_t=${timestamp}`, {
          signal: AbortSignal.timeout(3000),
        }).catch(() => null);
      }

      if (res && res.ok) {
        const data = await res.json();
        if (data.version && this.isNewerVersion(data.version, this.CURRENT_VERSION)) {
          this.triggerUpdateNotification({
            version: data.version,
            versionCode: data.versionCode || 201,
            releaseNotes: data.releaseNotes,
            mandatory: data.mandatory ?? true,
          });
        }
      }
    } catch {
      // ignore network errors
    }
  }

  private isNewerVersion(remote: string, current: string): boolean {
    const rParts = remote.split('.').map((n) => parseInt(n, 10) || 0);
    const cParts = current.split('.').map((n) => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
      const r = rParts[i] || 0;
      const c = cParts[i] || 0;
      if (r > c) return true;
      if (r < c) return false;
    }
    return false;
  }

  private triggerUpdateNotification(info: AppVersionInfo): void {
    this.latestVersion = info;
    this.listeners.forEach((l) => {
      try {
        l(info);
      } catch {}
    });
  }

  public stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  public applyUpdate(): void {
    if (this.isUpdating) return;
    this.isUpdating = true;

    // Instruct Service Worker to skip waiting
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }

    // Cache-busting hard reload
    setTimeout(() => {
      window.location.reload();
    }, 600);
  }
}

export const autoUpdateService = new AutoUpdateService();

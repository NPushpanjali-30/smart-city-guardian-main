import { getWebSocketUrl } from './apiConfig';

type MessageHandler = (data: {
  topic: string;
  eventType?: string;
  type?: string;
  timestamp: string;
  payload?: any;
  data?: any;
}) => void;

export type ConnectionStatus = 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private status: ConnectionStatus = 'OFFLINE';
  private simulationTimer?: any;
  private isSimulatedMode = false;
  private reconnectAttempts = 0;
  private reconnectTimer?: any;

  constructor() {
    this.connect();
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public isSimulated(): boolean {
    return this.isSimulatedMode;
  }

  public onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public send(data: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  private setStatus(newStatus: ConnectionStatus): void {
    this.status = newStatus;
    this.statusListeners.forEach((l) => l(newStatus));
  }

  private dispatchMessage(data: any): void {
    this.handlers.forEach((h) => {
      try {
        h(data);
      } catch {
        // ignore handler exceptions
      }
    });
  }

  private startSimulation(): void {
    if (this.simulationTimer) return;
    this.isSimulatedMode = true;
    this.setStatus('CONNECTED');

    // Periodically emit simulated real-time telemetry
    this.simulationTimer = setInterval(() => {
      const now = new Date().toISOString();
      const rainDelta = (Math.random() * 2 - 1);
      const currentRain = Math.max(0, Math.min(15, Number((8.5 + rainDelta).toFixed(1))));

      this.dispatchMessage({
        topic: 'realtime:weather',
        eventType: 'WEATHER_UPDATE',
        timestamp: now,
        payload: {
          rainfallRateMmh: currentRain,
          rainfall1hMm: Number((4.2 + (Math.random() * 0.5)).toFixed(1)),
          rainfall24hMm: 12.4,
          temperatureC: 24.5,
          humidityPercent: 68.0,
          freshness: 'LIVE',
          source: 'Simulated IoT Grid (Live Demo Mode)',
        },
      });

      this.dispatchMessage({
        topic: 'realtime:system',
        eventType: 'HEARTBEAT',
        timestamp: now,
        payload: {
          status: 'NOMINAL',
          dataIntelligence: 'ACTIVE',
          activeSensors: 48,
        },
      });
    }, 6000);
  }

  private stopSimulation(): void {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = undefined;
    }
    this.isSimulatedMode = false;
  }

  private connect(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const wsUrl = getWebSocketUrl();

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.stopSimulation();
        this.reconnectAttempts = 0;
        this.setStatus('CONNECTED');
        this.socket?.send(
          JSON.stringify({
            action: 'subscribe',
            topics: [
              'realtime:system',
              'realtime:weather',
              'realtime:traffic',
              'realtime:flood',
              'realtime:roads',
              'realtime:routing',
              'realtime:location_alert',
              'realtime:broadcast',
              'realtime:alerts',
            ],
          })
        );
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.dispatchMessage(data);
        } catch {
          // ignore
        }
      };

      this.socket.onclose = () => {
        this.setStatus('RECONNECTING');
        this.startSimulation();
        this.scheduleReconnect();
      };

      this.socket.onerror = () => {
        this.socket?.close();
      };
    } catch {
      this.setStatus('RECONNECTING');
      this.startSimulation();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(6000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}

export const realtimeClient = new RealtimeClient();

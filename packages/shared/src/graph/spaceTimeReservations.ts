import { GraphEdge } from './roadGraph.js';
import { calculateKinematicSpeed } from './hydrodynamicModel.js';

export interface SpaceTimeSlot {
  edgeId: string;
  timeWindowIndex: number; // e.g. 60-second time bins
  reservedVehicles: number;
}

export class SpaceTimeReservationGrid {
  private windowSizeSeconds: number;
  private reservations: Map<string, number> = new Map(); // 'edgeId:windowIndex' -> reservedVehicles

  constructor(windowSizeSeconds = 60) {
    this.windowSizeSeconds = windowSizeSeconds;
  }

  /**
   * Converts an epoch timestamp in seconds to the corresponding discrete time window index.
   */
  public getTimeWindowIndex(epochSeconds: number): number {
    return Math.floor(epochSeconds / this.windowSizeSeconds);
  }

  private makeKey(edgeId: string, windowIndex: number): string {
    return `${edgeId}:${windowIndex}`;
  }

  /**
   * Registers a planned vehicle transit across a link for a predicted arrival-departure window.
   */
  public reserveLinkOccupancy(
    edgeId: string,
    entryTimeEpochSeconds: number,
    exitTimeEpochSeconds: number,
    vehicleWeight = 1
  ): void {
    const startWindow = this.getTimeWindowIndex(entryTimeEpochSeconds);
    const endWindow = this.getTimeWindowIndex(exitTimeEpochSeconds);

    for (let w = startWindow; w <= endWindow; w++) {
      const key = this.makeKey(edgeId, w);
      const current = this.reservations.get(key) || 0;
      this.reservations.set(key, current + vehicleWeight);
    }
  }

  /**
   * Retrieves the anticipated future traffic volume on an edge at a specific future time.
   */
  public getAnticipatedVolume(
    edge: GraphEdge,
    arrivalTimeEpochSeconds: number
  ): number {
    const windowIndex = this.getTimeWindowIndex(arrivalTimeEpochSeconds);
    const key = this.makeKey(edge.id, windowIndex);
    const reservationsInWindow = this.reservations.get(key) || 0;

    // Base current volume + anticipated future reservations
    const currentBase = edge.currentVolume || 0;
    return currentBase + reservationsInWindow;
  }

  /**
   * Forecasts the actual anticipated traversal speed (km/h) when the commuter reaches the link.
   */
  public getAnticipatedSpeedKmh(
    edge: GraphEdge,
    arrivalTimeEpochSeconds: number
  ): number {
    const totalAnticipatedVolume = this.getAnticipatedVolume(edge, arrivalTimeEpochSeconds);
    const lengthKm = Math.max(0.1, edge.lengthMeters / 1000);
    const densityPerKm = totalAnticipatedVolume / lengthKm;

    const baseFreeSpeed = edge.freeFlowSpeedKmh || edge.speedLimitKmh;
    const speed = calculateKinematicSpeed(densityPerKm, baseFreeSpeed);

    // Factor in live traffic score impedance
    const congestionDampener = Math.max(0.2, 1 - (edge.trafficScore / 100) * 0.7);
    return Math.max(5.0, speed * congestionDampener);
  }

  /**
   * Forecasts travel time across the segment at the forecasted arrival timestamp.
   */
  public getAnticipatedTravelTimeSeconds(
    edge: GraphEdge,
    arrivalTimeEpochSeconds: number
  ): number {
    const speedKmh = this.getAnticipatedSpeedKmh(edge, arrivalTimeEpochSeconds);
    const speedMs = (speedKmh * 1000) / 3600;
    return Math.max(1, edge.lengthMeters / speedMs);
  }

  /**
   * Cleans up historic time windows older than the specified cutoff timestamp.
   */
  public pruneExpired(currentEpochSeconds: number): void {
    const currentWindow = this.getTimeWindowIndex(currentEpochSeconds);
    for (const key of this.reservations.keys()) {
      const parts = key.split(':');
      const windowIdx = parseInt(parts[1], 10);
      if (windowIdx < currentWindow - 1) {
        this.reservations.delete(key);
      }
    }
  }

  public clear(): void {
    this.reservations.clear();
  }

  public getAllReservations(): Array<{ edgeId: string; timeWindowIndex: number; vehicleCount: number }> {
    const list: Array<{ edgeId: string; timeWindowIndex: number; vehicleCount: number }> = [];
    for (const [key, count] of this.reservations.entries()) {
      const parts = key.split(':');
      list.push({
        edgeId: parts[0],
        timeWindowIndex: parseInt(parts[1], 10),
        vehicleCount: count,
      });
    }
    return list;
  }
}


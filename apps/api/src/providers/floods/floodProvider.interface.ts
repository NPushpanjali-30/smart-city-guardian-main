import { FloodObservation } from '@smartcity/shared';

export interface FloodProvider {
  readonly name: string;
  readonly isLive: boolean;
  getFloodObservations(areaId?: string): Promise<FloodObservation[]>;
  getFloodZones(areaId?: string): Promise<Array<Record<string, unknown>>>;
}

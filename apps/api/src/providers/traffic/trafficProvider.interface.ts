import { TrafficObservation, TrafficIncident } from '@smartcity/shared';

export interface TrafficProvider {
  readonly name: string;
  readonly isLive: boolean;
  getTrafficFlows(bbox: [number, number, number, number]): Promise<TrafficObservation[]>;
  getIncidents(bbox: [number, number, number, number]): Promise<TrafficIncident[]>;
}

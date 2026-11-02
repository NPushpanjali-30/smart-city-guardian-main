import { RoadSegment } from '@smartcity/shared';

export interface MapProvider {
  readonly name: string;
  readonly isLive: boolean;
  geocode(query: string): Promise<{ latitude: number; longitude: number; formattedAddress: string }>;
  getRoadNetwork(bbox?: [number, number, number, number]): Promise<RoadSegment[]>;
}

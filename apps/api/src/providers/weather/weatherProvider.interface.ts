import { WeatherObservation, WeatherForecast } from '@smartcity/shared';

export interface WeatherProvider {
  readonly name: string;
  readonly isLive: boolean;
  getCurrentWeather(latitude: number, longitude: number): Promise<WeatherObservation>;
  getForecast(latitude: number, longitude: number): Promise<WeatherForecast[]>;
}

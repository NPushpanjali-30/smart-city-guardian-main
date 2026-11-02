import {
  WeatherObservation,
  WeatherForecast,
  FreshnessState,
  PredictionTrend,
  FloodRiskFeatureSet,
} from '../../types/index.js';

export interface RawCitizenReportFeatureInput {
  category: string;
  status: string;
  ageMinutes: number;
  distanceMeters: number;
}

/**
 * 1. Rainfall Features & Acceleration Calculation
 */
export function extractRainfallFeatures(
  current: Pick<WeatherObservation, 'rainfallRateMmh' | 'rainfall1hMm' | 'rainfall24hMm' | 'timestamp' | 'freshness' | 'dataAgeSeconds'>,
  recentHistory: Pick<WeatherObservation, 'rainfallRateMmh' | 'timestamp'>[] = []
): {
  rainfallRateMmh: number;
  rainfall15mMm: number;
  rainfall30mMm: number;
  rainfall1hMm: number;
  rainfall3hMm: number;
  rainfallAcceleration: number;
  rainfallTrend: PredictionTrend;
} {
  const currentRate = Math.max(0, current.rainfallRateMmh || 0);
  const rain1h = Math.max(0, current.rainfall1hMm || 0);

  // Approximate 15m and 30m accumulation from 1h rate & history if available
  let rainfall15mMm = (currentRate * 15) / 60;
  let rainfall30mMm = (currentRate * 30) / 60;

  // Use 1h accumulation as upper bound if consistent
  if (rain1h > 0) {
    rainfall30mMm = Math.min(rain1h, Math.max(rainfall30mMm, rain1h * 0.45));
    rainfall15mMm = Math.min(rainfall30mMm, Math.max(rainfall15mMm, rain1h * 0.25));
  }

  // 3h accumulation estimate from 1h & 24h
  const rain24h = Math.max(0, current.rainfall24hMm || 0);
  const rainfall3hMm = Math.min(rain24h, Math.max(rain1h, rain1h * 1.8));

  // Trend & Acceleration
  let rainfallAcceleration = 0;
  let rainfallTrend: PredictionTrend = 'STABLE';

  if (recentHistory.length > 0) {
    const previous = recentHistory[0];
    const prevRate = Math.max(0, previous.rainfallRateMmh || 0);
    const timeDeltaHours = Math.max(
      0.016, // at least 1 minute
      (new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()) / (1000 * 3600)
    );

    rainfallAcceleration = Number(((currentRate - prevRate) / timeDeltaHours).toFixed(2));

    const rateDelta = currentRate - prevRate;
    if (rateDelta > 2.0 || rainfallAcceleration > 5.0) {
      rainfallTrend = 'INCREASING';
    } else if (rateDelta < -2.0 || rainfallAcceleration < -5.0) {
      rainfallTrend = 'DECREASING';
    } else {
      rainfallTrend = 'STABLE';
    }
  } else {
    // Single observation trend heuristic based on current rate vs 1h average
    const hourlyAvg = rain1h;
    if (currentRate > hourlyAvg * 1.4 && currentRate > 10) {
      rainfallTrend = 'INCREASING';
      rainfallAcceleration = 5.0;
    } else if ((currentRate < hourlyAvg * 0.6 && hourlyAvg > 1.0) || (currentRate === 0 && hourlyAvg > 0)) {
      rainfallTrend = 'DECREASING';
      rainfallAcceleration = -5.0;
    }
  }

  return {
    rainfallRateMmh: currentRate,
    rainfall15mMm: Number(rainfall15mMm.toFixed(2)),
    rainfall30mMm: Number(rainfall30mMm.toFixed(2)),
    rainfall1hMm: Number(rain1h.toFixed(2)),
    rainfall3hMm: Number(rainfall3hMm.toFixed(2)),
    rainfallAcceleration,
    rainfallTrend,
  };
}

/**
 * 2. Forecast Features Extraction
 */
export function extractForecastFeatures(forecasts: WeatherForecast[] = []): {
  forecastExpectedRainfallMm: number;
  forecastPrecipitationProbability: number;
  forecastIntensity: number;
} {
  if (!forecasts || forecasts.length === 0) {
    return {
      forecastExpectedRainfallMm: 0,
      forecastPrecipitationProbability: 0,
      forecastIntensity: 0,
    };
  }

  // Evaluate near-horizon forecast (first 3 intervals, ~3 hours)
  const nearForecasts = forecasts.slice(0, 3);
  let totalExpectedRainfall = 0;
  let maxProbability = 0;

  for (const f of nearForecasts) {
    totalExpectedRainfall += Math.max(0, f.precipitationAmountMm || 0);
    maxProbability = Math.max(maxProbability, Math.min(1.0, f.precipitationProbability || 0));
  }

  // Normalized intensity index [0, 100]
  // 40mm in 3h with 100% prob = 100 intensity
  const forecastIntensity = Math.min(100, Number((maxProbability * (totalExpectedRainfall / 35) * 100).toFixed(1)));

  return {
    forecastExpectedRainfallMm: Number(totalExpectedRainfall.toFixed(2)),
    forecastPrecipitationProbability: Number(maxProbability.toFixed(2)),
    forecastIntensity,
  };
}

/**
 * 3. Historical Vulnerability Features
 */
export function extractHistoricalFeatures(
  isHistoricallyFloodProne: boolean,
  basinElevationM?: number
): {
  isHistoricallyFloodProne: boolean;
  basinDepressionScore: number;
} {
  let basinDepressionScore = isHistoricallyFloodProne ? 65 : 10;

  if (typeof basinElevationM === 'number') {
    if (basinElevationM < 10) {
      basinDepressionScore = Math.min(100, basinDepressionScore + 25);
    } else if (basinElevationM > 35) {
      basinDepressionScore = Math.max(0, basinDepressionScore - 20);
    }
  }

  return {
    isHistoricallyFloodProne,
    basinDepressionScore,
  };
}

/**
 * 4. Crowdsourced Report Cluster & Verification Features
 */
export function extractCrowdsourcedFeatures(reports: RawCitizenReportFeatureInput[] = []): {
  verifiedReportsCount: number;
  unverifiedReportsCount: number;
  reportSpatialClusterWeight: number;
} {
  let verifiedReportsCount = 0;
  let unverifiedReportsCount = 0;
  let weightedClusterSum = 0;

  for (const r of reports) {
    const isVerified = r.status === 'VERIFIED';
    if (isVerified) verifiedReportsCount++;
    else unverifiedReportsCount++;

    // Spatial decay: e^(-dist / 500m)
    const distanceDecay = Math.exp(-Math.max(0, r.distanceMeters) / 500);
    // Temporal decay: max(0, 1 - age / 120min)
    const ageDecay = Math.max(0, 1 - Math.max(0, r.ageMinutes) / 120);

    const reportWeight = isVerified ? 25 : 8;
    weightedClusterSum += reportWeight * distanceDecay * ageDecay;
  }

  return {
    verifiedReportsCount,
    unverifiedReportsCount,
    reportSpatialClusterWeight: Math.min(100, Number(weightedClusterSum.toFixed(1))),
  };
}

/**
 * 5. Data Freshness & Evidence Confidence
 */
export function calculateEvidenceConfidence(params: {
  weatherFreshness: FreshnessState;
  weatherAgeMinutes: number;
  floodFreshness?: FreshnessState;
  floodAgeMinutes?: number;
  hasCorroboratingReports?: boolean;
}): {
  confidence: number;
  corroborationFactor: number;
} {
  let baseScore = 1.0;

  // Weather age decay
  if (params.weatherAgeMinutes > 60 || params.weatherFreshness === 'EXPIRED') {
    baseScore -= 0.50;
  } else if (params.weatherAgeMinutes > 20 || params.weatherFreshness === 'STALE') {
    baseScore -= 0.25;
  } else if (params.weatherFreshness === 'RECENT') {
    baseScore -= 0.10;
  }

  // Flood telemetry age decay (if present)
  if (params.floodFreshness) {
    if (params.floodFreshness === 'EXPIRED' || (params.floodAgeMinutes && params.floodAgeMinutes > 60)) {
      baseScore -= 0.20;
    } else if (params.floodFreshness === 'MOCK') {
      // Mock is honest simulation, mild uncertainty adjustment
      baseScore -= 0.05;
    }
  }

  let corroborationFactor = 0.5;
  if (params.hasCorroboratingReports) {
    corroborationFactor = 0.9;
    baseScore += 0.10; // Corroboration increases confidence
  }

  const confidence = Math.max(0.15, Math.min(1.0, Number(baseScore.toFixed(2))));

  return {
    confidence,
    corroborationFactor,
  };
}

/**
 * High-Level Feature Engineering Pipeline: Builds complete FloodRiskFeatureSet
 */
export function buildFloodRiskFeatureSet(inputs: {
  currentWeather: Pick<WeatherObservation, 'rainfallRateMmh' | 'rainfall1hMm' | 'rainfall24hMm' | 'timestamp' | 'freshness' | 'dataAgeSeconds'>;
  weatherHistory?: Pick<WeatherObservation, 'rainfallRateMmh' | 'timestamp'>[];
  forecasts?: WeatherForecast[];
  isHistoricallyFloodProne: boolean;
  basinElevationM?: number;
  reports?: RawCitizenReportFeatureInput[];
  floodFreshness?: FreshnessState;
  floodAgeMinutes?: number;
}): FloodRiskFeatureSet {
  const rainfall = extractRainfallFeatures(inputs.currentWeather, inputs.weatherHistory);
  const forecast = extractForecastFeatures(inputs.forecasts);
  const historical = extractHistoricalFeatures(inputs.isHistoricallyFloodProne, inputs.basinElevationM);
  const crowdsourced = extractCrowdsourcedFeatures(inputs.reports);

  const weatherAgeMinutes = Math.max(0, Math.round((inputs.currentWeather.dataAgeSeconds || 0) / 60));
  const confidenceData = calculateEvidenceConfidence({
    weatherFreshness: inputs.currentWeather.freshness,
    weatherAgeMinutes,
    floodFreshness: inputs.floodFreshness,
    floodAgeMinutes: inputs.floodAgeMinutes,
    hasCorroboratingReports: crowdsourced.verifiedReportsCount > 0,
  });

  return {
    ...rainfall,
    ...forecast,
    ...historical,
    ...crowdsourced,
    dataFreshnessState: inputs.currentWeather.freshness,
    dataAgeMinutes: weatherAgeMinutes,
    corroborationFactor: confidenceData.corroborationFactor,
  };
}

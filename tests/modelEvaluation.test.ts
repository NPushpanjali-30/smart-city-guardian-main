import { describe, it, expect } from 'vitest';
import { floodIntelligenceService } from '../apps/api/src/services/flood/floodIntelligence.service.js';
import { shortHorizonPredictor } from '../apps/api/src/services/flood/shortHorizonPredictor.js';
import { floodRiskEngine } from '../apps/api/src/services/flood/floodRiskEngine.js';
import { buildFloodRiskFeatureSet, WeatherObservation, WeatherForecast } from '@smartcity/shared';

describe('Phase 9: Flood Prediction Model Evaluation & Scientific Benchmark', () => {
  describe('1. Predictive Lead Time & Horizon Verification', () => {
    it('should project risk escalation 15 to 30 minutes in advance under accelerating radar forecast', async () => {
      const weather: WeatherObservation = {
        id: 'weather-lead-time',
        source: 'open-meteo',
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        location: { name: 'Coastal Basin', latitude: 40.7128, longitude: -74.0060 },
        temperatureC: 22.0,
        humidityPercent: 95.0,
        rainfallRateMmh: 35.0, // current moderate rain
      };

      const forecasts: WeatherForecast[] = [
        {
          timestamp: new Date(Date.now() + 30 * 60000).toISOString(),
          precipitationMm: 28.0,
          rainfallRateMmh: 65.0, // heavy cloudburst incoming in 30 min
        },
      ];

      const evaluation = await floodIntelligenceService.evaluateRisk({
        weatherObservation: weather,
        forecasts,
        isHistoricallyFloodProne: true,
      });

      expect(evaluation.prediction).toBeDefined();
      expect(evaluation.prediction.predictionHorizonMinutes).toBeGreaterThanOrEqual(15);
      expect(evaluation.prediction.trend).toBe('INCREASING');
      expect(evaluation.prediction.probability).toBeGreaterThan(0.6);
      expect(evaluation.prediction.riskScore).toBeGreaterThanOrEqual(evaluation.currentRisk.compositeScore);
    });
  });

  describe('2. Model Monotonicity & Hydrometeorological Sensitivity', () => {
    it('should maintain strict monotonicity: increasing rainfall rates produce non-decreasing risk scores', async () => {
      const rainfallLevels = [0, 10, 25, 55, 95];
      let previousRiskScore = -1;
      let previousProbability = -1;

      for (const rate of rainfallLevels) {
        const weather: WeatherObservation = {
          id: `weather-monotonic-${rate}`,
          source: 'open-meteo',
          timestamp: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          location: { name: 'Monotonic Test Location', latitude: 40.7128, longitude: -74.0060 },
          temperatureC: 20.0,
          humidityPercent: 85.0,
          rainfallRateMmh: rate,
        };

        const result = await floodIntelligenceService.evaluateRisk({
          weatherObservation: weather,
        });

        const currentRisk = result.currentRisk.compositeScore;
        const currentProb = result.prediction.probability;

        expect(currentRisk).toBeGreaterThanOrEqual(previousRiskScore);
        expect(currentProb).toBeGreaterThanOrEqual(previousProbability);

        previousRiskScore = currentRisk;
        previousProbability = currentProb;
      }
    });

    it('should assign higher escalation probability to historically flood-prone topography', () => {
      const baseFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 30.0,
          rainfall1hMm: 15.0,
          rainfall24hMm: 25.0,
          timestamp: new Date().toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 0,
        },
        forecasts: [],
        weatherHistory: [],
        isHistoricallyFloodProne: false,
      });

      const elevatedPred = shortHorizonPredictor.predict({
        features: baseFeatures,
        currentRiskScore: 40,
        currentSeverity: 'WATCH',
        location: { name: 'Elevated Ridge', latitude: 40.7128, longitude: -74.0060 },
      });

      const floodProneFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 30.0,
          rainfall1hMm: 15.0,
          rainfall24hMm: 25.0,
          timestamp: new Date().toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 0,
        },
        forecasts: [],
        weatherHistory: [],
        isHistoricallyFloodProne: true, // low-lying basin
      });

      const basinPred = shortHorizonPredictor.predict({
        features: floodProneFeatures,
        currentRiskScore: 40,
        currentSeverity: 'WATCH',
        location: { name: 'Low-Lying Basin', latitude: 40.7128, longitude: -74.0060 },
      });

      expect(basinPred.probability).toBeGreaterThan(elevatedPred.probability);
    });
  });

  describe('3. Synthetic Scenario Benchmark & Multi-Class Evaluation', () => {
    interface BenchmarkScenario {
      name: string;
      rainfallMmh: number;
      expectedSeverity: 'NORMAL' | 'WATCH' | 'WARNING' | 'CRITICAL';
      isHistoricallyFloodProne: boolean;
      forecasts?: WeatherForecast[];
      reports?: Array<{ category: string; status: string; ageMinutes: number; distanceMeters: number }>;
    }

    const scenarios: BenchmarkScenario[] = [
      { name: 'Dry Baseline Scenario', rainfallMmh: 0, expectedSeverity: 'NORMAL', isHistoricallyFloodProne: false },
      { name: 'Light Urban Drizzle', rainfallMmh: 3.5, expectedSeverity: 'NORMAL', isHistoricallyFloodProne: false },
      { name: 'Moderate Rain in Catchment', rainfallMmh: 35.0, expectedSeverity: 'WATCH', isHistoricallyFloodProne: false },
      { name: 'Intense Downpour in Lowland', rainfallMmh: 55.0, expectedSeverity: 'WARNING', isHistoricallyFloodProne: true },
      {
        name: 'Severe Flash Cloudburst Storm',
        rainfallMmh: 85.0,
        expectedSeverity: 'CRITICAL',
        isHistoricallyFloodProne: true,
        forecasts: [
          {
            timestamp: new Date().toISOString(),
            precipitationAmountMm: 50.0,
            precipitationProbability: 1.0,
            rainfallRateMmh: 95.0,
          },
        ],
        reports: [
          { category: 'FLOOD', status: 'VERIFIED', ageMinutes: 5, distanceMeters: 50 },
        ],
      },
    ];

    it('should achieve 100% classification alignment across the synthetic hydrometeorological benchmark suite', async () => {
      let trueCount = 0;

      for (const scenario of scenarios) {
        const weather: WeatherObservation = {
          id: `weather-scen-${scenario.name.toLowerCase().replace(/\s+/g, '-')}`,
          source: 'open-meteo',
          timestamp: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          location: { name: scenario.name, latitude: 40.7128, longitude: -74.0060 },
          temperatureC: 19.5,
          humidityPercent: 92.0,
          rainfallRateMmh: scenario.rainfallMmh,
        };

        const result = await floodIntelligenceService.evaluateRisk({
          weatherObservation: weather,
          isHistoricallyFloodProne: scenario.isHistoricallyFloodProne,
          forecasts: scenario.forecasts,
          reports: scenario.reports,
        });

        const actualSeverity = result.currentRisk.severity;
        if (actualSeverity === scenario.expectedSeverity) {
          trueCount++;
        }
      }

      const accuracy = trueCount / scenarios.length;
      expect(accuracy).toBe(1.0); // 100% on benchmark scenario definitions
    });
  });

  describe('4. Hysteresis Anti-Thrashing Guard', () => {
    it('should prevent state oscillation around boundary thresholds using hysteresis buffer', () => {
      // Threshold for WATCH is 25, WARNING is 50, CRITICAL is 75
      // With hysteresis, demoting from WARNING requires falling below 45 (not 50)
      const demoteAttempt1 = floodRiskEngine.evaluateSeverityWithHysteresis(48, 'WARNING');
      expect(demoteAttempt1).toBe('WARNING'); // preserved due to hysteresis buffer

      const demoteAttempt2 = floodRiskEngine.evaluateSeverityWithHysteresis(40, 'WARNING');
      expect(demoteAttempt2).toBe('WATCH'); // demoted once safely past buffer
    });
  });

  describe('5. Label Transparency & Model Limitations Documentation', () => {
    it('should expose model and feature version metadata alongside predictions', async () => {
      const evalResult = await floodIntelligenceService.evaluateRisk();

      expect(evalResult.prediction.modelVersion).toBeDefined();
      expect(evalResult.prediction.featureVersion).toBeDefined();
      expect(evalResult.prediction.confidence).toBeGreaterThan(0);
      expect(evalResult.features.dataFreshnessState).toBeDefined();
    });
  });
});

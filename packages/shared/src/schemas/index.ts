import { z } from 'zod';

export const FloodSeveritySchema = z.enum(['NORMAL', 'WATCH', 'WARNING', 'CRITICAL']);
export const RoadAccessibilitySchema = z.enum(['OPEN', 'CAUTION', 'HIGH_RISK', 'BLOCKED', 'UNKNOWN']);
export const IncidentTypeSchema = z.enum(['ACCIDENT', 'ROAD_WORK', 'HAZARD', 'CLOSURE', 'CONGESTION']);
export const ReportCategorySchema = z.enum(['FLOOD', 'ROAD_BLOCKED', 'ACCIDENT', 'HEAVY_TRAFFIC', 'OTHER_HAZARD']);
export const UserRoleSchema = z.enum(['CITIZEN', 'ADMIN']);
export const FreshnessStateSchema = z.enum(['LIVE', 'RECENT', 'STALE', 'EXPIRED', 'MOCK', 'UNAVAILABLE']);
export const ProviderHealthStatusSchema = z.enum(['HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN']);

/**
 * Standard API Response Metadata Schema
 */
export const StandardApiMetaSchema = z.object({
  source: z.string().min(1),
  retrievedAt: z.string().datetime(),
  freshness: FreshnessStateSchema,
  dataAgeSeconds: z.number().nonnegative().optional(),
  isMock: z.boolean(),
  correlationId: z.string().optional(),
});

/**
 * Inbound Weather Telemetry Validation Schema
 */
export const WeatherObservationSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  timestamp: z.string(),
  receivedAt: z.string(),
  location: z.object({
    name: z.string().min(1),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  temperatureC: z.number().min(-60).max(60),
  humidityPercent: z.number().min(0).max(100),
  rainfallRateMmh: z.number().min(0),
  rainfall1hMm: z.number().min(0),
  rainfall24hMm: z.number().min(0),
  windSpeedKmh: z.number().min(0),
  freshness: FreshnessStateSchema,
  dataAgeSeconds: z.number().nonnegative(),
});

/**
 * Inbound Traffic Observation Validation Schema
 */
export const TrafficObservationSchema = z.object({
  segmentId: z.string().min(1),
  roadName: z.string().min(1),
  timestamp: z.string(),
  receivedAt: z.string(),
  speedKmh: z.number().min(0).max(250),
  freeFlowSpeedKmh: z.number().min(1).max(250),
  delaySeconds: z.number().min(0),
  congestionLevel: z.number().min(0).max(100),
  source: z.string().min(1),
  freshness: FreshnessStateSchema,
  dataAgeSeconds: z.number().nonnegative(),
});

/**
 * Inbound Traffic Incident Validation Schema
 */
export const TrafficIncidentSchema = z.object({
  id: z.string().min(1),
  type: IncidentTypeSchema,
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  roadSegmentId: z.string().optional(),
  description: z.string().min(1),
  isBlocking: z.boolean(),
  startedAt: z.string(),
  source: z.string().min(1),
  freshness: FreshnessStateSchema,
});

/**
 * Inbound Flood Observation Validation Schema
 */
export const FloodObservationSchema = z.object({
  id: z.string().min(1),
  zoneId: z.string().min(1),
  zoneName: z.string().min(1),
  waterDepthCm: z.number().min(0),
  severity: FloodSeveritySchema,
  observedAt: z.string(),
  source: z.string().min(1),
  isLive: z.boolean(),
  freshness: FreshnessStateSchema,
  dataAgeSeconds: z.number().nonnegative(),
});

export const LanguageCodeSchema = z.enum(['en', 'hi', 'kn']);

export const AiDecisionModeSchema = z.enum([
  'CITY_OVERVIEW',
  'CITIZEN_SAFETY',
  'ROUTE_ASSESSMENT',
  'EVENT_SUMMARY',
  'ALERT_GENERATION',
]);

export const RouteRecommendationActionSchema = z.enum([
  'KEEP_ROUTE',
  'CONSIDER_ALTERNATIVE',
  'REROUTE_REQUIRED',
  'NO_ROUTE_RECOMMENDATION',
]);

export const NotificationPrioritySchema = z.enum([
  'INFO',
  'WARNING',
  'URGENT',
  'NONE',
]);

export const AiRiskLevelSchema = z.enum([
  'NORMAL',
  'WATCH',
  'WARNING',
  'CRITICAL',
  'UNKNOWN',
]);

export const RouteRecommendationSchema = z.object({
  action: RouteRecommendationActionSchema,
  reason: z.string(),
});

export const AiNotificationAdvisorySchema = z.object({
  should_notify: z.boolean(),
  priority: NotificationPrioritySchema,
  language: LanguageCodeSchema.default('en'),
  message: z.string(),
});

/**
 * Strict Grok AI Decision Output Validation Schema
 */
export const GrokDecisionOutputSchema = z.object({
  risk_level: AiRiskLevelSchema,
  confidence: z.number().min(0.0).max(1.0),
  situation_summary: z.string().default(''),
  affected_zones: z.array(z.string()),
  roads_to_avoid: z.array(z.string()),
  citizen_actions: z.array(z.string()),
  authority_actions: z.array(z.string()),
  recommended_actions: z.array(z.string()).optional(),
  route_recommendation: RouteRecommendationSchema.default({
    action: 'NO_ROUTE_RECOMMENDATION',
    reason: 'No active route specified.',
  }),
  notification: AiNotificationAdvisorySchema.default({
    should_notify: false,
    priority: 'NONE',
    language: 'en',
    message: '',
  }),
  uncertainties: z.array(z.string()).default([]),
  sms_summary: z.string().optional(),
  language: LanguageCodeSchema.optional(),
  decision_confidence: z.number().min(0.0).max(1.0).optional(),
  unverified_claims: z.array(z.string()).optional(),
});

export const AiAnalyzeRequestSchema = z.object({
  mode: AiDecisionModeSchema.default('CITY_OVERVIEW'),
  language: LanguageCodeSchema.default('en'),
  userLocation: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
  destination: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      name: z.string().optional(),
    })
    .optional(),
  routeContext: z
    .object({
      activeRouteId: z.string().optional(),
      origin: z.string().optional(),
      destination: z.string().optional(),
      traversedSegments: z.array(z.string()).optional(),
    })
    .optional(),
  context: z.record(z.unknown()).optional(),
});

/**
 * Citizen Report Submission Schema
 */
export const CitizenReportInputSchema = z.object({
  category: ReportCategorySchema,
  description: z.string().min(5).max(1000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  photoUrl: z.string().url().optional(),
});

/**
 * Route Request Validation Schema
 */
export const RouteRequestSchema = z.object({
  origin: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().optional(),
  }),
  destination: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().optional(),
  }),
  preferences: z.object({
    avoidFloodRiskThreshold: z.number().min(0).max(100).default(50),
    prioritizeSafety: z.boolean().default(true),
    useDynamicGraphRouter: z.boolean().optional(),
    useHydrodynamicRouter: z.boolean().optional(),
    algorithm: z.enum(['STANDARD', 'DMC_ASTAR', 'H_STAR', 'HD_STAR_LITE']).optional(),
  }).optional(),
});

/**
 * Health Check Response Schema
 */
export const HealthCheckResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  mockMode: z.boolean(),
  components: z.record(z.object({
    status: z.enum(['up', 'down', 'degraded', 'mocked']),
    latencyMs: z.number().optional(),
    details: z.string().optional(),
  })).optional(),
});

/**
 * Phase 2 Feature Add-On: Location Relevance & Multilingual Schemas
 */
export const SavedLocationTypeSchema = z.enum(['HOME', 'WORK', 'COLLEGE', 'HOSPITAL', 'CUSTOM']);

export const SavedLocationSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string(),
  name: z.string().min(1).max(100),
  type: SavedLocationTypeSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const LocationRelevanceRequestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional(),
  destination: z.string().optional(),
  destinationCoordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional(),
  userId: z.string().optional(),
  language: LanguageCodeSchema.default('en'),
});

/**
 * Phase 3: Flood Intelligence & Prediction Schemas
 */
export const PredictionTrendSchema = z.enum(['INCREASING', 'STABLE', 'DECREASING']);

export const FloodZoneTypeSchema = z.enum(['OBSERVED_CONFIRMED', 'PREDICTED_RISK', 'HISTORICAL_HOTSPOT']);

export const FloodPredictionResultSchema = z.object({
  timestamp: z.string(),
  location: z.object({
    name: z.string(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    zoneId: z.string().optional(),
  }),
  riskScore: z.number().min(0).max(100),
  currentState: FloodSeveritySchema,
  predictedState: FloodSeveritySchema,
  predictionHorizonMinutes: z.number().positive(),
  probability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  trend: PredictionTrendSchema,
  reasons: z.array(z.string()),
  modelVersion: z.string(),
  featureVersion: z.string(),
  fallbackLevel: z.enum(['PRIMARY', 'BASELINE', 'DETERMINISTIC_TREND', 'DEGRADED']),
});

export const GeographicRiskZoneSchema = z.object({
  zoneId: z.string(),
  zoneName: z.string(),
  zoneType: FloodZoneTypeSchema,
  severity: FloodSeveritySchema,
  floodScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  waterDepthCm: z.number().optional(),
  drainageCapacityPercent: z.number().optional(),
  isHistoricallyFloodProne: z.boolean().optional(),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
  updatedAt: z.string(),
});

export const RoadFloodRiskResultSchema = z.object({
  roadId: z.string(),
  roadName: z.string(),
  floodScore: z.number().min(0).max(100),
  riskState: FloodSeveritySchema,
  accessibilityState: RoadAccessibilitySchema,
  confidence: z.number().min(0).max(1),
  intersectingZoneId: z.string().optional(),
  reason: z.string(),
  updatedAt: z.string(),
});

/**
 * Phase 5 Validation Schemas
 */
export const TrafficStateSchema = z.enum([
  'SMOOTH',
  'SLOW',
  'CONGESTED',
  'SEVERELY_CONGESTED',
  'UNKNOWN',
]);

export const RouteStatusSchema = z.enum([
  'SAFE_TO_PROCEED',
  'CAUTION',
  'HIGH_RISK',
  'INVALID',
  'UNKNOWN',
]);

export const RerouteTriggerTypeSchema = z.enum([
  'MANUAL',
  'ROAD_BLOCKED',
  'FLOOD_RISK_SURGE',
  'HIGH_RISK_TRANSITION',
  'SEVERE_CONGESTION',
  'NEW_INCIDENT',
  'ROUTE_DEVIATION',
  'SAFER_ALTERNATIVE_AVAILABLE',
  'AI_RECOMMENDATION',
]);

export const RouteCalculationRequestSchema = z.object({
  origin: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().optional(),
    accuracyMeters: z.number().optional(),
    timestamp: z.string().optional(),
  }),
  destination: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().optional(),
  }),
  preferences: z
    .object({
      avoidFlood: z.boolean().default(true),
      avoidTraffic: z.boolean().default(true),
      emergencyMode: z.boolean().default(false),
      prioritizeSafety: z.boolean().default(true),
      avoidFloodRiskThreshold: z.number().min(0).max(100).default(50),
    })
    .optional(),
  userId: z.string().optional(),
});

export const ActiveRouteStartRequestSchema = z.object({
  routeId: z.string().min(1),
  userId: z.string().optional(),
});



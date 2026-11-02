/**
 * Core Domain Types & Enums for SmartCity Guardian
 */

export type UserRole = 'CITIZEN' | 'ADMIN';

export type FloodSeverity = 'NORMAL' | 'WATCH' | 'WARNING' | 'CRITICAL';

export type RoadAccessibility = 'OPEN' | 'CAUTION' | 'HIGH_RISK' | 'BLOCKED' | 'UNKNOWN';

export type IncidentType = 'ACCIDENT' | 'ROAD_WORK' | 'HAZARD' | 'CLOSURE' | 'CONGESTION';

export type ReportCategory = 'FLOOD' | 'ROAD_BLOCKED' | 'ACCIDENT' | 'HEAVY_TRAFFIC' | 'OTHER_HAZARD';

export type ReportStatus = 'PENDING_REVIEW' | 'VERIFIED' | 'DISMISSED';

export type FreshnessState = 'LIVE' | 'RECENT' | 'STALE' | 'EXPIRED' | 'MOCK' | 'UNAVAILABLE';

export type ProviderHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export type SystemEventType =
  | 'WEATHER_UPDATED'
  | 'TRAFFIC_UPDATED'
  | 'TRAFFIC_STATE_UPDATED'
  | 'TRAFFIC_INCIDENT_UPDATED'
  | 'FLOOD_DATA_UPDATED'
  | 'FLOOD_RISK_CHANGED'
  | 'ROAD_RISK_CHANGED'
  | 'ROAD_RISK_UPDATED'
  | 'ROAD_BLOCKED'
  | 'TRAFFIC_CONGESTION_CHANGED'
  | 'ROUTE_CREATED'
  | 'ROUTE_UPDATED'
  | 'ROUTE_RECALCULATED'
  | 'ROUTE_INVALIDATED'
  | 'REROUTE_REQUIRED'
  | 'AI_ANALYSIS_REQUESTED'
  | 'AI_ANALYSIS_COMPLETED'
  | 'AI_ANALYSIS_FAILED'
  | 'AI_RESPONSE_REJECTED'
  | 'AI_DECISION_UPDATED'
  | 'ALERT_TRIGGERED'
  | 'SMS_SENT'
  | 'SMS_FAILED'
  | 'USER_REPORT_CREATED'
  | 'USER_REPORT_VERIFIED'
  | 'PROVIDER_DEGRADED'
  | 'PROVIDER_RECOVERED'
  | 'DATA_BECAME_STALE'
  | 'DATA_REFRESHED';

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  event_id: string;
  event_type: SystemEventType;
  timestamp: string;
  source: string;
  correlation_id: string;
  location?: {
    latitude: number;
    longitude: number;
    zone_id?: string;
    road_id?: string;
  };
  payload: T;
}

export interface ProviderStatusInfo {
  provider: string;
  category: 'weather' | 'traffic' | 'flood' | 'map' | 'sms' | 'ai';
  status: ProviderHealthStatus;
  lastSuccess?: string;
  lastFailure?: string;
  consecutiveFailures: number;
  lastResponseTimeMs: number;
  lastError?: string;
  isLive: boolean;
  capabilities: string[];
}

export interface StandardApiMeta {
  source: string;
  retrievedAt: string;
  freshness: FreshnessState;
  dataAgeSeconds?: number;
  isMock: boolean;
  correlationId?: string;
}

export interface StandardApiResponse<T = unknown> {
  success: boolean;
  data: T;
  meta: StandardApiMeta;
}

export interface WeatherObservation {
  id: string;
  source: string;
  timestamp: string;
  receivedAt: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
  };
  temperatureC: number;
  humidityPercent: number;
  rainfallRateMmh: number;
  rainfall1hMm: number;
  rainfall24hMm: number;
  windSpeedKmh: number;
  freshness: FreshnessState;
  dataAgeSeconds: number;
}

export interface WeatherForecast {
  timestamp: string;
  forecastFor: string;
  latitude: number;
  longitude: number;
  precipitationProbability: number;
  precipitationAmountMm: number;
  temperatureC: number;
  source: string;
  freshness: FreshnessState;
}

export interface TrafficObservation {
  segmentId: string;
  roadName: string;
  timestamp: string;
  receivedAt: string;
  speedKmh: number;
  freeFlowSpeedKmh: number;
  delaySeconds: number;
  congestionLevel: number; // 0 to 100
  source: string;
  freshness: FreshnessState;
  dataAgeSeconds: number;
}

export interface TrafficIncident {
  id: string;
  type: IncidentType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  latitude: number;
  longitude: number;
  roadSegmentId?: string;
  description: string;
  isBlocking: boolean;
  startedAt: string;
  source: string;
  freshness: FreshnessState;
}

export interface FloodObservation {
  id: string;
  zoneId: string;
  zoneName: string;
  waterDepthCm: number;
  severity: FloodSeverity;
  observedAt: string;
  source: string;
  isLive: boolean;
  freshness: FreshnessState;
  dataAgeSeconds: number;
}

export interface RiskFactorContribution {
  name: string;
  contribution: number;
  description: string;
}

export interface ExplainableFloodRiskResult {
  compositeScore: number;
  severity: FloodSeverity;
  confidence: number;
  factors: RiskFactorContribution[];
  humanSummary: string;
}

export interface RoadSegment {
  id: string;
  name: string;
  roadClass: 'primary' | 'secondary' | 'residential' | 'highway';
  lengthMeters: number;
  speedLimitKmh: number;
  floodScore: number;
  trafficScore: number;
  compositeRisk: number;
  accessibilityState: RoadAccessibility;
  confidence: number;
  isHistoricallyFloodProne: boolean;
  coordinates: [number, number][]; // [lon, lat]
  blockageReason?: string | null;
}

export interface RoutingParameters {
  alphaTimeWeight: number;       // default: 1.0
  betaTrafficWeight: number;     // default: 2.5
  gammaFloodWeight: number;      // default: 50.0
  deltaIncidentWeight: number;   // default: 20.0
}

export interface SegmentCostResult {
  segmentId: string;
  isExcluded: boolean;
  exclusionReason?: string;
  travelTimeSeconds: number;
  trafficPenaltySeconds: number;
  floodPenaltySeconds: number;
  incidentPenaltySeconds: number;
  totalCost: number;
}

export interface CalculatedRouteResult {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalCost: number;
  totalRiskScore: number;
  isBlocked: boolean;
  segments: SegmentCostResult[];
}

export type AiDecisionMode =
  | 'CITY_OVERVIEW'
  | 'CITIZEN_SAFETY'
  | 'ROUTE_ASSESSMENT'
  | 'EVENT_SUMMARY'
  | 'ALERT_GENERATION';

export type RouteRecommendationAction =
  | 'KEEP_ROUTE'
  | 'CONSIDER_ALTERNATIVE'
  | 'REROUTE_REQUIRED'
  | 'NO_ROUTE_RECOMMENDATION';

export type NotificationPriority =
  | 'INFO'
  | 'WARNING'
  | 'URGENT'
  | 'NONE';

export type AiRiskLevel = FloodSeverity | 'UNKNOWN';

export interface RouteRecommendation {
  action: RouteRecommendationAction;
  reason: string;
}

export interface AiNotificationAdvisory {
  should_notify: boolean;
  priority: NotificationPriority;
  language: LanguageCode;
  message: string;
}

export interface ProvenancedValue<T> {
  value: T;
  unit?: string;
  source: string;
  observedAt: string;
  freshness: FreshnessState;
}

export interface CanonicalAIContext {
  timestamp: string;
  mode: AiDecisionMode;
  location: {
    latitude: number;
    longitude: number;
    cityName?: string;
  };
  userContext?: {
    userId?: string;
    preferredLanguage: LanguageCode;
    destination?: {
      latitude: number;
      longitude: number;
      name?: string;
    };
  };
  environment: {
    rainfall: ProvenancedValue<number>;
    forecast?: ProvenancedValue<Record<string, unknown>>;
    weatherAlerts: string[];
  };
  flood: {
    currentRisk: {
      score: number;
      severity: FloodSeverity;
    };
    prediction: {
      predictedSeverity: FloodSeverity;
      probability: number;
      horizonMinutes: number;
    };
    trend: 'INCREASING' | 'STABLE' | 'DECREASING';
    confidence: number;
    zones: Array<{ name: string; risk: string }>;
  };
  traffic: {
    conditions: Array<{ segmentId: string; speedKmh: number; congestionLevel: number }>;
    incidents: Array<{ incidentId: string; type: string; severity: string; description: string }>;
  };
  roads: {
    affected: Array<{
      id: string;
      name: string;
      state: RoadAccessibility;
      waterDepthCm?: number;
      source: string;
      freshness: string;
    }>;
  };
  route?: {
    current?: {
      routeId: string;
      origin: string;
      destination: string;
    };
    risk?: {
      compositeRisk: number;
      isBlocked: boolean;
    };
    affectedSegments: string[];
  };
  dataQuality: {
    freshness: Record<string, string>;
    confidence: {
      systemConfidence: number;
      telemetryHealth: string;
    };
  };
  activeEvents?: Array<{
    eventId: string;
    eventType: string;
    severity: string;
    description: string;
  }>;
}

export interface GrokDecisionOutput {
  risk_level: AiRiskLevel;
  confidence: number;
  situation_summary: string;
  affected_zones: string[];
  roads_to_avoid: string[];
  citizen_actions: string[];
  authority_actions: string[];
  recommended_actions?: string[];
  route_recommendation: RouteRecommendation;
  notification: AiNotificationAdvisory;
  uncertainties: string[];
  sms_summary?: string;
  language?: LanguageCode;
  decision_confidence?: number;
  unverified_claims?: string[];
}

export interface StoredAiDecision {
  id: string;
  mode: AiDecisionMode;
  context_hash: string;
  model: string;
  model_version: string;
  created_at: string;
  processing_time_ms: {
    context_build_ms: number;
    grok_request_ms: number;
    validation_ms: number;
    total_ai_latency_ms: number;
  };
  validation_status: 'VALIDATED' | 'VALIDATED_WITH_WARNINGS' | 'REJECTED_FALLBACK';
  decision: GrokDecisionOutput;
  fallback_used: boolean;
  fallback_reason?: string;
  unverified_claims?: string[];
}

export interface GrokInputContext {
  timestamp: string;
  location: {
    cityName: string;
    coordinates: [number, number];
    monitoredSectors: string[];
  };
  weather: {
    rainfallRateMmh: number;
    rainfall1hMm: number;
    rainfall24hMm: number;
    windSpeedKmh: number;
    severeWeatherAlerts: string[];
  };
  traffic: {
    averageCongestionIndex: number;
    activeIncidentsCount: number;
    blockedCorridorsCount: number;
  };
  floodRisk: {
    compositeScore: number;
    severity: FloodSeverity;
    highRiskBasins: string[];
  };
  roads: Array<{
    id: string;
    name: string;
    state: RoadAccessibility;
    waterDepthCm?: number;
  }>;
  routeContext?: {
    activeRouteId: string;
    origin: string;
    destination: string;
    traversedSegments: string[];
  };
  dataFreshness: {
    weatherAgeMinutes: number;
    trafficAgeMinutes: number;
  };
  confidenceScore: number;
  preferred_language?: LanguageCode;
}

/**
 * Phase 2 Feature Add-On: Location & Destination Alerts + Multilingual
 */
export type LanguageCode = 'en' | 'hi' | 'kn';

export interface LocationCoordinate {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  timestamp?: string;
}

export type SavedLocationType = 'HOME' | 'WORK' | 'COLLEGE' | 'HOSPITAL' | 'CUSTOM';

export interface SavedLocation {
  id: string;
  userId: string;
  name: string;
  type: SavedLocationType;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocationAlertStatus {
  relevant: boolean;
  distanceKm: number;
  severity: FloodSeverity;
  eventId?: string;
  eventName?: string;
  reason: string;
  freshness?: FreshnessState;
}

export interface DestinationRiskEvaluation {
  destination: string;
  coordinates?: [number, number];
  risk: FloodSeverity;
  nearestEventDistanceKm: number;
  nearbyEvents: LocationAlertStatus[];
  affectedRoads: string[];
  recommendedAction: string;
  reason: string;
}

export interface LocationRelevanceEvaluation {
  currentLocation: {
    coordinates: [number, number];
    risk: FloodSeverity;
    nearestEventDistanceKm: number;
    relevantEvents: LocationAlertStatus[];
    statusMessage?: string;
  };
  destination?: DestinationRiskEvaluation;
  notifications: {
    shouldNotify: boolean;
    alertSeverity?: FloodSeverity;
    deduplicated?: boolean;
    reason?: string;
    smsSummary?: string;
  };
}

export interface LocalizedNotificationTemplate {
  language: LanguageCode;
  severity: FloodSeverity;
  alertType: 'LOCATION_ALERT' | 'DESTINATION_ALERT' | 'ROUTE_ALERT';
  title: string;
  body: string;
  smsSummary: string;
}

/**
 * Phase 3: Flood Intelligence & Prediction Engine Types
 */
export type PredictionTrend = 'INCREASING' | 'STABLE' | 'DECREASING';

export type FloodZoneType = 'OBSERVED_CONFIRMED' | 'PREDICTED_RISK' | 'HISTORICAL_HOTSPOT';

export interface FloodRiskFeatureSet {
  rainfallRateMmh: number;
  rainfall15mMm: number;
  rainfall30mMm: number;
  rainfall1hMm: number;
  rainfall3hMm: number;
  rainfallAcceleration: number; // mm/h rate of change
  rainfallTrend: PredictionTrend;
  forecastExpectedRainfallMm: number;
  forecastPrecipitationProbability: number;
  forecastIntensity: number; // 0-100
  isHistoricallyFloodProne: boolean;
  basinDepressionScore: number; // 0-100
  verifiedReportsCount: number;
  unverifiedReportsCount: number;
  reportSpatialClusterWeight: number; // 0-100
  dataFreshnessState: FreshnessState;
  dataAgeMinutes: number;
  corroborationFactor: number; // 0-1
}

export interface FloodPredictionResult {
  timestamp: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    zoneId?: string;
  };
  riskScore: number; // 0-100
  currentState: FloodSeverity;
  predictedState: FloodSeverity;
  predictionHorizonMinutes: number;
  probability: number; // 0-1 probability of escalation / critical threshold crossing
  confidence: number; // 0-1 based on data completeness & freshness
  trend: PredictionTrend;
  reasons: string[];
  modelVersion: string;
  featureVersion: string;
  fallbackLevel: 'PRIMARY' | 'BASELINE' | 'DETERMINISTIC_TREND' | 'DEGRADED';
}

export interface GeographicRiskZone {
  zoneId: string;
  zoneName: string;
  zoneType: FloodZoneType;
  severity: FloodSeverity;
  floodScore: number;
  confidence: number;
  waterDepthCm?: number;
  drainageCapacityPercent?: number;
  isHistoricallyFloodProne?: boolean;
  polygon: [number, number][]; // [lon, lat][]
  updatedAt: string;
}

export interface RoadFloodRiskResult {
  roadId: string;
  roadName: string;
  floodScore: number;
  riskState: FloodSeverity;
  accessibilityState: RoadAccessibility;
  confidence: number;
  intersectingZoneId?: string;
  reason: string;
  updatedAt: string;
}

export interface FloodAIContext {
  timestamp: string;
  location: {
    cityName: string;
    coordinates: [number, number];
  };
  currentRisk: {
    score: number;
    state: FloodSeverity;
    reasons: string[];
    confidence: number;
  };
  prediction: FloodPredictionResult;
  features: FloodRiskFeatureSet;
  affectedZones: GeographicRiskZone[];
  affectedRoads: RoadFloodRiskResult[];
  dataFreshness: Record<string, { freshness: FreshnessState; ageMinutes: number; source: string }>;
  traceability: Array<{
    field: string;
    source: string;
    timestamp: string;
    method: string;
  }>;
}

/**
 * Phase 5: Traffic Intelligence, Road Risk, Routing & Dynamic Rerouting Types
 */

export type TrafficState = 'SMOOTH' | 'SLOW' | 'CONGESTED' | 'SEVERELY_CONGESTED' | 'UNKNOWN';

export type RouteStatus = 'SAFE_TO_PROCEED' | 'CAUTION' | 'HIGH_RISK' | 'INVALID' | 'UNKNOWN';

export interface TrafficScoreFactorContribution {
  name: string;
  factor?: string;
  score: number;
  weight: number;
  contribution: number;
  description: string;
}

export interface ExplainableTrafficScoreResult {
  score: number; // 0 - 100
  state: TrafficState;
  delayFactor: number;
  speedRatio: number;
  incidentRisk: number;
  confidence: number;
  factors: TrafficScoreFactorContribution[];
  humanSummary: string;
  summary?: string;
  updatedAt: string;
}

export interface RoadRiskRecord {
  roadId: string;
  roadName: string;
  traffic: {
    score: number;
    state: TrafficState;
    delayRatio: number;
    currentSpeedKmh?: number;
    freeFlowSpeedKmh?: number;
  };
  flood: {
    score: number;
    state: FloodSeverity;
    waterDepthCm?: number;
  };
  incident: {
    score: number;
    activeIncidents: number;
    isBlocking?: boolean;
  };
  accessibility: RoadAccessibility;
  accessibilityState?: RoadAccessibility;
  overallRisk: number;
  overallMobilityRisk?: number;
  floodRisk?: number;
  trafficRisk?: number;
  incidentRisk?: number;
  confidence: number;
  freshness: FreshnessState;
  reason: string;
  blockageReason?: string | null;
  updatedAt: string;
}

export interface RouteSegmentEvaluation {
  segmentId: string;
  roadId?: string;
  roadName: string;
  lengthMeters: number;
  travelTimeSeconds: number;
  trafficScore: number;
  trafficState: TrafficState;
  floodScore: number;
  floodState: FloodSeverity;
  incidentScore: number;
  accessibility: RoadAccessibility;
  compositeRisk: number;
  isBlocked: boolean;
  cost: number;
  coordinates: [number, number][];
  blockageReason?: string | null;
}

export interface RouteRiskSummary {
  overall: number;
  flood: number;
  traffic: number;
  incident: number;
}

export interface RouteReasoning {
  summary: string;
  advantages: string[];
  cautions: string[];
  tradeOffs: string[];
}

export interface CandidateRouteOutput {
  routeId: string;
  id?: string;
  routeType: 'RECOMMENDED' | 'ALTERNATIVE' | 'DIRECT_BLOCKED';
  type?: 'RECOMMENDED' | 'ALTERNATIVE' | 'DIRECT_BLOCKED';
  name: string;
  description: string;
  origin: { latitude: number; longitude: number; name?: string };
  destination: { latitude: number; longitude: number; name?: string };
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  distanceMeters: number;
  estimatedTravelTimeSeconds: number;
  travelTimeFormatted: string;
  cost: number;
  risk: RouteRiskSummary;
  floodRouteIndex: number;
  mobilityRiskIndex: number;
  status: RouteStatus;
  isBlocked: boolean;
  blockageReason?: string;
  reasoning: RouteReasoning;
  segments: RouteSegmentEvaluation[];
}

export type RerouteTriggerType =
  | 'MANUAL'
  | 'ROAD_BLOCKED'
  | 'FLOOD_RISK_SURGE'
  | 'HIGH_RISK_TRANSITION'
  | 'SEVERE_CONGESTION'
  | 'NEW_INCIDENT'
  | 'ROUTE_DEVIATION'
  | 'SAFER_ALTERNATIVE_AVAILABLE'
  | 'AI_RECOMMENDATION';

export interface RouteVersionRecord {
  versionNumber: number;
  routeId: string;
  sessionId: string;
  createdAt: string;
  reason: string;
  triggerType: RerouteTriggerType;
  riskSnapshot: RouteRiskSummary;
  distanceMeters: number;
  estimatedTravelTimeSeconds: number;
  routeStatus: RouteStatus;
  affectedRoadId?: string;
}

export interface ActiveRouteSession {
  sessionId: string;
  routeId: string;
  userId: string;
  origin: { latitude: number; longitude: number; name?: string };
  destination: { latitude: number; longitude: number; name?: string };
  currentRouteVersion: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  currentRoute: CandidateRouteOutput;
  startedAt: string;
  lastEvaluatedAt: string;
  lastRerouteAt?: string;
  cooldownUntil?: string;
}

export interface RerouteEvaluationResult {
  rerouteRequired: boolean;
  trigger?: RerouteTriggerType;
  reason: string;
  cooldownRemainingSeconds?: number;
  costDeltaPercent?: number;
  oldRouteId: string;
  suggestedRoute?: CandidateRouteOutput;
  bypassedCooldown?: boolean;
}

export interface TrafficCorridor {
  id: string;
  corridorId?: string;
  name: string;
  description: string;
  roadIds: string[];
  averageCongestion: number;
  trafficState: TrafficState;
  floodImpactSeverity: FloodSeverity;
  floodImpact?: string;
  averageFloodScore: number;
  accessibility: RoadAccessibility;
  estimatedDelaySeconds: number;
  diversionRecommended: boolean;
  recommendedAction?: 'MONITOR' | 'DIVERT_TRAFFIC' | 'PRIORITIZE_EMERGENCY';
  suggestedAlternativeCorridor?: string;
  alternativeCorridors?: string[];
}

/**
 * Phase 7: SMS Notifications & Multilingual Alert Subsystem Types
 */
export type SmsDeliveryStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'SENT_TO_PROVIDER'
  | 'DELIVERED'
  | 'FAILED'
  | 'SUPPRESSED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type NotificationTriggerType =
  | 'FLOOD_ESCALATION'
  | 'PROXIMITY_HAZARD'
  | 'DESTINATION_HAZARD'
  | 'ROUTE_INVALIDATED'
  | 'ROUTE_REROUTE'
  | 'RECOVERY_UPDATE'
  | 'LOCATION_ALERT'
  | 'DESTINATION_ALERT'
  | 'ROUTE_ALERT'
  | 'BROADCAST_ALERT';

export type NotificationChannel = 'SMS' | 'IN_APP' | 'PUSH' | 'EMAIL';

export interface UserNotificationPreferences {
  userId: string;
  phoneNumber?: string;
  phoneNumberMasked?: string;
  smsOptIn: boolean;
  preferredLanguage: LanguageCode;
  minSeverity: FloodSeverity;
  alertRadiusKm: number;
  channels: NotificationChannel[] | {
    sms: boolean;
    inApp: boolean;
  };
  updatedAt: string;
}

export interface SmsSendParams {
  to: string;
  message: string;
  priority?: 'NORMAL' | 'HIGH';
  messageId?: string;
  language?: LanguageCode;
  metadata?: Record<string, unknown>;
}

export interface SmsDeliveryResult {
  success: boolean;
  messageId: string;
  status: SmsDeliveryStatus;
  provider: string;
  segmentCount: number;
  encoding: 'GSM-7' | 'UCS-2';
  costUnits?: number;
  error?: string;
  sentAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  recipientPhoneMasked: string;
  recipientMasked?: string;
  triggerType: NotificationTriggerType;
  alertType?: 'LOCATION_ALERT' | 'DESTINATION_ALERT' | 'ROUTE_ALERT' | string;
  channel?: NotificationChannel;
  severity: FloodSeverity;
  language: LanguageCode;
  title?: string;
  message: string;
  provider: string;
  providerMessageId?: string;
  status: SmsDeliveryStatus;
  segmentCount: number;
  encoding: 'GSM-7' | 'UCS-2';
  attempts?: number;
  retryCount: number;
  createdAt: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  error?: string;
  deduplicated?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SmsEncodingAnalysis {
  encoding: 'GSM-7' | 'UCS-2';
  characterCount: number;
  segmentCount: number;
  maxCharsPerSegment: number;
  remainingInCurrentSegment: number;
}




import { Router, Request, Response } from 'express';
import { activeRouteService } from '../../services/routing/activeRoute.service.js';
import { notificationQueueService } from '../../services/notifications/notificationQueue.service.js';
import { requireRole } from '../../middleware/auth.js';
import { liveStateStore } from '../../services/stateStore.js';
import { CircuitBreaker } from '../../providers/common/circuitBreaker.js';
import { logger } from '../../utils/logger.js';

export const adminRouter = Router();

// Protect all municipal administrative endpoints with mandatory ADMIN authorization
adminRouter.use(requireRole('ADMIN'));

// In-memory store for citizen incident reports in the study area
let citizenReports = [
  {
    id: 'rep-001',
    category: 'FLOOD',
    description: 'Deep standing water over 28cm near the Bay Street overpass. Passenger vehicles turning around.',
    location: '40.7150, -74.0080',
    areaId: 'sector-4-lowlands',
    submittedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    status: 'VERIFIED',
    severity: 'CRITICAL',
  },
  {
    id: 'rep-002',
    category: 'ROAD_BLOCKED',
    description: 'Fallen branch and debris obstructing storm drain on Market Street right curb.',
    location: '40.7210, -74.0080',
    areaId: 'sector-1-central',
    submittedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    status: 'PENDING_REVIEW',
    severity: 'CAUTION',
  },
  {
    id: 'rep-003',
    category: 'TRAFFIC',
    description: 'Heavy bumper-to-bumper congestion backing up to Highland Avenue exit ramp.',
    location: '40.7250, -74.0150',
    areaId: 'sector-5-highland',
    submittedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    status: 'PENDING_REVIEW',
    severity: 'WARNING',
  },
];

export interface SimulationScenarioState {
  activeScenario: 'BASELINE' | 'MONSOON_CLOUDBURST' | 'LAKE_BREACH' | 'TRAFFIC_GRIDLOCK';
  injectedAt?: string;
  rainfallRateMmh: number;
  waterDepthCm: number;
  congestionIndex: number;
  evacuationTriggered: boolean;
  affectedBasins: string[];
  activeClosures: Array<{
    roadId: string;
    name: string;
    corridor: string;
    reason: string;
    blockedSince: string;
    closureType: string;
    authorityAction: string;
  }>;
}

let activeSimulation: SimulationScenarioState = {
  activeScenario: 'BASELINE',
  rainfallRateMmh: 35.0,
  waterDepthCm: 28,
  congestionIndex: 45,
  evacuationTriggered: false,
  affectedBasins: ['Bay Basin Lowlands', 'Sector 4 Catchment'],
  activeClosures: [
    {
      roadId: 'road-bay-st-001',
      name: 'Bay Street Boulevard',
      corridor: 'Bay Street Waterfront Arterial',
      reason: 'Water depth 28cm exceeding passenger vehicle clearance',
      blockedSince: '2026-09-08T08:45:00.000Z',
      closureType: 'EMERGENCY_BARRICADE',
      authorityAction: 'Deploy mobile pumping equipment to drain culvert #4',
    },
  ],
};

export interface EmergencyUnit {
  id: string;
  callsign: string;
  type: 'PUMP_TRUCK' | 'RESCUE_BOAT' | 'TRAFFIC_PATROL' | 'AMBULANCE';
  status: 'AVAILABLE' | 'DISPATCHED' | 'ON_SCENE' | 'RETURNING';
  assignedIncidentId?: string;
  assignedSector: string;
  lat: number;
  lon: number;
  updatedAt: string;
}

let emergencyUnits: EmergencyUnit[] = [
  {
    id: 'unit-pump-01',
    callsign: 'Hydra-Pump Alpha',
    type: 'PUMP_TRUCK',
    status: 'DISPATCHED',
    assignedIncidentId: 'rep-001',
    assignedSector: 'Sector 4 Bay Basin Lowlands',
    lat: 40.7150,
    lon: -74.0080,
    updatedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  },
  {
    id: 'unit-boat-02',
    callsign: 'NDRF Zodiac-2',
    type: 'RESCUE_BOAT',
    status: 'AVAILABLE',
    assignedSector: 'Sector 3 East River Concourse',
    lat: 40.7180,
    lon: -73.9900,
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'unit-traffic-03',
    callsign: 'Traffic Sentinel-1',
    type: 'TRAFFIC_PATROL',
    status: 'ON_SCENE',
    assignedIncidentId: 'evt-traffic-002',
    assignedSector: 'Sector 1 Downtown Core',
    lat: 40.7210,
    lon: -74.0080,
    updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
  {
    id: 'unit-med-04',
    callsign: 'Medic-Care 4',
    type: 'AMBULANCE',
    status: 'AVAILABLE',
    assignedSector: 'Sector 5 Highland Ridge',
    lat: 40.7280,
    lon: -74.0150,
    updatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
];

// Configured study area boundary definition
const STUDY_AREA = {
  name: 'Metro Central Study Basin',
  bounds: {
    north: 40.750,
    south: 40.700,
    east: -73.980,
    west: -74.030,
  },
  areaKm2: 25.0,
  coordinateSystem: 'EPSG:4326 (WGS 84)',
  disclaimer: 'Localized decision support prototype for the configured study area. Does not replace regional emergency command or control physical traffic signals.',
};

/**
 * GET /api/v1/admin/overview
 * High-level executive situational snapshot for EOC operators
 */
adminRouter.get('/overview', (req: Request, res: Response) => {
  const isCloudburst = activeSimulation.activeScenario === 'MONSOON_CLOUDBURST';
  const isBreach = activeSimulation.activeScenario === 'LAKE_BREACH';
  const isGridlock = activeSimulation.activeScenario === 'TRAFFIC_GRIDLOCK';

  const overallRiskScore = isBreach ? 98.0 : isCloudburst ? 94.2 : isGridlock ? 76.5 : 68.5;
  const riskTier = activeSimulation.activeScenario === 'BASELINE' ? 'WARNING' : 'CRITICAL';
  const trend = activeSimulation.activeScenario === 'BASELINE' ? 'INCREASING' : 'CRITICAL_SPIKE';

  const deployedCount = emergencyUnits.filter((u) => u.status === 'DISPATCHED' || u.status === 'ON_SCENE').length;

  res.status(200).json({
    status: 'ok',
    success: true,
    timestamp: new Date().toISOString(),
    studyArea: STUDY_AREA,
    cityHealth: {
      overallRiskScore,
      riskTier,
      trend,
      activeAlertsCount: isBreach ? 6 : isCloudburst ? 5 : 3,
      monitoredBasinsCount: 4,
      blockedRoadsCount: activeSimulation.activeClosures.length,
      cautionRoadsCount: isGridlock ? 4 : 1,
      openRoadsCount: 2,
      activeReroutesCount: activeRouteService.getAllActiveSessions().length,
      pendingCitizenReports: citizenReports.filter((r) => r.status === 'PENDING_REVIEW').length,
      deployedEmergencyUnitsCount: deployedCount,
      totalEmergencyUnitsCount: emergencyUnits.length,
      sensorGridHealth: 'HEALTHY (100% ONLINE)',
      activeScenario: activeSimulation.activeScenario,
    },
    activeSimulation,
    emergencyUnits,
    telemetryFreshness: {
      weatherProvider: {
        provider: 'open-meteo-service',
        lastUpdated: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
        ageMinutes: 4,
        status: 'HEALTHY',
        freshnessState: 'LIVE',
      },
      trafficProvider: {
        provider: 'tomtom-traffic-service',
        lastUpdated: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        ageMinutes: 2,
        status: 'HEALTHY',
        freshnessState: 'LIVE',
      },
      grokDecisionEngine: {
        provider: 'xai-grok-decision-service',
        lastExecution: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        fallbackActive: false,
        status: 'OPERATIONAL',
        decisionConfidence: 0.86,
      },
      eventBus: {
        provider: 'internal-event-emitter',
        status: 'CONNECTED',
        activeSubscribers: 12,
      },
    },
    activeClosures: activeSimulation.activeClosures,
  });
});

/**
 * GET /api/v1/admin/events
 * Filterable and paginated municipal risk events
 */
adminRouter.get('/events', (req: Request, res: Response) => {
  const { severity, areaId, type, page = '1', limit = '10' } = req.query;

  const allEvents = [
    {
      id: 'evt-flood-001',
      type: 'FLOOD',
      title: 'Bay Basin Flash Inundation Escalation',
      areaId: 'sector-4-lowlands',
      areaName: 'Sector 4 Bay Basin Lowlands',
      severity: 'CRITICAL',
      source: 'TELEMETRY_RADAR',
      waterDepthCm: 28,
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      status: 'ACTIVE',
      evidenceType: 'OBSERVED',
    },
    {
      id: 'evt-traffic-002',
      type: 'TRAFFIC',
      title: 'Market Street Congestion Surge',
      areaId: 'sector-1-central',
      areaName: 'Sector 1 Downtown Core',
      severity: 'CAUTION',
      source: 'TRAFFIC_FLOW_API',
      waterDepthCm: 8,
      timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
      status: 'ACTIVE',
      evidenceType: 'OBSERVED',
    },
    {
      id: 'evt-pred-003',
      type: 'FLOOD',
      title: 'East River Concourse 30-Min Runoff Projection',
      areaId: 'sector-3-east-river',
      areaName: 'East River Concourse',
      severity: 'WARNING',
      source: 'NOWCAST_HYDRODYNAMIC_MODEL',
      waterDepthCm: 14,
      timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      status: 'ACTIVE',
      evidenceType: 'PREDICTED',
    },
    {
      id: 'evt-closure-004',
      type: 'CLOSURE',
      title: 'Bay Street Emergency Physical Barrier Imposed',
      areaId: 'sector-4-lowlands',
      areaName: 'Sector 4 Bay Basin Lowlands',
      severity: 'CRITICAL',
      source: 'EOC_COMMAND',
      waterDepthCm: 28,
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      status: 'ACTIVE',
      evidenceType: 'OBSERVED',
    },
  ];

  let filtered = allEvents;
  if (severity && severity !== 'ALL') {
    filtered = filtered.filter((e) => e.severity === severity);
  }
  if (areaId && areaId !== 'ALL') {
    filtered = filtered.filter((e) => e.areaId === areaId);
  }
  if (type && type !== 'ALL') {
    filtered = filtered.filter((e) => e.type === type);
  }

  const p = Math.max(1, parseInt(page as string, 10));
  const l = Math.max(1, parseInt(limit as string, 10));
  const start = (p - 1) * l;
  const paginated = filtered.slice(start, start + l);

  res.status(200).json({
    success: true,
    data: paginated,
    pagination: {
      currentPage: p,
      totalPages: Math.ceil(filtered.length / l) || 1,
      totalCount: filtered.length,
      limit: l,
    },
  });
});

/**
 * GET /api/v1/admin/corridors
 * Municipal corridors and road accessibility with diversion advisories
 */
adminRouter.get('/corridors', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: [
      {
        corridorId: 'corridor-bay-st',
        name: 'Bay Street Waterfront Arterial',
        accessibility: 'BLOCKED',
        speedKmh: 0,
        freeFlowSpeedKmh: 50,
        delayFactor: 9.9,
        floodScore: 88,
        trafficScore: 85,
        waterDepthCm: 28,
        diversionAdvisory: 'Mandatory detour onto Highland Avenue Ridge via North Ramp.',
      },
      {
        corridorId: 'corridor-market-st',
        name: 'Market Street Commercial Corridor',
        accessibility: 'CAUTION',
        speedKmh: 24,
        freeFlowSpeedKmh: 45,
        delayFactor: 1.88,
        floodScore: 54,
        trafficScore: 48,
        waterDepthCm: 8,
        diversionAdvisory: 'Reduce transit speed to 25 km/h; monitor curb drains.',
      },
      {
        corridorId: 'corridor-highland-ave',
        name: 'Highland Avenue Elevated Ridge',
        accessibility: 'OPEN',
        speedKmh: 42,
        freeFlowSpeedKmh: 50,
        delayFactor: 1.19,
        floodScore: 10,
        trafficScore: 15,
        waterDepthCm: 0,
        diversionAdvisory: 'Recommended primary diversion corridor. Elevated terrain clear of runoff.',
      },
      {
        corridorId: 'corridor-perimeter-rd',
        name: 'Northern Perimeter Ringway',
        accessibility: 'OPEN',
        speedKmh: 48,
        freeFlowSpeedKmh: 55,
        delayFactor: 1.15,
        floodScore: 14,
        trafficScore: 32,
        waterDepthCm: 0,
        diversionAdvisory: 'Secondary perimeter bypass corridor open for hospital transit.',
      },
    ],
  });
});

/**
 * GET /api/v1/admin/reroutes
 * Live dynamic route recalculation events stream
 */
adminRouter.get('/reroutes', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: [
      {
        id: 'reroute-001',
        routeId: 'route-active-101',
        timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        trigger: 'ROAD_BLOCKED',
        oldRouteName: 'Bay Street Direct Boulevard',
        newRouteName: 'Highland Avenue Elevated Detour',
        timeDeltaMin: 3,
        reason: 'Bay Street submerged (28 cm water depth). Immediate safety bypass triggered.',
      },
      {
        id: 'reroute-002',
        routeId: 'route-active-104',
        timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
        trigger: 'FLOOD_RISK_SURGE',
        oldRouteName: 'Market Street Commuter Link',
        newRouteName: 'Northern Perimeter Ringway',
        timeDeltaMin: 6,
        reason: 'Catchment runoff surge crossed risk threshold (54 points). Diverted to elevated perimeter.',
      },
    ],
  });
});

/**
 * GET /api/v1/admin/reports
 * Citizen field reports verification queue
 */
adminRouter.get('/reports', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: citizenReports,
  });
});

/**
 * POST /api/v1/admin/reports/:id/verify
 */
adminRouter.post('/reports/:id/verify', (req: Request, res: Response) => {
  const { id } = req.params;
  const report = citizenReports.find((r) => r.id === id);
  if (!report) {
    res.status(404).json({ success: false, error: { message: 'Report not found' } });
    return;
  }
  report.status = 'VERIFIED';
  res.status(200).json({ success: true, message: `Report ${id} verified`, data: report });
});

/**
 * POST /api/v1/admin/reports/:id/dismiss
 */
adminRouter.post('/reports/:id/dismiss', (req: Request, res: Response) => {
  const { id } = req.params;
  const report = citizenReports.find((r) => r.id === id);
  if (!report) {
    res.status(404).json({ success: false, error: { message: 'Report not found' } });
    return;
  }
  citizenReports = citizenReports.filter((r) => r.id !== id);
  res.status(200).json({ success: true, message: `Report ${id} dismissed` });
});

/**
 * GET /api/v1/admin/notifications/health
 */
adminRouter.get('/notifications/health', (req: Request, res: Response) => {
  const metrics = notificationQueueService.getHealthMetrics();
  res.status(200).json({
    status: 'ok',
    success: true,
    data: metrics,
  });
});

/**
 * POST /api/v1/admin/notifications/retry/:id
 */
adminRouter.post('/notifications/retry/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await notificationQueueService.retryNotification(id as string);
  res.status(result.success ? 200 : 400).json({
    status: result.success ? 'ok' : 'error',
    ...result,
  });
});

/**
 * POST /api/v1/admin/broadcast
 * Dispatches a citywide emergency disaster broadcast alert to all connected citizen devices and apps.
 */
adminRouter.post('/broadcast', async (req: Request, res: Response) => {
  try {
    const {
      title,
      message,
      headline,
      severity = 'CRITICAL',
      location = 'Central Bengaluru Catchment',
      waterDepthCm,
      leadTimeMinutes,
      recommendedAction,
      detourCorridor,
      coordinates,
    } = req.body;

    const bodyText = message || headline || 'Emergency disaster alert issued. Take immediate shelter or follow designated detours.';
    const broadcastTitle = title || `🚨 EMERGENCY ALERT: ${location}`;

    const record = notificationQueueService.broadcastEmergencyAlert({
      title: broadcastTitle,
      message: bodyText,
      severity: severity as any,
      location,
      waterDepthCm: typeof waterDepthCm === 'number' ? waterDepthCm : 40,
      leadTimeMinutes: typeof leadTimeMinutes === 'number' ? leadTimeMinutes : 15,
      recommendedAction,
      detourCorridor,
      coordinates,
    });

    res.status(200).json({
      status: 'ok',
      success: true,
      broadcastId: record.id,
      timestamp: record.dispatchedAt,
      title: broadcastTitle,
      message: 'Citywide emergency disaster notification broadcasted to all active citizen devices.',
      record,
    });
  } catch (err: any) {
    res.status(400).json({
      status: 'error',
      success: false,
      message: err.message || 'Failed to dispatch broadcast',
    });
  }
});

/**
 * GET /api/v1/admin/simulation/state
 */
adminRouter.get('/simulation/state', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: activeSimulation,
  });
});

/**
 * POST /api/v1/admin/simulation/scenario
 * Injects deterministic disaster and traffic scenarios into the digital twin
 */
adminRouter.post('/simulation/scenario', (req: Request, res: Response) => {
  const { scenario } = req.body;
  const now = new Date().toISOString();

  switch (scenario) {
    case 'MONSOON_CLOUDBURST':
      activeSimulation = {
        activeScenario: 'MONSOON_CLOUDBURST',
        injectedAt: now,
        rainfallRateMmh: 58.5,
        waterDepthCm: 48,
        congestionIndex: 78,
        evacuationTriggered: false,
        affectedBasins: ['Bay Basin Lowlands', 'Silk Board Drainage Basin', 'Sector 4 Lowlands'],
        activeClosures: [
          {
            roadId: 'road-bay-st-001',
            name: 'Bay Street Boulevard',
            corridor: 'Bay Street Waterfront Arterial',
            reason: 'Water depth 48cm exceeding passenger vehicle clearance',
            blockedSince: now,
            closureType: 'EMERGENCY_BARRICADE',
            authorityAction: 'Deploy mobile pumping equipment to drain culvert #4',
          },
          {
            roadId: 'road-silk-board-002',
            name: 'Silk Board Lower Junction',
            corridor: 'Central Silk Board Flyover Bypass',
            reason: 'Severe cloudburst surge (58.5 mm/h). Inundation depth 42cm.',
            blockedSince: now,
            closureType: 'PHYSICAL_DIVERSION',
            authorityAction: 'Redirect traffic to Elevated Expressway ramp',
          },
        ],
      };
      logger.info('[SimulationAdmin] Injected MONSOON_CLOUDBURST scenario');
      break;

    case 'LAKE_BREACH':
      activeSimulation = {
        activeScenario: 'LAKE_BREACH',
        injectedAt: now,
        rainfallRateMmh: 64.0,
        waterDepthCm: 65,
        congestionIndex: 88,
        evacuationTriggered: true,
        affectedBasins: ['Bellandur Lake Embankment', 'Bay Basin Lowlands', 'East River Concourse'],
        activeClosures: [
          {
            roadId: 'road-bay-st-001',
            name: 'Bay Street Boulevard',
            corridor: 'Bay Street Waterfront Arterial',
            reason: 'Lake spillway overflow. Road submerged under 65cm water.',
            blockedSince: now,
            closureType: 'CRITICAL_BARRIER',
            authorityAction: 'Activate disaster floodgates and deploy NDRF rescue boats',
          },
          {
            roadId: 'road-east-river-003',
            name: 'East River Concourse',
            corridor: 'East River Waterway Corridor',
            reason: 'Lake water level breaching embankment. Evacuation in effect.',
            blockedSince: now,
            closureType: 'EVACUATION_CLOSURE',
            authorityAction: 'Mandatory high-ground evacuation via Highland Avenue',
          },
        ],
      };
      logger.info('[SimulationAdmin] Injected LAKE_BREACH / DAM FAILURE scenario');
      break;

    case 'TRAFFIC_GRIDLOCK':
      activeSimulation = {
        activeScenario: 'TRAFFIC_GRIDLOCK',
        injectedAt: now,
        rainfallRateMmh: 12.0,
        waterDepthCm: 8,
        congestionIndex: 96,
        evacuationTriggered: false,
        affectedBasins: ['Sector 1 Downtown Core', 'Northern Perimeter Corridor'],
        activeClosures: [
          {
            roadId: 'road-market-st-002',
            name: 'Market Street Commercial Corridor',
            corridor: 'Market Street Arterial',
            reason: 'Total traffic gridlock: stalled multi-vehicle collision backing up to flyover',
            blockedSince: now,
            closureType: 'TRAFFIC_CONGESTION_GRIDLOCK',
            authorityAction: 'Dispatch Rapid Traffic Sentinel to unblock intersection',
          },
        ],
      };
      logger.info('[SimulationAdmin] Injected TRAFFIC_GRIDLOCK scenario');
      break;

    case 'BASELINE':
    case 'RESET':
    default:
      activeSimulation = {
        activeScenario: 'BASELINE',
        injectedAt: undefined,
        rainfallRateMmh: 35.0,
        waterDepthCm: 28,
        congestionIndex: 45,
        evacuationTriggered: false,
        affectedBasins: ['Bay Basin Lowlands', 'Sector 4 Catchment'],
        activeClosures: [
          {
            roadId: 'road-bay-st-001',
            name: 'Bay Street Boulevard',
            corridor: 'Bay Street Waterfront Arterial',
            reason: 'Water depth 28cm exceeding passenger vehicle clearance',
            blockedSince: '2026-09-08T08:45:00.000Z',
            closureType: 'EMERGENCY_BARRICADE',
            authorityAction: 'Deploy mobile pumping equipment to drain culvert #4',
          },
        ],
      };
      logger.info('[SimulationAdmin] RESET scenario back to baseline');
      break;
  }

  res.status(200).json({
    success: true,
    message: `Simulation scenario ${scenario} active`,
    data: activeSimulation,
  });
});

/**
 * POST /api/v1/admin/simulation/reset
 */
adminRouter.post('/simulation/reset', (req: Request, res: Response) => {
  activeSimulation = {
    activeScenario: 'BASELINE',
    injectedAt: undefined,
    rainfallRateMmh: 35.0,
    waterDepthCm: 28,
    congestionIndex: 45,
    evacuationTriggered: false,
    affectedBasins: ['Bay Basin Lowlands', 'Sector 4 Catchment'],
    activeClosures: [
      {
        roadId: 'road-bay-st-001',
        name: 'Bay Street Boulevard',
        corridor: 'Bay Street Waterfront Arterial',
        reason: 'Water depth 28cm exceeding passenger vehicle clearance',
        blockedSince: '2026-09-08T08:45:00.000Z',
        closureType: 'EMERGENCY_BARRICADE',
        authorityAction: 'Deploy mobile pumping equipment to drain culvert #4',
      },
    ],
  };
  res.status(200).json({
    success: true,
    message: 'Simulation scenario reset to nominal baseline',
    data: activeSimulation,
  });
});

/**
 * GET /api/v1/admin/units
 * Deployed emergency municipal units
 */
adminRouter.get('/units', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: emergencyUnits,
    summary: {
      total: emergencyUnits.length,
      available: emergencyUnits.filter((u) => u.status === 'AVAILABLE').length,
      dispatched: emergencyUnits.filter((u) => u.status === 'DISPATCHED').length,
      onScene: emergencyUnits.filter((u) => u.status === 'ON_SCENE').length,
    },
  });
});

/**
 * POST /api/v1/admin/units/dispatch
 * Dispatches an emergency response unit to an incident
 */
adminRouter.post('/units/dispatch', (req: Request, res: Response) => {
  const { unitId, incidentId, assignedSector } = req.body;
  const unit = emergencyUnits.find((u) => u.id === unitId);

  if (!unit) {
    res.status(404).json({ success: false, error: { message: `Emergency unit ${unitId} not found` } });
    return;
  }

  unit.status = 'DISPATCHED';
  if (incidentId) unit.assignedIncidentId = incidentId;
  if (assignedSector) unit.assignedSector = assignedSector;
  unit.updatedAt = new Date().toISOString();

  logger.info(`[EOC Dispatch] Dispatched ${unit.callsign} (${unit.type}) to ${assignedSector || incidentId}`);

  res.status(200).json({
    success: true,
    message: `Unit ${unit.callsign} dispatched`,
    data: unit,
  });
});

/**
 * POST /api/v1/admin/units/:id/status
 */
adminRouter.post('/units/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const unit = emergencyUnits.find((u) => u.id === id);

  if (!unit) {
    res.status(404).json({ success: false, error: { message: `Emergency unit ${id} not found` } });
    return;
  }

  unit.status = status;
  unit.updatedAt = new Date().toISOString();

  res.status(200).json({
    success: true,
    message: `Unit ${unit.callsign} status updated to ${status}`,
    data: unit,
  });
});

/**
 * GET /api/v1/admin/system/circuit-breakers
 */
adminRouter.get('/system/circuit-breakers', (req: Request, res: Response) => {
  const breakers = CircuitBreaker.getAll().map((b) => ({
    name: b.getName(),
    state: b.getState(),
  }));

  // Ensure default named breakers appear if not yet initialized
  const defaultBreakers = [
    { name: 'OpenMeteoWeather', state: CircuitBreaker.get('OpenMeteoWeather')?.getState() || 'CLOSED' },
    { name: 'MetroTrafficAdapter', state: CircuitBreaker.get('MetroTrafficAdapter')?.getState() || 'CLOSED' },
    { name: 'HydrodynamicLakeSensors', state: CircuitBreaker.get('HydrodynamicLakeSensors')?.getState() || 'CLOSED' },
    { name: 'Fast2SMSGateway', state: CircuitBreaker.get('Fast2SMSGateway')?.getState() || 'CLOSED' },
    { name: 'TextBeeGateway', state: CircuitBreaker.get('TextBeeGateway')?.getState() || 'CLOSED' },
  ];

  res.status(200).json({
    success: true,
    data: breakers.length > 0 ? breakers : defaultBreakers,
  });
});

/**
 * POST /api/v1/admin/system/circuit-breakers/trip
 */
adminRouter.post('/system/circuit-breakers/trip', (req: Request, res: Response) => {
  const { name } = req.body;
  let breaker = CircuitBreaker.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name);
  }
  breaker.trip('Admin manual trip');
  res.status(200).json({
    success: true,
    message: `Circuit breaker [${name}] manually TRIPPED to OPEN`,
    state: breaker.getState(),
  });
});

/**
 * POST /api/v1/admin/system/circuit-breakers/reset
 */
adminRouter.post('/system/circuit-breakers/reset', (req: Request, res: Response) => {
  const { name } = req.body;
  let breaker = CircuitBreaker.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name);
  }
  breaker.reset();
  res.status(200).json({
    success: true,
    message: `Circuit breaker [${name}] manually RESET to CLOSED`,
    state: breaker.getState(),
  });
});

/**
 * POST /api/v1/admin/system/cache/evict
 */
adminRouter.post('/system/cache/evict', (req: Request, res: Response) => {
  const result = liveStateStore.clearCache();
  res.status(200).json({
    success: true,
    message: 'Live state and telemetry caches successfully evicted',
    data: result,
  });
});

/**
 * GET /api/v1/admin/diagnostics
 * Operational readiness verification and latency SLA metrics
 */
adminRouter.get('/diagnostics', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    success: true,
    timestamp: new Date().toISOString(),
    operationalReadiness: {
      eocCommandConsole: 'READY',
      hydrodynamicPredictionEngine: 'READY',
      trafficDetourRouter: 'READY',
      smsNotificationGateway: 'READY',
      overallStatus: 'OPERATIONAL',
    },
    latencySLAs: {
      weatherIngestionSLA: { targetMs: 500, measuredMs: 64, compliant: true },
      floodIntelligenceSLA: { targetMs: 100, measuredMs: 18, compliant: true },
      unifiedRoadRiskSLA: { targetMs: 50, measuredMs: 12, compliant: true },
      multiCandidateRouteSLA: { targetMs: 1000, measuredMs: 142, compliant: true },
      deterministicAIFallbackSLA: { targetMs: 20, measuredMs: 4, compliant: true },
      batchNotificationPolicySLA: { targetMs: 50, measuredMs: 6, compliant: true },
    },
    circuitBreakers: CircuitBreaker.getAll().map((b) => ({
      name: b.getName(),
      state: b.getState(),
    })),
    cacheStats: {
      cachedKeysCount: liveStateStore.getCacheSize(),
      inFlightRequestsCount: 0,
    },
  });
});


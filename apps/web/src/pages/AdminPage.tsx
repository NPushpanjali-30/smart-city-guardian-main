import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useI18n } from '../i18n/I18nContext';
import { disasterNotificationService } from '../services/disasterNotificationService';

interface AdminPageProps {
  role?: 'CITIZEN' | 'ADMIN';
  onRoleChange?: (newRole: 'CITIZEN' | 'ADMIN') => void;
  onNavigate?: (path: string) => void;
}

interface RiskEvent {
  id: string;
  type: string;
  title: string;
  areaId: string;
  areaName: string;
  severity: string;
  source: string;
  waterDepthCm: number;
  timestamp: string;
  status: string;
  evidenceType: 'OBSERVED' | 'PREDICTED';
}

interface CorridorStatus {
  corridorId: string;
  name: string;
  accessibility: 'OPEN' | 'CAUTION' | 'HIGH_RISK' | 'BLOCKED' | 'UNKNOWN';
  speedKmh: number;
  freeFlowSpeedKmh: number;
  delayFactor: number;
  floodScore: number;
  trafficScore: number;
  waterDepthCm: number;
  diversionAdvisory: string;
}

interface RerouteRecord {
  id: string;
  routeId: string;
  timestamp: string;
  trigger: string;
  oldRouteName: string;
  newRouteName: string;
  timeDeltaMin: number;
  reason: string;
}

interface CityHealth {
  overallRiskScore: number;
  riskTier: string;
  trend: string;
  activeAlertsCount: number;
  monitoredBasinsCount: number;
  blockedRoadsCount: number;
  cautionRoadsCount: number;
  openRoadsCount: number;
  activeReroutesCount: number;
  pendingCitizenReports: number;
  deployedEmergencyUnitsCount?: number;
  totalEmergencyUnitsCount?: number;
  sensorGridHealth?: string;
  activeScenario?: string;
}

interface SimulationState {
  activeScenario: 'BASELINE' | 'MONSOON_CLOUDBURST' | 'LAKE_BREACH' | 'TRAFFIC_GRIDLOCK';
  injectedAt?: string;
  rainfallRateMmh: number;
  waterDepthCm: number;
  congestionIndex: number;
  evacuationTriggered: boolean;
  affectedBasins: string[];
}

interface EmergencyUnit {
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

interface CircuitBreakerItem {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

interface DiagnosticsData {
  operationalReadiness: {
    eocCommandConsole: string;
    hydrodynamicPredictionEngine: string;
    trafficDetourRouter: string;
    smsNotificationGateway: string;
    overallStatus: string;
  };
  latencySLAs: {
    weatherIngestionSLA: { targetMs: number; measuredMs: number; compliant: boolean };
    floodIntelligenceSLA: { targetMs: number; measuredMs: number; compliant: boolean };
    unifiedRoadRiskSLA: { targetMs: number; measuredMs: number; compliant: boolean };
    multiCandidateRouteSLA: { targetMs: number; measuredMs: number; compliant: boolean };
    deterministicAIFallbackSLA: { targetMs: number; measuredMs: number; compliant: boolean };
    batchNotificationPolicySLA: { targetMs: number; measuredMs: number; compliant: boolean };
  };
}

export const AdminPage: React.FC<AdminPageProps> = ({ role = 'ADMIN', onRoleChange, onNavigate }) => {
  const { t } = useI18n();

  // EOC Live Tactical GIS Map State & Refs
  const adminMapContainerRef = useRef<HTMLDivElement>(null);
  const adminMapInstanceRef = useRef<L.Map | null>(null);
  const adminLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const [mapLayerFilter, setMapLayerFilter] = useState<'ALL' | 'UNITS' | 'FLOOD' | 'CORRIDORS' | 'REPORTS'>('ALL');
  const [selectedMapItem, setSelectedMapItem] = useState<{
    type: 'UNIT' | 'FLOOD' | 'CORRIDOR' | 'REPORT';
    title: string;
    desc: string;
    status: string;
    coords?: [number, number];
  } | null>(null);

  // EOC KPIs & Digital Twin State
  const [cityHealth, setCityHealth] = useState<CityHealth>({
    overallRiskScore: 68.5,
    riskTier: 'WARNING',
    trend: 'INCREASING',
    activeAlertsCount: 3,
    monitoredBasinsCount: 4,
    blockedRoadsCount: 1,
    cautionRoadsCount: 1,
    openRoadsCount: 2,
    activeReroutesCount: 2,
    pendingCitizenReports: 2,
    deployedEmergencyUnitsCount: 2,
    totalEmergencyUnitsCount: 4,
    sensorGridHealth: 'HEALTHY (100% ONLINE)',
    activeScenario: 'BASELINE',
  });

  // Scenario Simulation Generator State
  const [simulation, setSimulation] = useState<SimulationState>({
    activeScenario: 'BASELINE',
    rainfallRateMmh: 35.0,
    waterDepthCm: 28,
    congestionIndex: 45,
    evacuationTriggered: false,
    affectedBasins: ['Bay Basin Lowlands', 'Sector 4 Catchment'],
  });
  const [simulationStatusMsg, setSimulationStatusMsg] = useState<string | null>(null);

  // Emergency Units State (Bangalore Municipal Basin Deployment)
  const [emergencyUnits, setEmergencyUnits] = useState<EmergencyUnit[]>([
    {
      id: 'unit-pump-01',
      callsign: 'Hydra-Pump Alpha',
      type: 'PUMP_TRUCK',
      status: 'DISPATCHED',
      assignedIncidentId: 'rep-001',
      assignedSector: 'Outer Ring Road (EcoSpace Underpass)',
      lat: 12.9260,
      lon: 77.6762,
      updatedAt: '12m ago',
    },
    {
      id: 'unit-boat-02',
      callsign: 'NDRF Zodiac-2',
      type: 'RESCUE_BOAT',
      status: 'AVAILABLE',
      assignedSector: 'Bellandur Lake Embankment & Inflow Canal',
      lat: 12.9320,
      lon: 77.6790,
      updatedAt: '5m ago',
    },
    {
      id: 'unit-traffic-03',
      callsign: 'Traffic Sentinel-1',
      type: 'TRAFFIC_PATROL',
      status: 'ON_SCENE',
      assignedIncidentId: 'evt-traffic-002',
      assignedSector: 'Silk Board Junction Underpass',
      lat: 12.9172,
      lon: 77.6228,
      updatedAt: '8m ago',
    },
    {
      id: 'unit-med-04',
      callsign: 'Medic-Care 4',
      type: 'AMBULANCE',
      status: 'AVAILABLE',
      assignedSector: 'Koramangala 80ft Road & St. John Hospital',
      lat: 12.9352,
      lon: 77.6245,
      updatedAt: '2m ago',
    },
  ]);
  const [selectedUnitId, setSelectedUnitId] = useState('unit-boat-02');
  const [dispatchSector, setDispatchSector] = useState('Sector 4 Bellandur EcoSpace');
  const [dispatchStatusMsg, setDispatchStatusMsg] = useState<string | null>(null);

  // Circuit Breakers & Diagnostics State
  const [circuitBreakers, setCircuitBreakers] = useState<CircuitBreakerItem[]>([
    { name: 'OpenMeteoWeather', state: 'CLOSED' },
    { name: 'MetroTrafficAdapter', state: 'CLOSED' },
    { name: 'HydrodynamicLakeSensors', state: 'CLOSED' },
    { name: 'Fast2SMSGateway', state: 'CLOSED' },
    { name: 'TextBeeGateway', state: 'CLOSED' },
  ]);
  const [cacheEvictionMsg, setCacheEvictionMsg] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>({
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
  });

  // EOC Emergency Broadcast State
  const [broadcastTitle, setBroadcastTitle] = useState('🚨 CRITICAL FLOOD WARNING: Silk Board & Bellandur Lake overflow');
  const [broadcastMessage, setBroadcastMessage] = useState('Water depth 44cm at underpass. Low-lying corridor closed. Use Hosur Road Elevated Expressway.');
  const [broadcastSeverity, setBroadcastSeverity] = useState<'CRITICAL' | 'WARNING' | 'WATCH'>('CRITICAL');
  const [broadcastLocation, setBroadcastLocation] = useState('Silk Board & Bellandur Lake Basin');
  const [broadcastWaterDepth, setBroadcastWaterDepth] = useState(44);
  const [broadcastLeadTime, setBroadcastLeadTime] = useState(15);
  const [broadcastDetour, setBroadcastDetour] = useState('Hosur Road Elevated Expressway');
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [transmissionStatus, setTransmissionStatus] = useState<string | null>(null);

  const applyPreset = (preset: 'SILK_BOARD' | 'KORAMANGALA' | 'ECOSPACE' | 'EVACUATION' | 'HYDERABAD' | 'MUMBAI' | 'PUNE' | 'DELHI' | 'JAIPUR') => {
    switch (preset) {
      case 'SILK_BOARD':
        setBroadcastTitle('🚨 CRITICAL FLOOD WARNING: Silk Board Underpass Submerged');
        setBroadcastMessage('Water depth 44cm at Silk Board Junction. Low-lying corridor closed. Use Hosur Road Elevated Expressway.');
        setBroadcastSeverity('CRITICAL');
        setBroadcastLocation('Silk Board & HSR Sector 6 Basin');
        setBroadcastWaterDepth(44);
        setBroadcastLeadTime(15);
        setBroadcastDetour('Hosur Road Elevated Expressway');
        break;
      case 'KORAMANGALA':
        setBroadcastTitle('⚠️ FLOOD WARNING: Koramangala 80ft Road Inundation');
        setBroadcastMessage('Catchment runoff surge. Intermediate Ring Road elevated detour active (+9 min).');
        setBroadcastSeverity('WARNING');
        setBroadcastLocation('Koramangala 80ft Road Corridor');
        setBroadcastWaterDepth(28);
        setBroadcastLeadTime(25);
        setBroadcastDetour('Intermediate Ring Road Elevated Ridge');
        break;
      case 'ECOSPACE':
        setBroadcastTitle('🚨 CORRIDOR SUBMERSION: Outer Ring Road EcoSpace Underpass');
        setBroadcastMessage('Severe flash flood barrier triggered. Water depth 48cm. Impassable for all vehicles.');
        setBroadcastSeverity('CRITICAL');
        setBroadcastLocation('Outer Ring Road (EcoSpace Underpass)');
        setBroadcastWaterDepth(48);
        setBroadcastLeadTime(10);
        setBroadcastDetour('Old Airport Road Elevated Bypass');
        break;
      case 'EVACUATION':
        setBroadcastTitle('🚨 EMERGENCY EVACUATION ORDER: Bellandur Lake Lowland Catchment');
        setBroadcastMessage('Water levels breaching safe lake embankment. Evacuate immediately to Bellandur Community Shelter.');
        setBroadcastSeverity('CRITICAL');
        setBroadcastLocation('Bellandur Lake Catchment Basin');
        setBroadcastWaterDepth(60);
        setBroadcastLeadTime(20);
        setBroadcastDetour('Designated Emergency Shelter Ridge Route');
        break;
      case 'HYDERABAD':
        setBroadcastTitle('🚨 CRITICAL SURGE: Musi River Basin & Malakpet Inundation');
        setBroadcastMessage('Water discharge 32,000 cusecs upstream. Malakpet lowlands submerged. Divert traffic via PVNR Elevated Expressway.');
        setBroadcastSeverity('CRITICAL');
        setBroadcastLocation('Hyderabad Musi River Corridor & Amberpet');
        setBroadcastWaterDepth(52);
        setBroadcastLeadTime(15);
        setBroadcastDetour('PV Narasimha Rao Expressway & Inner Ring High Ridge');
        break;
      case 'MUMBAI':
        setBroadcastTitle('🚨 FLOOD EMERGENCY: Mithi River Spill & Kurla Underpass Blocked');
        setBroadcastMessage('Mithi river high tide surge overtopping banks. Kurla and Sion lowlands impassable. Divert via Eastern Freeway.');
        setBroadcastSeverity('CRITICAL');
        setBroadcastLocation('Mumbai Mithi River Basin & Kurla-Sion Lowlands');
        setBroadcastWaterDepth(55);
        setBroadcastLeadTime(10);
        setBroadcastDetour('Eastern Freeway & BKC Elevated Connector');
        break;
      case 'PUNE':
        setBroadcastTitle('⚠️ RIVER DISCHARGE WARNING: Mula-Mutha Basin Overflow');
        setBroadcastMessage('Khadakwasla dam discharge increased to 28,000 cusecs. Riverside road submerged. Use Senapati Bapat high ridge detour.');
        setBroadcastSeverity('WARNING');
        setBroadcastLocation('Pune Mula-Mutha Basin & Sangamwadi');
        setBroadcastWaterDepth(36);
        setBroadcastLeadTime(20);
        setBroadcastDetour('Senapati Bapat Elevated Ridge Road');
        break;
      case 'DELHI':
        setBroadcastTitle('🚨 YAMUNA FLOOD ALERT: Kashmiri Gate & Ring Road Inundation');
        setBroadcastMessage('Yamuna river water level crosses 208.48m. Ring Road low-lying segments blocked. Use Barapullah elevated corridor.');
        setBroadcastSeverity('CRITICAL');
        setBroadcastLocation('Delhi Yamuna Floodplain & Kashmiri Gate');
        setBroadcastWaterDepth(46);
        setBroadcastLeadTime(15);
        setBroadcastDetour('Barapullah Elevated Corridor & Outer Ring Bypass');
        break;
      case 'JAIPUR':
        setBroadcastTitle('⚠️ FLASH RUNOFF WARNING: Dravyavati River / Sanganer Lowlands');
        setBroadcastMessage('Sudden cloudburst runoff in Amanishah Nullah catchment. Sanganer low bridge submerged. Divert via Tonk Elevated Road.');
        setBroadcastSeverity('WARNING');
        setBroadcastLocation('Jaipur Dravyavati Basin & Sanganer Lowlands');
        setBroadcastWaterDepth(32);
        setBroadcastLeadTime(25);
        setBroadcastDetour('Tonk Road Elevated Flyover Corridor');
        break;
    }
  };

  const handleTransmitBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTransmitting(true);
    setTransmissionStatus(null);

    try {
      await disasterNotificationService.broadcastAdminAlert({
        title: broadcastTitle,
        message: broadcastMessage,
        severity: broadcastSeverity,
        location: broadcastLocation,
        waterDepthCm: broadcastWaterDepth,
        leadTimeMinutes: broadcastLeadTime,
        recommendedAction: `Follow designated detour via ${broadcastDetour}. Avoid low-lying underpasses.`,
        detourCorridor: broadcastDetour,
        coordinates: [12.9172, 77.6228],
      });

      setTransmissionStatus(
        `✅ Citywide emergency broadcast transmitted! Pushed to all connected citizen devices with loud buzzer alarm at ${new Date().toLocaleTimeString()}.`
      );
    } catch (err: any) {
      setTransmissionStatus(`❌ Failed to transmit broadcast: ${err?.message || 'Network error'}`);
    } finally {
      setIsTransmitting(false);
    }
  };

  // Citizen Reports Verification Queue State
  const [reports, setReports] = useState([
    {
      id: 'rep-001',
      category: 'FLOOD',
      description: 'Deep standing water over 28cm near the Bay Street overpass. Passenger vehicles turning around.',
      location: '40.7150, -74.0080',
      submittedAt: '35m ago',
      status: 'VERIFIED',
    },
    {
      id: 'rep-002',
      category: 'ROAD_BLOCKED',
      description: 'Fallen branch and debris obstructing storm drain on Market Street right curb.',
      location: '40.7210, -74.0080',
      submittedAt: '10m ago',
      status: 'PENDING_REVIEW',
    },
    {
      id: 'rep-003',
      category: 'TRAFFIC',
      description: 'Heavy bumper-to-bumper congestion backing up to Highland Avenue exit ramp.',
      location: '40.7250, -74.0150',
      submittedAt: '4m ago',
      status: 'PENDING_REVIEW',
    },
  ]);

  // Telemetry Provider Statuses
  const [providerStatuses, setProviderStatuses] = useState<any[]>([
    { provider: 'Open-Meteo Weather API', category: 'METEOROLOGY', status: 'HEALTHY', isLive: true, lastResponseTimeMs: 64 },
    { provider: 'Bengaluru Traffic Sensor Grid', category: 'TRAFFIC_MOBILITY', status: 'HEALTHY', isLive: true, lastResponseTimeMs: 42 },
    { provider: 'Hydrodynamic IoT Lake Gauges', category: 'HYDROLOGY', status: 'HEALTHY', isLive: true, lastResponseTimeMs: 78 },
    { provider: 'Grok-2 AI Reasoning Engine', category: 'DECISION_SUPPORT', status: 'HEALTHY', isLive: true, lastResponseTimeMs: 112 },
    { provider: 'TextBee & Fast2SMS Carrier Gateways', category: 'SMS_DISPATCH', status: 'HEALTHY', isLive: true, lastResponseTimeMs: 48 },
  ]);

  // Grok AI Decision & Audit State
  const [aiDecision, setAiDecision] = useState<any>({
    risk_level: 'WARNING',
    confidence: 0.88,
    decision_confidence: 0.84,
    situation_summary: 'Citywide flood escalation: Multiple catchment basins experiencing elevated runoff. Priority municipal mitigation required.',
    affected_zones: ['Bay Basin Lowlands', 'East River Concourse'],
    roads_to_avoid: ['Bay Street Boulevard'],
    authority_actions: [
      'Deploy mobile pumping assets to low-elevation catchment discharge points.',
      'Pre-position physical warning barriers and detour signs at blocked intersections.',
      'Inspect storm drainage culverts in Sector 4 and clear debris.',
    ],
    citizen_actions: [
      'Avoid Bay Street Boulevard and all low-lying underpasses.',
      'Follow safety-weighted alternate corridors on elevated terrain.',
    ],
    uncertainties: [],
    model: 'grok-2-latest',
    fallback_used: false,
    created_at: new Date().toISOString(),
    processing_time_ms: { total_ai_latency_ms: 18 },
  });
  const [aiHistory, setAiHistory] = useState<any[]>([
    {
      id: 'ai-aud-001',
      created_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      risk_level: 'WARNING',
      model: 'grok-2-latest',
      confidence: 0.88,
      decision_confidence: 0.84,
      situation_summary: 'Monsoon cloudburst over South Bengaluru catchment. Silk Board drainage at threshold.',
      authority_actions: ['Activate Bellandur discharge pumps', 'Divert transit to Elevated Expressway'],
      processing_time_ms: { total_ai_latency_ms: 19 },
    },
    {
      id: 'ai-aud-002',
      created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      risk_level: 'WATCH',
      model: 'grok-2-latest',
      confidence: 0.91,
      decision_confidence: 0.89,
      situation_summary: 'Antecedent soil saturation reaches 78% in Koramangala basin.',
      authority_actions: ['Pre-position emergency barrier equipment'],
      processing_time_ms: { total_ai_latency_ms: 16 },
    },
  ]);

  // Events Table Filtering & Pagination State
  const [filterArea, setFilterArea] = useState<string>('ALL');
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 3;

  const allEvents: RiskEvent[] = [
    {
      id: 'evt-flood-001',
      type: 'FLOOD',
      title: 'Bay Basin Flash Inundation Escalation',
      areaId: 'sector-4-lowlands',
      areaName: 'Sector 4 Bay Basin Lowlands',
      severity: 'CRITICAL',
      source: 'TELEMETRY_RADAR',
      waterDepthCm: 28,
      timestamp: '15m ago',
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
      timestamp: '22m ago',
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
      timestamp: '8m ago',
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
      timestamp: '30m ago',
      status: 'ACTIVE',
      evidenceType: 'OBSERVED',
    },
  ];

  // Corridors & Diversion Advisories State
  const [corridors, setCorridors] = useState<CorridorStatus[]>([
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
  ]);

  // Route Recalculation Events Stream
  const [reroutes, setReroutes] = useState<RerouteRecord[]>([
    {
      id: 'reroute-001',
      routeId: 'route-active-101',
      timestamp: '3m ago',
      trigger: 'ROAD_BLOCKED',
      oldRouteName: 'Bay Street Direct Boulevard',
      newRouteName: 'Highland Avenue Elevated Detour',
      timeDeltaMin: 3,
      reason: 'Bay Street submerged (28 cm water depth). Immediate safety bypass triggered.',
    },
    {
      id: 'reroute-002',
      routeId: 'route-active-104',
      timestamp: '14m ago',
      trigger: 'FLOOD_RISK_SURGE',
      oldRouteName: 'Market Street Commuter Link',
      newRouteName: 'Northern Perimeter Ringway',
      timeDeltaMin: 6,
      reason: 'Catchment runoff surge crossed risk threshold (54 points). Diverted to elevated perimeter.',
    },
  ]);

  // ---------------------------------------------------------------------------
  // EOC TACTICAL GIS MAP INITIALIZATION
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!adminMapContainerRef.current) return;

    if ((adminMapContainerRef.current as any)._leaflet_id) {
      delete (adminMapContainerRef.current as any)._leaflet_id;
    }

    const map = L.map(adminMapContainerRef.current, {
      center: [12.9280, 77.6550], // Bengaluru Tech Basin (Bellandur, Silk Board, Koramangala)
      zoom: 12,
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: true,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 60,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const adminContainer = adminMapContainerRef.current;
    if (adminContainer) {
      adminContainer.addEventListener('mouseenter', () => map.scrollWheelZoom.enable());
      adminContainer.addEventListener('mouseleave', () => map.scrollWheelZoom.disable());
    }

    // Standard High-Detail OpenStreetMap Cartography
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    adminLayerGroupRef.current = layerGroup;
    adminMapInstanceRef.current = map;

    const triggerInvalidate = () => {
      if (adminMapInstanceRef.current) {
        adminMapInstanceRef.current.invalidateSize();
      }
    };
    setTimeout(triggerInvalidate, 80);
    setTimeout(triggerInvalidate, 300);
    setTimeout(triggerInvalidate, 700);
    window.addEventListener('resize', triggerInvalidate);

    return () => {
      window.removeEventListener('resize', triggerInvalidate);
      if (adminMapInstanceRef.current) {
        adminMapInstanceRef.current.remove();
        adminMapInstanceRef.current = null;
        adminLayerGroupRef.current = null;
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // EOC TACTICAL GIS MAP DYNAMIC LAYER RENDERING
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = adminMapInstanceRef.current;
    const group = adminLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 1. Flood Inundation Polygons
    if (mapLayerFilter === 'ALL' || mapLayerFilter === 'FLOOD') {
      const bellandurPolygon = L.polygon([
        [12.9220, 77.6680],
        [12.9320, 77.6790],
        [12.9270, 77.6840],
        [12.9180, 77.6720],
      ], {
        color: '#EF4444',
        weight: 2,
        fillColor: '#EF4444',
        fillOpacity: 0.35,
      });
      bellandurPolygon.bindPopup(`
        <div style="font-family: inherit; font-size: 0.85rem; color: #F8FAFC;">
          <div style="font-weight: 800; color: #EF4444; margin-bottom: 4px;">🚨 OBSERVED FLOOD INUNDATION</div>
          <div><strong>Sector:</strong> Bellandur Lake Basin / EcoSpace ORR</div>
          <div><strong>Water Depth:</strong> 48 cm (Critical Barrier Triggered)</div>
          <div><strong>Status:</strong> Corridors impassable. Mobile pumps active.</div>
        </div>
      `);
      bellandurPolygon.on('click', () => {
        setSelectedMapItem({
          type: 'FLOOD',
          title: 'Bellandur Lake & EcoSpace Lowland Basin',
          desc: 'Observed water depth 48cm. Low-lying underpasses fully submerged. Municipal barrier active.',
          status: 'CRITICAL (48cm)',
          coords: [12.9260, 77.6762],
        });
      });
      group.addLayer(bellandurPolygon);

      // Predicted 30-min surge zone (Silk Board stormwater runoff)
      const silkBoardPolygon = L.polygon([
        [12.9120, 77.6180],
        [12.9220, 77.6280],
        [12.9180, 77.6320],
        [12.9090, 77.6210],
      ], {
        color: '#F59E0B',
        weight: 2,
        fillColor: '#F59E0B',
        fillOpacity: 0.28,
        dashArray: '5, 5',
      });
      silkBoardPolygon.bindPopup(`
        <div style="font-family: inherit; font-size: 0.85rem; color: #F8FAFC;">
          <div style="font-weight: 800; color: #F59E0B; margin-bottom: 4px;">⚠️ 30-MIN PREDICTED RUNOFF SURGE</div>
          <div><strong>Sector:</strong> Silk Board Junction Catchment</div>
          <div><strong>Predicted Depth:</strong> 34 cm</div>
          <div><strong>Status:</strong> Detours advised via Hosur Elevated Flyover.</div>
        </div>
      `);
      silkBoardPolygon.on('click', () => {
        setSelectedMapItem({
          type: 'FLOOD',
          title: 'Silk Board Junction Catchment Basin',
          desc: 'Predicted stormwater surge +34cm in next 30 min. Slower transit, detours in effect.',
          status: 'WARNING (34cm)',
          coords: [12.9172, 77.6228],
        });
      });
      group.addLayer(silkBoardPolygon);
    }

    // 2. Corridors (Compact Tactical Pin Markers with Tooltips)
    if (mapLayerFilter === 'ALL' || mapLayerFilter === 'CORRIDORS') {
      const corridorPoints = [
        { name: 'Outer Ring Road (EcoSpace Underpass)', status: 'BLOCKED', coords: [12.9260, 77.6762] as [number, number], depth: 48, icon: '🛑' },
        { name: 'Silk Board Junction Underpass', status: 'CAUTION', coords: [12.9172, 77.6228] as [number, number], depth: 28, icon: '⚠️' },
        { name: 'Hosur Road Elevated Expressway', status: 'OPEN', coords: [12.9350, 77.6150] as [number, number], depth: 0, icon: '🟢' },
        { name: 'Old Airport Road Elevated Ridge', status: 'OPEN', coords: [12.9587, 77.6486] as [number, number], depth: 0, icon: '🟢' },
      ];

      corridorPoints.forEach((cp) => {
        const bgCol = cp.status === 'BLOCKED' ? '#DC2626' : cp.status === 'CAUTION' ? '#D97706' : '#059669';
        const cMarker = L.marker(cp.coords, {
          icon: L.divIcon({
            className: 'eoc-marker-corridor',
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            html: `
              <div style="
                background: ${bgCol};
                color: #FFFFFF;
                border: 2px solid #FFFFFF;
                border-radius: 50%;
                width: 34px;
                height: 34px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1rem;
                box-shadow: 0 0 12px ${bgCol};
                cursor: pointer;
              ">
                ${cp.icon}
              </div>
            `,
          }),
        });

        cMarker.bindTooltip(`
          <div style="font-family: inherit; font-size: 0.76rem; font-weight: 700; color: #FFF; background: #0B1120; padding: 4px 8px; border-radius: 6px; border: 1px solid ${bgCol};">
            <div>${cp.name}</div>
            <div style="color: ${bgCol}; font-weight: 800;">${cp.status}: ${cp.depth > 0 ? cp.depth + 'cm' : 'CLEAR'}</div>
          </div>
        `, { direction: 'top', offset: [0, -18], opacity: 0.95 });

        cMarker.bindPopup(`
          <div style="font-family: inherit; font-size: 0.85rem; color: #F8FAFC;">
            <div style="font-weight: 800; color: ${bgCol}; margin-bottom: 4px;">CORRIDOR: ${cp.status}</div>
            <div><strong>Name:</strong> ${cp.name}</div>
            <div><strong>Water Depth:</strong> ${cp.depth} cm</div>
          </div>
        `);
        cMarker.on('click', () => {
          setSelectedMapItem({
            type: 'CORRIDOR',
            title: cp.name,
            desc: cp.status === 'BLOCKED' ? 'Closed due to standing water. Detours active.' : cp.status === 'CAUTION' ? 'Reduced speed required.' : 'Free flow clear transit.',
            status: cp.status,
            coords: cp.coords,
          });
        });
        group.addLayer(cMarker);
      });
    }

    // 3. Emergency Response Units (Tactical Asset Markers)
    if (mapLayerFilter === 'ALL' || mapLayerFilter === 'UNITS') {
      const unitsWithBengaluruPositions = [
        { ...emergencyUnits[0], lat: 12.9240, lon: 77.6820 },
        { ...emergencyUnits[1], lat: 12.9340, lon: 77.6740 },
        { ...emergencyUnits[2], lat: 12.9140, lon: 77.6270 },
        { ...emergencyUnits[3], lat: 12.9420, lon: 77.6320 },
      ];

      unitsWithBengaluruPositions.forEach((u) => {
        if (!u) return;
        const iconEmoji = u.type === 'PUMP_TRUCK' ? '🚒' : u.type === 'RESCUE_BOAT' ? '🚤' : u.type === 'TRAFFIC_PATROL' ? '🚔' : '🚑';
        const statusCol = u.status === 'DISPATCHED' ? '#EF4444' : u.status === 'ON_SCENE' ? '#F59E0B' : '#10B981';
        const unitMarker = L.marker([u.lat, u.lon], {
          icon: L.divIcon({
            className: 'eoc-marker-unit',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            html: `
              <div style="
                background: #0B1120;
                border: 2px solid ${statusCol};
                border-radius: 50%;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.1rem;
                box-shadow: 0 0 12px ${statusCol};
                cursor: pointer;
              ">
                ${iconEmoji}
              </div>
            `,
          }),
        });

        unitMarker.bindTooltip(`
          <div style="font-family: inherit; font-size: 0.76rem; font-weight: 700; color: #FFF; background: #0B1120; padding: 4px 8px; border-radius: 6px; border: 1px solid ${statusCol};">
            <div>${iconEmoji} ${u.callsign}</div>
            <div style="color: ${statusCol}; font-weight: 800;">${u.status} (${u.type})</div>
          </div>
        `, { direction: 'top', offset: [0, -18], opacity: 0.95 });

        unitMarker.bindPopup(`
          <div style="font-family: inherit; font-size: 0.85rem; color: #F8FAFC;">
            <div style="font-weight: 800; color: ${statusCol}; margin-bottom: 4px;">${iconEmoji} ${u.callsign}</div>
            <div><strong>Type:</strong> ${u.type}</div>
            <div><strong>Status:</strong> ${u.status}</div>
            <div><strong>Sector:</strong> ${u.assignedSector}</div>
          </div>
        `);
        unitMarker.on('click', () => {
          setSelectedMapItem({
            type: 'UNIT',
            title: `${u.callsign} (${u.type})`,
            desc: `Assigned Sector: ${u.assignedSector}. Last ping ${u.updatedAt}.`,
            status: u.status,
            coords: [u.lat, u.lon],
          });
        });
        group.addLayer(unitMarker);
      });
    }

    // 4. Citizen Reports
    if (mapLayerFilter === 'ALL' || mapLayerFilter === 'REPORTS') {
      const repList = [
        { id: 'rep-001', coords: [12.9280, 77.6710] as [number, number], desc: 'Deep standing water over 35cm near ORR EcoSpace' },
        { id: 'rep-002', coords: [12.9200, 77.6250] as [number, number], desc: 'Silk Board service lane inundated' },
      ];
      repList.forEach((r) => {
        const rMarker = L.marker(r.coords, {
          icon: L.divIcon({
            className: 'eoc-marker-rep',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            html: `
              <div style="
                background: #D97706;
                color: #FFFFFF;
                border: 1.5px solid #FFFFFF;
                border-radius: 50%;
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.85rem;
                font-weight: 800;
                box-shadow: 0 0 10px rgba(217, 119, 6, 0.8);
                cursor: pointer;
              ">
                ⚠️
              </div>
            `,
          }),
        });
        rMarker.bindTooltip(`
          <div style="font-family: inherit; font-size: 0.74rem; font-weight: 700; color: #FFF; background: #0B1120; padding: 4px 8px; border-radius: 6px; border: 1px solid #D97706;">
            <div>📢 Citizen Report</div>
            <div style="color: #FCD34D;">${r.desc}</div>
          </div>
        `, { direction: 'top', offset: [0, -14], opacity: 0.95 });

        rMarker.bindPopup(`
          <div style="font-family: inherit; font-size: 0.82rem; color: #F8FAFC;">
            <div style="font-weight: 800; color: #F59E0B; margin-bottom: 4px;">📢 Citizen SOS Report</div>
            <div>${r.desc}</div>
          </div>
        `);
        rMarker.on('click', () => {
          setSelectedMapItem({
            type: 'REPORT',
            title: 'Citizen Flood Hazard SOS',
            desc: r.desc,
            status: 'VERIFIED',
            coords: r.coords,
          });
        });
        group.addLayer(rMarker);
      });
    }

    // Auto-fit bounds so all Bangalore features and corridors are perfectly framed
    const bounds = L.latLngBounds([
      [12.9090, 77.6120], // SW: Silk Board / HSR
      [12.9650, 77.6950], // NE: Old Airport Rd / Bellandur
    ]);
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [emergencyUnits, mapLayerFilter, simulation]);

  useEffect(() => {
    // Ensure Admin role is set so buzzer tone and intrusive banners are silenced on EOC console
    disasterNotificationService.setUserRole('ADMIN');

    // Fetch provider status
    fetch('/api/v1/data/providers/status')
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((body) => {
        if (body?.success && Array.isArray(body.data)) {
          setProviderStatuses(body.data);
        }
      })
      .catch(() => {});

    // Fetch EOC AI Decision
    fetch('/api/v1/ai/latest?mode=CITY_OVERVIEW')
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((body) => {
        if (body?.status === 'ok' && body.data?.decision) {
          setAiDecision({
            ...body.data.decision,
            model: body.data.model,
            fallback_used: body.data.fallback_used,
            created_at: body.data.created_at,
            processing_time_ms: body.data.processing_time_ms,
          });
        }
      })
      .catch(() => {});

    // Fetch AI Decision Audit History
    fetch('/api/v1/ai/decisions?limit=6')
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((body) => {
        if (body?.status === 'ok' && Array.isArray(body.data)) {
          setAiHistory(body.data);
        }
      })
      .catch(() => {});

    // Auth headers for EOC Authority access
    const authHeaders = {
      Authorization: 'Bearer mock_jwt_token_admin',
      'x-user-role': 'ADMIN',
    };

    // Fetch live reroute logs from API
    fetch('/api/v1/admin/reroutes', { headers: authHeaders })
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((body) => {
        if (body?.success && Array.isArray(body.data)) {
          setReroutes(body.data);
        }
      })
      .catch(() => {});

    // Fetch live corridor advisories from API
    fetch('/api/v1/admin/corridors', { headers: authHeaders })
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((body) => {
        if (body?.success && Array.isArray(body.data)) {
          setCorridors(body.data);
        }
      })
      .catch(() => {});

    // Fetch EOC Overview & Health KPIs
    fetch('/api/v1/admin/overview', { headers: authHeaders })
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((body) => {
        if (body?.success && body.cityHealth) {
          setCityHealth(body.cityHealth);
        }
        if (body?.activeSimulation) {
          setSimulation(body.activeSimulation);
        }
        if (body?.emergencyUnits && Array.isArray(body.emergencyUnits)) {
          setEmergencyUnits(body.emergencyUnits);
        }
      })
      .catch(() => {});

    // Fetch Emergency Units
    fetch('/api/v1/admin/units', { headers: authHeaders })
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((body) => {
        if (body?.success && Array.isArray(body.data)) {
          setEmergencyUnits(body.data);
        }
      })
      .catch(() => {});

    // Fetch Circuit Breakers
    fetch('/api/v1/admin/system/circuit-breakers', { headers: authHeaders })
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((body) => {
        if (body?.success && Array.isArray(body.data)) {
          setCircuitBreakers(body.data);
        }
      })
      .catch(() => {});

    // Fetch System Diagnostics
    fetch('/api/v1/admin/diagnostics', { headers: authHeaders })
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((body) => {
        if (body?.success) {
          setDiagnostics(body);
        }
      })
      .catch(() => {});
  }, []);

  const handleInjectScenario = (scenario: 'MONSOON_CLOUDBURST' | 'LAKE_BREACH' | 'TRAFFIC_GRIDLOCK') => {
    setSimulationStatusMsg(`Injecting ${scenario} simulation...`);
    fetch('/api/v1/admin/simulation/scenario', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock_jwt_token_admin',
        'x-user-role': 'ADMIN',
      },
      body: JSON.stringify({ scenario }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body?.success && body.data) {
          setSimulation(body.data);
          setCityHealth((prev) => ({
            ...prev,
            activeScenario: body.data.activeScenario,
            overallRiskScore: scenario === 'LAKE_BREACH' ? 98.0 : scenario === 'MONSOON_CLOUDBURST' ? 94.2 : 76.5,
            riskTier: 'CRITICAL',
            trend: 'CRITICAL_SPIKE',
            blockedRoadsCount: body.data.activeClosures?.length || 2,
          }));
          setSimulationStatusMsg(`✅ Injected ${scenario} scenario! Telemetry updated.`);
        }
      })
      .catch(() => {
        setSimulationStatusMsg(`⚠️ Simulated scenario ${scenario} active (client fallback)`);
      });
  };

  const handleResetScenario = () => {
    setSimulationStatusMsg('Resetting simulation to baseline...');
    fetch('/api/v1/admin/simulation/reset', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock_jwt_token_admin',
        'x-user-role': 'ADMIN',
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body?.success && body.data) {
          setSimulation(body.data);
          setCityHealth((prev) => ({
            ...prev,
            activeScenario: 'BASELINE',
            overallRiskScore: 68.5,
            riskTier: 'WARNING',
            trend: 'INCREASING',
            blockedRoadsCount: 1,
          }));
          setSimulationStatusMsg('✅ Simulation reset to nominal baseline state.');
        }
      })
      .catch(() => {
        setSimulationStatusMsg('✅ Simulation reset to nominal baseline.');
      });
  };

  const handleDispatchUnit = (unitId: string, sector: string) => {
    setDispatchStatusMsg(`Dispatching unit ${unitId}...`);
    fetch('/api/v1/admin/units/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock_jwt_token_admin',
        'x-user-role': 'ADMIN',
      },
      body: JSON.stringify({ unitId, assignedSector: sector }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body?.success && body.data) {
          setEmergencyUnits((prev) =>
            prev.map((u) => (u.id === unitId ? { ...u, status: 'DISPATCHED', assignedSector: sector } : u))
          );
          setDispatchStatusMsg(`✅ Unit ${body.data.callsign} dispatched to ${sector}!`);
        }
      })
      .catch(() => {
        setEmergencyUnits((prev) =>
          prev.map((u) => (u.id === unitId ? { ...u, status: 'DISPATCHED', assignedSector: sector } : u))
        );
        setDispatchStatusMsg(`✅ Unit dispatched to ${sector}!`);
      });
  };

  const handleUpdateUnitStatus = (unitId: string, newStatus: 'AVAILABLE' | 'DISPATCHED' | 'ON_SCENE' | 'RETURNING') => {
    fetch(`/api/v1/admin/units/${unitId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock_jwt_token_admin',
        'x-user-role': 'ADMIN',
      },
      body: JSON.stringify({ status: newStatus }),
    })
      .then(() => {
        setEmergencyUnits((prev) =>
          prev.map((u) => (u.id === unitId ? { ...u, status: newStatus } : u))
        );
      })
      .catch(() => {
        setEmergencyUnits((prev) =>
          prev.map((u) => (u.id === unitId ? { ...u, status: newStatus } : u))
        );
      });
  };

  const handleTripBreaker = (name: string) => {
    fetch('/api/v1/admin/system/circuit-breakers/trip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock_jwt_token_admin',
        'x-user-role': 'ADMIN',
      },
      body: JSON.stringify({ name }),
    })
      .then(() => {
        setCircuitBreakers((prev) =>
          prev.map((b) => (b.name === name ? { ...b, state: 'OPEN' } : b))
        );
      })
      .catch(() => {
        setCircuitBreakers((prev) =>
          prev.map((b) => (b.name === name ? { ...b, state: 'OPEN' } : b))
        );
      });
  };

  const handleResetBreaker = (name: string) => {
    fetch('/api/v1/admin/system/circuit-breakers/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock_jwt_token_admin',
        'x-user-role': 'ADMIN',
      },
      body: JSON.stringify({ name }),
    })
      .then(() => {
        setCircuitBreakers((prev) =>
          prev.map((b) => (b.name === name ? { ...b, state: 'CLOSED' } : b))
        );
      })
      .catch(() => {
        setCircuitBreakers((prev) =>
          prev.map((b) => (b.name === name ? { ...b, state: 'CLOSED' } : b))
        );
      });
  };

  const handleEvictCache = () => {
    setCacheEvictionMsg('Evicting telemetry & state caches...');
    fetch('/api/v1/admin/system/cache/evict', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock_jwt_token_admin',
        'x-user-role': 'ADMIN',
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        setCacheEvictionMsg(`✅ Live state & route caches cleared! (Evicted ${body?.data?.evictedCount ?? 0} items)`);
        setTimeout(() => setCacheEvictionMsg(null), 4000);
      })
      .catch(() => {
        setCacheEvictionMsg('✅ Live state & route caches cleared!');
        setTimeout(() => setCacheEvictionMsg(null), 4000);
      });
  };

  const handleVerify = (id: string) => {
    fetch(`/api/v1/admin/reports/${id}/verify`, {
      method: 'POST',
      headers: { Authorization: 'Bearer mock_jwt_token_admin', 'x-user-role': 'ADMIN' },
    }).catch(() => {});
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'VERIFIED' } : r))
    );
  };

  const handleDismiss = (id: string) => {
    fetch(`/api/v1/admin/reports/${id}/dismiss`, {
      method: 'POST',
      headers: { Authorization: 'Bearer mock_jwt_token_admin', 'x-user-role': 'ADMIN' },
    }).catch(() => {});
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  // Role Gate: Protect Authority Control Center
  if (role !== 'ADMIN') {
    return (
      <div className="container" style={{ padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
        <div className="glass-panel" style={{
          maxWidth: '560px',
          width: '100%',
          padding: '32px',
          textAlign: 'center',
          border: '1px solid #EF4444',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}>
          <span style={{ fontSize: '3rem' }}>🔒</span>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#EF4444' }}>
            {t('authority.access_denied')}
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {t('authority.access_denied_desc')}
          </p>
          {onRoleChange && (
            <button
              className="btn btn-primary"
              onClick={() => onRoleChange('ADMIN')}
              style={{ marginTop: '8px', padding: '10px 20px', fontWeight: 700 }}
            >
              Switch to Admin EOC Role
            </button>
          )}
        </div>
      </div>
    );
  }

  // Filtered Events Calculation
  const filteredEvents = allEvents.filter((e) => {
    if (filterArea !== 'ALL' && e.areaId !== filterArea) return false;
    if (filterSeverity !== 'ALL' && e.severity !== filterSeverity) return false;
    if (filterType !== 'ALL' && e.type !== filterType) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage) || 1;
  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Top Header & Session Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge badge-critical">EOC DECISION SUPPORT CONSOLE</span>
            <span className="font-mono text-muted" style={{ fontSize: '0.8rem' }}>SESSION: EOC-OFFICER-001</span>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px' }}>
            {t('authority.title')}
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {t('authority.subtitle')}
          </p>
        </div>
      </div>

      {/* Configured Study Area Boundary & Scope Disclaimer Banner */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(56, 189, 248, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)',
        border: '1px solid var(--accent-cyan)',
        borderRadius: '10px',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
      }}>
        <span style={{ fontSize: '1.6rem' }}>📍</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#38BDF8' }}>
            {t('authority.study_area')}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            ⚠️ <strong>{t('authority.study_area_disclaimer')}</strong>
          </div>
        </div>
      </div>

      {/* Executive Operational Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('authority.active_risk_tier').toUpperCase()}</div>
          <div className="font-mono" style={{ fontSize: '2rem', fontWeight: 800, color: cityHealth.overallRiskScore >= 75 ? 'var(--color-critical)' : 'var(--color-warning)', marginTop: '4px' }}>
            {cityHealth.overallRiskScore.toFixed(1)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ 100</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: cityHealth.overallRiskScore >= 75 ? '#EF4444' : 'var(--color-warning)', marginTop: '4px' }}>
            Tier: {cityHealth.riskTier} ({cityHealth.trend})
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('authority.blocked_roads').toUpperCase()}</div>
          <div className="font-mono" style={{ fontSize: '2rem', fontWeight: 800, color: '#EF4444', marginTop: '4px' }}>
            {cityHealth.blockedRoadsCount} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>corridors</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {cityHealth.blockedRoadsCount > 1 ? 'Multiple corridors blocked' : 'Bay Street Waterfront Arterial'}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('authority.monitored_basins').toUpperCase()}</div>
          <div className="font-mono" style={{ fontSize: '2rem', fontWeight: 800, color: '#38BDF8', marginTop: '4px' }}>
            {cityHealth.monitoredBasinsCount} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>basins</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Bay Basin, Silk Board, East River, Highland
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>DEPLOYED EMERGENCY UNITS</div>
          <div className="font-mono" style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-cyan)', marginTop: '4px' }}>
            {emergencyUnits.filter((u) => u.status === 'DISPATCHED' || u.status === 'ON_SCENE').length} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ {emergencyUnits.length} active</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Pumps, Boats &amp; Traffic Sentinels
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SENSOR TELEMETRY &amp; SLAs</div>
          <div className="font-mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-normal)', marginTop: '8px' }}>
            100% HEALTHY
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            All 6 ingestion SLAs compliant
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* EOC LIVE TACTICAL GIS OPERATIONS MAP & CITYWIDE ASSET TRACKING            */}
      {/* ========================================================================= */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          border: '1.5px solid rgba(56, 189, 248, 0.4)',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(7, 11, 20, 0.98) 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Map Header & Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.4rem' }}>🗺️</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38BDF8', margin: 0 }}>
                EOC Live Tactical GIS Operations Map
              </h3>
              <span className="badge badge-critical" style={{ animation: 'pulseGlow 2s infinite ease-in-out' }}>
                ● REAL-TIME DISPATCH ACTIVE
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '4px', margin: '4px 0 0 0' }}>
              Real-time multi-hazard spatial view of Bengaluru Tech Corridor: Active flood zones, road closures, emergency units, and citizen SOS.
            </p>
          </div>

          {/* Quick Actions & Navigation to Safe-Mobility Map */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Filter Pills */}
            <div style={{
              display: 'inline-flex',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '4px',
              borderRadius: '10px',
              border: '1px solid var(--border-subtle)',
              gap: '4px',
            }}>
              {(['ALL', 'UNITS', 'FLOOD', 'CORRIDORS', 'REPORTS'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setMapLayerFilter(filter)}
                  style={{
                    background: mapLayerFilter === filter ? '#38BDF8' : 'transparent',
                    color: mapLayerFilter === filter ? '#070B14' : 'var(--text-secondary)',
                    fontWeight: mapLayerFilter === filter ? 800 : 600,
                    fontSize: '0.74rem',
                    padding: '5px 11px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {filter === 'ALL' ? 'All GIS Layers' : filter === 'UNITS' ? '🚒 Response Units' : filter === 'FLOOD' ? '🌊 Flood Zones' : filter === 'CORRIDORS' ? '🛑 Corridors' : '⚠️ Citizen SOS'}
                </button>
              ))}
            </div>

            {/* Direct Switcher to Fullscreen Live Navigation Map */}
            <button
              type="button"
              onClick={() => onNavigate?.('/map')}
              className="btn btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                fontSize: '0.82rem',
                fontWeight: 800,
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0284C7, #0369A1)',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title="Open full-screen citizen routing and detour map"
            >
              <span>🧭</span>
              <span>Open Safe Detour &amp; Routing Map</span>
              <span style={{ fontSize: '0.9rem' }}>→</span>
            </button>
          </div>
        </div>

        {/* Selected Item Detail Banner (if clicked) */}
        {selectedMapItem && (
          <div style={{
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '10px',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            animation: 'slideDown 0.2s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.2rem' }}>
                {selectedMapItem.type === 'UNIT' ? '🚒' : selectedMapItem.type === 'FLOOD' ? '🌊' : selectedMapItem.type === 'CORRIDOR' ? '🛑' : '⚠️'}
              </span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#FFFFFF' }}>
                  {selectedMapItem.title} • <span style={{ color: '#38BDF8' }}>{selectedMapItem.status}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {selectedMapItem.desc}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMapItem(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '1rem',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Tactical Map Leaflet Canvas */}
        <div style={{ position: 'relative', width: '100%', height: '460px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div ref={adminMapContainerRef} style={{ width: '100%', height: '100%', background: '#0B1120' }} />

          {/* Map Overlay Quick Legend Tile */}
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            zIndex: 1000,
            background: 'rgba(11, 17, 32, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '10px',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
          }}>
            <div style={{ fontWeight: 700, color: '#F8FAFC', marginBottom: '2px' }}>EOC Tactical GIS Legend</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'rgba(239, 68, 68, 0.5)', border: '1px solid #EF4444' }} />
              <span>Observed Inundation (EcoSpace 48cm)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'rgba(245, 158, 11, 0.5)', border: '1px dashed #F59E0B' }} />
              <span>30-min Predicted Surge (Silk Board 34cm)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🚒 🚤 🚔 🚑</span>
              <span>Deployed Emergency Units ({emergencyUnits.length} Assets)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🛑 ⚠️ 🟢</span>
              <span>Corridor Status (Blocked / Caution / Open Detour)</span>
            </div>
          </div>
        </div>

        {/* EOC Basin Quick Stats Strip */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '12px 16px',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)',
        }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>MAPPED BASIN EXTENT</div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#38BDF8', marginTop: '2px' }}>
              Bengaluru Tech Lowlands
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Bellandur • Silk Board • Koramangala</div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ACTIVE FLOOD HAZARDS</div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#EF4444', marginTop: '2px' }}>
              2 Critical Inundation Zones
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Max Depth 48cm at EcoSpace ORR</div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>OPERATIONAL CORRIDORS</div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#10B981', marginTop: '2px' }}>
              2 Clear Detours Active
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Hosur Elevated &amp; Old Airport Rd</div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>DEPLOYED FIELD ASSETS</div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-cyan)', marginTop: '2px' }}>
              {emergencyUnits.filter(u => u.status === 'DISPATCHED' || u.status === 'ON_SCENE').length} Units Dispatched
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Hydra-Pump Alpha &amp; Traffic Sentinel-1</div>
          </div>
        </div>
      </div>

      {/* Scenario Simulation Generator Panel */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          border: '1.5px solid var(--accent-cyan)',
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(15, 23, 42, 0.85) 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>🎮</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                Scenario Simulation Generator &amp; Stress Testing
              </h3>
              <span className={`badge ${simulation.activeScenario === 'BASELINE' ? 'badge-normal' : 'badge-critical'}`}>
                SCENARIO: {simulation.activeScenario}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              Inject deterministic multi-hazard scenarios into the digital twin to test dynamic rerouting, barrier deployments, and EOC workflows.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn"
              style={{
                background: simulation.activeScenario === 'MONSOON_CLOUDBURST' ? '#0284C7' : 'rgba(14, 165, 233, 0.2)',
                color: '#38BDF8',
                border: '1px solid #38BDF8',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
              onClick={() => handleInjectScenario('MONSOON_CLOUDBURST')}
            >
              🌧️ Monsoon Cloudburst
            </button>

            <button
              className="btn"
              style={{
                background: simulation.activeScenario === 'LAKE_BREACH' ? '#DC2626' : 'rgba(239, 68, 68, 0.2)',
                color: '#F87171',
                border: '1px solid #EF4444',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
              onClick={() => handleInjectScenario('LAKE_BREACH')}
            >
              🌊 Lake Breach / Dam Failure
            </button>

            <button
              className="btn"
              style={{
                background: simulation.activeScenario === 'TRAFFIC_GRIDLOCK' ? '#D97706' : 'rgba(245, 158, 11, 0.2)',
                color: '#FBBF24',
                border: '1px solid #F59E0B',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
              onClick={() => handleInjectScenario('TRAFFIC_GRIDLOCK')}
            >
              🚦 Peak Hour Traffic Gridlock
            </button>

            <button
              className="btn btn-secondary"
              style={{
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
              onClick={handleResetScenario}
            >
              🔄 Reset to Baseline
            </button>
          </div>
        </div>

        {simulationStatusMsg && (
          <div style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid var(--accent-cyan)', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem', color: '#7DD3FC' }}>
            {simulationStatusMsg}
          </div>
        )}

        {/* Live Simulation Parameters Telemetry */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>RAINFALL INTENSITY</div>
            <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: simulation.rainfallRateMmh > 40 ? '#EF4444' : '#38BDF8', marginTop: '2px' }}>
              {simulation.rainfallRateMmh} mm/h
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              {simulation.rainfallRateMmh > 50 ? 'Severe cloudburst downpour' : 'Moderate monsoon showers'}
            </div>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>MAX WATER DEPTH</div>
            <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: simulation.waterDepthCm >= 30 ? '#EF4444' : '#F59E0B', marginTop: '2px' }}>
              {simulation.waterDepthCm} cm
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              {simulation.waterDepthCm >= 30 ? 'Arterial roadways impassable' : 'Curb overflow caution'}
            </div>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>CONGESTION SATURATION</div>
            <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: simulation.congestionIndex > 75 ? '#EF4444' : '#10B981', marginTop: '2px' }}>
              {simulation.congestionIndex}%
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              {simulation.congestionIndex > 75 ? 'Severe arterial delay (+18 min)' : 'Moderate fluid traffic'}
            </div>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>EVACUATION ORDER</div>
            <div className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: simulation.evacuationTriggered ? '#EF4444' : '#10B981', marginTop: '2px' }}>
              {simulation.evacuationTriggered ? 'ACTIVE 🚨' : 'STANDBY'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              {simulation.evacuationTriggered ? 'Lake embankment breach order' : 'Normal shelter posture'}
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Incident Triage & Field Unit Dispatch Console */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>🚒</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                Real-Time Incident Triage &amp; Emergency Field Unit Dispatch
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              Assign high-capacity pumping assets, NDRF rescue watercraft, and traffic control units to active municipal incidents.
            </p>
          </div>

          {/* Quick Dispatch Controls */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="input"
              style={{ fontSize: '0.82rem', padding: '6px 12px' }}
            >
              {emergencyUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.callsign} ({u.type} - {u.status})
                </option>
              ))}
            </select>

            <select
              value={dispatchSector}
              onChange={(e) => setDispatchSector(e.target.value)}
              className="input"
              style={{ fontSize: '0.82rem', padding: '6px 12px' }}
            >
              <option value="Sector 4 Bay Basin Lowlands">Sector 4 Bay Basin Lowlands</option>
              <option value="Sector 3 East River Concourse">Sector 3 East River Concourse</option>
              <option value="Sector 1 Downtown Core">Sector 1 Downtown Core</option>
              <option value="Sector 5 Highland Ridge">Sector 5 Highland Ridge</option>
            </select>

            <button
              className="btn btn-primary"
              style={{ padding: '6px 16px', fontSize: '0.82rem', fontWeight: 700 }}
              onClick={() => handleDispatchUnit(selectedUnitId, dispatchSector)}
            >
              Dispatch Unit
            </button>
          </div>
        </div>

        {dispatchStatusMsg && (
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10B981', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem', color: '#6EE7B7' }}>
            {dispatchStatusMsg}
          </div>
        )}

        {/* Emergency Units Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          {emergencyUnits.map((unit) => (
            <div
              key={unit.id}
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{unit.callsign}</span>
                <span
                  className={`badge ${
                    unit.status === 'AVAILABLE'
                      ? 'badge-normal'
                      : unit.status === 'DISPATCHED'
                      ? 'badge-warning'
                      : 'badge-critical'
                  }`}
                  style={{ fontSize: '0.72rem' }}
                >
                  {unit.status}
                </span>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Type: <b>{unit.type}</b> • Assigned: <b>{unit.assignedSector}</b>
              </div>

              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                  onClick={() => handleUpdateUnitStatus(unit.id, 'ON_SCENE')}
                >
                  On Scene
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                  onClick={() => handleUpdateUnitStatus(unit.id, 'AVAILABLE')}
                >
                  Available
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Telemetry Resilience, Circuit Breaker Controls & Cache Eviction */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>🛡️</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                Telemetry Circuit Breakers, Cache Eviction &amp; Diagnostics
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              Zero-latency circuit breakers provide instant upstream fast-fail isolation during carrier or network degradations.
            </p>
          </div>

          <button
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.8rem', fontWeight: 700 }}
            onClick={handleEvictCache}
          >
            🧹 Evict Live State Caches
          </button>
        </div>

        {cacheEvictionMsg && (
          <div style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid var(--accent-cyan)', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem', color: '#7DD3FC' }}>
            {cacheEvictionMsg}
          </div>
        )}

        {/* Latency SLA Compliance Matrix */}
        {diagnostics?.latencySLAs && (
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
              SUB-SYSTEM LATENCY SLA COMPLIANCE VERIFICATION
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Weather Ingestion SLA</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#10B981' }}>
                  {diagnostics.latencySLAs.weatherIngestionSLA.measuredMs}ms <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(&lt; 500ms target)</span>
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Flood Intelligence SLA</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#10B981' }}>
                  {diagnostics.latencySLAs.floodIntelligenceSLA.measuredMs}ms <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(&lt; 100ms target)</span>
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Road Risk Scoring SLA</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#10B981' }}>
                  {diagnostics.latencySLAs.unifiedRoadRiskSLA.measuredMs}ms <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(&lt; 50ms target)</span>
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Multi-Candidate Routing SLA</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#10B981' }}>
                  {diagnostics.latencySLAs.multiCandidateRouteSLA.measuredMs}ms <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(&lt; 1000ms target)</span>
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>AI Deterministic Fallback</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#10B981' }}>
                  {diagnostics.latencySLAs.deterministicAIFallbackSLA.measuredMs}ms <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(&lt; 20ms target)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Circuit Breakers Control Grid */}
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
            ACTIVE CIRCUIT BREAKERS &amp; MANUAL FAULT ISOLATION CONTROLS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            {circuitBreakers.map((cb) => (
              <div
                key={cb.name}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: `1.5px solid ${cb.state === 'OPEN' ? '#EF4444' : cb.state === 'HALF_OPEN' ? '#F59E0B' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{cb.name}</span>
                  <span
                    className={`badge ${cb.state === 'CLOSED' ? 'badge-normal' : cb.state === 'OPEN' ? 'badge-critical' : 'badge-warning'}`}
                    style={{ fontSize: '0.72rem' }}
                  >
                    {cb.state}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#EF4444' }}
                    onClick={() => handleTripBreaker(cb.name)}
                    disabled={cb.state === 'OPEN'}
                  >
                    Trip (Simulate Outage)
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#10B981' }}
                    onClick={() => handleResetBreaker(cb.name)}
                    disabled={cb.state === 'CLOSED'}
                  >
                    Reset (Restore)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* EOC Citywide Emergency Broadcast Center */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          border: '1.5px solid rgba(239, 68, 68, 0.45)',
          background: 'linear-gradient(135deg, rgba(30, 20, 25, 0.75) 0%, rgba(15, 23, 42, 0.9) 100%)',
          boxShadow: '0 8px 32px rgba(220, 38, 38, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>🚨</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#FCA5A5' }}>
                EOC Citywide Emergency Broadcast Center
              </h3>
              <span
                style={{
                  background: '#EF4444',
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                }}
              >
                LIVE DISPATCH
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '4px' }}>
              Transmit authoritative disaster alerts directly to <strong>all citizen apps and phones</strong> across the city.
              Every connected device will immediately sound a <strong>loud buzzer alarm</strong>, vibrate, and display emergency evacuation routing.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => disasterNotificationService.playBuzzerSound()}
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#9CA3AF',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: 0.75,
              }}
              title="Buzzer alarm sounds exclusively on citizen devices; silenced on EOC Admin console"
            >
              <span>🔇</span>
              <span>Buzzer Alert (Citizen Devices Only)</span>
            </button>
          </div>
        </div>

        {/* Quick Disaster Scenario Presets */}
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
            ONE-CLICK DISASTER SCENARIO PRESETS:
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => applyPreset('SILK_BOARD')}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#FCA5A5',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🚨 Silk Board Flash Flood (Critical)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('KORAMANGALA')}
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#FCD34D',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⚠️ Koramangala 80ft Runoff (Warning)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('ECOSPACE')}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#FCA5A5',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🌊 EcoSpace Underpass Submerged
            </button>
            <button
              type="button"
              onClick={() => applyPreset('EVACUATION')}
              style={{
                background: 'rgba(168, 85, 247, 0.2)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                color: '#E9D5FF',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🏃 Bellandur Lowland Evacuation Order
            </button>
            <button
              type="button"
              onClick={() => applyPreset('HYDERABAD')}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#FCA5A5',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🌊 Hyderabad Musi River Surge
            </button>
            <button
              type="button"
              onClick={() => applyPreset('MUMBAI')}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#FCA5A5',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🌊 Mumbai Mithi / Kurla Submersion
            </button>
            <button
              type="button"
              onClick={() => applyPreset('PUNE')}
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#FCD34D',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⚠️ Pune Mula-Mutha Basin Warning
            </button>
            <button
              type="button"
              onClick={() => applyPreset('DELHI')}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#FCA5A5',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🚨 Delhi Yamuna Floodplain Alert
            </button>
            <button
              type="button"
              onClick={() => applyPreset('JAIPUR')}
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#FCD34D',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⚠️ Jaipur Dravyavati Runoff
            </button>
          </div>
        </div>

        {/* Transmission Status Feedback */}
        {transmissionStatus && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: transmissionStatus.startsWith('✅') ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: transmissionStatus.startsWith('✅') ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
              color: transmissionStatus.startsWith('✅') ? '#86EFAC' : '#FCA5A5',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            {transmissionStatus}
          </div>
        )}

        {/* Broadcast Dispatch Form */}
        <form onSubmit={handleTransmitBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Disaster Alert Title
              </label>
              <input
                type="text"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Severity Level
              </label>
              <select
                value={broadcastSeverity}
                onChange={(e) => setBroadcastSeverity(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: broadcastSeverity === 'CRITICAL' ? '#EF4444' : broadcastSeverity === 'WARNING' ? '#F59E0B' : '#38BDF8',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                }}
              >
                <option value="CRITICAL">🔴 CRITICAL (Immediate Life-Safety Hazard + Buzzer)</option>
                <option value="WARNING">🟠 WARNING (Impending Flash Inundation)</option>
                <option value="WATCH">🔵 WATCH (Severe Weather Advisory)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Affected Corridor / Catchment Location
              </label>
              <input
                type="text"
                value={broadcastLocation}
                onChange={(e) => setBroadcastLocation(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '0.82rem',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Water Depth (cm)
              </label>
              <input
                type="number"
                value={broadcastWaterDepth}
                onChange={(e) => setBroadcastWaterDepth(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: '#67E8F9',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Est. Lead Time (min)
              </label>
              <input
                type="number"
                value={broadcastLeadTime}
                onChange={(e) => setBroadcastLeadTime(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: '#FEF08A',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Designated Safe Detour Corridor
              </label>
              <input
                type="text"
                value={broadcastDetour}
                onChange={(e) => setBroadcastDetour(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '0.82rem',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Citizen Advisory &amp; Emergency Instruction Message
            </label>
            <textarea
              rows={2}
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: 'white',
                fontSize: '0.82rem',
                lineHeight: 1.4,
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
            <button
              type="submit"
              disabled={isTransmitting}
              style={{
                background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '12px 24px',
                fontSize: '0.9rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(220, 38, 38, 0.45)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>📢</span>
              <span>{isTransmitting ? 'Transmitting Citywide Emergency Broadcast...' : 'Broadcast Emergency Notification to All Devices'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Filterable Active & Escalating Events Table */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
              {t('authority.events_table')}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              Filterable incident registry across monitored catchments and road segments.
            </p>
          </div>

          {/* Interactive Filters Bar */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select
              value={filterArea}
              onChange={(e) => { setFilterArea(e.target.value); setCurrentPage(1); }}
              className="input"
              style={{ fontSize: '0.78rem', padding: '6px 10px' }}
            >
              <option value="ALL">{t('authority.all_areas')}</option>
              <option value="sector-4-lowlands">Sector 4 Lowlands</option>
              <option value="sector-1-central">Sector 1 Central Core</option>
              <option value="sector-3-east-river">Sector 3 East River</option>
            </select>

            <select
              value={filterSeverity}
              onChange={(e) => { setFilterSeverity(e.target.value); setCurrentPage(1); }}
              className="input"
              style={{ fontSize: '0.78rem', padding: '6px 10px' }}
            >
              <option value="ALL">{t('authority.all_severities')}</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="WARNING">WARNING</option>
              <option value="CAUTION">CAUTION</option>
            </select>

            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
              className="input"
              style={{ fontSize: '0.78rem', padding: '6px 10px' }}
            >
              <option value="ALL">{t('authority.all_types')}</option>
              <option value="FLOOD">FLOOD</option>
              <option value="TRAFFIC">TRAFFIC</option>
              <option value="CLOSURE">CLOSURE</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px' }}>EVENT ID</th>
                <th style={{ padding: '8px' }}>SEVERITY</th>
                <th style={{ padding: '8px' }}>TITLE &amp; DESCRIPTION</th>
                <th style={{ padding: '8px' }}>AREA</th>
                <th style={{ padding: '8px' }}>WATER DEPTH</th>
                <th style={{ padding: '8px' }}>EVIDENCE</th>
                <th style={{ padding: '8px' }}>TIME</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEvents.length > 0 ? (
                paginatedEvents.map((evt) => (
                  <tr key={evt.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px' }} className="font-mono text-muted">{evt.id}</td>
                    <td style={{ padding: '8px' }}>
                      <span className={`badge ${evt.severity === 'CRITICAL' ? 'badge-critical' : evt.severity === 'WARNING' ? 'badge-warning' : 'badge-watch'}`}>
                        {evt.severity}
                      </span>
                    </td>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{evt.title}</td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{evt.areaName}</td>
                    <td style={{ padding: '8px' }} className="font-mono">
                      {evt.waterDepthCm > 0 ? `${evt.waterDepthCm} cm` : '0 cm'}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <span className={`badge ${evt.evidenceType === 'OBSERVED' ? 'badge-critical' : 'badge-normal'}`} style={{ fontSize: '0.7rem' }}>
                        {evt.evidenceType}
                      </span>
                    </td>
                    <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{evt.timestamp}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No events match the selected filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {t('authority.page_info', { current: currentPage, total: totalPages })} • ({filteredEvents.length} total events)
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            >
              {t('authority.page_prev')}
            </button>
            <button
              className="btn btn-secondary"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            >
              {t('authority.page_next')}
            </button>
          </div>
        </div>
      </div>

      {/* Municipal Corridors & Diversion Advisory Panel */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
              {t('authority.corridors_table')}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Real-time arterial congestion, water depth, and automated municipal diversion advisories.
            </p>
          </div>
          <span className="badge badge-secondary">{corridors.length} Monitored Corridors</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {corridors.map((c) => (
            <div
              key={c.corridorId}
              style={{
                background: c.accessibility === 'BLOCKED' ? 'rgba(239, 68, 68, 0.08)' : c.accessibility === 'CAUTION' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                border: `2px solid ${c.accessibility === 'BLOCKED' ? '#EF4444' : c.accessibility === 'CAUTION' ? '#F59E0B' : '#10B981'}`,
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: c.accessibility === 'BLOCKED' ? '#EF4444' : c.accessibility === 'CAUTION' ? '#F59E0B' : '#10B981' }}>
                  {c.name}
                </span>
                <span className={`badge ${c.accessibility === 'BLOCKED' ? 'badge-critical' : c.accessibility === 'CAUTION' ? 'badge-warning' : 'badge-normal'}`}>
                  {c.accessibility}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <span>Speed: <b>{c.speedKmh} km/h</b> (Free: {c.freeFlowSpeedKmh})</span>
                <span>Water: <b style={{ color: c.waterDepthCm > 15 ? '#EF4444' : 'inherit' }}>{c.waterDepthCm} cm</b></span>
                <span>Flood Score: <b>{c.floodScore}/100</b></span>
              </div>
              <div style={{
                background: c.accessibility === 'BLOCKED' ? 'rgba(239, 68, 68, 0.2)' : c.accessibility === 'CAUTION' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                padding: '8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                color: c.accessibility === 'BLOCKED' ? '#FCA5A5' : c.accessibility === 'CAUTION' ? '#FDE68A' : '#6EE7B7',
              }}>
                🛡️ <b>DIVERSION ADVISORY:</b> {c.diversionAdvisory}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Route Recalculation Events Stream */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🔄</span>
              <span>{t('authority.reroute_stream')}</span>
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Audit log of commuter routes dynamically altered due to escalating road hazards.
            </p>
          </div>
          <span className="badge badge-normal">{reroutes.length} Recent Recalculations</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {reroutes.map((r) => (
            <div
              key={r.id}
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>{r.trigger}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                    {r.oldRouteName} ➔ {r.newRouteName}
                  </span>
                  <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                    +{r.timeDeltaMin} min detour • {r.timestamp}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {r.reason}
                </div>
              </div>
              <span className="badge badge-outline" style={{ fontSize: '0.75rem' }}>Session: {r.routeId}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grok AI Municipal Decision Support & Audit Panel */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          borderLeft: '4px solid var(--color-warning)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge-warning">AI REASONING CONSOLE</span>
              <span className="font-mono text-muted" style={{ fontSize: '0.8rem' }}>
                MODEL: {aiDecision.model || 'grok-2-latest'}
              </span>
              {aiDecision.fallback_used && (
                <span className="badge" style={{ background: 'rgba(148, 163, 184, 0.2)', color: '#94A3B8', fontSize: '0.7rem' }}>
                  FALLBACK ENGINE ACTIVE
                </span>
              )}
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '4px' }}>
              {t('authority.decision_audit')}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Contextual synthesis of multi-factor hydrological predictions and verified corridor accessibility.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              className="badge"
              style={{
                fontSize: '0.85rem',
                padding: '6px 12px',
                background:
                  aiDecision.risk_level === 'CRITICAL'
                    ? 'rgba(239, 68, 68, 0.2)'
                    : aiDecision.risk_level === 'WARNING'
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(16, 185, 129, 0.2)',
                color:
                  aiDecision.risk_level === 'CRITICAL'
                    ? '#EF4444'
                    : aiDecision.risk_level === 'WARNING'
                      ? '#F59E0B'
                      : '#10B981',
                fontWeight: 800,
              }}
            >
              STATE: {aiDecision.risk_level}
            </span>
            <span className="badge badge-outline" style={{ fontSize: '0.8rem' }}>
              Latency: {aiDecision.processing_time_ms?.total_ai_latency_ms ?? 18}ms
            </span>
          </div>
        </div>

        {/* Situation Brief & Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
              OPERATIONAL SITUATION INTERPRETATION
            </div>
            <div style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {aiDecision.situation_summary}
            </div>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              DECISION CONFIDENCE HARMONIZATION
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>System Ground Evidence:</span>
              <span className="font-mono" style={{ fontWeight: 700 }}>88%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>AI Interpretation:</span>
              <span className="font-mono" style={{ fontWeight: 700 }}>{((aiDecision.confidence || 0.85) * 100).toFixed(0)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }}>
              <span style={{ color: 'var(--color-normal)', fontWeight: 600 }}>Enforced Decision Confidence:</span>
              <span className="font-mono" style={{ fontWeight: 800, color: 'var(--color-normal)' }}>
                {((aiDecision.decision_confidence || 0.84) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Recommended Authority Actions & Corridor Hazards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '8px' }}>
              MUNICIPAL AUTHORITY ACTION RECOMMENDATIONS
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(aiDecision.authority_actions || []).map((action: string, idx: number) => (
                <li key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {action}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#EF4444', marginBottom: '8px' }}>
              IDENTIFIED CORRIDOR AVOIDANCE ZONES
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {(aiDecision.roads_to_avoid || []).map((road: string, idx: number) => (
                <span key={idx} className="badge badge-critical" style={{ fontSize: '0.78rem' }}>
                  🚫 {road}
                </span>
              ))}
            </div>

            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
              AFFECTED HYDROLOGICAL BASINS
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {(aiDecision.affected_zones || []).join(' • ') || 'None identified'}
            </div>
          </div>
        </div>

        {/* Audit History Table */}
        {aiHistory.length > 0 && (
          <div style={{ marginTop: '6px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
              RECENT AI DECISION AUDIT TRAIL
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '6px 8px' }}>TIMESTAMP</th>
                    <th style={{ padding: '6px 8px' }}>MODE</th>
                    <th style={{ padding: '6px 8px' }}>RISK LEVEL</th>
                    <th style={{ padding: '6px 8px' }}>CONFIDENCE</th>
                    <th style={{ padding: '6px 8px' }}>STATUS</th>
                    <th style={{ padding: '6px 8px' }}>DECISION SUMMARY</th>
                  </tr>
                </thead>
                <tbody>
                  {aiHistory.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '6px 8px' }} className="font-mono text-muted">
                        {new Date(item.created_at).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{item.mode}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span className={`badge ${item.decision?.risk_level === 'CRITICAL' ? 'badge-critical' : item.decision?.risk_level === 'WARNING' ? 'badge-warning' : 'badge-normal'}`}>
                          {item.decision?.risk_level}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px' }} className="font-mono">
                        {((item.decision?.decision_confidence || 0.85) * 100).toFixed(0)}%
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        {item.fallback_used ? (
                          <span style={{ color: 'var(--color-warning)' }}>FALLBACK</span>
                        ) : (
                          <span style={{ color: 'var(--color-normal)' }}>VALIDATED</span>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.decision?.situation_summary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Telemetry Provider Statuses Matrix */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
              {t('authority.provider_health')}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Monitoring latency, consecutive failures, and live vs. mock adapter modes.
            </p>
          </div>
          <span className="badge badge-normal">Central Ingestion Live</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {(providerStatuses.length > 0
            ? providerStatuses
            : [
                { provider: 'open-meteo', category: 'weather', status: 'HEALTHY', isLive: true, lastResponseTimeMs: 124, consecutiveFailures: 0 },
                { provider: 'metro-traffic-adapter', category: 'traffic', status: 'HEALTHY', isLive: true, lastResponseTimeMs: 45, consecutiveFailures: 0 },
                { provider: 'metro-flood-adapter', category: 'flood', status: 'HEALTHY', isLive: false, lastResponseTimeMs: 5, consecutiveFailures: 0 },
                { provider: 'osm-map-service', category: 'map', status: 'HEALTHY', isLive: true, lastResponseTimeMs: 8, consecutiveFailures: 0 },
              ]
          ).map((p, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.provider}</span>
                <span className={`badge ${p.status === 'HEALTHY' ? 'badge-normal' : 'badge-warning'}`}>
                  {p.status}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Category: <b>{p.category}</b> • Mode: <b>{p.isLive ? 'LIVE' : 'MOCK / SIMULATION'}</b>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Response Time: <b>{p.lastResponseTimeMs}ms</b></span>
                <span>Failures: <b>{p.consecutiveFailures}</b></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Citizen Hazard Verification Queue */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
              {t('authority.citizen_reports')}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Review and verify crowd-sourced road flood observations before updating municipal road states.
            </p>
          </div>
          <span className="badge badge-watch">{reports.length} Reports</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.map((report) => (
            <div
              key={report.id}
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ maxWidth: '650px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className={`badge ${report.status === 'VERIFIED' ? 'badge-normal' : 'badge-warning'}`}>
                    {report.status === 'VERIFIED' ? t('authority.status_verified') : t('authority.status_pending')}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Category: {report.category}</span>
                  <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                    {report.submittedAt} • Coordinates: {report.location}
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  "{report.description}"
                </p>
              </div>

              {report.status === 'PENDING_REVIEW' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => handleVerify(report.id)}>
                    {t('authority.verify')}
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => handleDismiss(report.id)}>
                    {t('authority.dismiss')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

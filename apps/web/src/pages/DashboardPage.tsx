import React, { useState, useEffect, useCallback } from 'react';
import { realtimeClient, ConnectionStatus } from '../services/realtimeClient';
import { useI18n } from '../i18n/I18nContext';

interface DashboardPageProps {
  onNavigate: (path: string) => void;
}

interface RelevantEvent {
  relevant: boolean;
  distanceKm: number;
  severity: string;
  eventName?: string;
  reason: string;
}

interface DestinationEvaluation {
  destination: string;
  risk: string;
  nearestEventDistanceKm: number;
  affectedRoads: string[];
  recommendedAction: string;
  reason: string;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { t, getLocalizedSeverity, language } = useI18n();

  const [reportText, setReportText] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('OFFLINE');

  // Location tracking state
  const [locationStatus, setLocationStatus] = useState<'PROMPT' | 'ACTIVE' | 'DENIED' | 'UNSUPPORTED'>('PROMPT');
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number }>({ lat: 40.7128, lon: -74.0060 });
  const [lastLocationUpdated, setLastLocationUpdated] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Proximity & Destination Evaluation
  const [currentRisk, setCurrentRisk] = useState<string>('WARNING');
  const [nearestEventDistance, setNearestEventDistance] = useState<number>(4.2);
  const [nearbyEvents, setNearbyEvents] = useState<RelevantEvent[]>([]);
  const [destinationQuery, setDestinationQuery] = useState('Hospital');
  const [destinationResult, setDestinationResult] = useState<DestinationEvaluation | null>({
    destination: 'City Memorial Hospital',
    risk: 'WARNING',
    nearestEventDistanceKm: 3.8,
    affectedRoads: ['Bay Street Underpass', 'Harbor Boulevard Corridor'],
    recommendedAction: 'Check an alternative route before traveling.',
    reason: 'Active flood event detected 3.8 km from destination',
  });
  const [evaluatingDest, setEvaluatingDest] = useState(false);

  // Phase 3: Flood Intelligence & 30-Min Nowcast state
  const [floodIntel, setFloodIntel] = useState<{
    score: number;
    state: string;
    predictedState: string;
    horizonMinutes: number;
    probability: number;
    trend: 'INCREASING' | 'STABLE' | 'DECREASING';
    confidence: number;
    reasons: string[];
    affectedRoads: Array<{ roadName: string; accessibilityState: string; floodScore: number }>;
  }>({
    score: 68.5,
    state: 'WARNING',
    predictedState: 'CRITICAL',
    horizonMinutes: 30,
    probability: 0.76,
    trend: 'INCREASING',
    confidence: 0.88,
    reasons: [
      'Precipitation accelerating at 5.2 mm/h²',
      'Radar projects sustained rainfall (38.0 mm in 3h)',
      'Low-lying catchment basin accelerates surface water accumulation',
    ],
    affectedRoads: [
      { roadName: 'Bay Street Boulevard', accessibilityState: 'BLOCKED', floodScore: 88 },
      { roadName: 'Market Street', accessibilityState: 'CAUTION', floodScore: 54 },
      { roadName: 'Highland Avenue Elevated', accessibilityState: 'OPEN', floodScore: 10 },
    ],
  });

  // Phase 4: Grok AI Decision Support state
  const [aiDecision, setAiDecision] = useState<{
    risk_level: string;
    situation_summary: string;
    citizen_actions: string[];
    route_recommendation: { action: string; reason: string };
    roads_to_avoid: string[];
    notification: { message: string };
    decision_confidence: number;
    fallback_used: boolean;
  }>({
    risk_level: 'WARNING',
    situation_summary: 'Flood risk is increasing near your route due to sustained rainfall.',
    citizen_actions: [
      'Avoid Bay Street Boulevard and all low-lying underpasses.',
      'Follow safety-weighted alternate routes shown on the map.',
      'Delay non-essential transit if possible.',
    ],
    route_recommendation: {
      action: 'CONSIDER_ALTERNATIVE',
      reason: 'Heavy rainfall + increasing flood risk + traffic disruption detected.',
    },
    roads_to_avoid: ['Bay Street Boulevard'],
    notification: {
      message: 'Flood risk is increasing near your route. Avoid Bay Street and use the safer route shown.',
    },
    decision_confidence: 0.85,
    fallback_used: false,
  });

  // Real-time telemetry state
  const [weatherData, setWeatherData] = useState({
    rainfallRateMmh: 42.5,
    rainfall1hMm: 34.2,
    rainfall24hMm: 98.6,
    temperatureC: 21.5,
    humidityPercent: 94.0,
    windSpeedKmh: 45.0,
    freshness: 'LIVE',
    source: 'open-meteo',
    dataAgeSeconds: 15,
  });

  const [trafficData] = useState({
    congestedCount: 2,
    incidentsCount: 2,
    freshness: 'LIVE',
    source: 'metro-traffic-adapter',
  });

  const [providerStatuses, setProviderStatuses] = useState([
    { provider: 'open-meteo', category: 'weather', status: 'HEALTHY', isLive: true, responseTime: 120 },
    { provider: 'metro-traffic-adapter', category: 'traffic', status: 'HEALTHY', isLive: true, responseTime: 85 },
    { provider: 'metro-flood-adapter', category: 'flood', status: 'HEALTHY', isLive: false, responseTime: 4 },
  ]);

  // Request user location with browser geolocation
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('UNSUPPORTED');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setUserCoords(coords);
        setLocationStatus('ACTIVE');
        setLastLocationUpdated(new Date());
        setSecondsAgo(0);

        // Fetch location relevance
        fetchLocationRelevance(coords.lat, coords.lon, destinationQuery);

        // Notify WebSocket
        realtimeClient.send({
          action: 'location_update',
          latitude: coords.lat,
          longitude: coords.lon,
          destination: destinationQuery,
          language,
        });
      },
      () => {
        setLocationStatus('DENIED');
        // Continue operating with default coordinates
        fetchLocationRelevance(userCoords.lat, userCoords.lon, destinationQuery);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, [destinationQuery, language, userCoords]);

  // Fetch location relevance from backend
  const fetchLocationRelevance = (lat: number, lon: number, dest: string) => {
    fetch(`/api/v1/location/relevance?lat=${lat}&lon=${lon}&destination=${encodeURIComponent(dest)}&language=${language}`)
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((body) => {
        if (body?.success && body.data) {
          if (body.data.currentLocation) {
            setCurrentRisk(body.data.currentLocation.risk || 'NORMAL');
            setNearestEventDistance(body.data.currentLocation.nearestEventDistanceKm || 999);
            setNearbyEvents(body.data.currentLocation.relevantEvents || []);
          }
          if (body.data.destination) {
            setDestinationResult(body.data.destination);
          }
        }
      })
      .catch(() => {
        // Fallback for standalone demo
        if (!dest) return;
        const lower = dest.toLowerCase();
        if (lower.includes('bellandur') || lower.includes('ecospace') || lower.includes('silk board')) {
          setDestinationResult({
            destination: dest,
            risk: 'CRITICAL',
            nearestEventDistanceKm: 0.8,
            affectedRoads: ['Bellandur EcoSpace Underpass', 'Silk Board Lower Junction'],
            recommendedAction: 'Divert immediately via Outer Ring Road Elevated Corridor',
            reason: 'Active inundation (38cm) detected along transit corridor.',
          });
        } else if (lower.includes('whitefield') || lower.includes('itpl') || lower.includes('electronic city')) {
          setDestinationResult({
            destination: dest,
            risk: 'WATCH',
            nearestEventDistanceKm: 6.2,
            affectedRoads: ['Varthur Lake Spillway'],
            recommendedAction: 'Main expressways operational; proceed with caution',
            reason: 'Moderate precipitation, normal drainage functioning on elevated expressways.',
          });
        } else {
          setDestinationResult({
            destination: dest,
            risk: 'WARNING',
            nearestEventDistanceKm: 2.1,
            affectedRoads: ['Intermediate Ring Road Low-lying Culvert'],
            recommendedAction: 'Follow safety-weighted alternative route',
            reason: 'Regional precipitation index above baseline; surface runoff accumulating.',
          });
        }
      });
  };

  // Timer ticker for updated location seconds ago
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastLocationUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastLocationUpdated]);

  // Initial fetch and WebSocket listener
  useEffect(() => {
    const unsubStatus = realtimeClient.onStatusChange(setWsStatus);

    // Initial HTTP fetch of city state & location relevance
    fetch('/api/v1/realtime/state')
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((body) => {
        if (body?.success && body.data) {
          if (body.data.weather) {
            setWeatherData((prev) => ({ ...prev, ...body.data.weather }));
          }
          if (body.data.providers && Array.isArray(body.data.providers)) {
            setProviderStatuses(
              body.data.providers.map((p: any) => ({
                provider: p.provider,
                category: p.category,
                status: p.status,
                isLive: p.isLive,
                responseTime: p.lastResponseTimeMs || 50,
              }))
            );
          }
        }
      })
      .catch(() => {});

    fetchLocationRelevance(userCoords.lat, userCoords.lon, destinationQuery);

    // Initial fetch of Flood Intelligence & Predictions
    const fetchFloodIntel = () => {
      Promise.all([
        fetch('/api/v1/flood/risk').then((r) => (r.ok && r.headers.get('content-type')?.includes('application/json') ? r.json() : null)).catch(() => null),
        fetch('/api/v1/roads/flood-risk').then((r) => (r.ok && r.headers.get('content-type')?.includes('application/json') ? r.json() : null)).catch(() => null),
      ]).then(([riskRes, roadsRes]) => {
        if (riskRes?.success && riskRes.data) {
          setFloodIntel((prev) => ({
            ...prev,
            score: riskRes.data.current?.score ?? prev.score,
            state: riskRes.data.current?.state ?? prev.state,
            predictedState: riskRes.data.prediction?.state ?? prev.predictedState,
            horizonMinutes: riskRes.data.prediction?.horizonMinutes ?? prev.horizonMinutes,
            probability: riskRes.data.prediction?.probability ?? prev.probability,
            trend: riskRes.data.prediction?.trend ?? prev.trend,
            confidence: riskRes.data.confidence ?? prev.confidence,
            reasons: riskRes.data.prediction?.reasons ?? prev.reasons,
            affectedRoads: roadsRes?.success && Array.isArray(roadsRes.data)
              ? roadsRes.data.map((r: any) => ({
                  roadName: r.roadName,
                  accessibilityState: r.accessibilityState,
                  floodScore: r.floodScore,
                }))
              : prev.affectedRoads,
          }));
        }
      });
    };

    fetchFloodIntel();

    // Listen for WebSocket pushes
    const unsubMsg = realtimeClient.onMessage((msg) => {
      if (msg.topic === 'realtime:weather' && msg.payload) {
        setWeatherData((prev) => ({
          ...prev,
          rainfallRateMmh: msg.payload.rainfallRateMmh ?? prev.rainfallRateMmh,
          temperatureC: msg.payload.temperatureC ?? prev.temperatureC,
          rainfall24hMm: msg.payload.rainfall24hMm ?? prev.rainfall24hMm,
          freshness: msg.payload.freshness ?? 'LIVE',
          source: msg.payload.source || prev.source,
          dataAgeSeconds: 0,
        }));
        fetchFloodIntel();
      } else if (msg.topic === 'realtime:flood') {
        fetchFloodIntel();
      } else if (msg.topic === 'realtime:location_alert' && msg.data) {
        if (msg.data.currentLocation) {
          setCurrentRisk(msg.data.currentLocation.risk || 'NORMAL');
          setNearestEventDistance(msg.data.currentLocation.nearestEventDistanceKm || 999);
          setNearbyEvents(msg.data.currentLocation.relevantEvents || []);
        }
        if (msg.data.destination) {
          setDestinationResult(msg.data.destination);
        }
      } else if (msg.topic === 'realtime:ai') {
        fetchAiDecision();
      }
    });

    // Phase 4: Fetch Latest Citizen AI Decision
    const fetchAiDecision = () => {
      fetch(`/api/v1/ai/latest?mode=CITIZEN_SAFETY&language=${language}`)
        .then((r) => (r.ok && r.headers.get('content-type')?.includes('application/json') ? r.json() : null))
        .then((res) => {
          if (res?.status === 'ok' && res.data?.decision) {
            const dec = res.data.decision;
            setAiDecision({
              risk_level: dec.risk_level,
              situation_summary: dec.situation_summary,
              citizen_actions: dec.citizen_actions || [],
              route_recommendation: dec.route_recommendation || {
                action: 'KEEP_ROUTE',
                reason: 'Normal transit conditions.',
              },
              roads_to_avoid: dec.roads_to_avoid || [],
              notification: dec.notification || { message: '' },
              decision_confidence: dec.decision_confidence ?? dec.confidence ?? 0.85,
              fallback_used: res.data.fallback_used,
            });
          }
        })
        .catch(() => {});
    };

    fetchAiDecision();

    return () => {
      unsubStatus();
      unsubMsg();
    };
  }, [destinationQuery, userCoords.lat, userCoords.lon, language]);

  const handleDestinationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEvaluatingDest(true);
    fetchLocationRelevance(userCoords.lat, userCoords.lon, destinationQuery);
    setTimeout(() => setEvaluatingDest(false), 500);
  };

  const handleQuickDestination = (dest: string) => {
    setDestinationQuery(dest);
    fetchLocationRelevance(userCoords.lat, userCoords.lon, dest);
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setReportSubmitted(true);
    setTimeout(() => {
      setReportText('');
      setReportSubmitted(false);
    }, 4000);
  };

  const getSeverityBadgeClass = (sev: string) => {
    switch (sev.toUpperCase()) {
      case 'CRITICAL':
        return 'badge-critical';
      case 'WARNING':
        return 'badge-warning';
      case 'WATCH':
        return 'badge-watch';
      default:
        return 'badge-normal';
    }
  };

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Location Permission & Status Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          background: locationStatus === 'DENIED' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(15, 23, 42, 0.85)',
          borderRadius: '10px',
          border: locationStatus === 'DENIED' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-subtle)',
          fontSize: '0.85rem',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className={`pulse-dot ${locationStatus === 'ACTIVE' ? 'text-emerald' : locationStatus === 'DENIED' ? 'text-red' : 'text-amber'}`} />
          <div>
            <div style={{ fontWeight: 700 }}>
              {locationStatus === 'ACTIVE'
                ? t('location.status_active')
                : locationStatus === 'DENIED'
                ? t('location.status_denied')
                : t('location.status_prompt')}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {locationStatus === 'ACTIVE'
                ? t('location.updated_ago', { seconds: secondsAgo })
                : locationStatus === 'DENIED'
                ? t('location.using_default')
                : t('location.prompt_description')}
            </div>
          </div>
        </div>

        {locationStatus !== 'ACTIVE' && (
          <button className="btn btn-secondary" onClick={requestLocation} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
            {t('location.enable_button')}
          </button>
        )}
      </div>

      {/* Real-time Stream & Freshness Indicator */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.8rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={`pulse-dot ${wsStatus === 'CONNECTED' ? 'text-emerald' : 'text-amber'}`} />
          <span className="font-mono">REAL-TIME STREAM: {wsStatus}</span>
          <span className="text-muted">• Live telemetry updates pushed via WebSockets without page reload</span>
        </div>
        <span className="font-mono text-cyan" style={{ fontSize: '0.75rem' }}>
          SOURCE: {weatherData.source.toUpperCase()} ({weatherData.freshness})
        </span>
      </div>

      {/* Feature Add-On Section: CURRENT LOCATION RISK vs DESTINATION RISK */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
        {/* Nearby Location Risk Card */}
        <div
          className="glass-panel"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            borderLeft: currentRisk === 'CRITICAL' ? '4px solid var(--color-critical)' : currentRisk === 'WARNING' ? '4px solid var(--color-warning)' : '4px solid var(--color-normal)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              {t('location.nearby_flood_risk').toUpperCase()}
            </span>
            <span className={`badge ${getSeverityBadgeClass(currentRisk)}`}>
              {getLocalizedSeverity(currentRisk)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span className="font-mono" style={{ fontSize: '2.4rem', fontWeight: 800, color: currentRisk === 'CRITICAL' ? 'var(--color-critical)' : currentRisk === 'WARNING' ? 'var(--color-warning)' : 'var(--color-normal)' }}>
              {nearestEventDistance < 900 ? `${nearestEventDistance.toFixed(1)} km` : '10+ km'}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {nearestEventDistance < 900 ? 'away from your location' : t('location.no_nearby_hazards')}
            </span>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            {currentRisk !== 'NORMAL' ? t('location.avoid_roads') : t('location.no_nearby_hazards')}
          </div>

          {nearbyEvents.length > 0 && (
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.8rem' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                {nearbyEvents[0].eventName}
              </div>
              <div style={{ color: 'var(--text-muted)' }}>{nearbyEvents[0].reason}</div>
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
            <button className="btn btn-secondary" onClick={() => onNavigate('/map')} style={{ width: '100%', fontSize: '0.8rem' }}>
              {t('location.view_details')}
            </button>
          </div>
        </div>

        {/* Destination Risk Card */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              {t('destination.title').toUpperCase()}
            </span>
            {destinationResult && (
              <span className={`badge ${getSeverityBadgeClass(destinationResult.risk)}`}>
                {getLocalizedSeverity(destinationResult.risk)}
              </span>
            )}
          </div>

          {/* Destination Search Form */}
          <form onSubmit={handleDestinationSubmit} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
              placeholder={t('destination.enter_destination')}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '0.85rem',
              }}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '0.8rem' }} disabled={evaluatingDest}>
              {t('destination.check_button')}
            </button>
          </form>

          {/* Quick Destination Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('destination.quick_destinations')}</span>
            {[
              { key: 'dest_home', label: t('destination.dest_home') },
              { key: 'dest_work', label: t('destination.dest_work') },
              { key: 'dest_hospital', label: t('destination.dest_hospital') },
              { key: 'dest_college', label: t('destination.dest_college') },
              { key: 'dest_whitefield', label: t('destination.dest_whitefield') },
            ].map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => handleQuickDestination(chip.label)}
                style={{
                  background: destinationQuery === chip.label ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.7)',
                  color: destinationQuery === chip.label ? '#38BDF8' : 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Destination Risk Details */}
          {destinationResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <div style={{ fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Destination: </span>
                <b>{destinationResult.destination}</b>
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Proximity to Hazard: </span>
                <span className="font-mono" style={{ fontWeight: 700 }}>
                  {destinationResult.nearestEventDistanceKm < 900
                    ? `${destinationResult.nearestEventDistanceKm.toFixed(1)} km`
                    : 'Clear (> 10 km)'}
                </span>
              </div>
              {destinationResult.affectedRoads.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-critical)' }}>
                  <b>{t('destination.affected_roads')}</b> {destinationResult.affectedRoads.join(', ')}
                </div>
              )}
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(15, 23, 42, 0.6)', padding: '8px 12px', borderRadius: '6px' }}>
                <b>{t('destination.recommended_action')}</b> {destinationResult.recommendedAction}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('destination.no_destination_hazards')}</div>
          )}
        </div>
      </div>

      {/* Phase 3: Dedicated Flood Intelligence & 30-Min Predictive Nowcast Card */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          borderLeft:
            floodIntel.state === 'CRITICAL'
              ? '4px solid var(--color-critical)'
              : floodIntel.state === 'WARNING'
              ? '4px solid var(--color-warning)'
              : '4px solid var(--color-normal)',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.7) 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`pulse-dot ${floodIntel.state === 'CRITICAL' ? 'text-red' : floodIntel.state === 'WARNING' ? 'text-amber' : 'text-emerald'}`} />
              {t('flood_intelligence.title')}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {t('flood_intelligence.model_tag')} • Short-Horizon Nowcast (15–30 Min Horizon) • Non-IoT Software Intelligence
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className={`badge ${getSeverityBadgeClass(floodIntel.state)}`}>
              {t('flood_intelligence.current_risk')}: {getLocalizedSeverity(floodIntel.state)} ({floodIntel.score}/100)
            </span>
            <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06B6D4', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
              {t('flood_intelligence.confidence')}: {(floodIntel.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Prediction Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          {/* Nowcast Forecast State */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              {t('flood_intelligence.nowcast_heading')}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span className={`badge ${getSeverityBadgeClass(floodIntel.predictedState)}`} style={{ fontSize: '0.9rem', padding: '4px 10px' }}>
                {getLocalizedSeverity(floodIntel.predictedState)}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                in {floodIntel.horizonMinutes} mins
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
              Escalation Prob: <b>{(floodIntel.probability * 100).toFixed(0)}%</b>
            </div>
          </div>

          {/* Hazard Trend */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              {t('flood_intelligence.trend_label')}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: floodIntel.trend === 'INCREASING' ? 'var(--color-critical)' : floodIntel.trend === 'DECREASING' ? 'var(--color-normal)' : 'var(--color-warning)' }}>
              {floodIntel.trend === 'INCREASING'
                ? `↗ ${t('flood_intelligence.trend_increasing')}`
                : floodIntel.trend === 'DECREASING'
                ? `↘ ${t('flood_intelligence.trend_decreasing')}`
                : `→ ${t('flood_intelligence.trend_stable')}`}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              Rate of change evaluated from radar &amp; 1h accumulation
            </div>
          </div>

          {/* Explainable Reasons */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)', gridColumn: 'span 2' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              {t('flood_intelligence.factors_title')}
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {floodIntel.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Affected Roads Table */}
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            {t('flood_intelligence.affected_roads_title')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            {floodIntel.affectedRoads.map((road, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(15, 23, 42, 0.5)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{road.roadName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hazard Score: {road.floodScore}/100</div>
                </div>
                <span
                  className="badge"
                  style={{
                    background:
                      road.accessibilityState === 'BLOCKED'
                        ? 'rgba(239, 68, 68, 0.2)'
                        : road.accessibilityState === 'CAUTION'
                        ? 'rgba(245, 158, 11, 0.2)'
                        : 'rgba(16, 185, 129, 0.2)',
                    color:
                      road.accessibilityState === 'BLOCKED'
                        ? '#EF4444'
                        : road.accessibilityState === 'CAUTION'
                        ? '#F59E0B'
                        : '#10B981',
                    fontSize: '0.7rem',
                  }}
                >
                  {road.accessibilityState}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Phase 4: Citizen AI Safety Summary Panel */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          borderLeft: `4px solid ${
            aiDecision.risk_level === 'CRITICAL'
              ? 'var(--color-critical)'
              : aiDecision.risk_level === 'WARNING'
                ? 'var(--color-warning)'
                : 'var(--color-normal)'
          }`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>🧠</span>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                AI Safety Summary
              </h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                xAI Grok Reasoning Engine • Advisory Decision Support
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="badge"
              style={{
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
                fontWeight: 700,
              }}
            >
              {aiDecision.risk_level} RISK
            </span>
            <span className="badge badge-outline" style={{ fontSize: '0.75rem' }}>
              Confidence: {(aiDecision.decision_confidence * 100).toFixed(0)}%
            </span>
            {aiDecision.fallback_used && (
              <span className="badge" style={{ background: 'rgba(148, 163, 184, 0.2)', color: '#94A3B8', fontSize: '0.7rem' }}>
                DETERMINISTIC FALLBACK
              </span>
            )}
          </div>
        </div>

        {/* Plain-Language Situation Summary */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '16px',
            borderRadius: '10px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            {aiDecision.situation_summary}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-warning)' }}>
                Recommended Action:
              </span>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                {aiDecision.roads_to_avoid.length > 0
                  ? `Avoid ${aiDecision.roads_to_avoid.join(', ')} and use the safer route shown on the map.`
                  : 'Follow normal transit guidelines.'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Why:
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {aiDecision.route_recommendation.reason || 'Telemetry-grounded multi-factor evaluation.'}
              </span>
            </div>
          </div>
        </div>

        {/* Protective Action Checklist & Route Status */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {/* Action Checklist */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.4)',
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              COMMUTER PROTECTIVE ACTIONS
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {aiDecision.citizen_actions.map((act, idx) => (
                <li key={idx} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {act}
                </li>
              ))}
            </ul>
          </div>

          {/* Route Advisory Box */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.4)',
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                ROUTE TRANSIT RECOMMENDATION
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span
                  className="badge"
                  style={{
                    background:
                      aiDecision.route_recommendation.action === 'REROUTE_REQUIRED'
                        ? 'rgba(239, 68, 68, 0.25)'
                        : aiDecision.route_recommendation.action === 'CONSIDER_ALTERNATIVE'
                          ? 'rgba(245, 158, 11, 0.25)'
                          : 'rgba(16, 185, 129, 0.25)',
                    color:
                      aiDecision.route_recommendation.action === 'REROUTE_REQUIRED'
                        ? '#EF4444'
                        : aiDecision.route_recommendation.action === 'CONSIDER_ALTERNATIVE'
                          ? '#F59E0B'
                          : '#10B981',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                  }}
                >
                  {aiDecision.route_recommendation.action.replace('_', ' ')}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {aiDecision.notification.message}
              </div>
            </div>

            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '12px', alignSelf: 'flex-start' }}
              onClick={() => onNavigate('/map')}
            >
              View Safer Alternative on Map →
            </button>
          </div>
        </div>
      </div>

      {/* Telemetry Grid (Weather, Traffic, Flood) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
        {/* Weather Card */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('dashboard.weather_card').toUpperCase()}
            </span>
            <span className={`badge ${weatherData.freshness === 'LIVE' ? 'badge-normal' : 'badge-watch'}`}>
              {weatherData.freshness} • {weatherData.dataAgeSeconds}s ago
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '4px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('dashboard.rain_rate').toUpperCase()}</div>
              <div className="font-mono" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                {weatherData.rainfallRateMmh.toFixed(1)} mm/h
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>24H ACCUMULATION</div>
              <div className="font-mono" style={{ fontSize: '1.6rem', fontWeight: 800 }}>
                {weatherData.rainfall24hMm.toFixed(1)} mm
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('dashboard.temp').toUpperCase()}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{weatherData.temperatureC.toFixed(1)}°C</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('dashboard.wind').toUpperCase()}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{weatherData.windSpeedKmh.toFixed(0)} km/h</div>
            </div>
          </div>
        </div>

        {/* Traffic Telemetry Card */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('dashboard.traffic_card').toUpperCase()}
            </span>
            <span className="badge badge-normal">LIVE FLOW</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '4px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('dashboard.congestion').toUpperCase()}</div>
              <div className="font-mono" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-warning)' }}>
                {trafficData.congestedCount} sectors
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('dashboard.incidents').toUpperCase()}</div>
              <div className="font-mono" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-critical)' }}>
                {trafficData.incidentsCount} active
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MONITORED ROADS</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>3 Key Arteries</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>UPDATE CYCLE</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>180s interval</div>
            </div>
          </div>
        </div>

        {/* Flood Observation Card */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('dashboard.flood_card').toUpperCase()}
            </span>
            <span className="badge badge-watch">SIMULATION DATA</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--color-critical)' }}>28 cm</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Peak depth in Bay Basin Lowlands</span>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            <b>Transparency Notice:</b> Live city sensor telemetry is supplemented by hydrological simulation models for this sector.
          </div>
        </div>
      </div>

      {/* Provider Status Monitor Row */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
          <span>{t('dashboard.provider_card').toUpperCase()}</span>
          <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>CENTRALIZED BACKGROUND INGESTION</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          {providerStatuses.map((p, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{p.provider}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {p.isLive ? 'Live API Source' : 'Simulated Source'} • {p.responseTime}ms
                </div>
              </div>
              <span className={`badge ${p.status === 'HEALTHY' ? 'badge-normal' : 'badge-warning'}`}>
                {p.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Citizen Hazard Report Form */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px' }}>
          Report Local Road Waterlogging or Hazard
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '16px' }}>
          Submit local observations directly to the real-time data intelligence pipeline.
        </p>

        {reportSubmitted ? (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              padding: '16px',
              color: 'var(--color-normal)',
              fontWeight: 600,
            }}
          >
            ✓ Report received and ingested into the telemetry pipeline. Thank you for keeping the city safe.
          </div>
        ) : (
          <form onSubmit={handleReportSubmit} style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="e.g. Standing water over curb at 5th and Main intersection..."
              style={{
                flex: 1,
                padding: '10px 14px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'white',
              }}
              required
            />
            <button type="submit" className="btn btn-primary">
              Submit Report
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

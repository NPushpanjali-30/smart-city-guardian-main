import {
  CanonicalAIContext,
  AiDecisionMode,
  LanguageCode,
  GrokDecisionOutput,
  RouteRecommendationAction,
  NotificationPriority,
  AiRiskLevel,
} from '@smartcity/shared';
import { AiProvider, AiProviderResult } from './aiProvider.interface.js';

export class MockAiProvider implements AiProvider {
  public readonly name = 'mock-ai-provider';

  public async generateDecision(
    context: CanonicalAIContext,
    mode: AiDecisionMode,
    language: LanguageCode = 'en'
  ): Promise<AiProviderResult> {
    const startTime = Date.now();

    // Check if telemetry is missing
    const isTelemetryMissing =
      context.dataQuality.confidence.telemetryHealth === 'UNAVAILABLE' ||
      context.flood.confidence < 0.2;

    const floodScore = context.flood.currentRisk.score;
    const isCritical = floodScore >= 75;
    const isWarning = floodScore >= 50;
    const isWatch = floodScore >= 25;

    let riskLevel: AiRiskLevel = 'NORMAL';
    if (isTelemetryMissing) {
      riskLevel = 'UNKNOWN';
    } else if (isCritical) {
      riskLevel = 'CRITICAL';
    } else if (isWarning) {
      riskLevel = 'WARNING';
    } else if (isWatch) {
      riskLevel = 'WATCH';
    }

    const blockedRoads = context.roads.affected
      .filter((r) => r.state === 'BLOCKED')
      .map((r) => r.name);
    const cautionRoads = context.roads.affected
      .filter((r) => r.state === 'HIGH_RISK')
      .map((r) => r.name);
    const roadsToAvoid = [...blockedRoads, ...cautionRoads];

    const targetZone =
      context.flood.zones[0]?.name || context.location.cityName || 'Metro Central';
    const primaryRoad = roadsToAvoid[0] || 'low-lying underpasses';

    const routeAction: RouteRecommendationAction =
      blockedRoads.length > 0
        ? 'REROUTE_REQUIRED'
        : cautionRoads.length > 0
          ? 'CONSIDER_ALTERNATIVE'
          : 'KEEP_ROUTE';

    const notifPriority: NotificationPriority = isCritical
      ? 'URGENT'
      : isWarning
        ? 'WARNING'
        : isWatch
          ? 'INFO'
          : 'NONE';

    const localized = this.getModeContent(
      mode,
      language,
      riskLevel,
      targetZone,
      primaryRoad,
      blockedRoads,
      routeAction,
      context
    );

    // Simulate minor processing latency
    const latencyMs = Date.now() - startTime + 5;

    const decision: GrokDecisionOutput = {
      risk_level: riskLevel,
      confidence: Number((context.flood.confidence * 0.95).toFixed(2)),
      situation_summary: localized.situationSummary,
      affected_zones:
        context.flood.zones.length > 0
          ? context.flood.zones.map((z) => z.name)
          : [targetZone],
      roads_to_avoid: roadsToAvoid.length > 0 ? roadsToAvoid : ['Low-lying corridors'],
      citizen_actions: localized.citizenActions,
      authority_actions: localized.authorityActions,
      recommended_actions: localized.citizenActions,
      route_recommendation: {
        action: routeAction,
        reason: localized.routeReason,
      },
      notification: {
        should_notify: isWarning || isCritical,
        priority: notifPriority,
        language,
        message: localized.notificationMessage,
      },
      uncertainties: isTelemetryMissing
        ? ['Live flood observations are unavailable. Telemetry health is degraded.']
        : context.flood.confidence < 0.7
          ? ['Telemetry confidence is moderately reduced due to sensor age.']
          : [],
      sms_summary: localized.notificationMessage.slice(0, 160),
      language,
      decision_confidence: Number((context.flood.confidence * 0.95).toFixed(2)),
      unverified_claims: [],
    };

    return {
      rawResponse: JSON.stringify(decision),
      parsed: decision,
      latencyMs,
      model: 'mock-grok-v2',
    };
  }

  public isHealthy(): boolean {
    return true;
  }

  private getModeContent(
    mode: AiDecisionMode,
    language: LanguageCode,
    riskLevel: AiRiskLevel,
    zone: string,
    road: string,
    blockedRoads: string[],
    routeAction: RouteRecommendationAction,
    context: CanonicalAIContext
  ) {
    if (language === 'hi') {
      return {
        situationSummary:
          riskLevel === 'CRITICAL'
            ? `${zone} में अत्यधिक जलभराव और मार्ग रुकावट की पुष्टि हुई है। सार्वजनिक सुरक्षा सर्वोच्च प्राथमिकता है।`
            : riskLevel === 'WARNING'
              ? `${zone} में बाढ़ का बढ़ता जोखिम देखा गया है। सुरक्षात्मक मार्ग अपनाएं।`
              : riskLevel === 'UNKNOWN'
                ? `${zone} के लिए लाइव अवलोकन अनुपलब्ध हैं। अत्यधिक सतर्कता बरतें।`
                : `${zone} में मौसम और यातायात सामान्य परिचालन सीमा में हैं।`,
        citizenActions: [
          `${road} और सभी निचले अंडरपास से दूर रहें।`,
          'सुरक्षित उच्च भूमि वाले वैकल्पिक मार्गों का चयन करें।',
          'गैर-ज़रूरी यात्रा स्थगित करें।',
        ],
        authorityActions: [
          'जल निकासी पंपागारों की परिचालन स्थिति सत्यापित करें।',
          'अवरुद्ध चौराहों पर बैरिकेड्स और चेतावनी संकेत लगाएं।',
        ],
        routeReason:
          routeAction === 'REROUTE_REQUIRED'
            ? `मार्ग पर ${blockedRoads.join(', ') || 'सड़कें'} जलभराव के कारण पूरी तरह से अवरुद्ध हैं।`
            : 'प्रस्तावित मार्ग पर कोई ज्ञात जलभराव अवरोध नहीं है।',
        notificationMessage:
          riskLevel === 'CRITICAL'
            ? `चेतावनी: ${road} पर गहरा पानी। वैकल्पिक सुरक्षित मार्ग अपनाएं।`
            : `सतर्कता: ${zone} में जलभराव निगरानी सक्रिय है।`,
      };
    }

    if (language === 'kn') {
      return {
        situationSummary:
          riskLevel === 'CRITICAL'
            ? `${zone} ನಲ್ಲಿ ತೀವ್ರ ಪ್ರವಾಹ ಮತ್ತು ರಸ್ತೆ ತಡೆ ಪತ್ತೆಯಾಗಿದೆ. ಸಾರ್ವಜನಿಕ ಸುರಕ್ಷತೆಗೆ ಪ್ರಥಮ ಆದ್ಯತೆ.`
            : riskLevel === 'WARNING'
              ? `${zone} ನಲ್ಲಿ ಪ್ರವಾಹ ಅಪಾಯ ಹೆಚ್ಚುತ್ತಿದೆ. ಸುರಕ್ಷಿತ ರಸ್ತೆಗಳನ್ನು ಬಳಸಿ.`
              : riskLevel === 'UNKNOWN'
                ? `${zone} ಗಾಗಿ ನೇರ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ. ತೀವ್ರ ಎಚ್ಚರಿಕೆಯಿಂದ ಸಂಚರಿಸಿ.`
                : `${zone} ನಲ್ಲಿ ಸಂಚಾರ ಮತ್ತು ಹವಾಮಾನ ಸ್ಥಿತಿ ಸಾಮಾನ್ಯವಾಗಿವೆ.`,
        citizenActions: [
          `${road} ಮತ್ತು ತಗ್ಗು ಪ್ರದೇಶಗಳ ಅಂಡರ್‌ಪಾಸ್‌ಗಳನ್ನು ತಪ್ಪಿಸಿ.`,
          'ಎತ್ತರದ ಸುರಕ್ಷಿತ ಪರ್ಯಾಯ ಮಾರ್ಗಗಳನ್ನು ಅನುಸರಿಸಿ.',
          'ಅನಗತ್ಯ ಪ್ರಯಾಣ ಮುಂದೂಡಿ.',
        ],
        authorityActions: [
          'ಚರಂಡಿ ಮತ್ತು ಪಂಪ್ ವ್ಯವಸ್ಥೆಯನ್ನು ತಕ್ಷಣ ಪರಿಶೀಲಿಸಿ.',
          'ಅಪಾಯಕಾರಿ ವಲಯಗಳಲ್ಲಿ ಬ್ಯಾರಿಕೇಡ್ ಅಳವಡಿಸಿ.',
        ],
        routeReason:
          routeAction === 'REROUTE_REQUIRED'
            ? `ಮಾರ್ಗದಲ್ಲಿ ${blockedRoads.join(', ') || 'ರಸ್ತೆಗಳು'} ಜಲಾವೃತವಾಗಿವೆ. ಮಾರ್ಗ ಬದಲಾವಣೆ ಕಡ್ಡಾಯ.`
            : 'ಪ್ರಸ್ತುತ ಮಾರ್ಗದಲ್ಲಿ ಯಾವುದೇ ಅಪಾಯಕಾರಿ ಪ್ರವಾಹ ಅಡೆತಡೆಗಳಿಲ್ಲ.',
        notificationMessage:
          riskLevel === 'CRITICAL'
            ? `ಪ್ರವಾಹ ಎಚ್ಚರಿಕೆ: ${road} ನಲ್ಲಿ ನೀರು ತುಂಬಿದೆ. ಸುರಕ್ಷಿತ ಮಾರ್ಗ ಬಳಸಿ.`
            : `ಜಾಗರೂಕತೆ: ${zone} ನಲ್ಲಿ ನೀರು ನಿಲ್ಲುವ ಸಾಧ್ಯತೆ ಇದೆ.`,
      };
    }

    // Default: English
    let situationSummary = '';
    switch (mode) {
      case 'CITY_OVERVIEW':
        situationSummary =
          riskLevel === 'CRITICAL'
            ? `Citywide flood escalation: Multiple catchment basins experiencing severe inundation in ${zone}. Priority municipal mitigation underway.`
            : riskLevel === 'WARNING'
              ? `Elevated urban flood risk across ${zone} due to intense antecedent rainfall and reducing drainage headway.`
              : riskLevel === 'UNKNOWN'
                ? `Citywide flood observation feeds are currently unavailable. Operations running on degraded baseline.`
                : `Urban drainage and mobility corridors operating within nominal baseline parameters across ${zone}.`;
        break;
      case 'CITIZEN_SAFETY':
        situationSummary =
          riskLevel === 'CRITICAL'
            ? `Hazardous inundation detected within your travel radius in ${zone}. Immediate avoidance of low corridors required.`
            : riskLevel === 'WARNING'
              ? `Increasing surface runoff and ponding detected near your location in ${zone}. Exercise heightened transit caution.`
              : riskLevel === 'UNKNOWN'
                ? `Localized flood telemetry is temporarily unavailable for your coordinates. Proceed cautiously.`
                : `Safe transit conditions confirmed near your current location in ${zone}.`;
        break;
      case 'ROUTE_ASSESSMENT':
        situationSummary =
          routeAction === 'REROUTE_REQUIRED'
            ? `Active route trajectory directly intersects critical flood hazard zones and confirmed road blockages.`
            : routeAction === 'CONSIDER_ALTERNATIVE'
              ? `Active route traverses corridors adjacent to rising water hazards. Alternative paths recommended.`
              : `Active route corridor is clear of significant flood hazards and operating normally.`;
        break;
      case 'EVENT_SUMMARY':
        situationSummary = `State transition event recorded: Flood severity assessed as ${riskLevel} in ${zone}.`;
        break;
      case 'ALERT_GENERATION':
        situationSummary = `${riskLevel} alert generated for affected commuters in ${zone}.`;
        break;
    }

    return {
      situationSummary,
      citizenActions: [
        `Avoid ${road} and all low-lying underpasses.`,
        'Follow safety-weighted alternate corridors on elevated terrain.',
        'Delay non-essential transit and verify real-time road accessibility.',
      ],
      authorityActions: [
        'Deploy mobile pumping assets to low-elevation catchment discharge points.',
        'Pre-position physical warning barriers and detour signs at blocked intersections.',
      ],
      routeReason:
        routeAction === 'REROUTE_REQUIRED'
          ? `Route intersects verified blocked corridors (${blockedRoads.join(', ') || 'inundated segment'}). Safe rerouting mandatory.`
          : routeAction === 'CONSIDER_ALTERNATIVE'
            ? `Adjacent corridors exhibit elevated flood hazard. Precautionary diversion recommended.`
            : 'Current transit corridor operates without material environmental restriction.',
      notificationMessage:
        riskLevel === 'CRITICAL'
          ? `FLASH FLOOD CRITICAL: Avoid ${road}. Use safe elevated route on map.`
          : riskLevel === 'WARNING'
            ? `FLOOD WARNING: Water pooling on ${road}. Follow detour.`
            : `ADVISORY: Normal transit across ${zone}. Safe travels.`,
    };
  }
}

export const mockAiProvider = new MockAiProvider();

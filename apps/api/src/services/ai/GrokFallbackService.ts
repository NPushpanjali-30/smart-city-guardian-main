import {
  CanonicalAIContext,
  GrokDecisionOutput,
  LanguageCode,
  RouteRecommendationAction,
  NotificationPriority,
  AiRiskLevel,
} from '@smartcity/shared';

export class GrokFallbackService {
  /**
   * Deterministically generates a structured emergency action plan in the requested language
   */
  public generateFallback(
    context: CanonicalAIContext,
    reason = 'Autonomous fallback triggered',
    language: LanguageCode = 'en'
  ): GrokDecisionOutput {
    const isDataUnavailable =
      context.dataQuality.confidence.telemetryHealth === 'UNAVAILABLE' ||
      context.flood.confidence < 0.2;

    const compositeScore = context.flood.currentRisk.score;
    const isCritical = compositeScore >= 75;
    const isWarning = compositeScore >= 50;
    const isWatch = compositeScore >= 25;

    let risk_level: AiRiskLevel = 'NORMAL';
    if (isDataUnavailable) {
      risk_level = 'UNKNOWN';
    } else if (isCritical) {
      risk_level = 'CRITICAL';
    } else if (isWarning) {
      risk_level = 'WARNING';
    } else if (isWatch) {
      risk_level = 'WATCH';
    }

    const blockedRoads = context.roads.affected
      .filter((r) => r.state === 'BLOCKED')
      .map((r) => r.name);
    const cautionRoads = context.roads.affected
      .filter((r) => r.state === 'HIGH_RISK')
      .map((r) => r.name);
    const roadsToAvoid = [...blockedRoads, ...cautionRoads];

    const targetZone =
      context.flood.zones[0]?.name || context.location.cityName || 'Metropolitan Area';
    const primaryAvoidRoad = roadsToAvoid[0] || 'low-lying underpasses';

    // Determine route recommendation
    const hasBlocked = blockedRoads.length > 0;
    const hasCaution = cautionRoads.length > 0;
    const routeAction: RouteRecommendationAction = hasBlocked
      ? 'REROUTE_REQUIRED'
      : hasCaution
        ? 'CONSIDER_ALTERNATIVE'
        : 'KEEP_ROUTE';

    const shouldNotify = isWarning || isCritical;
    const notifPriority: NotificationPriority = isCritical
      ? 'URGENT'
      : isWarning
        ? 'WARNING'
        : isWatch
          ? 'INFO'
          : 'NONE';

    // Localized content generator based on language
    const localized = this.getLocalizedContent(
      language,
      risk_level,
      targetZone,
      primaryAvoidRoad,
      blockedRoads,
      routeAction,
      reason
    );

    const systemConf = context.dataQuality.confidence.systemConfidence ?? 0.8;
    const fallbackConf = Number((systemConf * 0.85).toFixed(2));

    return {
      risk_level,
      confidence: fallbackConf,
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
        should_notify: shouldNotify,
        priority: notifPriority,
        language,
        message: localized.notificationMessage,
      },
      uncertainties: isDataUnavailable
        ? ['Live flood observations are unavailable. Telemetry health degraded.']
        : [
            `Fallback operational mode active (${reason}). Reasoning generated deterministically without LLM.`,
          ],
      sms_summary: localized.notificationMessage.slice(0, 160),
      language,
      decision_confidence: fallbackConf,
      unverified_claims: [],
    };
  }

  private getLocalizedContent(
    language: LanguageCode,
    riskLevel: AiRiskLevel,
    zone: string,
    primaryAvoidRoad: string,
    blockedRoads: string[],
    routeAction: RouteRecommendationAction,
    reason: string
  ) {
    if (language === 'hi') {
      return {
        situationSummary:
          riskLevel === 'CRITICAL'
            ? `${zone} में गंभीर जलभराव और मार्ग अवरोध का पता चला है। तत्काल सुरक्षा सावधानियां लागू हैं।`
            : riskLevel === 'WARNING'
              ? `${zone} में बाढ़ का बढ़ता जोखिम देखा गया है। अत्यधिक सावधानी बरतने की सलाह दी जाती है।`
              : riskLevel === 'UNKNOWN'
                ? `${zone} के लिए वास्तविक समय बाढ़ डेटा अनुपलब्ध है। सावधानी से आगे बढ़ें।`
                : `${zone} में पारगमन की स्थिति सामान्य है।`,
        citizenActions: [
          `${primaryAvoidRoad} और निचले अंडरपास से बचें।`,
          'उच्च भूमि वाले वैकल्पिक सुरक्षित मार्ग का उपयोग करें।',
          'अनावश्यक यात्रा को टालें और आधिकारिक सलाह का पालन करें।',
        ],
        authorityActions: [
          'प्रभावित क्षेत्रों में जल निकासी और पंपों का निरीक्षण करें।',
          'अवरुद्ध मार्गों पर त्वरित चेतावनी बैरिकेड्स लगाएं।',
        ],
        routeReason:
          routeAction === 'REROUTE_REQUIRED'
            ? `जलभराव के कारण ${blockedRoads.join(', ') || 'सड़कें'} अवरुद्ध हैं। पुनः मार्ग आवश्यक है।`
            : 'वर्तमान मार्ग पर कोई महत्वपूर्ण पर्यावरणीय प्रतिबंध नहीं है।',
        notificationMessage:
          riskLevel === 'CRITICAL'
            ? `बाढ़ चेतावनी: ${primaryAvoidRoad} के पास भारी जलभराव। सुरक्षित मार्ग का उपयोग करें।`
            : `सतर्कता: ${zone} में जलभराव की निगरानी। गति धीमी रखें।`,
      };
    }

    if (language === 'kn') {
      return {
        situationSummary:
          riskLevel === 'CRITICAL'
            ? `${zone} ನಲ್ಲಿ ತೀವ್ರ ಪ್ರವಾಹ ಮತ್ತು ರಸ್ತೆ ತಡೆ ಪತ್ತೆಯಾಗಿದೆ. ಸುರಕ್ಷತಾ ಕ್ರಮಗಳನ್ನು ಕೈಗೊಳ್ಳಿ.`
            : riskLevel === 'WARNING'
              ? `${zone} ನಲ್ಲಿ ಪ್ರವಾಹ ಅಪಾಯ ಹೆಚ್ಚುತ್ತಿದೆ. ಎಚ್ಚರಿಕೆಯಿಂದ ಸಂಚರಿಸಿ.`
              : riskLevel === 'UNKNOWN'
                ? `${zone} ಗಾಗಿ ನೇರ ಪ್ರವಾಹ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ. ಜಾಗರೂಕರಾಗಿರಿ.`
                : `${zone} ನಲ್ಲಿ ಸಂಚಾರ ಪರಿಸ್ಥಿತಿ ಸಾಮಾನ್ಯವಾಗಿದೆ.`,
        citizenActions: [
          `${primaryAvoidRoad} ಮತ್ತು ತಗ್ಗು ಪ್ರದೇಶಗಳ ಅಂಡರ್‌ಪಾಸ್‌ಗಳನ್ನು ತಪ್ಪಿಸಿ.`,
          'ಎತ್ತರದ ಪರ್ಯಾಯ ಸುರಕ್ಷಿತ ರಸ್ತೆಗಳನ್ನು ಬಳಸಿ.',
          'ಅನಗತ್ಯ ಪ್ರಯಾಣವನ್ನು ಮುಂದೂಡಿ ಮತ್ತು ಅಧಿಕೃತ ಎಚ್ಚರಿಕೆಗಳನ್ನು ಗಮನಿಸಿ.',
        ],
        authorityActions: [
          'ಬಾಧಿತ ವಲಯಗಳಲ್ಲಿ ಚರಂಡಿ ಮತ್ತು ಪಂಪ್‌ಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.',
          'ಅಪಾಯಕಾರಿ ರಸ್ತೆಗಳಲ್ಲಿ ಬ್ಯಾರಿಕೇಡ್‌ಗಳನ್ನು ಸ್ಥಾಪಿಸಿ.',
        ],
        routeReason:
          routeAction === 'REROUTE_REQUIRED'
            ? `${blockedRoads.join(', ') || 'ರಸ್ತೆಗಳು'} ಜಲಾವೃತವಾಗಿವೆ. ಮಾರ್ಗ ಬದಲಾವಣೆ ಅಗತ್ಯ.`
            : 'ಪ್ರಸ್ತುತ ಮಾರ್ಗದಲ್ಲಿ ಯಾವುದೇ ಗಂಭೀರ ನಿರ್ಬಂಧಗಳಿಲ್ಲ.',
        notificationMessage:
          riskLevel === 'CRITICAL'
            ? `ಪ್ರವಾಹ ಎಚ್ಚರಿಕೆ: ${primaryAvoidRoad} ಬಳಿ ನೀರು ತುಂಬಿದೆ. ಸುರಕ್ಷಿತ ಮಾರ್ಗ ಬಳಸಿ.`
            : `ಜಾಗರೂಕತೆ: ${zone} ನಲ್ಲಿ ನೀರು ನಿಲ್ಲುವ ಸಾಧ್ಯತೆ. ನಿಧಾನವಾಗಿ ಚಲಿಸಿ.`,
      };
    }

    // Default: English
    return {
      situationSummary:
        riskLevel === 'CRITICAL'
          ? `Severe water accumulation and active corridor blockages detected in ${zone}. Life safety precautions in effect.`
          : riskLevel === 'WARNING'
            ? `Increasing flood risk and localized inundation observed in ${zone}. Heightened transit caution advised.`
            : riskLevel === 'UNKNOWN'
              ? `Real-time flood telemetry is unavailable for ${zone}. Proceed with caution and monitor updates.`
              : `Environmental and mobility conditions within normal operational baselines across ${zone}.`,
      citizenActions: [
        `Avoid ${primaryAvoidRoad} and designated low-lying underpasses.`,
        'Utilize safety-weighted alternate routes on higher ground.',
        'Delay non-essential transit and follow in-app guidance.',
      ],
      authorityActions: [
        'Inspect storm drainage culverts and activate mobile pumps in active basins.',
        'Pre-position warning barricades and redirect traffic from blocked segments.',
      ],
      routeReason:
        routeAction === 'REROUTE_REQUIRED'
          ? `Direct corridor closure detected on ${blockedRoads.join(', ') || 'affected corridors'}. Safer reroute required.`
          : routeAction === 'CONSIDER_ALTERNATIVE'
            ? `Elevated water hazard observed along active route corridors. Alternative recommended.`
            : 'Current transit corridor operates without material environmental restriction.',
      notificationMessage:
        riskLevel === 'CRITICAL'
          ? `FLASH FLOOD CRITICAL: High water near ${primaryAvoidRoad}. Avoid underpasses. Follow safe route.`
          : riskLevel === 'WARNING'
            ? `FLOOD WARNING: Water pooling on ${primaryAvoidRoad}. Follow designated detours.`
            : `WEATHER ADVISORY: Normal transit across ${zone}. Safe travels.`,
    };
  }
}

export const grokFallbackService = new GrokFallbackService();

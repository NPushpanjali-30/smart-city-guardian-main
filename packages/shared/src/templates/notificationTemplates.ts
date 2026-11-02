import {
  LanguageCode,
  FloodSeverity,
  LocalizedNotificationTemplate,
  SmsEncodingAnalysis,
} from '../types/index.js';

export interface AlertTemplateParams {
  language: LanguageCode;
  severity: FloodSeverity;
  alertType?: 'LOCATION_ALERT' | 'DESTINATION_ALERT' | 'ROUTE_ALERT';
  template?: 'LOCATION_ALERT' | 'DESTINATION_ALERT' | 'ROUTE_ALERT';
  distanceKm?: number;
  destination?: string;
  eventName?: string;
  affectedRoads?: string[];
  routeDetourName?: string;
  travelTimeDeltaMin?: number;
  waterDepthCm?: number;
}

export const NOTIFICATION_TEMPLATES: Record<
  LanguageCode,
  Record<
    'LOCATION_ALERT' | 'DESTINATION_ALERT' | 'ROUTE_ALERT',
    Record<FloodSeverity, { title: string; bodyTemplate: string; smsTemplate: string }>
  >
> = {
  en: {
    LOCATION_ALERT: {
      NORMAL: {
        title: 'Safety Conditions Normal',
        bodyTemplate: 'No active flood hazards detected within your monitored area.',
        smsTemplate: 'SMARTCITY: Conditions normal in your area. Safe travels.',
      },
      WATCH: {
        title: 'Flood Watch Advisory',
        bodyTemplate: 'Weather monitoring indicates potential water accumulation {distanceKm} km from your location. Stay alert.',
        smsTemplate: 'SMARTCITY ADVISORY: Potential waterlogging {distanceKm}km away. Monitor local updates.',
      },
      WARNING: {
        title: 'Active Flood Warning',
        bodyTemplate: 'Active flood hazard detected {distanceKm} km from your location ({eventName}). Avoid low-lying corridors.',
        smsTemplate: 'SMARTCITY WARNING: Flood hazard {distanceKm}km away near {eventName}. Avoid low underpasses.',
      },
      CRITICAL: {
        title: 'URGENT: Flash Flood Emergency',
        bodyTemplate: 'CRITICAL flood hazard {distanceKm} km from your location. Roads may be submerged. Seek higher ground immediately.',
        smsTemplate: 'SMARTCITY CRITICAL: Flash flood {distanceKm}km away. Submerged roads. Avoid travel immediately.',
      },
    },
    DESTINATION_ALERT: {
      NORMAL: {
        title: 'Destination Clear',
        bodyTemplate: 'Your destination {destination} has no active flood or traffic hazards reported.',
        smsTemplate: 'SMARTCITY: Route to {destination} is clear of flood hazards.',
      },
      WATCH: {
        title: 'Destination Weather Advisory',
        bodyTemplate: 'Destination {destination} has potential weather runoff {distanceKm} km away. Allow extra travel time.',
        smsTemplate: 'SMARTCITY: Potential delay near {destination} due to rain {distanceKm}km away.',
      },
      WARNING: {
        title: 'Destination Flood Warning',
        bodyTemplate: 'Active flood event detected {distanceKm} km from {destination}. Check alternative routes before traveling.',
        smsTemplate: 'SMARTCITY: Flood alert {distanceKm}km from {destination}. Check safer alternatives.',
      },
      CRITICAL: {
        title: 'Destination Inundation Emergency',
        bodyTemplate: 'CRITICAL flooding near {destination} ({distanceKm} km away). Corridors are submerged. Do not travel to this area.',
        smsTemplate: 'SMARTCITY CRITICAL: Flooding at {destination} ({distanceKm}km). Access blocked. Do not travel.',
      },
    },
    ROUTE_ALERT: {
      NORMAL: {
        title: 'Route Conditions Clear',
        bodyTemplate: 'Your planned route is clear of flood hazards.',
        smsTemplate: 'SMARTCITY: Planned route is clear of flood hazards. Safe travels.',
      },
      WATCH: {
        title: 'Route Weather Advisory',
        bodyTemplate: 'Potential water pooling detected near {routeDetourName}. Allow extra transit time.',
        smsTemplate: 'SMARTCITY ADVISORY: Potential water pooling on route near {routeDetourName}.',
      },
      WARNING: {
        title: 'Route Flood Warning',
        bodyTemplate: 'Flood hazard detected on active corridor. Detour recommended via {routeDetourName} (+{travelTimeDeltaMin} min).',
        smsTemplate: 'SMARTCITY WARNING: Flood hazard on route. Safer detour: {routeDetourName} (+{travelTimeDeltaMin}m). Avoid flooded roads.',
      },
      CRITICAL: {
        title: 'URGENT: Route Submerged — Detour Mandated',
        bodyTemplate: 'CRITICAL: Planned route corridor is submerged. Mandatory detour active via {routeDetourName}.',
        smsTemplate: 'SMARTCITY CRITICAL: Road submerged on route. Detour via {routeDetourName}. Do not attempt flooded crossing.',
      },
    },
  },
  hi: {
    LOCATION_ALERT: {
      NORMAL: {
        title: 'सुरक्षा स्थिति सामान्य',
        bodyTemplate: 'आपके निगरानी क्षेत्र में बाढ़ का कोई सक्रिय खतरा नहीं पाया गया है।',
        smsTemplate: 'स्मार्टसिटी: आपके क्षेत्र में स्थिति सामान्य है। सुरक्षित यात्रा करें।',
      },
      WATCH: {
        title: 'बाढ़ निगरानी सलाह',
        bodyTemplate: 'मौसम निगरानी आपके स्थान से {distanceKm} किमी दूर जलभराव की संभावना दर्शाती है। सतर्क रहें।',
        smsTemplate: 'स्मार्टसिटी सलाह: आपके स्थान से {distanceKm} किमी दूर जलभराव संभव। सतर्क रहें।',
      },
      WARNING: {
        title: 'सक्रिय बाढ़ चेतावनी',
        bodyTemplate: 'आपके स्थान से {distanceKm} किमी दूर बाढ़ का खतरा पाया गया है ({eventName})। निचले इलाकों से बचें।',
        smsTemplate: 'स्मार्टसिटी चेतावनी: {distanceKm} किमी दूर बाढ़ का खतरा ({eventName})। निचले रास्तों से बचें।',
      },
      CRITICAL: {
        title: 'अति आवश्यक: त्वरित बाढ़ आपातकाल',
        bodyTemplate: 'गंभीर बाढ़ का खतरा आपके स्थान से {distanceKm} किमी दूर है। सड़कें जलमग्न हो सकती हैं। सुरक्षित स्थान पर जाएं।',
        smsTemplate: 'स्मार्टसिटी आपातकाल: {distanceKm} किमी दूर भारी बाढ़। सड़कें जलमग्न। यात्रा तुरंत रोकें।',
      },
    },
    DESTINATION_ALERT: {
      NORMAL: {
        title: 'गंतव्य सुरक्षित',
        bodyTemplate: 'आपके गंतव्य {destination} पर बाढ़ या यातायात का कोई सक्रिय खतरा नहीं है।',
        smsTemplate: 'स्मार्टसिटी: {destination} का मार्ग सुरक्षित और स्पष्ट है।',
      },
      WATCH: {
        title: 'गंतव्य मौसम सलाह',
        bodyTemplate: 'गंतव्य {destination} के पास {distanceKm} किमी दूर वर्षा जलभराव संभव है। अतिरिक्त समय लेकर चलें।',
        smsTemplate: 'स्मार्टसिटी: {destination} के पास {distanceKm} किमी दूर जलभराव की संभावना।',
      },
      WARNING: {
        title: 'गंतव्य बाढ़ चेतावनी',
        bodyTemplate: '{destination} से {distanceKm} किमी दूर बाढ़ की स्थिति दर्ज की गई है। यात्रा से पहले वैकल्पिक मार्ग देखें।',
        smsTemplate: 'स्मार्टसिटी चेतावनी: {destination} से {distanceKm} किमी दूर बाढ़। वैकल्पिक मार्ग चुनें।',
      },
      CRITICAL: {
        title: 'गंतव्य जलमग्नता आपातकाल',
        bodyTemplate: '{destination} के पास गंभीर बाढ़ ({distanceKm} किमी दूर)। मार्ग जलमग्न हैं। इस क्षेत्र में यात्रा न करें।',
        smsTemplate: 'स्मार्टसिटी आपातकाल: {destination} के पास भारी बाढ़ ({distanceKm} किमी)। इस क्षेत्र में न जाएं।',
      },
    },
    ROUTE_ALERT: {
      NORMAL: {
        title: 'मार्ग की स्थिति स्पष्ट',
        bodyTemplate: 'आपके नियोजित मार्ग पर बाढ़ का कोई खतरा नहीं है।',
        smsTemplate: 'स्मार्टसिटी: नियोजित मार्ग बाढ़ से मुक्त है। सुरक्षित यात्रा करें।',
      },
      WATCH: {
        title: 'मार्ग मौसम सलाह',
        bodyTemplate: '{routeDetourName} के पास जलभराव संभव। अतिरिक्त समय लेकर चलें।',
        smsTemplate: 'स्मार्टसिटी सलाह: मार्ग में {routeDetourName} के पास जलभराव संभव।',
      },
      WARNING: {
        title: 'मार्ग बाढ़ चेतावनी',
        bodyTemplate: 'मार्ग पर बाढ़ का खतरा। {routeDetourName} के माध्यम से सुरक्षित चक्कर की सिफारिश (+{travelTimeDeltaMin} मिनट)।',
        smsTemplate: 'स्मार्टसिटी चेतावनी: मार्ग पर बाढ़। सुरक्षित चक्कर: {routeDetourName} (+{travelTimeDeltaMin} मिनट)।',
      },
      CRITICAL: {
        title: 'अति आवश्यक: मार्ग जलमग्न — डायवर्जन अनिवार्य',
        bodyTemplate: 'गंभीर: नियोजित मार्ग जलमग्न हो चुका है। {routeDetourName} के माध्यम से अनिवार्य डायवर्जन सक्रिय।',
        smsTemplate: 'स्मार्टसिटी आपातकाल: मार्ग जलमग्न। {routeDetourName} से जाएं। जलमग्न सड़क पार न करें।',
      },
    },
  },
  kn: {
    LOCATION_ALERT: {
      NORMAL: {
        title: 'ಸುರಕ್ಷತಾ ಪರಿಸ್ಥಿತಿ ಸಾಮಾನ್ಯ',
        bodyTemplate: 'ನಿಮ್ಮ ವ್ಯಾಪ್ತಿಯಲ್ಲಿ ಯಾವುದೇ ಸಕ್ರಿಯ ಪ್ರವಾಹ ಅಪಾಯಗಳು ಕಂಡುಬಂದಿಲ್ಲ.',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ: ನಿಮ್ಮ ಪ್ರದೇಶದಲ್ಲಿ ಪರಿಸ್ಥಿತಿ ಸಾಮಾನ್ಯವಾಗಿದೆ. ಶುಭ ಪ್ರಯಾಣ.',
      },
      WATCH: {
        title: 'ಪ್ರವಾಹ ಮುನ್ನೆಚ್ಚರಿಕೆ ವೀಕ್ಷಣೆ',
        bodyTemplate: 'ನಿಮ್ಮ ಸ್ಥಳದಿಂದ {distanceKm} ಕಿ.ಮೀ ದೂರದಲ್ಲಿ ನೀರು ನಿಲ್ಲುವ ಸಾಧ್ಯತೆಯಿದೆ. ಜಾಗರೂಕರಾಗಿರಿ.',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ ಎಚ್ಚರಿಕೆ: {distanceKm} ಕಿ.ಮೀ ದೂರದಲ್ಲಿ ನೀರು ನಿಲ್ಲುವ ಸಾಧ್ಯತೆ. ನಿಗಾ ವಹಿಸಿ.',
      },
      WARNING: {
        title: 'ಸಕ್ರಿಯ ಪ್ರವಾಹ ಎಚ್ಚರಿಕೆ',
        bodyTemplate: 'ನಿಮ್ಮ ಸ್ಥಳದಿಂದ {distanceKm} ಕಿ.ಮೀ ದೂರದಲ್ಲಿ ಪ್ರವಾಹದ ಅಪಾಯ ಪತ್ತೆಯಾಗಿದೆ ({eventName}). ತಗ್ಗು ರಸ್ತೆಗಳನ್ನು ತಪ್ಪಿಸಿ.',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ ಎಚ್ಚರಿಕೆ: {distanceKm} ಕಿ.ಮೀ ದೂರದಲ್ಲಿ ಪ್ರವಾಹ ({eventName}). ತಗ್ಗು ರಸ್ತೆ ಬೇಡ.',
      },
      CRITICAL: {
        title: 'ತುರ್ತು: ಹಠಾತ್ ಪ್ರವಾಹ ತುರ್ತು ಪರಿಸ್ಥಿತಿ',
        bodyTemplate: 'ನಿಮ್ಮ ಸ್ಥಳದಿಂದ {distanceKm} ಕಿ.ಮೀ ದೂರದಲ್ಲಿ ತೀವ್ರ ಪ್ರವಾಹ. ರಸ್ತೆಗಳು ಜಲಾವೃತವಾಗಿವೆ. ಸುರಕ್ಷಿತ ಸ್ಥಳಕ್ಕೆ ತೆರಳಿ.',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ ತುರ್ತು: {distanceKm} ಕಿ.ಮೀ ದೂರದಲ್ಲಿ ಭಾರಿ ಪ್ರವಾಹ. ರಸ್ತೆಗಳು ಮುಳುಗಿವೆ. ಪ್ರಯಾಣ ನಿಲ್ಲಿಸಿ.',
      },
    },
    DESTINATION_ALERT: {
      NORMAL: {
        title: 'ಗಮ್ಯಸ್ಥಾನ ಸುರಕ್ಷಿತ',
        bodyTemplate: 'ನಿಮ್ಮ ಗಮ್ಯಸ್ಥಾನ {destination} ನಲ್ಲಿ ಯಾವುದೇ ಪ್ರವಾಹ ಅಥವಾ ಟ್ರಾಫಿಕ್ ಅಪಾಯಗಳಿಲ್ಲ.',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ: {destination} ಗೆ ರಸ್ತೆ ಸುರಕ್ಷಿತವಾಗಿದೆ.',
      },
      WATCH: {
        title: 'ಗಮ್ಯಸ್ಥಾನ ಹವಾಮಾನ ಸಲಹೆ',
        bodyTemplate: 'ಗಮ್ಯಸ್ಥಾನ {destination} ಸಮೀಪ {distanceKm} ಕಿ.ಮೀ ದೂರದಲ್ಲಿ ಮಳೆ ನೀರು ನಿಲ್ಲುವ ಸಾಧ್ಯತೆಯಿದೆ.',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ: {destination} ಬಳಿ {distanceKm} ಕಿ.ಮೀ ದೂರದಲ್ಲಿ ಮಳೆ ನೀರಿನ ಸಾಧ್ಯತೆ.',
      },
      WARNING: {
        title: 'ಗಮ್ಯಸ್ಥಾನ ಪ್ರವಾಹ ಎಚ್ಚರಿಕೆ',
        bodyTemplate: '{destination} ನಿಂದ {distanceKm} ಕಿ.ಮೀ ದೂರದಲ್ಲಿ ಪ್ರವಾಹ ಪತ್ತೆಯಾಗಿದೆ. ಪರ್ಯಾಯ ಮಾರ್ಗವನ್ನು ಪರಿಶೀಲಿಸಿ.',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ: {destination} ನಿಂದ {distanceKm} ಕಿ.ಮೀ ದೂರದಲ್ಲಿ ಪ್ರವಾಹ. ಪರ್ಯಾಯ ಮಾರ್ಗ ನೋಡಿ.',
      },
      CRITICAL: {
        title: 'ಗಮ್ಯಸ್ಥಾನ ಜಲಾವೃತ ತುರ್ತುಸ್ಥಿತಿ',
        bodyTemplate: '{destination} ಬಳಿ ತೀವ್ರ ಪ್ರವಾಹ ({distanceKm} ಕಿ.ಮೀ). ರಸ್ತೆಗಳು ಮುಳುಗಿವೆ. ಈ ಪ್ರದೇಶಕ್ಕೆ ಪ್ರಯಾಣಿಸಬೇಡಿ.',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ ತುರ್ತು: {destination} ಬಳಿ ಭಾರಿ ಪ್ರವಾಹ ({distanceKm} ಕಿ.ಮೀ). ದಯವಿಟ್ಟು ಹೋಗಬೇಡಿ.',
      },
    },
    ROUTE_ALERT: {
      NORMAL: {
        title: 'ಮಾರ್ಗ ಪರಿಸ್ಥಿತಿ ಮುಕ್ತವಾಗಿದೆ',
        bodyTemplate: 'ನಿಮ್ಮ ಯೋಜಿತ ಮಾರ್ಗದಲ್ಲಿ ಯಾವುದೇ ಪ್ರವಾಹ ಅಪಾಯಗಳಿಲ್ಲ.',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ: ಯೋಜಿತ ಮಾರ್ಗ ಪ್ರವಾಹದಿಂದ ಮುಕ್ತವಾಗಿದೆ. ಶುಭ ಪ್ರಯಾಣ.',
      },
      WATCH: {
        title: 'ಮಾರ್ಗ ಹವಾಮಾನ ಸಲಹೆ',
        bodyTemplate: '{routeDetourName} ಬಳಿ ನೀರು ನಿಲ್ಲುವ ಸಾಧ್ಯತೆ. ಹೆಚ್ಚುವರಿ ಸಮಯ ತೆಗೆದುಕೊಳ್ಳಿ.',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ ಸಲಹೆ: ಮಾರ್ಗದಲ್ಲಿ {routeDetourName} ಬಳಿ ನೀರು ನಿಲ್ಲುವ ಸಾಧ್ಯತೆ.',
      },
      WARNING: {
        title: 'ಮಾರ್ಗ ಪ್ರವಾಹ ಎಚ್ಚರಿಕೆ',
        bodyTemplate: 'ಮಾರ್ಗದಲ್ಲಿ ಪ್ರವಾಹ ಅಪಾಯ. {routeDetourName} ಮೂಲಕ ಪರ್ಯಾಯ ಮಾರ್ಗ ಶಿಫಾರಸು (+{travelTimeDeltaMin} ನಿಮಿಷ).',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ ಎಚ್ಚರಿಕೆ: ಮಾರ್ಗದಲ್ಲಿ ಪ್ರವಾಹ. ಸುರಕ್ಷಿತ ಬದಲಿ: {routeDetourName} (+{travelTimeDeltaMin} ನಿಮಿಷ).',
      },
      CRITICAL: {
        title: 'ತುರ್ತು: ಮಾರ್ಗ ಜಲಾವೃತ — ಪರ್ಯಾಯ ಮಾರ್ಗ ಕಡ್ಡಾಯ',
        bodyTemplate: 'ತುರ್ತು: ಯೋಜಿತ ಮಾರ್ಗ ಮುಳುಗಿದೆ. {routeDetourName} ಮೂಲಕ ಕಡ್ಡಾಯ ಪರ್ಯಾಯ ಮಾರ್ಗ ಅನ್ವಯ.',
        smsTemplate: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ ತುರ್ತು: ಮಾರ್ಗ ಜಲಾವೃತವಾಗಿದೆ. {routeDetourName} ಮೂಲಕ ತೆರಳಿ. ನೀರಿನಲ್ಲಿ ವಾಹನ ಚಲಾಯಿಸಬೇಡಿ.',
      },
    },
  },
};

export function formatLocalizedAlert(params: AlertTemplateParams): LocalizedNotificationTemplate {
  const lang = params.language in NOTIFICATION_TEMPLATES ? params.language : 'en';
  const alertTypeKey = params.alertType || params.template || 'LOCATION_ALERT';
  const typeTemplates = NOTIFICATION_TEMPLATES[lang][alertTypeKey] || NOTIFICATION_TEMPLATES[lang].LOCATION_ALERT;
  const template = typeTemplates[params.severity] || typeTemplates.NORMAL;

  const distanceStr = params.distanceKm !== undefined ? params.distanceKm.toFixed(1) : '0.0';
  const destStr = params.destination || 'Destination';
  const eventStr = params.eventName || 'Monitored Basin';
  const detourStr = params.routeDetourName || 'Highland Avenue Elevated Detour';
  const timeDeltaStr = params.travelTimeDeltaMin !== undefined ? String(params.travelTimeDeltaMin) : '3';

  const title = template.title;
  const body = template.bodyTemplate
    .replace(/{distanceKm}/g, distanceStr)
    .replace(/{destination}/g, destStr)
    .replace(/{eventName}/g, eventStr)
    .replace(/{routeDetourName}/g, detourStr)
    .replace(/{travelTimeDeltaMin}/g, timeDeltaStr);

  const smsSummary = template.smsTemplate
    .replace(/{distanceKm}/g, distanceStr)
    .replace(/{destination}/g, destStr)
    .replace(/{eventName}/g, eventStr)
    .replace(/{routeDetourName}/g, detourStr)
    .replace(/{travelTimeDeltaMin}/g, timeDeltaStr);

  return {
    language: lang,
    severity: params.severity,
    alertType: alertTypeKey,
    title,
    body,
    smsSummary,
  };
}

/**
 * Unicode-Aware SMS Character & Segmentation Calculator
 * Calculates standard GSM-7 (160 char base / 153 concatenated) vs
 * UCS-2 Unicode (70 char base / 67 concatenated for Devanagari Hindi and Kannada).
 */
export function calculateSmsSegments(text: string): SmsEncodingAnalysis {
  // Regex to detect characters outside the GSM 7-bit basic and extended character set
  // Non-GSM includes Hindi (\u0900-\u097F), Kannada (\u0C80-\u0CFF), and high Unicode code points
  const gsm7Regex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;

  const isGsm7 = gsm7Regex.test(text);
  const characterCount = Array.from(text).length; // Unicode-aware code point length

  if (isGsm7) {
    const maxCharsPerSegment = 160;
    const concatMax = 153;
    const segmentCount = characterCount <= maxCharsPerSegment
      ? (characterCount === 0 ? 0 : 1)
      : Math.ceil(characterCount / concatMax);

    const remainingInCurrentSegment = characterCount <= maxCharsPerSegment
      ? maxCharsPerSegment - characterCount
      : concatMax - (characterCount % concatMax || concatMax);

    return {
      encoding: 'GSM-7',
      characterCount,
      segmentCount,
      maxCharsPerSegment,
      remainingInCurrentSegment,
    };
  } else {
    const maxCharsPerSegment = 70;
    const concatMax = 67;
    const segmentCount = characterCount <= maxCharsPerSegment
      ? (characterCount === 0 ? 0 : 1)
      : Math.ceil(characterCount / concatMax);

    const remainingInCurrentSegment = characterCount <= maxCharsPerSegment
      ? maxCharsPerSegment - characterCount
      : concatMax - (characterCount % concatMax || concatMax);

    return {
      encoding: 'UCS-2',
      characterCount,
      segmentCount,
      maxCharsPerSegment,
      remainingInCurrentSegment,
    };
  }
}

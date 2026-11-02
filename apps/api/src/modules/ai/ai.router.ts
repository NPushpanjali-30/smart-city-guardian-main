import { Router, Request, Response } from 'express';
import {
  GrokDecisionOutputSchema,
  generateDeterministicFallbackDecision,
  GrokInputContext,
  AiAnalyzeRequestSchema,
  AiDecisionMode,
  LanguageCode,
} from '@smartcity/shared';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { grokDecisionService } from '../../services/ai/GrokDecisionService.js';

export const aiRouter = Router();

/**
 * Advanced Phase 4 AI Decision Support Analysis Endpoint
 * POST /api/v1/ai/analyze
 */
aiRouter.post('/analyze', async (req: Request, res: Response) => {
  try {
    const parseResult = AiAnalyzeRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid AI analysis request parameters',
        errors: parseResult.error.format(),
      });
      return;
    }

    const { mode, language, userLocation, destination, routeContext } = parseResult.data;

    const storedDecision = await grokDecisionService.analyze({
      mode: mode as AiDecisionMode,
      language: language as LanguageCode,
      userLocation,
      destination,
      routeContext,
      userId: (req as any).user?.userId || req.body.userId,
      forceFresh: req.body.forceFresh === true,
    });

    res.status(200).json({
      status: 'ok',
      data: storedDecision,
    });
  } catch (err: unknown) {
    logger.error('Error during AI analysis', { requestId: req.id }, err as Error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to complete AI decision support analysis',
      error: (err as Error).message,
    });
  }
});

/**
 * AI Evacuation Planning & Flood Risk Advisory Generation Endpoint
 * POST /api/v1/ai/evacuation-plan
 */
aiRouter.post('/evacuation-plan', async (req: Request, res: Response) => {
  try {
    const defaultBody = {
      mode: req.body.mode || 'ROUTE_ASSESSMENT',
      language: req.body.language || 'en',
      ...req.body,
    };
    const parseResult = AiAnalyzeRequestSchema.safeParse(defaultBody);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid AI evacuation planning parameters',
        errors: parseResult.error.format(),
      });
      return;
    }

    const { mode, language, userLocation, destination, routeContext } = parseResult.data;

    const storedDecision = await grokDecisionService.analyze({
      mode: mode as AiDecisionMode,
      language: language as LanguageCode,
      userLocation,
      destination,
      routeContext,
      userId: (req as any).user?.userId || req.body.userId,
      forceFresh: req.body.forceFresh === true,
    });

    res.status(200).json({
      status: 'ok',
      planType: 'EMERGENCY_EVACUATION',
      data: storedDecision,
    });
  } catch (err: unknown) {
    logger.error('Error during AI evacuation planning', { requestId: req.id }, err as Error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate AI evacuation plan',
      error: (err as Error).message,
    });
  }
});

/**
 * Retrieve Latest AI Decision
 * GET /api/v1/ai/latest
 */
aiRouter.get('/latest', async (req: Request, res: Response) => {
  try {
    const mode = (req.query.mode as AiDecisionMode) || 'CITY_OVERVIEW';
    const language = (req.query.language as LanguageCode) || 'en';

    let latest = grokDecisionService.getLatestDecision(mode, language);
    if (!latest) {
      latest = await grokDecisionService.analyze({ mode, language });
    }

    res.status(200).json({
      status: 'ok',
      data: latest,
    });
  } catch (err: unknown) {
    logger.error('Error retrieving latest AI decision', { requestId: req.id }, err as Error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve latest AI decision',
      error: (err as Error).message,
    });
  }
});

/**
 * Retrieve Stored AI Decision by ID
 * GET /api/v1/ai/decisions/:id
 */
aiRouter.get('/decisions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const decision = grokDecisionService.getDecisionById(id);

  if (!decision) {
    res.status(404).json({
      status: 'error',
      message: `AI decision with ID ${id} not found`,
    });
    return;
  }

  res.status(200).json({
    status: 'ok',
    data: decision,
  });
});

/**
 * List Recent AI Decisions for Audit & History
 * GET /api/v1/ai/decisions
 */
aiRouter.get('/decisions', (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const decisions = grokDecisionService.getAllDecisions(limit);

  res.status(200).json({
    status: 'ok',
    count: decisions.length,
    data: decisions,
  });
});

/**
 * Legacy / Core AI Decision Support Endpoint
 * POST /api/v1/ai/decide
 */
aiRouter.post('/decide', (req: Request, res: Response) => {
  const context: GrokInputContext = req.body.context || {
    timestamp: new Date().toISOString(),
    location: {
      cityName: 'Metro Bay District',
      coordinates: [40.7128, -74.006],
      monitoredSectors: ['Sector 4 Lowlands', 'Harbor Underpass', 'Highland Ridge'],
    },
    weather: {
      rainfallRateMmh: 42.5,
      rainfall1hMm: 34.2,
      rainfall24hMm: 98.6,
      windSpeedKmh: 45.0,
      severeWeatherAlerts: ['Flash Flood Warning until 2:00 PM'],
    },
    traffic: {
      averageCongestionIndex: 78.0,
      activeIncidentsCount: 3,
      blockedCorridorsCount: 1,
    },
    floodRisk: {
      compositeScore: 78.5,
      severity: 'CRITICAL',
      highRiskBasins: ['Bay Basin Lowlands', 'East River Concourse'],
    },
    roads: [
      { id: 'road-bay-st-001', name: 'Bay Street Boulevard', state: 'BLOCKED', waterDepthCm: 28 },
      { id: 'road-highland-ave-002', name: 'Highland Avenue', state: 'OPEN' },
      { id: 'road-market-st-003', name: 'Market Street', state: 'CAUTION', waterDepthCm: 8 },
    ],
    dataFreshness: {
      weatherAgeMinutes: 4,
      trafficAgeMinutes: 2,
    },
    confidenceScore: 0.95,
  };

  // If live Grok integration is mocked or API key is not a real production key:
  if (config.MOCK_MODE || config.GROK_API_KEY === 'mock-grok-api-key') {
    logger.info('Invoking deterministic decision fallback for AI service', {
      requestId: req.id,
      operation: 'ai.decide',
    });

    const fallbackDecision = generateDeterministicFallbackDecision(
      context,
      'Phase 1 Mock/Fallback Engine'
    );

    // Validate with strict Zod schema
    const validated = GrokDecisionOutputSchema.parse(fallbackDecision);

    res.status(200).json({
      status: 'ok',
      engine: 'deterministic_fallback_v1',
      isFallback: true,
      data: validated,
    });
    return;
  }

  try {
    const fallback = generateDeterministicFallbackDecision(context, 'Live Grok Adapter Pending Phase 2');
    const validated = GrokDecisionOutputSchema.parse(fallback);
    res.status(200).json({
      status: 'ok',
      engine: 'grok_decision_engine',
      isFallback: true,
      data: validated,
    });
  } catch (err) {
    logger.error('Error generating AI decision', { requestId: req.id }, err as Error);
    const fallback = generateDeterministicFallbackDecision(context, 'Critical Exception in AI Engine');
    res.status(200).json({
      status: 'ok',
      engine: 'deterministic_fallback_v1',
      isFallback: true,
      data: fallback,
    });
  }
});

/**
 * Interactive AI Copilot / Conversational Decision Assistant
 * POST /api/v1/ai/copilot
 */
aiRouter.post('/copilot', async (req: Request, res: Response) => {
  try {
    const query = req.body.query || req.body.message || req.body.prompt || 'Give me a city flood and mobility safety briefing.';
    const language = (req.body.language as LanguageCode) || 'en';
    const mode = (req.body.mode as AiDecisionMode) || 'CITY_OVERVIEW';

    // Retrieve or generate latest decision context
    const stored = await grokDecisionService.analyze({
      mode,
      language,
      userLocation: req.body.userLocation,
      destination: req.body.destination,
      userId: (req as any).user?.userId || req.body.userId,
    });

    const d = stored.decision;

    // Construct rich AI copilot conversational response
    const answer = [
      `🛡️ SmartCity Guardian AI Copilot Briefing:`,
      `• City Flood Risk Status: ${d.risk_level} (Confidence: ${Math.round((d.confidence ?? 0.85) * 100)}%)`,
      `• Situation Summary: ${d.situation_summary}`,
      d.roads_to_avoid && d.roads_to_avoid.length > 0 ? `• Roads to Avoid: ${d.roads_to_avoid.join(', ')}` : '',
      d.citizen_actions && d.citizen_actions.length > 0 ? `• Recommended Action: ${d.citizen_actions[0]}` : '',
      d.route_recommendation?.action ? `• Routing Advisory: ${d.route_recommendation.action} - ${d.route_recommendation.reason}` : '',
    ].filter(Boolean).join('\n');

    res.status(200).json({
      success: true,
      query,
      answer,
      response: answer,
      decision: d,
      meta: {
        mode,
        language,
        decisionId: stored.id,
        modelVersion: stored.model_version,
        isFallback: stored.fallback_used,
        generatedAt: stored.created_at,
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    logger.error('Error during AI Copilot interaction', { requestId: req.id }, err as Error);
    res.status(500).json({
      success: false,
      error: {
        code: 'COPILOT_ERROR',
        message: `AI Copilot inquiry failed: ${(err as Error).message}`,
      },
    });
  }
});

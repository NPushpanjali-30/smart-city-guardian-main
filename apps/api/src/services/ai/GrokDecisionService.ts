import crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  CanonicalAIContext,
  AiDecisionMode,
  LanguageCode,
  GrokDecisionOutput,
  StoredAiDecision,
  DomainEventEnvelope,
  SystemEventType,
} from '@smartcity/shared';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { liveStateStore } from '../stateStore.js';
import { grokAIContextBuilder, ContextBuildOptions } from './GrokAIContextBuilder.js';
import { grokResponseValidator } from './GrokResponseValidator.js';
import { grokFallbackService } from './GrokFallbackService.js';
import { mockAiProvider } from '../../providers/ai/mockAiProvider.js';
import { grokProvider } from '../../providers/ai/grokProvider.js';
import { AiProvider } from '../../providers/ai/aiProvider.interface.js';

export interface DecisionAnalysisOptions extends ContextBuildOptions {
  forceFresh?: boolean;
}

export class GrokDecisionService extends EventEmitter {
  private activeProvider: AiProvider;
  private decisionsStore: Map<string, StoredAiDecision> = new Map();
  private decisionOrder: string[] = []; // for LRU/circular retention (max 500)
  private maxStoredDecisions = 500;
  private cacheTtlSeconds = 60; // 60-second context cache

  constructor(provider?: AiProvider) {
    super();
    if (provider) {
      this.activeProvider = provider;
    } else if (config.AI_PROVIDER === 'grok' && !config.MOCK_MODE && grokProvider.isHealthy()) {
      this.activeProvider = grokProvider;
    } else {
      this.activeProvider = mockAiProvider;
    }
  }

  public setProvider(provider: AiProvider): void {
    this.activeProvider = provider;
    logger.info(`GrokDecisionService active provider switched to: ${provider.name}`);
  }

  public getProvider(): AiProvider {
    return this.activeProvider;
  }

  /**
   * Primary entry point to analyze and produce an authoritative, validated AI decision
   */
  public async analyze(options?: DecisionAnalysisOptions): Promise<StoredAiDecision> {
    const totalStartTime = Date.now();
    const mode: AiDecisionMode = options?.mode || 'CITY_OVERVIEW';
    const language: LanguageCode = options?.language || 'en';

    // 1. Build Canonical Context
    const contextStartTime = Date.now();
    const context: CanonicalAIContext = await grokAIContextBuilder.buildContext(options);
    const contextBuildMs = Date.now() - contextStartTime;

    // 2. Compute Context Hash for Caching & Rate Limiting
    const contextHash = this.computeContextHash(context, mode, language);
    const cacheKey = `ai:decision:${contextHash}`;

    // Emit event: AI_ANALYSIS_REQUESTED
    this.emitAiEvent('AI_ANALYSIS_REQUESTED', {
      mode,
      language,
      contextHash,
      provider: this.activeProvider.name,
    });

    // Check Cache unless forced fresh
    if (!options?.forceFresh) {
      const cached = liveStateStore.get<StoredAiDecision>(cacheKey);
      if (cached) {
        logger.debug('GrokDecisionService cache hit for normalized context', { contextHash });
        return cached;
      }
    }

    // 3. Invoke Selected AI Provider with Latency Tracking
    let rawResponse = '';
    let parsedPayload: unknown;
    let grokRequestMs = 0;
    let providerModel = this.activeProvider.name;
    let fallbackUsed = false;
    let fallbackReason: string | undefined;

    const requestStartTime = Date.now();
    try {
      const result = await this.activeProvider.generateDecision(context, mode, language);
      rawResponse = result.rawResponse;
      parsedPayload = result.parsed;
      grokRequestMs = result.latencyMs || Date.now() - requestStartTime;
      providerModel = result.model || this.activeProvider.name;
    } catch (err: unknown) {
      fallbackUsed = true;
      fallbackReason = `Provider invocation failed: ${(err as Error).message}`;
      grokRequestMs = Date.now() - requestStartTime;
      logger.warn('AI Provider failed; activating deterministic fallback', {
        provider: this.activeProvider.name,
        error: fallbackReason,
      });

      this.emitAiEvent('AI_ANALYSIS_FAILED', {
        mode,
        language,
        contextHash,
        error: fallbackReason,
      });
    }

    // 4. Validate Response or Generate Fallback
    const validationStartTime = Date.now();
    let finalDecision: GrokDecisionOutput;
    let validationStatus: 'VALIDATED' | 'VALIDATED_WITH_WARNINGS' | 'REJECTED_FALLBACK' = 'VALIDATED';
    let unverifiedClaims: string[] = [];

    if (!fallbackUsed && parsedPayload) {
      const validationResult = grokResponseValidator.validate(parsedPayload, context);

      if (validationResult.isValid && validationResult.validatedDecision) {
        finalDecision = validationResult.validatedDecision;
        validationStatus = validationResult.validationStatus;
        unverifiedClaims = validationResult.unverifiedClaims;

        if (unverifiedClaims.length > 0) {
          logger.warn('AI response validated with warnings (unverified claims)', {
            unverifiedClaims,
          });
        }
      } else {
        // Schema or business rule rejection
        fallbackUsed = true;
        fallbackReason = `Validation rejected response: ${validationResult.errors.join('; ')}`;
        validationStatus = 'REJECTED_FALLBACK';

        this.emitAiEvent('AI_RESPONSE_REJECTED', {
          mode,
          contextHash,
          errors: validationResult.errors,
        });

        logger.warn('AI response failed validation; generating deterministic fallback', {
          errors: validationResult.errors,
        });

        finalDecision = grokFallbackService.generateFallback(context, fallbackReason, language);
      }
    } else {
      finalDecision = grokFallbackService.generateFallback(
        context,
        fallbackReason || 'Direct fallback requested',
        language
      );
      validationStatus = 'REJECTED_FALLBACK';
    }

    const validationMs = Date.now() - validationStartTime;
    const totalAiLatencyMs = Date.now() - totalStartTime;

    // 5. Construct Stored Record
    const storedRecord: StoredAiDecision = {
      id: crypto.randomUUID(),
      mode,
      context_hash: contextHash,
      model: providerModel,
      model_version: '1.0.0',
      created_at: new Date().toISOString(),
      processing_time_ms: {
        context_build_ms: contextBuildMs,
        grok_request_ms: grokRequestMs,
        validation_ms: validationMs,
        total_ai_latency_ms: totalAiLatencyMs,
      },
      validation_status: validationStatus,
      decision: finalDecision,
      fallback_used: fallbackUsed,
      fallback_reason: fallbackReason,
      unverified_claims: unverifiedClaims,
    };

    // 6. Cache and Persist Decision
    liveStateStore.set(cacheKey, storedRecord, this.cacheTtlSeconds);
    this.persistDecision(storedRecord);

    // 7. Emit Completion Events
    this.emitAiEvent('AI_ANALYSIS_COMPLETED', {
      decisionId: storedRecord.id,
      mode: storedRecord.mode,
      riskLevel: finalDecision.risk_level,
      fallbackUsed,
      latencyMs: totalAiLatencyMs,
    });

    this.emitAiEvent('AI_DECISION_UPDATED', {
      decision: storedRecord,
    });

    return storedRecord;
  }

  /**
   * Retrieves the most recent AI decision for a given mode and language
   */
  public getLatestDecision(
    mode: AiDecisionMode = 'CITY_OVERVIEW',
    language: LanguageCode = 'en'
  ): StoredAiDecision | undefined {
    for (let i = this.decisionOrder.length - 1; i >= 0; i--) {
      const dec = this.decisionsStore.get(this.decisionOrder[i]);
      if (dec && dec.mode === mode && dec.decision.language === language) {
        return dec;
      }
    }
    // Fallback to any latest
    if (this.decisionOrder.length > 0) {
      return this.decisionsStore.get(this.decisionOrder[this.decisionOrder.length - 1]);
    }
    return undefined;
  }

  public getDecisionById(id: string): StoredAiDecision | undefined {
    return this.decisionsStore.get(id);
  }

  public getAllDecisions(limit = 50): StoredAiDecision[] {
    return this.decisionOrder
      .slice(-limit)
      .reverse()
      .map((id) => this.decisionsStore.get(id)!)
      .filter(Boolean);
  }

  private persistDecision(decision: StoredAiDecision): void {
    this.decisionsStore.set(decision.id, decision);
    this.decisionOrder.push(decision.id);

    // Prune if over max capacity
    if (this.decisionOrder.length > this.maxStoredDecisions) {
      const oldestId = this.decisionOrder.shift();
      if (oldestId) {
        this.decisionsStore.delete(oldestId);
      }
    }
  }

  private computeContextHash(
    context: CanonicalAIContext,
    mode: AiDecisionMode,
    language: LanguageCode
  ): string {
    const normalized = {
      mode,
      language,
      score: Math.round(context.flood.currentRisk.score),
      rainfall: Math.round(context.environment.rainfall.value),
      zones: context.flood.zones.map((z) => z.name).sort(),
      blockedRoads: context.roads.affected
        .filter((r) => r.state === 'BLOCKED')
        .map((r) => r.name)
        .sort(),
      routeSegments: context.route?.affectedSegments || [],
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .slice(0, 16);
  }

  private emitAiEvent(eventType: SystemEventType, payload: Record<string, unknown>): void {
    const event: DomainEventEnvelope<Record<string, unknown>> = {
      event_id: crypto.randomUUID(),
      event_type: eventType,
      timestamp: new Date().toISOString(),
      source: 'grok-decision-service',
      correlation_id: crypto.randomUUID(),
      payload,
    };
    this.emit('domain_event', event);
  }
}

export const grokDecisionService = new GrokDecisionService();

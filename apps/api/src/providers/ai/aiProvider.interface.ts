import { CanonicalAIContext, AiDecisionMode, LanguageCode } from '@smartcity/shared';

export interface AiProviderResult {
  rawResponse: string;
  parsed: unknown;
  latencyMs: number;
  model: string;
}

export interface AiProvider {
  readonly name: string;
  generateDecision(
    context: CanonicalAIContext,
    mode: AiDecisionMode,
    language: LanguageCode
  ): Promise<AiProviderResult>;
  isHealthy(): boolean;
}

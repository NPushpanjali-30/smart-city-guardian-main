import { CanonicalAIContext, AiDecisionMode, LanguageCode } from '@smartcity/shared';
import { AiProvider, AiProviderResult } from './aiProvider.interface.js';
import { grokPromptBuilder } from '../../services/ai/GrokPromptBuilder.js';
import { grokClient } from '../../services/ai/GrokClient.js';
import { config } from '../../config/index.js';

export class GrokProvider implements AiProvider {
  public readonly name = 'xai-grok-provider';

  public async generateDecision(
    context: CanonicalAIContext,
    mode: AiDecisionMode,
    language: LanguageCode = 'en'
  ): Promise<AiProviderResult> {
    const promptPayload = grokPromptBuilder.buildPrompt(context, mode, language);
    const clientResponse = await grokClient.complete(promptPayload);

    return {
      rawResponse: clientResponse.rawContent,
      parsed: clientResponse.parsedJson,
      latencyMs: clientResponse.latencyMs,
      model: clientResponse.model,
    };
  }

  public isHealthy(): boolean {
    return Boolean(config.GROK_API_KEY && config.GROK_API_KEY !== 'mock-grok-api-key');
  }
}

export const grokProvider = new GrokProvider();

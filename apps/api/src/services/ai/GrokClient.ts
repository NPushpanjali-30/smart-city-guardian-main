import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { GrokPromptPayload } from './GrokPromptBuilder.js';

export interface GrokClientResponse {
  rawContent: string;
  parsedJson: unknown;
  latencyMs: number;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class GrokClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;
  private maxRetries: number;
  private isEnabled: boolean;

  constructor(options?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
    maxRetries?: number;
    isEnabled?: boolean;
  }) {
    this.apiKey = options?.apiKey || config.GROK_API_KEY;
    this.baseUrl = options?.baseUrl || process.env.GROK_API_BASE_URL || 'https://api.x.ai/v1';
    this.model = options?.model || config.GROK_MODEL || 'grok-2-latest';
    this.timeoutMs = options?.timeoutMs || config.GROK_TIMEOUT_MS || 5000;
    this.maxRetries = options?.maxRetries ?? (config.GROK_MAX_RETRIES ?? 2);
    this.isEnabled = options?.isEnabled ?? config.GROK_ENABLED;
  }

  /**
   * Dispatches a structured prompt payload to xAI chat completions endpoint
   */
  public async complete(prompt: GrokPromptPayload): Promise<GrokClientResponse> {
    if (!this.isEnabled) {
      throw new Error('Grok AI integration is disabled via configuration (GROK_ENABLED=false)');
    }

    if (!this.apiKey || this.apiKey === 'mock-grok-api-key') {
      throw new Error('Valid GROK_API_KEY is not configured for live Grok client invocation');
    }

    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: prompt.systemInstruction },
        { role: 'user', content: prompt.userPrompt },
      ],
      temperature: 0.2, // low temperature for deterministic adherence
      response_format: { type: 'json_object' },
    };

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      const startTime = Date.now();
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        const latencyMs = Date.now() - startTime;

        if (response.status === 429) {
          // Rate limit encountered
          attempt++;
          if (attempt > this.maxRetries) {
            throw new Error(`Grok API 429 Rate Limit exceeded after ${this.maxRetries} retries`);
          }
          const backoff = Math.min(1000 * Math.pow(2, attempt), 4000);
          logger.warn(`Grok API rate limit (429), retrying in ${backoff}ms...`, { attempt });
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error text');
          throw new Error(`Grok API error (HTTP ${response.status}): ${errorText}`);
        }

        const responseData = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          model?: string;
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };

        const rawContent = responseData.choices?.[0]?.message?.content || '';
        const cleaned = this.cleanJsonOutput(rawContent);
        const parsedJson = JSON.parse(cleaned);

        return {
          rawContent,
          parsedJson,
          latencyMs,
          model: responseData.model || this.model,
          usage: responseData.usage
            ? {
                promptTokens: responseData.usage.prompt_tokens,
                completionTokens: responseData.usage.completion_tokens,
                totalTokens: responseData.usage.total_tokens,
              }
            : undefined,
        };
      } catch (err: unknown) {
        lastError = err as Error;
        const isAbort = (err as { name?: string }).name === 'TimeoutError' || (err as { name?: string }).name === 'AbortError';
        logger.warn(`Grok API attempt ${attempt + 1} failed: ${lastError.message}`, {
          isAbort,
          attempt,
        });

        attempt++;
        if (attempt <= this.maxRetries && !isAbort) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        } else {
          break;
        }
      }
    }

    throw lastError || new Error('Grok API invocation failed after retries');
  }

  /**
   * Helper to strip potential markdown fences if present
   */
  public cleanJsonOutput(raw: string): string {
    let text = raw.trim();
    if (text.startsWith('```json')) {
      text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (text.startsWith('```')) {
      text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return text.trim();
  }
}

export const grokClient = new GrokClient();

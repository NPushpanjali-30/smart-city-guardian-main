import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('*'),
  MOCK_MODE: z.string().transform((val) => val === 'true' || val === '1').default('true'),
  DATABASE_URL: z.string().default('postgresql://smartcity:smartcity_secret@localhost:5432/smartcity_db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16).default('smartcity_guardian_phase1_super_secure_jwt_secret_token_key_12345'),
  ADMIN_API_KEY: z.string().default('smartcity_guardian_admin_secret_key_2026'),
  ENFORCE_AUTH: z.string().transform((val) => val === 'true' || val === '1').default('false'),
  GROK_API_KEY: z.string().default('mock-grok-api-key'),
  GROK_MODEL: z.string().default('grok-2-latest'),
  GROK_TIMEOUT_MS: z.coerce.number().default(5000),
  GROK_MAX_RETRIES: z.coerce.number().default(2),
  GROK_ENABLED: z.string().transform((val) => val === 'true' || val === '1').default('true'),
  AI_PROVIDER: z.enum(['grok', 'mock']).default('mock'),
  WEATHER_PROVIDER: z.string().default('mock'),
  TRAFFIC_PROVIDER: z.string().default('mock'),
  MAP_PROVIDER: z.string().default('mock'),
  SMS_PROVIDER: z.string().default('mock'),
  FAST2SMS_API_KEY: z.string().optional(),
  TEXTBEE_API_KEY: z.string().optional(),
  TEXTBEE_DEVICE_ID: z.string().optional(),
  TEXTBEE_TEST_MODE: z.string().transform((val) => val === 'true' || val === '1').default('true'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  ALERT_RADIUS_KM: z.coerce.number().default(10),
  LOCATION_UPDATE_INTERVAL_SECONDS: z.coerce.number().default(60),
  LOCATION_MIN_MOVEMENT_METERS: z.coerce.number().default(250),
  DEFAULT_LANGUAGE: z.enum(['en', 'hi', 'kn']).default('en'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Configuration validation failed:', JSON.stringify(result.error.format(), null, 2));
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Fatal: Invalid production environment configuration');
    }
  }

  cachedConfig = result.success ? result.data : ConfigSchema.parse({});
  return cachedConfig;
}

export const config = getConfig();

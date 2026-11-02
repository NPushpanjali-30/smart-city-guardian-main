/**
 * Sanitizes text, error messages, and payload logs to prevent accidental exposure of
 * third-party API keys, JWT secrets, bearer tokens, or provider credentials.
 */
export function sanitizeSecrets(input: string): string {
  if (!input || typeof input !== 'string') return input;

  return input
    // xAI Grok API Keys
    .replace(/xai-[a-zA-Z0-9_-]{10,}/gi, 'xai-***REDACTED***')
    // Fast2SMS API Keys
    .replace(/(fast2sms|FAST2SMS)[a-zA-Z0-9_\-]{10,}/gi, '$1-***REDACTED***')
    // Twilio Auth Tokens / SIDs
    .replace(/(SK|AC)[a-zA-Z0-9]{32}/gi, '$1***REDACTED***')
    // Authorization: Bearer tokens
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{15,}/gi, 'Bearer ***REDACTED***')
    // Key/Token/Secret/Password in query parameters or URL parameters
    .replace(/((?:key|token|auth|secret|password|api_key|apiKey)=)([^&\s]{6,})/gi, '$1***REDACTED***')
    // JSON credential fields
    .replace(/("?(?:apiKey|authToken|jwtSecret|password|accountSid)"?\s*:\s*)"[^"]+"/gi, '$1"***REDACTED***"');
}

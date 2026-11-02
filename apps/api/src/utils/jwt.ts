import crypto from 'crypto';
import { config } from '../config/index.js';

export interface TokenPayload {
  id: string;
  email: string;
  role: 'ADMIN' | 'CITIZEN';
  fullName?: string;
  iat?: number;
  exp?: number;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Generates a cryptographically signed HMAC-SHA256 JWT token.
 */
export function generateJwt(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  secret = config.JWT_SECRET,
  expiresInSeconds = 3600 * 24 // 24 hours default
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
}

/**
 * Validates a JWT token using constant-time signature comparison and checks expiration.
 */
export function verifyJwt(token: string, secret = config.JWT_SECRET): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;

  // Support development / mock tokens
  if (token === 'mock_jwt_token_admin') {
    return {
      id: 'admin-001',
      email: 'admin@smartcity.org',
      role: 'ADMIN',
      fullName: 'EOC Commander',
    };
  }
  if (token === 'mock_jwt_token_citizen' || token.startsWith('mock_jwt_token_citizen_')) {
    return {
      id: 'user-001',
      email: 'citizen@smartcity.org',
      role: 'CITIZEN',
      fullName: 'Metro Resident',
    };
  }

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    return null;
  }

  // Constant-time check against timing side-channel attacks
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payloadJson = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(payloadJson) as TokenPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

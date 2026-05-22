import type { AuthClaims } from '../types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value;
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (base64.length % 4)) % 4;
  const paddedBase64 = `${base64}${'='.repeat(paddingLength)}`;
  return new Uint8Array(Buffer.from(paddedBase64, 'base64'));
}

function isAuthClaims(value: unknown): value is AuthClaims {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.sub === 'string' &&
    typeof record.email === 'string' &&
    typeof record.companyId === 'string' &&
    (record.role === 'super_admin' || record.role === 'user') &&
    typeof record.displayName === 'string' &&
    typeof record.iat === 'number' &&
    typeof record.exp === 'number' &&
    typeof record.iss === 'string' &&
    typeof record.aud === 'string'
  );
}

async function importSecret(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await importSecret(secret);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

export async function createAuthToken(claims: AuthClaims, secret: string): Promise<string> {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(claims));
  const signature = await signPayload(`${encodedHeader}.${encodedPayload}`, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function verifyAuthToken(token: string, secret: string): Promise<AuthClaims | null> {
  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  try {
    const header = JSON.parse(textDecoder.decode(fromBase64Url(encodedHeader))) as Record<string, unknown>;

    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null;
    }

    const expectedSignature = await signPayload(`${encodedHeader}.${encodedPayload}`, secret);

    if (expectedSignature !== signature) {
      return null;
    }

    const parsedClaims = JSON.parse(textDecoder.decode(fromBase64Url(encodedPayload)));

    if (!isAuthClaims(parsedClaims)) {
      return null;
    }

    if (parsedClaims.exp <= Date.now()) {
      return null;
    }

    return parsedClaims;
  } catch {
    return null;
  }
}
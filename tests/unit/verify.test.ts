import crypto from 'crypto';
import { verifyWebhookSignature } from '../../src/webhook/verify';

describe('verifyWebhookSignature', () => {
  const SECRET = 'test-webhook-secret-minimum-16-chars';
  const BODY = Buffer.from(JSON.stringify({ action: 'opened', number: 42 }));

  function makeSignature(body: Buffer, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return `sha256=${hmac}`;
  }

  it('returns true for a valid signature', () => {
    const sig = makeSignature(BODY, SECRET);
    expect(verifyWebhookSignature(BODY, sig, SECRET)).toBe(true);
  });

  it('returns false when signature is missing', () => {
    expect(verifyWebhookSignature(BODY, undefined, SECRET)).toBe(false);
  });

  it('returns false for a tampered body', () => {
    const sig = makeSignature(BODY, SECRET);
    const tamperedBody = Buffer.from('{"action":"closed","number":42}');
    expect(verifyWebhookSignature(tamperedBody, sig, SECRET)).toBe(false);
  });

  it('returns false for a wrong secret', () => {
    const sig = makeSignature(BODY, 'wrong-secret-minimum-16chars');
    expect(verifyWebhookSignature(BODY, sig, SECRET)).toBe(false);
  });

  it('returns false for malformed header (no sha256= prefix)', () => {
    const hex = crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyWebhookSignature(BODY, hex, SECRET)).toBe(false);
  });

  it('returns false for truncated hex digest', () => {
    const sig = `sha256=abc123`; // too short – different buffer length
    expect(verifyWebhookSignature(BODY, sig, SECRET)).toBe(false);
  });
});

import crypto from 'crypto';

/**
 * Verifies a GitHub webhook signature.
 *
 * WHY timingSafeEqual: a naive string comparison leaks information about
 * how many leading bytes match, enabling timing-based secret recovery.
 * GitHub always sends "sha256=<hex>"; we must strip the prefix before comparing.
 *
 * @returns true if the signature is valid, false otherwise
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  // GitHub format: "sha256=<64-hex-chars>"
  const [algo, receivedHex] = signatureHeader.split('=');
  if (algo !== 'sha256' || !receivedHex) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Both buffers must be same length for timingSafeEqual to work correctly
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(receivedHex, 'hex');

  if (expectedBuf.length !== receivedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

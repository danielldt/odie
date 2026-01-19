import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Derive a 32-byte key from the master key (handles any input format)
 */
function deriveKey(): Buffer {
  const masterKey = config.credentialsMasterKey;
  
  // If it looks like base64 and decodes to 32 bytes, use directly
  if (/^[A-Za-z0-9+/=]+$/.test(masterKey)) {
    try {
      const decoded = Buffer.from(masterKey, "base64");
      if (decoded.length === KEY_LENGTH) {
        return decoded;
      }
    } catch {
      // Fall through to hash-based derivation
    }
  }
  
  // Otherwise, derive a 32-byte key using SHA-256
  return createHash("sha256").update(masterKey).digest();
}

const encryptionKey = deriveKey();

/**
 * Decrypt credentials using AES-256-GCM with the master key
 */
export function decrypt(encryptedWithTag: string, ivHex: string): string {
  const iv = Buffer.from(ivHex, "hex");
  
  const encryptedBuffer = Buffer.from(encryptedWithTag, "base64");
  
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - AUTH_TAG_LENGTH);
  const encrypted = encryptedBuffer.subarray(0, encryptedBuffer.length - AUTH_TAG_LENGTH);
  
  const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString("utf8");
}

/**
 * Generate an idempotency key from inputs
 */
export function generateIdempotencyKey(
  userId: string,
  strategyId: string,
  scheduledTime: Date
): string {
  const roundedTime = new Date(scheduledTime);
  roundedTime.setSeconds(0, 0);
  
  const input = `${userId}:${strategyId}:${roundedTime.toISOString()}`;
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Generate a unique client order ID
 */
export function generateClientOrderId(runId: string, side: string): string {
  return `${runId}-${side}-${Date.now()}`;
}

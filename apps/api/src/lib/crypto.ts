import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt data using AES-256-GCM with the master key
 */
export function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const key = Buffer.from(config.credentialsMasterKey, "base64");
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();
  
  // Append auth tag to encrypted data
  const encryptedWithTag = Buffer.concat([
    Buffer.from(encrypted, "base64"),
    authTag,
  ]).toString("base64");
  
  return {
    encrypted: encryptedWithTag,
    iv: iv.toString("hex"),
  };
}

/**
 * Decrypt data using AES-256-GCM with the master key
 */
export function decrypt(encryptedWithTag: string, ivHex: string): string {
  const key = Buffer.from(config.credentialsMasterKey, "base64");
  const iv = Buffer.from(ivHex, "hex");
  
  const encryptedBuffer = Buffer.from(encryptedWithTag, "base64");
  
  // Extract auth tag from end of encrypted data
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - AUTH_TAG_LENGTH);
  const encrypted = encryptedBuffer.subarray(0, encryptedBuffer.length - AUTH_TAG_LENGTH);
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString("utf8");
}

/**
 * Hash a token for storage (refresh tokens)
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

/**
 * Generate an idempotency key from inputs
 */
export function generateIdempotencyKey(
  userId: string,
  strategyId: string,
  scheduledTime: Date
): string {
  // Round to minute
  const roundedTime = new Date(scheduledTime);
  roundedTime.setSeconds(0, 0);
  
  const input = `${userId}:${strategyId}:${roundedTime.toISOString()}`;
  return createHash("sha256").update(input).digest("hex");
}

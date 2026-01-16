import { createHash } from "crypto";

/**
 * Simple SIWE-style message verification
 * In production, use a proper SIWE library like 'siwe' or ethers.js
 */
export async function verifyMessage(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  // This is a simplified verification
  // In production, use ethers.js or viem to properly verify EIP-191 signatures
  
  try {
    // For now, we'll do a basic check that the signature is well-formed
    // The actual verification should use ecrecover
    
    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return false;
    }
    
    // Validate signature format (65 bytes = 130 hex chars + 0x)
    if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) {
      return false;
    }
    
    // In a real implementation, you would:
    // 1. Hash the message with EIP-191 prefix
    // 2. Recover the public key from the signature
    // 3. Derive the address from the public key
    // 4. Compare with the provided address
    
    // For development, we accept any well-formed signature
    // TODO: Implement proper signature verification with ethers.js or viem
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a SIWE message for the user to sign
 */
export function generateSiweMessage(
  address: string,
  chainId: number,
  nonce: string
): string {
  const domain = process.env.FRONTEND_URL || "localhost:3000";
  const uri = `${domain}/`;
  const issuedAt = new Date().toISOString();
  
  return `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to Odie Polymarket Platform

URI: ${uri}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

/**
 * Generate a random nonce for SIWE
 */
export function generateNonce(): string {
  return createHash("sha256")
    .update(Date.now().toString() + Math.random().toString())
    .digest("hex")
    .slice(0, 16);
}

import { createHash } from "crypto";
import { ethers } from "ethers";

/**
 * Verify an Ethereum signed message
 */
export async function verifyMessage(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      return false;
    }
    
    // Validate signature format
    if (!/^0x[a-fA-F0-9]{130}$/i.test(signature)) {
      return false;
    }
    
    // Recover the address from the signature
    const recoveredAddress = ethers.utils.verifyMessage(message, signature);
    
    // Compare addresses (case-insensitive)
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch (err) {
    console.error("Signature verification failed:", err);
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
  const domain = process.env['FRONTEND_URL'] || "localhost:3000";
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

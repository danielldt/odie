import type { FastifyInstance } from "fastify";
import { polymarketCredentialsSchema } from "@odie/shared/schemas";
import {
  createCredential,
  getActiveCredentialForUser,
  getWalletById,
  revokeCredential,
} from "@odie/db";
import { authenticate, getUserId } from "../lib/auth.js";
import { encrypt } from "../lib/crypto.js";
import { BadRequestError, NotFoundError, ForbiddenError } from "../lib/error-handler.js";

export async function credentialRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // Get current credential status (not the actual credentials)
  app.get("/polymarket", async (request) => {
    const userId = getUserId(request);
    const credential = await getActiveCredentialForUser(userId);

    if (!credential) {
      return { hasCredentials: false };
    }

    return {
      hasCredentials: true,
      credentialId: credential.id,
      walletId: credential.walletId,
      createdAt: credential.createdAt,
    };
  });

  // Store Polymarket credentials (encrypted)
  app.post("/polymarket", async (request, reply) => {
    const userId = getUserId(request);
    const { walletId, apiKey, apiSecret, passphrase } = 
      polymarketCredentialsSchema.parse(request.body);

    // Verify wallet belongs to user
    const wallet = await getWalletById(walletId);
    if (!wallet) {
      throw new NotFoundError("Wallet not found");
    }
    if (wallet.userId !== userId) {
      throw new ForbiddenError("Wallet does not belong to user");
    }

    // Check if user already has credentials
    const existing = await getActiveCredentialForUser(userId);
    if (existing) {
      throw new BadRequestError("User already has active credentials. Revoke existing first.");
    }

    // Encrypt credentials
    const credentialsPayload = JSON.stringify({ apiKey, apiSecret, passphrase });
    const { encrypted, iv } = encrypt(credentialsPayload);

    // Store encrypted credentials
    const credential = await createCredential({
      userId,
      walletId,
      provider: "polymarket_clob",
      encryptedBlob: encrypted,
      iv,
      keyVersion: 1,
    });

    if (!credential) {
      throw new BadRequestError("Failed to create credential");
    }

    return reply.status(201).send({
      credentialId: credential.id,
      walletId: credential.walletId,
      createdAt: credential.createdAt,
    });
  });

  // Revoke credentials
  app.delete("/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const credential = await getActiveCredentialForUser(userId);
    
    if (!credential || credential.id !== id) {
      throw new NotFoundError("Credential not found");
    }

    await revokeCredential(id);

    return { success: true };
  });
}

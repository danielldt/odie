import type { FastifyInstance } from "fastify";
import { walletVerifySchema } from "@odie/shared/schemas";
import { createWallet, getUserWallets, getWalletByAddress } from "@odie/db";
import { authenticate, getUserId } from "../lib/auth.js";
import { BadRequestError, ConflictError } from "../lib/error-handler.js";
import { verifyMessage } from "../lib/siwe.js";

export async function walletRoutes(app: FastifyInstance) {
  // Add auth hook to all routes
  app.addHook("onRequest", authenticate);

  // List user wallets
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const wallets = await getUserWallets(userId);
    
    return { wallets };
  });

  // Verify and add wallet (SIWE-style)
  app.post("/verify", async (request, reply) => {
    const userId = getUserId(request);
    const { address, chainId, message, signature } = walletVerifySchema.parse(request.body);

    // Verify signature
    const isValid = await verifyMessage(address, message, signature);
    if (!isValid) {
      throw new BadRequestError("Invalid signature");
    }

    // Check if wallet already exists
    const existing = await getWalletByAddress(address);
    if (existing) {
      if (existing.userId === userId) {
        return { wallet: existing };
      }
      throw new ConflictError("Wallet already associated with another account");
    }

    // Create wallet
    const wallet = await createWallet({
      userId,
      address: address.toLowerCase(),
      chainId,
    });

    return reply.status(201).send({ wallet });
  });
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { credentialsApi, walletsApi } from "../lib/api";
import { connectWallet, connectWithPrivateKey, derivePolymarketCredentials, shortenAddress } from "../lib/wallet";
import type { ethers } from "ethers";

export function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: credentialsData, isLoading: credentialsLoading } = useQuery({
    queryKey: ["credentials"],
    queryFn: credentialsApi.status,
  });

  const { data: walletsData } = useQuery({
    queryKey: ["wallets"],
    queryFn: walletsApi.list,
  });

  const wallets = walletsData?.wallets ?? [];
  const hasCredentials = credentialsData?.hasCredentials ?? false;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-display font-bold mb-2">Settings</h1>
        <p className="text-surface-400">Connect your wallet and set up Polymarket API credentials</p>
      </div>

      <WalletSection wallets={wallets} />
      
      <CredentialsSection
        hasCredentials={hasCredentials}
        credentialId={credentialsData?.credentialId}
        wallets={wallets}
        isLoading={credentialsLoading}
      />
    </div>
  );
}

function WalletSection({ wallets }: { wallets: any[] }) {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const verifyMutation = useMutation({
    mutationFn: walletsApi.verify,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleConnectWallet = async () => {
    setError("");
    setConnecting(true);
    
    try {
      const wallet = await connectWallet();
      
      if (!wallet.address) {
        throw new Error("Failed to get wallet address");
      }

      // Create a simple signature to verify ownership
      const message = `Sign this message to connect your wallet to Odie Trading Platform.\n\nWallet: ${wallet.address}\nTimestamp: ${Date.now()}`;
      const signature = await wallet.signer!.signMessage(message);

      // Send to backend
      verifyMutation.mutate({
        address: wallet.address,
        chainId: wallet.chainId!,
        message,
        signature,
      });
    } catch (err: any) {
      setError(err.message || "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-lg font-display font-semibold mb-4">Connected Wallets</h2>

      {wallets.length === 0 ? (
        <p className="text-surface-500 mb-4">No wallets connected. Connect your Polygon wallet to get started.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {wallets.map((wallet: any) => (
            <div
              key={wallet.id}
              className="flex items-center justify-between p-3 bg-surface-800 rounded-lg"
            >
              <div>
                <p className="font-mono text-sm">{wallet.address}</p>
                <p className="text-surface-500 text-xs">Polygon (Chain ID: {wallet.chainId})</p>
              </div>
              <span className="text-green-400 text-sm">✓ Connected</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm mb-3">{error}</p>
      )}

      <button
        onClick={handleConnectWallet}
        disabled={connecting || verifyMutation.isPending}
        className="btn-primary"
      >
        {connecting ? "Connecting..." : verifyMutation.isPending ? "Verifying..." : "+ Connect MetaMask"}
      </button>
      
      <p className="text-surface-500 text-xs mt-2">
        Make sure MetaMask is installed and set to Polygon network
      </p>
    </div>
  );
}

function CredentialsSection({
  hasCredentials,
  credentialId,
  wallets,
  isLoading,
}: {
  hasCredentials: boolean;
  credentialId?: string;
  wallets: any[];
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"auto" | "privatekey" | "manual">("auto");
  const [privateKey, setPrivateKey] = useState("");
  
  // Manual entry state
  const [walletId, setWalletId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");

  const storeMutation = useMutation({
    mutationFn: credentialsApi.store,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      setApiKey("");
      setApiSecret("");
      setPassphrase("");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => credentialsApi.revoke(credentialId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
    },
  });

  const handleDeriveCredentials = async () => {
    setError("");
    setDeriving(true);

    try {
      // Connect wallet first
      const wallet = await connectWallet();
      
      if (!wallet.signer) {
        throw new Error("Failed to get wallet signer");
      }

      // Find or create wallet in our system
      let targetWallet = wallets.find(
        (w: any) => w.address.toLowerCase() === wallet.address?.toLowerCase()
      );

      if (!targetWallet) {
        // Verify wallet first
        const message = `Sign this message to connect your wallet to Odie Trading Platform.\n\nWallet: ${wallet.address}\nTimestamp: ${Date.now()}`;
        const signature = await wallet.signer.signMessage(message);
        
        const result = await walletsApi.verify({
          address: wallet.address!,
          chainId: wallet.chainId!,
          message,
          signature,
        });
        targetWallet = result.wallet;
        queryClient.invalidateQueries({ queryKey: ["wallets"] });
      }

      // Now derive Polymarket credentials
      console.log("Deriving Polymarket API credentials...");
      const creds = await derivePolymarketCredentials(wallet.signer);
      
      console.log("Credentials derived, storing...");
      
      // Store credentials
      await storeMutation.mutateAsync({
        walletId: (targetWallet as any).id,
        apiKey: creds.apiKey,
        apiSecret: creds.secret,
        passphrase: creds.passphrase,
      });

      console.log("Credentials stored successfully!");
    } catch (err: any) {
      console.error("Error deriving credentials:", err);
      setError(err.message || "Failed to derive credentials");
    } finally {
      setDeriving(false);
    }
  };

  const handleDeriveFromPrivateKey = async () => {
    setError("");
    setDeriving(true);

    try {
      if (!privateKey) {
        throw new Error("Please enter your private key");
      }

      // Connect with private key
      const wallet = await connectWithPrivateKey(privateKey);
      
      if (!wallet.signer || !wallet.address) {
        throw new Error("Failed to create wallet from private key");
      }

      // Find or create wallet in our system
      let targetWallet = wallets.find(
        (w: any) => w.address.toLowerCase() === wallet.address?.toLowerCase()
      );

      if (!targetWallet) {
        // Create a signature to verify wallet
        const message = `Sign this message to connect your wallet to Odie Trading Platform.\n\nWallet: ${wallet.address}\nTimestamp: ${Date.now()}`;
        const signature = await wallet.signer.signMessage(message);
        
        const result = await walletsApi.verify({
          address: wallet.address,
          chainId: wallet.chainId!,
          message,
          signature,
        });
        targetWallet = result.wallet;
        queryClient.invalidateQueries({ queryKey: ["wallets"] });
      }

      // Derive Polymarket credentials
      console.log("Deriving Polymarket API credentials from private key...");
      const creds = await derivePolymarketCredentials(wallet.signer);
      
      console.log("Credentials derived, storing...");
      
      // Store credentials
      await storeMutation.mutateAsync({
        walletId: (targetWallet as any).id,
        apiKey: creds.apiKey,
        apiSecret: creds.secret,
        passphrase: creds.passphrase,
      });

      // Clear private key from memory
      setPrivateKey("");
      console.log("Credentials stored successfully!");
    } catch (err: any) {
      console.error("Error deriving credentials:", err);
      setError(err.message || "Failed to derive credentials");
    } finally {
      setDeriving(false);
    }
  };

  const handleManualSave = () => {
    if (!walletId || !apiKey || !apiSecret || !passphrase) {
      setError("All fields are required");
      return;
    }
    storeMutation.mutate({ walletId, apiKey, apiSecret, passphrase });
  };

  if (isLoading) {
    return (
      <div className="card">
        <h2 className="text-lg font-display font-semibold mb-4">Polymarket API Credentials</h2>
        <p className="text-surface-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-lg font-display font-semibold mb-4">Polymarket API Credentials</h2>

      {hasCredentials ? (
        <div>
          <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg mb-4">
            <div>
              <p className="text-green-400 font-medium">✓ Credentials configured</p>
              <p className="text-surface-500 text-sm">Your API credentials are securely stored and ready for trading</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (confirm("Revoke your API credentials? You'll need to add them again to trade.")) {
                revokeMutation.mutate();
              }
            }}
            disabled={revokeMutation.isPending}
            className="btn-danger text-sm"
          >
            Revoke Credentials
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Mode selector */}
          <div className="flex gap-2 p-1 bg-surface-800 rounded-lg">
            <button
              onClick={() => setMode("auto")}
              className={`flex-1 py-2 px-3 rounded text-sm font-medium transition ${
                mode === "auto" ? "bg-primary-600 text-white" : "text-surface-400 hover:text-white"
              }`}
            >
              🦊 MetaMask
            </button>
            <button
              onClick={() => setMode("privatekey")}
              className={`flex-1 py-2 px-3 rounded text-sm font-medium transition ${
                mode === "privatekey" ? "bg-primary-600 text-white" : "text-surface-400 hover:text-white"
              }`}
            >
              🔑 Private Key
            </button>
            <button
              onClick={() => setMode("manual")}
              className={`flex-1 py-2 px-3 rounded text-sm font-medium transition ${
                mode === "manual" ? "bg-primary-600 text-white" : "text-surface-400 hover:text-white"
              }`}
            >
              ✏️ Manual
            </button>
          </div>

          {mode === "auto" && (
            <>
              <p className="text-surface-400 text-sm">
                Connect MetaMask and sign a message to derive your Polymarket API credentials.
                Best for users with MetaMask or other browser wallets.
              </p>

              <button
                onClick={handleDeriveCredentials}
                disabled={deriving || storeMutation.isPending}
                className="btn-primary w-full"
              >
                {deriving ? "Check MetaMask for signature request..." : 
                 storeMutation.isPending ? "Storing..." : 
                 "🦊 Connect MetaMask & Derive Credentials"}
              </button>
            </>
          )}

          {mode === "privatekey" && (
            <>
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-yellow-400 text-sm font-medium">⚠️ For Polymarket.com users</p>
                <p className="text-surface-400 text-xs mt-1">
                  If you created your account on Polymarket.com (email/Google login), 
                  you can export your private key from{" "}
                  <a 
                    href="https://polymarket.com/settings" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary-400 underline"
                  >
                    polymarket.com/settings
                  </a>
                </p>
              </div>

              <div>
                <label className="label">Private Key</label>
                <input
                  type="password"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="input font-mono text-sm"
                  placeholder="0x... or paste without 0x"
                />
                <p className="text-surface-500 text-xs mt-1">
                  Your private key is used locally to derive credentials and is never sent to our servers.
                </p>
              </div>

              <button
                onClick={handleDeriveFromPrivateKey}
                disabled={deriving || storeMutation.isPending || !privateKey}
                className="btn-primary w-full"
              >
                {deriving ? "Deriving credentials..." : 
                 storeMutation.isPending ? "Storing..." : 
                 "🔑 Derive Credentials from Private Key"}
              </button>
            </>
          )}

          {mode === "manual" && (
            <>
              <p className="text-surface-400 text-sm">
                Enter your Polymarket CLOB API credentials manually if you already have them.
              </p>

              {wallets.length === 0 ? (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-yellow-400 text-sm">Connect a wallet first using MetaMask or Private Key mode</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="label">Wallet</label>
                    <select
                      value={walletId}
                      onChange={(e) => setWalletId(e.target.value)}
                      className="input"
                      required
                    >
                      <option value="">Select wallet...</option>
                      {wallets.map((w: any) => (
                        <option key={w.id} value={w.id}>
                          {shortenAddress(w.address)} (Polygon)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">API Key</label>
                    <input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="input font-mono text-sm"
                      placeholder="550e8400-e29b-41d4-a716-446655440000"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">API Secret</label>
                    <input
                      type="password"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      className="input font-mono text-sm"
                      placeholder="base64EncodedSecretString"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Passphrase</label>
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      className="input font-mono text-sm"
                      placeholder="randomPassphraseString"
                      required
                    />
                  </div>

                  <button
                    onClick={handleManualSave}
                    disabled={storeMutation.isPending}
                    className="btn-primary w-full"
                  >
                    {storeMutation.isPending ? "Saving..." : "Save Credentials"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

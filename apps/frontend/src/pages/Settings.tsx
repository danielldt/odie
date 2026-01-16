import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { credentialsApi, walletsApi } from "../lib/api";

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
        <p className="text-surface-400">Manage your wallet and API credentials</p>
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
  const [showConnect, setShowConnect] = useState(false);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");

  const verifyMutation = useMutation({
    mutationFn: walletsApi.verify,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setShowConnect(false);
      setAddress("");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleConnect = async () => {
    setError("");
    
    // In production, use WalletConnect/MetaMask
    // For now, just verify address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setError("Invalid Ethereum address");
      return;
    }

    // Simulated signature (in production, request from wallet)
    const message = "Sign in to Odie Polymarket Platform";
    const signature = "0x" + "0".repeat(130); // Placeholder

    verifyMutation.mutate({
      address,
      chainId: 137,
      message,
      signature,
    });
  };

  return (
    <div className="card">
      <h2 className="text-lg font-display font-semibold mb-4">Connected Wallets</h2>

      {wallets.length === 0 ? (
        <p className="text-surface-500 mb-4">No wallets connected</p>
      ) : (
        <div className="space-y-2 mb-4">
          {wallets.map((wallet: any) => (
            <div
              key={wallet.id}
              className="flex items-center justify-between p-3 bg-surface-800 rounded-lg"
            >
              <div>
                <p className="font-mono text-sm">{wallet.address}</p>
                <p className="text-surface-500 text-xs">Chain ID: {wallet.chainId}</p>
              </div>
              <span className="text-green-400 text-sm">Connected</span>
            </div>
          ))}
        </div>
      )}

      {showConnect ? (
        <div className="space-y-3">
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className="input"
          />
          <div className="flex gap-2">
            <button
              onClick={handleConnect}
              disabled={verifyMutation.isPending}
              className="btn-primary"
            >
              {verifyMutation.isPending ? "Connecting..." : "Connect"}
            </button>
            <button
              onClick={() => setShowConnect(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowConnect(true)} className="btn-secondary">
          + Connect Wallet
        </button>
      )}
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
  const [showForm, setShowForm] = useState(false);
  const [walletId, setWalletId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");

  const storeMutation = useMutation({
    mutationFn: credentialsApi.store,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      setShowForm(false);
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
              <p className="text-green-400 font-medium">Credentials configured</p>
              <p className="text-surface-500 text-sm">Your API credentials are securely stored</p>
            </div>
            <span className="text-green-400">✓</span>
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
      ) : showForm ? (
        <div className="space-y-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          <p className="text-surface-400 text-sm">
            Enter your Polymarket CLOB API credentials. These are derived from your wallet
            using the official CLOB client.
          </p>

          {wallets.length === 0 ? (
            <p className="text-yellow-400 text-sm">Connect a wallet first to store credentials.</p>
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
                      {w.address}
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
                  className="input font-mono"
                  required
                />
              </div>

              <div>
                <label className="label">API Secret</label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="input font-mono"
                  required
                />
              </div>

              <div>
                <label className="label">Passphrase</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="input font-mono"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!walletId || !apiKey || !apiSecret || !passphrase) {
                      setError("All fields are required");
                      return;
                    }
                    storeMutation.mutate({ walletId, apiKey, apiSecret, passphrase });
                  }}
                  disabled={storeMutation.isPending}
                  className="btn-primary"
                >
                  {storeMutation.isPending ? "Saving..." : "Save Credentials"}
                </button>
                <button onClick={() => setShowForm(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div>
          <p className="text-surface-400 text-sm mb-4">
            Configure your Polymarket API credentials to enable trading.
          </p>
          <button
            onClick={() => setShowForm(true)}
            disabled={wallets.length === 0}
            className="btn-primary"
          >
            + Add Credentials
          </button>
          {wallets.length === 0 && (
            <p className="text-yellow-400 text-sm mt-2">Connect a wallet first</p>
          )}
        </div>
      )}
    </div>
  );
}

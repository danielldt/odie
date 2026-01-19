import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export interface WalletState {
  address: string | null;
  chainId: number | null;
  signer: ethers.Signer | null;
  provider: ethers.providers.Web3Provider | null;
}

// Connect via MetaMask
export async function connectWallet(): Promise<WalletState> {
  if (!window.ethereum) {
    throw new Error("MetaMask or another Web3 wallet is required");
  }

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  
  // Request account access
  await provider.send("eth_requestAccounts", []);
  
  const signer = provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();
  
  // Check if on Polygon
  if (network.chainId !== 137) {
    // Try to switch to Polygon
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x89" }], // 137 in hex
      });
    } catch (switchError: any) {
      // If Polygon is not added, add it
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x89",
            chainName: "Polygon Mainnet",
            nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
            rpcUrls: ["https://polygon-rpc.com"],
            blockExplorerUrls: ["https://polygonscan.com"],
          }],
        });
      } else {
        throw switchError;
      }
    }
  }

  return {
    address,
    chainId: 137,
    signer,
    provider,
  };
}

// Connect via private key (for Polymarket.com exported keys)
export async function connectWithPrivateKey(privateKey: string): Promise<WalletState> {
  // Ensure private key has 0x prefix
  const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  
  // Validate private key format
  if (!/^0x[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error("Invalid private key format. Must be 64 hex characters.");
  }
  
  // Create a provider for Polygon
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-rpc.com", 137);
  
  // Create wallet from private key
  const wallet = new ethers.Wallet(key, provider);
  const address = await wallet.getAddress();
  
  return {
    address,
    chainId: 137,
    signer: wallet,
    provider: null,
  };
}

const POLYMARKET_CLOB_URL = "https://clob.polymarket.com";

// Build L1 authentication headers for Polymarket API (EIP-712 signing)
async function buildPolymarketAuthHeaders(signer: ethers.Signer): Promise<Record<string, string>> {
  const address = await signer.getAddress();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = 0;

  // EIP-712 domain for Polymarket CLOB authentication
  const domain = {
    name: "ClobAuthDomain",
    version: "1",
    chainId: 137,
  };

  const types = {
    ClobAuth: [
      { name: "address", type: "address" },
      { name: "timestamp", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "message", type: "string" },
    ],
  };

  const message = {
    address,
    timestamp,
    nonce,
    message: "This message attests that I control the given wallet",
  };

  // Sign using EIP-712 typed data
  const signature = await (signer as any)._signTypedData(domain, types, message);

  return {
    "POLY_ADDRESS": address,
    "POLY_SIGNATURE": signature,
    "POLY_TIMESTAMP": timestamp,
    "POLY_NONCE": nonce.toString(),
  };
}

export async function derivePolymarketCredentials(signer: ethers.Signer): Promise<{
  apiKey: string;
  secret: string;
  passphrase: string;
}> {
  // Build authentication headers
  const authHeaders = await buildPolymarketAuthHeaders(signer);

  // Try to derive existing API key first
  console.log("Attempting to derive existing API key...");
  try {
    const deriveResponse = await fetch(`${POLYMARKET_CLOB_URL}/auth/derive-api-key`, {
      method: "GET",
      headers: authHeaders,
    });

    if (deriveResponse.ok) {
      const data = await deriveResponse.json();
      console.log("Derive response:", data);
      if (data.apiKey) {
        return {
          apiKey: data.apiKey,
          secret: data.secret,
          passphrase: data.passphrase,
        };
      }
    } else {
      console.log("Derive failed with status:", deriveResponse.status);
      const errorText = await deriveResponse.text();
      console.log("Derive error:", errorText);
    }
  } catch (err) {
    console.log("Derive request failed:", err);
  }

  // If no existing key, create a new one
  console.log("Creating new API key...");
  const createResponse = await fetch(`${POLYMARKET_CLOB_URL}/auth/api-key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error("Create API key failed:", createResponse.status, error);
    throw new Error(`Failed to create API key: ${error}`);
  }

  const data = await createResponse.json();
  console.log("Create response:", data);
  
  if (!data.apiKey || !data.secret || !data.passphrase) {
    throw new Error("Polymarket returned incomplete credentials. Please try again.");
  }
  
  return {
    apiKey: data.apiKey,
    secret: data.secret,
    passphrase: data.passphrase,
  };
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

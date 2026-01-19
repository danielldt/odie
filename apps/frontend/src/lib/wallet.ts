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

export async function derivePolymarketCredentials(signer: ethers.Signer): Promise<{
  apiKey: string;
  secret: string;
  passphrase: string;
}> {
  // Dynamically import the CLOB client (it's a heavy library)
  const { ClobClient } = await import("@polymarket/clob-client");
  
  const client = new ClobClient(
    "https://clob.polymarket.com",
    137, // Polygon
    signer as any
  );
  
  // This will prompt the user to sign a message with their wallet
  const creds = await client.createOrDeriveApiKey();
  
  // The API returns different property names depending on version
  // Handle both cases
  const result = creds as any;
  
  return {
    apiKey: result.apiKey || result.key || result.api_key,
    secret: result.secret || result.apiSecret || result.api_secret,
    passphrase: result.passphrase || result.apiPassphrase || result.api_passphrase,
  };
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

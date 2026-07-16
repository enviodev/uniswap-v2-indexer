// Multichain RPC Configuration
// Centralized configuration for all supported chains

export interface ChainRpcConfig {
  chainId: number;
  name: string;
  network: string;
  nativeCurrency: {
    decimals: number;
    name: string;
    symbol: string;
  };
  rpcUrl: string | undefined;
  blockExplorer?: string;
}

// Environment variable mapping for RPC URLs
const RPC_URLS = {
  1: process.env.ENVIO_CHAIN_1_RPC_URL,
  137: process.env.ENVIO_CHAIN_137_RPC_URL,
  56: process.env.ENVIO_CHAIN_56_RPC_URL,
  8453: process.env.ENVIO_CHAIN_8453_RPC_URL,
  42161: process.env.ENVIO_CHAIN_42161_RPC_URL,
  43114: process.env.ENVIO_CHAIN_43114_RPC_URL,
  10: process.env.ENVIO_CHAIN_10_RPC_URL,
  10143: process.env.ENVIO_CHAIN_10143_RPC_URL,
} as const;

// Chain configurations
export const CHAIN_CONFIGS: Record<number, ChainRpcConfig> = {
  1: {
    chainId: 1,
    name: 'Ethereum',
    network: 'mainnet',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    rpcUrl: RPC_URLS[1],
    blockExplorer: 'https://etherscan.io',
  },
  137: {
    chainId: 137,
    name: 'Polygon',
    network: 'matic',
    nativeCurrency: {
      decimals: 18,
      name: 'MATIC',
      symbol: 'MATIC',
    },
    rpcUrl: RPC_URLS[137],
    blockExplorer: 'https://polygonscan.com',
  },
  56: {
    chainId: 56,
    name: 'BNB Smart Chain',
    network: 'bsc',
    nativeCurrency: {
      decimals: 18,
      name: 'BNB',
      symbol: 'BNB',
    },
    rpcUrl: RPC_URLS[56],
    blockExplorer: 'https://bscscan.com',
  },
  8453: {
    chainId: 8453,
    name: 'Base',
    network: 'base',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    rpcUrl: RPC_URLS[8453],
    blockExplorer: 'https://basescan.org',
  },
  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    network: 'arbitrum',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    rpcUrl: RPC_URLS[42161],
    blockExplorer: 'https://arbiscan.io',
  },
  43114: {
    chainId: 43114,
    name: 'Avalanche',
    network: 'avalanche',
    nativeCurrency: {
      decimals: 18,
      name: 'AVAX',
      symbol: 'AVAX',
    },
    rpcUrl: RPC_URLS[43114],
    blockExplorer: 'https://snowtrace.io',
  },
  10: {
    chainId: 10,
    name: 'Optimism',
    network: 'optimism',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    rpcUrl: RPC_URLS[10],
    blockExplorer: 'https://optimistic.etherscan.io',
  },
  10143: {
    chainId: 10143,
    name: 'Monad Testnet',
    network: 'monad-testnet',
    nativeCurrency: {
      decimals: 18,
      name: 'MON',
      symbol: 'NATIVE',
    },
    rpcUrl: RPC_URLS[10143],
  },
};

// Helper function to get chain config by chain ID
export function getChainConfig(chainId: number): ChainRpcConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  
  // Validate that RPC URL is provided
  if (!config.rpcUrl) {
    throw new Error(`RPC URL not configured for chain ID ${chainId}. Please set ENVIO_CHAIN_${chainId}_RPC_URL in your .env file.`);
  }
  
  return config;
}

// Helper function to check if chain is supported
export function isChainSupported(chainId: number): boolean {
  return chainId in CHAIN_CONFIGS;
}

// Get all supported chain IDs
export function getSupportedChainIds(): number[] {
  return Object.keys(CHAIN_CONFIGS).map(Number);
}

// Export RPC URLs for direct access if needed
export { RPC_URLS };

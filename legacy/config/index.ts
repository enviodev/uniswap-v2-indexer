// Chain Configuration Index
// Export chain configuration mapping

// Chain ID to configuration mapping
export const CHAIN_CONFIGS = {
  1: 'ethereum',
  137: 'matic',
  56: 'bsc',
  8453: 'base',
  10143: 'monad-testnet',
} as const

export type SupportedChainId = keyof typeof CHAIN_CONFIGS

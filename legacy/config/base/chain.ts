// Base Chain Configuration
// Reference: v2-subgraph-main/config/base/chain.ts

export const FACTORY_ADDRESS = '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6'

export const REFERENCE_TOKEN = '0x4200000000000000000000000000000000000006' // WETH
export const STABLE_TOKEN_PAIRS = [] // Add actual stable token pairs when available

// token where amounts should contribute to tracked volume and liquidity
export const WHITELIST: string[] = [
  '0x4200000000000000000000000000000000000006', // WETH
  // TODO: Add more whitelist tokens as they become available
]

export const STABLECOINS = [
  // TODO: Add actual stablecoins for Base
]

// minimum liquidity required to count towards tracked volume for pairs with small # of LPs
export const MINIMUM_USD_THRESHOLD_NEW_PAIRS = '10000'

// minimum liquidity for price to get tracked
export const MINIMUM_LIQUIDITY_THRESHOLD_ETH = '1'

export interface TokenDefinition {
  address: string
  symbol: string
  name: string
  decimals: number
}

export const STATIC_TOKEN_DEFINITIONS: TokenDefinition[] = []

export const SKIP_TOTAL_SUPPLY: string[] = []

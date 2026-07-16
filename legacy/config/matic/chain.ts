// Polygon (Matic) Chain Configuration
// Reference: v2-subgraph-main/config/matic/chain.ts

export const FACTORY_ADDRESS = '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C'

export const REFERENCE_TOKEN = '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270' // WMATIC
export const STABLE_TOKEN_PAIRS = ['0x1f0c5400a3c7e357cc7c9a3d2f7fe6ddf629d868'] // USDC/MATIC

// token where amounts should contribute to tracked volume and liquidity
export const WHITELIST: string[] = [
  '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', // WMATIC
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', // USDC
]

export const STABLECOINS = [
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', // USDC
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

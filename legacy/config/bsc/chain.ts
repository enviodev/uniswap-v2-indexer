// BSC (Binance Smart Chain) Configuration
// Reference: v2-subgraph-main/config/bsc/chain.ts

export const FACTORY_ADDRESS = '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6'

export const REFERENCE_TOKEN = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c' // WBNB
export const STABLE_TOKEN_PAIRS = ['0x8a1ed8e124fdfbd534bf48baf732e26db9cc0cf4'] // USDC/BNB

// token where amounts should contribute to tracked volume and liquidity
export const WHITELIST: string[] = [
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WBNB
  '0x55d398326f99059ff775485246999027b3197955', // BUSD
]

export const STABLECOINS = [
  '0x55d398326f99059ff775485246999027b3197955', // BUSD
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
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

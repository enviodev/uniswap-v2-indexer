// Monad Testnet Chain Configuration (Network ID: 10143)
// Updated with real token addresses from Monad testnet

export const FACTORY_ADDRESS = '0xe26dd94f67Ca3615fcaF6062750147F37Df84F7a'

// WETH is the reference token for pricing calculations
export const REFERENCE_TOKEN = '0xB5a30b0FDc5EA94A52fDc42e3E9760Cb8449Fb37' // WETH

// Stable token pairs for USD pricing (USDC/WETH)
export const STABLE_TOKEN_PAIRS = [
  '0x31b53a60C87Dd6A4787996CAef388D4eb50F78A0', // USDC/WETH pair
  '0x8E69c89b81cFB3AA6d366cd5f8d8bE8A938669CE', // USDT/WETH pair
]

// token where amounts should contribute to tracked volume and liquidity
export const WHITELIST: string[] = [
  '0xB5a30b0FDc5EA94A52fDc42e3E9760Cb8449Fb37', // WETH
  '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701', // WMON (wrapped MON)
  '0xf817257fed379853cDe0fa4F97AB987181B1E5Ea', // USDC
  '0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D', // USDT
]

export const STABLECOINS = [
  '0xf817257fed379853cDe0fa4F97AB987181B1E5Ea', // USDC
  '0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D', // USDT
]

// minimum liquidity required to count towards tracked volume for pairs with small # of LPs
// Lower threshold for testnet
export const MINIMUM_USD_THRESHOLD_NEW_PAIRS = '1000'

// minimum liquidity for price to get tracked
// Lower threshold for testnet
export const MINIMUM_LIQUIDITY_THRESHOLD_ETH = '0.1'

export interface TokenDefinition {
  address: string
  symbol: string
  name: string
  decimals: number
}

export const STATIC_TOKEN_DEFINITIONS: TokenDefinition[] = []

export const SKIP_TOTAL_SUPPLY: string[] = []

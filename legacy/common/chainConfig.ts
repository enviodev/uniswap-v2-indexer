// Chain Configuration Loader
// Dynamically loads chain-specific configurations based on chainId

import * as ethereumConfig from '../../config/ethereum/chain'
import * as maticConfig from '../../config/matic/chain'
import * as bscConfig from '../../config/bsc/chain'
import * as baseConfig from '../../config/base/chain'
import * as monadTestnetConfig from '../../config/10143/chain'

export interface ChainConfig {
  FACTORY_ADDRESS: string
  REFERENCE_TOKEN: string
  STABLE_TOKEN_PAIRS: string[]
  WHITELIST: string[]
  STABLECOINS: string[]
  MINIMUM_USD_THRESHOLD_NEW_PAIRS: string
  MINIMUM_LIQUIDITY_THRESHOLD_ETH: string
}

const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  1: ethereumConfig,
  137: maticConfig,
  56: bscConfig,
  8453: baseConfig,
  10143: monadTestnetConfig,
}

/**
 * Get chain-specific configuration
 * @param chainId - The chain ID
 * @returns Chain configuration or undefined if not supported
 */
export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAIN_CONFIGS[chainId]
}

/**
 * Get factory address for a specific chain
 * @param chainId - The chain ID
 * @returns Factory address or undefined if chain not supported
 */
export function getFactoryAddress(chainId: number): string | undefined {
  return CHAIN_CONFIGS[chainId]?.FACTORY_ADDRESS
}

/**
 * Get reference token (WETH/WMATIC/WBNB) for a specific chain
 * @param chainId - The chain ID
 * @returns Reference token address or undefined if chain not supported
 */
export function getReferenceToken(chainId: number): string | undefined {
  return CHAIN_CONFIGS[chainId]?.REFERENCE_TOKEN
}

/**
 * Get stable token pairs for a specific chain
 * @param chainId - The chain ID
 * @returns Array of stable token pair addresses or empty array if chain not supported
 */
export function getStableTokenPairs(chainId: number): string[] {
  return CHAIN_CONFIGS[chainId]?.STABLE_TOKEN_PAIRS || []
}

/**
 * Get whitelist tokens for a specific chain
 * @param chainId - The chain ID
 * @returns Array of whitelist token addresses or empty array if chain not supported
 */
export function getWhitelist(chainId: number): string[] {
  return CHAIN_CONFIGS[chainId]?.WHITELIST || []
}

/**
 * Get stablecoins for a specific chain
 * @param chainId - The chain ID
 * @returns Array of stablecoin addresses or empty array if chain not supported
 */
export function getStablecoins(chainId: number): string[] {
  return CHAIN_CONFIGS[chainId]?.STABLECOINS || []
}

/**
 * Check if a chain is supported
 * @param chainId - The chain ID
 * @returns True if chain is supported, false otherwise
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in CHAIN_CONFIGS
}

/**
 * Get all supported chain IDs
 * @returns Array of supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(CHAIN_CONFIGS).map(Number)
}

// Pricing helper functions from original subgraph
// Reference: original-subgraph/src/common/pricing.ts
// Note: Removed whitelisting restrictions but kept data quality thresholds

import { ZERO_BD, ONE_BD, ADDRESS_ZERO } from './constants';
import { getChainConfig, getStableTokenPairs, getWhitelist, getStablecoins } from './chainConfig';
import { BigDecimal } from 'generated';

// Return 0 if denominator is 0 in division
export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
  if (amount1.isEqualTo(ZERO_BD)) {
    return ZERO_BD;
  } else {
    return amount0.div(amount1);
  }
}

//----

/**
 * Get ETH price in USD using stable token pairs
 * Keeps the original logic for reliable pricing
 */
export async function getEthPriceInUSD(context: any, chainId: number): Promise<BigDecimal> {
  // Get chain-specific configuration
  const chainConfig = getChainConfig(chainId);
  if (!chainConfig) {
    context.log.warn(`Chain ${chainId} not supported for ETH pricing`);
    return ZERO_BD;
  }

  const { STABLE_TOKEN_PAIRS, REFERENCE_TOKEN } = chainConfig;
  
  // If no stable token pairs configured for this chain, return 0
  if (STABLE_TOKEN_PAIRS.length === 0) {
    context.log.warn(`No stable token pairs configured for chain ${chainId}`);
    return ZERO_BD;
  }

  // Create arrays to store stable token pair data
  let stableTokenPairs = new Array<any>(STABLE_TOKEN_PAIRS.length);
  let stableTokenReserves = new Array<BigDecimal>(STABLE_TOKEN_PAIRS.length);
  let stableTokenPrices = new Array<BigDecimal>(STABLE_TOKEN_PAIRS.length);
  let stableTokenIsToken0 = new Array<boolean>(STABLE_TOKEN_PAIRS.length);
  let totalLiquidityETH = ZERO_BD;

  // Load stable token pairs and calculate total liquidity
  for (let i = 0; i < STABLE_TOKEN_PAIRS.length; i++) {
    // Construct chainId-prefixed pair ID for multichain support
    const pairId = `${chainId}-${STABLE_TOKEN_PAIRS[i]}`;
    const stableTokenPair = await context.Pair.get(pairId);
    if (stableTokenPair) {
      stableTokenIsToken0[i] = stableTokenPair.token1_id === `${chainId}-${REFERENCE_TOKEN}`;
      if (stableTokenIsToken0[i]) {
        stableTokenReserves[i] = stableTokenPair.reserve1;
        stableTokenPrices[i] = stableTokenPair.token0Price;  // Fixed: use token0Price when token1 is REFERENCE_TOKEN
        totalLiquidityETH = totalLiquidityETH.plus(stableTokenPair.reserve1);
      } else {
        stableTokenReserves[i] = stableTokenPair.reserve0;
        stableTokenPrices[i] = stableTokenPair.token1Price;  // Fixed: use token1Price when token0 is REFERENCE_TOKEN
        totalLiquidityETH = totalLiquidityETH.plus(stableTokenPair.reserve0);
      }
    }
    stableTokenPairs[i] = stableTokenPair;
  }

  // Calculate weighted average price
  let tokenPrice = ZERO_BD;
  for (let i = 0; i < STABLE_TOKEN_PAIRS.length; i++) {
    if (stableTokenPairs[i] !== null && stableTokenPrices[i] && stableTokenReserves[i]) {
      tokenPrice = tokenPrice.plus(stableTokenPrices[i].times(safeDiv(stableTokenReserves[i], totalLiquidityETH)));
    }
  }
  return tokenPrice;
}

/**
 * Get tracked volume USD - simplified version without whitelisting
 * Processes ALL pairs but keeps data quality thresholds
 */
export async function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: any,
  tokenAmount1: BigDecimal,
  token1: any,
  pair: any,
  context: any,
  chainId: number
): Promise<BigDecimal> {
  const bundle = await context.Bundle.get(`${chainId}-1`);
  if (!bundle || !bundle.ethPrice) {
    return ZERO_BD;
  }

  // Add null checks for derivedETH values
  if (!token0.derivedETH || !token1.derivedETH) {
    return ZERO_BD;
  }

  const price0 = token0.derivedETH.times(bundle.ethPrice);
  const price1 = token1.derivedETH.times(bundle.ethPrice);

  // Keep data quality checks (not scaling limitations)
  // If less than 5 LPs, require high minimum reserve amount or return 0
  if (pair.liquidityProviderCount < BigInt(5)) {
    const reserve0USD = pair.reserve0.times(price0);
    const reserve1USD = pair.reserve1.times(price1);
    
    // Get chain-specific minimum threshold
    const chainConfig = getChainConfig(chainId);
    const minThreshold = chainConfig ? new BigDecimal(chainConfig.MINIMUM_USD_THRESHOLD_NEW_PAIRS) : new BigDecimal('10000');
    
    // Check if reserves meet minimum threshold for data quality
    if (reserve0USD.plus(reserve1USD).isLessThan(minThreshold)) {
      return ZERO_BD;
    }
  }

  // Calculate volume based on both tokens (no whitelist restrictions)
  // Take average of both amounts for balanced calculation
  return tokenAmount0.times(price0).plus(tokenAmount1.times(price1)).div(new BigDecimal(2));
}

/**
 * Get tracked liquidity USD - simplified version without whitelisting
 * Processes ALL pairs but keeps data quality thresholds
 */
export async function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  tokenAmount1: BigDecimal,
  token0: any,
  token1: any,
  context: any,
  chainId: number
): Promise<BigDecimal> {
  const bundle = await context.Bundle.get(`${chainId}-1`);
  if (!bundle || !bundle.ethPrice) {
    return ZERO_BD;
  }

  // Add null checks for derivedETH values
  if (!token0.derivedETH || !token1.derivedETH) {
    return ZERO_BD;
  }

  const price0 = token0.derivedETH.times(bundle.ethPrice);
  const price1 = token1.derivedETH.times(bundle.ethPrice);

  // Calculate total liquidity (no whitelist restrictions)
  // Process all pairs equally
  return tokenAmount0.times(price0).plus(tokenAmount1.times(price1));
}

/**
 * Get token tracked liquidity USD - simplified version without whitelisting
 */
export async function getTokenTrackedLiquidityUSD(
  tokenForPricing: any,
  tokenForPricingAmount: BigDecimal,
  companionTokenAmount: BigDecimal,
  companionToken: any,
  context: any,
  chainId: number
): Promise<BigDecimal> {
  const bundle = await context.Bundle.get(`${chainId}-1`);
  if (!bundle || !bundle.ethPrice) {
    return ZERO_BD;
  }

  // Add null checks for derivedETH values
  if (!tokenForPricing.derivedETH || !companionToken.derivedETH) {
    return ZERO_BD;
  }

  const price0 = tokenForPricing.derivedETH.times(bundle.ethPrice);
  const price1 = companionToken.derivedETH.times(bundle.ethPrice);

  // Calculate liquidity for both tokens (no whitelist restrictions)
  // Process all tokens equally
  return tokenForPricingAmount.times(price0).plus(companionTokenAmount.times(price1));
}

/**
 * Find ETH per token using pair lookups
 * Implements the complete logic from original subgraph using WHITELIST for pricing accuracy
 * Uses PairTokenLookup entities to find reliable pricing sources
 */
export async function findEthPerToken(token: any, context: any, chainId: number): Promise<BigDecimal> {
  // Get chain-specific configuration
  const chainConfig = getChainConfig(chainId);
  if (!chainConfig) {
    context.log.warn(`Chain ${chainId} not supported for ETH pricing`);
    return ZERO_BD;
  }

  const { REFERENCE_TOKEN, STABLECOINS, WHITELIST, MINIMUM_LIQUIDITY_THRESHOLD_ETH } = chainConfig;
  
  if (token.id === `${chainId}-${REFERENCE_TOKEN}`) {
    return ONE_BD;
  }

  // Load bundle for ETH price
  const bundle = await context.Bundle.get(`${chainId}-1`);
  if (!bundle) {
    return ZERO_BD;
  }

  // For stablecoins, calculate based on ETH price
  if (STABLECOINS.includes(token.id.replace(`${chainId}-`, ''))) {
    return safeDiv(ONE_BD, bundle.ethPrice);
  }

  // Loop through whitelist and check if paired with any
  // This ensures we only use reliable pricing sources for data accuracy
  for (let i = 0; i < WHITELIST.length; ++i) {
    const pairLookupId = `${chainId}-${token.id}-${chainId}-${WHITELIST[i]}`;
    const pairLookup = await context.PairTokenLookup.get(pairLookupId);
    
    if (pairLookup) {
      const pairId = pairLookup.pair_id;
      if (pairId !== ADDRESS_ZERO) {
        const pair = await context.Pair.get(pairId);
        if (pair) {
          const minLiquidity = new BigDecimal(MINIMUM_LIQUIDITY_THRESHOLD_ETH);
          
          // Check if token0 is our token and has sufficient liquidity
          if (pair.token0_id === token.id && pair.reserveETH.isGreaterThan(minLiquidity)) {
            const token1 = await context.Token.get(pair.token1_id);
            if (token1) {
              // Return token1 per our token * ETH per token1
              return pair.token1Price.times(token1.derivedETH);
            }
          }
          // Check if token1 is our token and has sufficient liquidity
          if (pair.token1_id === token.id && pair.reserveETH.isGreaterThan(minLiquidity)) {
            const token0 = await context.Token.get(pair.token0_id);
            if (token0) {
              // Return token0 per our token * ETH per token0
              return pair.token0Price.times(token0.derivedETH);
            }
          }
        }
      }
    }
  }
  
  // Nothing was found, return 0
  return ZERO_BD;
}

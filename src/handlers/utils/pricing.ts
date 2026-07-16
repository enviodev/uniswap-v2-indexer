import { Bundle, Token, Pair, BigDecimal } from "envio";
import { ONE_BD, ZERO_BD } from "./constants";
import { safeDiv, isAddressInList } from "./index";
import { getChainConfig } from "./chains";

/**
 * Liquidity-weighted average of the reference token's price across the
 * chain's configured reference/stable pairs (subgraph getEthPriceInUSD).
 */
export async function getEthPriceInUSD(
  context: any,
  chainId: number
): Promise<BigDecimal> {
  const { stableTokenPairs, referenceTokenAddress } = getChainConfig(chainId);

  // On chains where the reference token is itself a USD stablecoin (e.g. Arc,
  // whose native gas token is USDC and which has no wrapped-native /
  // reference-stable pair), the reference token's USD price is 1 by
  // definition. Such chains opt in by including REFERENCE_TOKEN in
  // STABLE_TOKEN_PAIRS (subgraph convention).
  if (isAddressInList(referenceTokenAddress, stableTokenPairs)) {
    return ONE_BD;
  }

  const referenceTokenId = `${chainId}-${referenceTokenAddress.toLowerCase()}`;

  const pairs = await Promise.all(
    stableTokenPairs.map((pairAddress) =>
      context.Pair.get(`${chainId}-${pairAddress.toLowerCase()}`)
    )
  );

  // sum the reference-token side of every live pair, then weight each pair's
  // stable-denominated price by its share of that liquidity
  let totalLiquidityETH = ZERO_BD;
  const reserves: BigDecimal[] = [];
  const prices: BigDecimal[] = [];

  for (const pair of pairs) {
    if (pair) {
      // if token1 is the reference token, the stable side is token0
      if (pair.token1_id === referenceTokenId) {
        reserves.push(pair.reserve1);
        prices.push(pair.token0Price);
        totalLiquidityETH = totalLiquidityETH.plus(pair.reserve1);
      } else {
        reserves.push(pair.reserve0);
        prices.push(pair.token1Price);
        totalLiquidityETH = totalLiquidityETH.plus(pair.reserve0);
      }
    } else {
      reserves.push(ZERO_BD);
      prices.push(ZERO_BD);
    }
  }

  let tokenPrice = ZERO_BD;
  for (const [i, pair] of pairs.entries()) {
    if (pair) {
      tokenPrice = tokenPrice.plus(
        prices[i].times(safeDiv(reserves[i], totalLiquidityETH))
      );
    }
  }
  return tokenPrice;
}

/**
 * A pair may only set a token's price when the value it implies for the token
 * side is consistent with the pair's verifiable (whitelisted) side.
 *
 * Ported from the v4/v3 indexers where the 1000x bound was derived
 * empirically from production attack forensics. Without it an attacker parks
 * a bit more than minimumLiquidityThresholdEth of real capital against a
 * free-minted supply and freezes a junk derivedETH that inflates volume/TVL
 * everywhere the token appears. Deliberate, documented deviation from the
 * subgraph (which has no such guard).
 */
export const MAX_PRICING_PAIR_VALUE_IMBALANCE = new BigDecimal("1000");

/**
 * Search through graph to find derived Eth per token (subgraph
 * findEthPerToken): reference token = 1; configured stablecoins = 1/ethPrice;
 * otherwise the FIRST whitelist token this token has a pair with (via
 * PairTokenLookup) whose reserveETH clears the chain threshold sets the
 * price.
 */
export async function findEthPerToken(
  context: any,
  token: Token,
  bundle: Bundle,
  chainId: number
): Promise<BigDecimal> {
  const {
    referenceTokenAddress,
    stablecoinAddresses,
    whitelistTokens,
    minimumLiquidityThresholdEth,
  } = getChainConfig(chainId);

  const tokenAddress = token.id.split("-")[1];

  if (tokenAddress === referenceTokenAddress.toLowerCase()) {
    return ONE_BD;
  }

  if (isAddressInList(tokenAddress, stablecoinAddresses)) {
    return safeDiv(ONE_BD, bundle.ethPrice);
  }

  // loop through whitelist and check if paired with any
  for (const whitelistToken of whitelistTokens) {
    const pairLookup = await context.PairTokenLookup.get(
      `${chainId}-${tokenAddress}-${whitelistToken.toLowerCase()}`
    );
    if (!pairLookup) continue;

    const pair: Pair | undefined = await context.Pair.get(pairLookup.pair_id);
    if (!pair) continue;

    if (
      pair.token0_id === token.id &&
      pair.reserveETH.gt(minimumLiquidityThresholdEth)
    ) {
      const token1 = await context.Token.get(pair.token1_id);
      if (token1) {
        // token1 per our token * ETH per token1
        const candidatePrice = pair.token1Price.times(token1.derivedETH);
        const ethLocked = pair.reserve1.times(token1.derivedETH);
        const impliedOurSideETH = pair.reserve0.times(candidatePrice);
        if (
          impliedOurSideETH.lte(ethLocked.times(MAX_PRICING_PAIR_VALUE_IMBALANCE))
        ) {
          return candidatePrice;
        }
        continue; // imbalance guard rejected this pair — try the next
      }
    }
    if (
      pair.token1_id === token.id &&
      pair.reserveETH.gt(minimumLiquidityThresholdEth)
    ) {
      const token0 = await context.Token.get(pair.token0_id);
      if (token0) {
        // token0 per our token * ETH per token0
        const candidatePrice = pair.token0Price.times(token0.derivedETH);
        const ethLocked = pair.reserve0.times(token0.derivedETH);
        const impliedOurSideETH = pair.reserve1.times(candidatePrice);
        if (
          impliedOurSideETH.lte(ethLocked.times(MAX_PRICING_PAIR_VALUE_IMBALANCE))
        ) {
          return candidatePrice;
        }
        continue;
      }
    }
  }

  return ZERO_BD; // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist.
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts.
 * If neither is, return 0.
 * Pairs with < 5 liquidity providers must additionally clear the chain's
 * minimum reserve USD threshold. NOTE: like the current subgraph (which no
 * longer tracks liquidity positions), liquidityProviderCount is never
 * incremented, so this threshold applies to every pair permanently.
 */
export function getTrackedVolumeUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  pair: Pair,
  chainId: number
): BigDecimal {
  const { whitelistTokens, minimumUsdThresholdNewPairs } =
    getChainConfig(chainId);

  const price0 = token0.derivedETH.times(bundle.ethPrice);
  const price1 = token1.derivedETH.times(bundle.ethPrice);

  const token0Address = token0.id.split("-")[1];
  const token1Address = token1.id.split("-")[1];
  const token0IsWhitelisted = isAddressInList(token0Address, whitelistTokens);
  const token1IsWhitelisted = isAddressInList(token1Address, whitelistTokens);

  // if less than 5 LPs, require high minimum reserve amount amount or return 0
  if (pair.liquidityProviderCount < 5n) {
    const reserve0USD = pair.reserve0.times(price0);
    const reserve1USD = pair.reserve1.times(price1);
    if (token0IsWhitelisted && token1IsWhitelisted) {
      if (reserve0USD.plus(reserve1USD).lt(minimumUsdThresholdNewPairs)) {
        return ZERO_BD;
      }
    }
    if (token0IsWhitelisted && !token1IsWhitelisted) {
      if (
        reserve0USD.times(new BigDecimal("2")).lt(minimumUsdThresholdNewPairs)
      ) {
        return ZERO_BD;
      }
    }
    if (!token0IsWhitelisted && token1IsWhitelisted) {
      if (
        reserve1USD.times(new BigDecimal("2")).lt(minimumUsdThresholdNewPairs)
      ) {
        return ZERO_BD;
      }
    }
  }

  // both are whitelist tokens, take average of both amounts
  if (token0IsWhitelisted && token1IsWhitelisted) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(new BigDecimal("2"));
  }

  // take full value of the whitelisted token amount
  if (token0IsWhitelisted && !token1IsWhitelisted) {
    return tokenAmount0.times(price0);
  }

  // take full value of the whitelisted token amount
  if (!token0IsWhitelisted && token1IsWhitelisted) {
    return tokenAmount1.times(price1);
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist.
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts.
 * If neither is, return 0.
 */
export function getTrackedLiquidityUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  chainId: number
): BigDecimal {
  const { whitelistTokens } = getChainConfig(chainId);

  const price0 = token0.derivedETH.times(bundle.ethPrice);
  const price1 = token1.derivedETH.times(bundle.ethPrice);

  const token0Address = token0.id.split("-")[1];
  const token1Address = token1.id.split("-")[1];
  const token0IsWhitelisted = isAddressInList(token0Address, whitelistTokens);
  const token1IsWhitelisted = isAddressInList(token1Address, whitelistTokens);

  // both are whitelist tokens, take sum of both amounts
  if (token0IsWhitelisted && token1IsWhitelisted) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1));
  }

  // take double value of the whitelisted token amount
  if (token0IsWhitelisted && !token1IsWhitelisted) {
    return tokenAmount0.times(price0).times(new BigDecimal("2"));
  }

  // take double value of the whitelisted token amount
  if (!token0IsWhitelisted && token1IsWhitelisted) {
    return tokenAmount1.times(price1).times(new BigDecimal("2"));
  }

  // neither token is on white list, tracked liquidity is 0
  return ZERO_BD;
}

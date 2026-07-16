import { indexer, Token } from "envio";
import { ZERO_BD } from "./utils/constants";
import { convertTokenToDecimal, safeDiv, sanitizeBD } from "./utils/index";
import { getChainConfig } from "./utils/chains";
import { getEthPriceInUSD, findEthPerToken, getTrackedLiquidityUSD } from "./utils/pricing";

/**
 * Reserve sync (subgraph handleSync): updates reserves and pair prices, then
 * re-derives the ETH price, token derivedETH values and tracked/untracked
 * liquidity aggregates.
 */
indexer.onEvent(
  { contract: "Pair", event: "Sync" },
  async ({ event, context }) => {
    const pairRO = await context.Pair.get(
      `${event.chainId}-${event.srcAddress.toLowerCase()}`
    );
    if (!pairRO) return;

    const { factoryAddress } = getChainConfig(event.chainId);
    const [token0RO, token1RO, factoryRO, bundleRO] = await Promise.all([
      context.Token.get(pairRO.token0_id),
      context.Token.get(pairRO.token1_id),
      context.UniswapFactory.get(
        `${event.chainId}-${factoryAddress.toLowerCase()}`
      ),
      context.Bundle.get(event.chainId.toString()),
    ]);
    if (!token0RO || !token1RO || !factoryRO || !bundleRO) return;

    const pair = { ...pairRO };
    const token0 = { ...token0RO };
    const token1 = { ...token1RO };
    const uniswap = { ...factoryRO };
    const bundle = { ...bundleRO };

    // reset factory liquidity by subtracting only tracked liquidity
    uniswap.totalLiquidityETH = uniswap.totalLiquidityETH.minus(
      pair.trackedReserveETH
    );

    // reset token total liquidity amounts
    token0.totalLiquidity = token0.totalLiquidity.minus(pair.reserve0);
    token1.totalLiquidity = token1.totalLiquidity.minus(pair.reserve1);

    pair.reserve0 = convertTokenToDecimal(event.params.reserve0, token0.decimals);
    pair.reserve1 = convertTokenToDecimal(event.params.reserve1, token1.decimals);

    pair.token0Price = sanitizeBD(safeDiv(pair.reserve0, pair.reserve1));
    pair.token1Price = sanitizeBD(safeDiv(pair.reserve1, pair.reserve0));

    context.Pair.set(pair);

    // update ETH price now that reserves could have changed
    bundle.ethPrice = sanitizeBD(await getEthPriceInUSD(context, event.chainId));
    context.Bundle.set(bundle);

    token0.derivedETH = sanitizeBD(
      await findEthPerToken(context, token0 as Token, bundle, event.chainId)
    );
    token1.derivedETH = sanitizeBD(
      await findEthPerToken(context, token1 as Token, bundle, event.chainId)
    );
    context.Token.set(token0);
    context.Token.set(token1);

    // get tracked liquidity - will be 0 if neither is in whitelist
    let trackedLiquidityETH = ZERO_BD;
    if (!bundle.ethPrice.eq(ZERO_BD)) {
      trackedLiquidityETH = getTrackedLiquidityUSD(
        bundle,
        pair.reserve0,
        token0 as Token,
        pair.reserve1,
        token1 as Token,
        event.chainId
      ).div(bundle.ethPrice);
    }

    // use derived amounts within pair
    pair.trackedReserveETH = trackedLiquidityETH;
    pair.reserveETH = pair.reserve0
      .times(token0.derivedETH)
      .plus(pair.reserve1.times(token1.derivedETH));
    pair.reserveUSD = sanitizeBD(pair.reserveETH.times(bundle.ethPrice));

    // use tracked amounts globally
    uniswap.totalLiquidityETH = uniswap.totalLiquidityETH.plus(trackedLiquidityETH);
    uniswap.totalLiquidityUSD = sanitizeBD(
      uniswap.totalLiquidityETH.times(bundle.ethPrice)
    );

    // now correctly set liquidity amounts for each token
    token0.totalLiquidity = token0.totalLiquidity.plus(pair.reserve0);
    token1.totalLiquidity = token1.totalLiquidity.plus(pair.reserve1);

    // save entities
    context.Pair.set(pair);
    context.UniswapFactory.set(uniswap);
    context.Token.set(token0);
    context.Token.set(token1);
  }
);

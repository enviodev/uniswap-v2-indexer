import { indexer } from "envio";
import { ONE_BI } from "./utils/constants";
import { convertTokenToDecimal, sanitizeBD } from "./utils/index";
import { getChainConfig } from "./utils/chains";
import {
  updatePairDayData,
  updatePairHourData,
  updateUniswapDayData,
  updateTokenDayData,
} from "./utils/hourDayUpdates";

/**
 * Completes the Burn entity staged by the preceding LP-token Transfer(s)
 * (subgraph handleBurn) and bumps transaction counters. Reserves are handled
 * by Sync.
 */
indexer.onEvent(
  { contract: "Pair", event: "Burn" },
  async ({ event, context }) => {
    const transactionId = `${event.chainId}-${event.transaction.hash.toLowerCase()}`;
    const transaction = await context.Transaction.get(transactionId);

    // safety check
    if (!transaction) return;

    const burns = transaction.burns;
    const burnRO =
      burns.length > 0 ? await context.Burn.get(burns[burns.length - 1]) : undefined;
    if (!burnRO) return;

    const pairRO = await context.Pair.get(
      `${event.chainId}-${event.srcAddress.toLowerCase()}`
    );
    if (!pairRO) return;

    const { factoryAddress } = getChainConfig(event.chainId);
    const [factoryRO, token0RO, token1RO, bundle] = await Promise.all([
      context.UniswapFactory.get(`${event.chainId}-${factoryAddress.toLowerCase()}`),
      context.Token.get(pairRO.token0_id),
      context.Token.get(pairRO.token1_id),
      context.Bundle.get(event.chainId.toString()),
    ]);
    if (!factoryRO || !token0RO || !token1RO || !bundle) return;

    const pair = { ...pairRO };
    const uniswap = { ...factoryRO };
    const token0 = { ...token0RO };
    const token1 = { ...token1RO };

    const token0Amount = convertTokenToDecimal(event.params.amount0, token0.decimals);
    const token1Amount = convertTokenToDecimal(event.params.amount1, token1.decimals);

    // update txn counts
    token0.txCount = token0.txCount + ONE_BI;
    token1.txCount = token1.txCount + ONE_BI;

    // get new amounts of USD and ETH for tracking
    const amountTotalUSD = token1.derivedETH
      .times(token1Amount)
      .plus(token0.derivedETH.times(token0Amount))
      .times(bundle.ethPrice);

    // update txn counts
    uniswap.txCount = uniswap.txCount + ONE_BI;
    pair.txCount = pair.txCount + ONE_BI;

    // update global counter and save
    context.Token.set(token0);
    context.Token.set(token1);
    context.Pair.set(pair);
    context.UniswapFactory.set(uniswap);

    // update burn
    // note: the subgraph leaves sender/to as set by the staging Transfer
    const burn = {
      ...burnRO,
      amount0: token0Amount,
      amount1: token1Amount,
      logIndex: BigInt(event.logIndex),
      amountUSD: sanitizeBD(amountTotalUSD),
    };
    context.Burn.set(burn);

    // update day entities
    const timestamp = event.block.timestamp;
    await updatePairDayData(timestamp, pair, context);
    await updatePairHourData(timestamp, pair, context);
    await updateUniswapDayData(timestamp, event.chainId, context);
    await updateTokenDayData(timestamp, token0, bundle, context);
    await updateTokenDayData(timestamp, token1, bundle, context);
  }
);

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
 * Completes the Mint entity staged by the preceding LP-token Transfer
 * (subgraph handleMint) and bumps transaction counters. Reserves are handled
 * by Sync.
 */
indexer.onEvent(
  { contract: "Pair", event: "Mint" },
  async ({ event, context }) => {
    // loaded from a previous handler creating this transaction
    const transactionId = `${event.chainId}-${event.transaction.hash.toLowerCase()}`;
    const transaction = await context.Transaction.get(transactionId);
    if (!transaction) return;

    const mints = transaction.mints;
    const mintRO =
      mints.length > 0 ? await context.Mint.get(mints[mints.length - 1]) : undefined;
    if (!mintRO) return;

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

    // update exchange info (except balances, sync will cover that)
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
    pair.txCount = pair.txCount + ONE_BI;
    uniswap.txCount = uniswap.txCount + ONE_BI;

    // save entities
    context.Token.set(token0);
    context.Token.set(token1);
    context.Pair.set(pair);
    context.UniswapFactory.set(uniswap);

    const mint = {
      ...mintRO,
      sender: event.params.sender.toLowerCase(),
      amount0: token0Amount,
      amount1: token1Amount,
      logIndex: BigInt(event.logIndex),
      amountUSD: sanitizeBD(amountTotalUSD),
    };
    context.Mint.set(mint);

    // update day entities
    const timestamp = event.block.timestamp;
    await updatePairDayData(timestamp, pair, context);
    await updatePairHourData(timestamp, pair, context);
    await updateUniswapDayData(timestamp, event.chainId, context);
    await updateTokenDayData(timestamp, token0, bundle, context);
    await updateTokenDayData(timestamp, token1, bundle, context);
  }
);

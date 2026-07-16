import { indexer, BigDecimal, Token, Pair, Swap, Transaction } from "envio";
import { ALMOST_ZERO_BD, ONE_BI, ZERO_BD } from "./utils/constants";
import { convertTokenToDecimal, sanitizeBD } from "./utils/index";
import { getChainConfig } from "./utils/chains";
import { getTrackedVolumeUSD } from "./utils/pricing";
import {
  updatePairDayData,
  updatePairHourData,
  updateUniswapDayData,
  updateTokenDayData,
} from "./utils/hourDayUpdates";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

indexer.onEvent(
  { contract: "Pair", event: "Swap" },
  async ({ event, context }) => {
    const pairRO = await context.Pair.get(
      `${event.chainId}-${event.srcAddress.toLowerCase()}`
    );
    if (!pairRO) return;

    const { factoryAddress } = getChainConfig(event.chainId);
    const [token0RO, token1RO, factoryRO, bundle] = await Promise.all([
      context.Token.get(pairRO.token0_id),
      context.Token.get(pairRO.token1_id),
      context.UniswapFactory.get(`${event.chainId}-${factoryAddress.toLowerCase()}`),
      context.Bundle.get(event.chainId.toString()),
    ]);
    if (!token0RO || !token1RO || !factoryRO || !bundle) return;

    const pair = { ...pairRO };
    const token0 = { ...token0RO };
    const token1 = { ...token1RO };
    const uniswap = { ...factoryRO };

    const amount0In = convertTokenToDecimal(event.params.amount0In, token0.decimals);
    const amount1In = convertTokenToDecimal(event.params.amount1In, token1.decimals);
    const amount0Out = convertTokenToDecimal(event.params.amount0Out, token0.decimals);
    const amount1Out = convertTokenToDecimal(event.params.amount1Out, token1.decimals);

    // totals for volume updates
    const amount0Total = amount0Out.plus(amount0In);
    const amount1Total = amount1Out.plus(amount1In);

    // get total amounts of derived USD and ETH for tracking
    const derivedEthToken1 = token1.derivedETH.times(amount1Total);
    const derivedEthToken0 = token0.derivedETH.times(amount0Total);

    // if any side is 0, do not divide by 2 (subgraph parity)
    let derivedAmountETH: BigDecimal;
    if (
      derivedEthToken0.lte(ALMOST_ZERO_BD) ||
      derivedEthToken1.lte(ALMOST_ZERO_BD)
    ) {
      derivedAmountETH = derivedEthToken0.plus(derivedEthToken1);
    } else {
      derivedAmountETH = derivedEthToken0
        .plus(derivedEthToken1)
        .div(new BigDecimal("2"));
    }

    const derivedAmountUSD = derivedAmountETH.times(bundle.ethPrice);

    // only accounts for volume through white listed tokens
    const trackedAmountUSD = getTrackedVolumeUSD(
      bundle,
      amount0Total,
      token0 as Token,
      amount1Total,
      token1 as Token,
      pair as Pair,
      event.chainId
    );

    const trackedAmountETH = bundle.ethPrice.eq(ZERO_BD)
      ? ZERO_BD
      : trackedAmountUSD.div(bundle.ethPrice);

    // update token0 global volume and token liquidity stats
    token0.tradeVolume = token0.tradeVolume.plus(amount0In.plus(amount0Out));
    token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(trackedAmountUSD);
    token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(derivedAmountUSD);

    // update token1 global volume and token liquidity stats
    token1.tradeVolume = token1.tradeVolume.plus(amount1In.plus(amount1Out));
    token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(trackedAmountUSD);
    token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(derivedAmountUSD);

    // update txn counts
    token0.txCount = token0.txCount + ONE_BI;
    token1.txCount = token1.txCount + ONE_BI;

    // update pair volume data, use tracked amount if we have it as its probably more accurate
    pair.volumeUSD = sanitizeBD(pair.volumeUSD.plus(trackedAmountUSD));
    pair.volumeToken0 = pair.volumeToken0.plus(amount0Total);
    pair.volumeToken1 = pair.volumeToken1.plus(amount1Total);
    pair.untrackedVolumeUSD = pair.untrackedVolumeUSD.plus(derivedAmountUSD);
    pair.txCount = pair.txCount + ONE_BI;
    context.Pair.set(pair);

    // update global values, only used tracked amounts for volume
    uniswap.totalVolumeUSD = sanitizeBD(uniswap.totalVolumeUSD.plus(trackedAmountUSD));
    uniswap.totalVolumeETH = uniswap.totalVolumeETH.plus(trackedAmountETH);
    uniswap.untrackedVolumeUSD = uniswap.untrackedVolumeUSD.plus(derivedAmountUSD);
    uniswap.txCount = uniswap.txCount + ONE_BI;

    // save entities
    context.Token.set(token0);
    context.Token.set(token1);
    context.UniswapFactory.set(uniswap);

    const transactionId = `${event.chainId}-${event.transaction.hash.toLowerCase()}`;
    const transactionRO = await context.Transaction.get(transactionId);
    const transaction: Mutable<Transaction> = transactionRO
      ? { ...transactionRO }
      : {
          id: transactionId,
          blockNumber: BigInt(event.block.number),
          timestamp: BigInt(event.block.timestamp),
          mints: [],
          swaps: [],
          burns: [],
        };

    const swaps = transaction.swaps;
    const swap: Swap = {
      id: `${transactionId}-${swaps.length}`,
      transaction_id: transaction.id,
      pair_id: pair.id,
      timestamp: transaction.timestamp,
      sender: event.params.sender.toLowerCase(),
      amount0In,
      amount1In,
      amount0Out,
      amount1Out,
      to: event.params.to.toLowerCase(),
      from: event.transaction.from?.toLowerCase() || "",
      logIndex: BigInt(event.logIndex),
      // use the tracked amount if we have it
      amountUSD: sanitizeBD(
        trackedAmountUSD.eq(ZERO_BD) ? derivedAmountUSD : trackedAmountUSD
      ),
    };
    context.Swap.set(swap);

    // update the transaction
    transaction.swaps = swaps.concat([swap.id]);
    context.Transaction.set(transaction);

    // update day entities
    const timestamp = event.block.timestamp;
    const pairDayData = { ...(await updatePairDayData(timestamp, pair, context)) };
    const pairHourData = { ...(await updatePairHourData(timestamp, pair, context)) };
    const uniswapDayData = {
      ...(await updateUniswapDayData(timestamp, event.chainId, context)),
    };
    const token0DayData = {
      ...(await updateTokenDayData(timestamp, token0, bundle, context)),
    };
    const token1DayData = {
      ...(await updateTokenDayData(timestamp, token1, bundle, context)),
    };

    // swap specific updating
    uniswapDayData.dailyVolumeUSD = uniswapDayData.dailyVolumeUSD.plus(trackedAmountUSD);
    uniswapDayData.dailyVolumeETH = uniswapDayData.dailyVolumeETH.plus(trackedAmountETH);
    uniswapDayData.dailyVolumeUntracked =
      uniswapDayData.dailyVolumeUntracked.plus(derivedAmountUSD);
    context.UniswapDayData.set(uniswapDayData);

    // swap specific updating for pair
    pairDayData.dailyVolumeToken0 = pairDayData.dailyVolumeToken0.plus(amount0Total);
    pairDayData.dailyVolumeToken1 = pairDayData.dailyVolumeToken1.plus(amount1Total);
    pairDayData.dailyVolumeUSD = pairDayData.dailyVolumeUSD.plus(trackedAmountUSD);
    context.PairDayData.set(pairDayData);

    // update hourly pair data
    pairHourData.hourlyVolumeToken0 = pairHourData.hourlyVolumeToken0.plus(amount0Total);
    pairHourData.hourlyVolumeToken1 = pairHourData.hourlyVolumeToken1.plus(amount1Total);
    pairHourData.hourlyVolumeUSD = pairHourData.hourlyVolumeUSD.plus(trackedAmountUSD);
    context.PairHourData.set(pairHourData);

    // swap specific updating for token0
    token0DayData.dailyVolumeToken = token0DayData.dailyVolumeToken.plus(amount0Total);
    token0DayData.dailyVolumeETH = token0DayData.dailyVolumeETH.plus(
      amount0Total.times(token0.derivedETH)
    );
    token0DayData.dailyVolumeUSD = token0DayData.dailyVolumeUSD.plus(
      amount0Total.times(token0.derivedETH).times(bundle.ethPrice)
    );
    context.TokenDayData.set(token0DayData);

    // swap specific updating
    token1DayData.dailyVolumeToken = token1DayData.dailyVolumeToken.plus(amount1Total);
    token1DayData.dailyVolumeETH = token1DayData.dailyVolumeETH.plus(
      amount1Total.times(token1.derivedETH)
    );
    token1DayData.dailyVolumeUSD = token1DayData.dailyVolumeUSD.plus(
      amount1Total.times(token1.derivedETH).times(bundle.ethPrice)
    );
    context.TokenDayData.set(token1DayData);
  }
);

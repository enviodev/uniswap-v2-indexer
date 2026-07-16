import { ONE_BI, ZERO_BD, ZERO_BI } from "./constants";
import { getChainConfig } from "./chains";
import {
  Bundle,
  Pair,
  PairDayData,
  PairHourData,
  Token,
  TokenDayData,
  UniswapDayData,
} from "envio";

/**
 * Tracks global aggregate data over daily windows.
 *
 * Note: like the v3 port, these helpers receive the handler's already-updated
 * in-memory entities instead of re-loading pre-event state from the store, so
 * interval snapshots reflect the event that triggered them immediately —
 * see README "known deviations".
 */
export async function updateUniswapDayData(
  timestamp: number,
  chainId: number,
  context: any
): Promise<UniswapDayData> {
  const { factoryAddress } = getChainConfig(chainId);
  const uniswap = await context.UniswapFactory.get(
    `${chainId}-${factoryAddress.toLowerCase()}`
  );

  const dayID = Math.floor(timestamp / 86400);
  const dayStartTimestamp = dayID * 86400;
  const id = `${chainId}-${dayID}`;
  const uniswapDayDataRO = await context.UniswapDayData.get(id);
  const uniswapDayData = uniswapDayDataRO
    ? { ...uniswapDayDataRO }
    : {
        id,
        date: dayStartTimestamp,
        dailyVolumeUSD: ZERO_BD,
        dailyVolumeETH: ZERO_BD,
        // never accumulated by the subgraph — stays 0 (vestigial fields)
        totalVolumeUSD: ZERO_BD,
        totalVolumeETH: ZERO_BD,
        dailyVolumeUntracked: ZERO_BD,
        totalLiquidityUSD: ZERO_BD,
        totalLiquidityETH: ZERO_BD,
        txCount: ZERO_BI,
      };

  uniswapDayData.totalLiquidityUSD = uniswap.totalLiquidityUSD;
  uniswapDayData.totalLiquidityETH = uniswap.totalLiquidityETH;
  uniswapDayData.txCount = uniswap.txCount;

  context.UniswapDayData.set(uniswapDayData);
  return uniswapDayData as UniswapDayData;
}

export async function updatePairDayData(
  timestamp: number,
  pair: Pair,
  context: any
): Promise<PairDayData> {
  const dayID = Math.floor(timestamp / 86400);
  const dayStartTimestamp = dayID * 86400;
  const dayPairID = `${pair.id}-${dayID}`;
  const pairDayDataRO = await context.PairDayData.get(dayPairID);
  const pairDayData = pairDayDataRO
    ? { ...pairDayDataRO }
    : {
        id: dayPairID,
        date: dayStartTimestamp,
        token0_id: pair.token0_id,
        token1_id: pair.token1_id,
        pairAddress: pair.id.split("-")[1],
        dailyVolumeToken0: ZERO_BD,
        dailyVolumeToken1: ZERO_BD,
        dailyVolumeUSD: ZERO_BD,
        dailyTxns: ZERO_BI,
      };

  pairDayData.totalSupply = pair.totalSupply;
  pairDayData.reserve0 = pair.reserve0;
  pairDayData.reserve1 = pair.reserve1;
  pairDayData.reserveUSD = pair.reserveUSD;
  pairDayData.dailyTxns = pairDayData.dailyTxns + ONE_BI;

  context.PairDayData.set(pairDayData);
  return pairDayData as PairDayData;
}

export async function updatePairHourData(
  timestamp: number,
  pair: Pair,
  context: any
): Promise<PairHourData> {
  const hourIndex = Math.floor(timestamp / 3600); // get unique hour within unix history
  const hourStartUnix = hourIndex * 3600; // want the rounded effect
  const hourPairID = `${pair.id}-${hourIndex}`;
  const pairHourDataRO = await context.PairHourData.get(hourPairID);
  const pairHourData = pairHourDataRO
    ? { ...pairHourDataRO }
    : {
        id: hourPairID,
        hourStartUnix,
        pair_id: pair.id,
        hourlyVolumeToken0: ZERO_BD,
        hourlyVolumeToken1: ZERO_BD,
        hourlyVolumeUSD: ZERO_BD,
        hourlyTxns: ZERO_BI,
      };

  pairHourData.totalSupply = pair.totalSupply;
  pairHourData.reserve0 = pair.reserve0;
  pairHourData.reserve1 = pair.reserve1;
  pairHourData.reserveUSD = pair.reserveUSD;
  pairHourData.hourlyTxns = pairHourData.hourlyTxns + ONE_BI;

  context.PairHourData.set(pairHourData);
  return pairHourData as PairHourData;
}

export async function updateTokenDayData(
  timestamp: number,
  token: Token,
  bundle: Bundle,
  context: any
): Promise<TokenDayData> {
  const dayID = Math.floor(timestamp / 86400);
  const dayStartTimestamp = dayID * 86400;
  const tokenDayID = `${token.id}-${dayID}`;
  const tokenDayDataRO = await context.TokenDayData.get(tokenDayID);
  const tokenDayData = tokenDayDataRO
    ? { ...tokenDayDataRO }
    : {
        id: tokenDayID,
        date: dayStartTimestamp,
        token_id: token.id,
        priceUSD: token.derivedETH.times(bundle.ethPrice),
        dailyVolumeToken: ZERO_BD,
        dailyVolumeETH: ZERO_BD,
        dailyVolumeUSD: ZERO_BD,
        dailyTxns: ZERO_BI,
        totalLiquidityUSD: ZERO_BD,
      };

  tokenDayData.priceUSD = token.derivedETH.times(bundle.ethPrice);
  tokenDayData.totalLiquidityToken = token.totalLiquidity;
  tokenDayData.totalLiquidityETH = token.totalLiquidity.times(token.derivedETH);
  tokenDayData.totalLiquidityUSD = tokenDayData.totalLiquidityETH.times(
    bundle.ethPrice
  );
  tokenDayData.dailyTxns = tokenDayData.dailyTxns + ONE_BI;

  context.TokenDayData.set(tokenDayData);
  return tokenDayData as TokenDayData;
}

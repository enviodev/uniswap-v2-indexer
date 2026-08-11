import { indexer, Bundle, Token, Pair, UniswapFactory, PairTokenLookup } from "envio";
import { ZERO_BD, ZERO_BI } from "./utils/constants";
import { CHAIN_CONFIGS } from "./utils/chains";
import { getTokenMetadataEffect } from "./utils/tokenMetadataEffect";

// Mutable version of the (readonly) generated entity type
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

indexer.contractRegister(
  { contract: "Factory", event: "PairCreated" },
  async ({ event, context }) => {
    context.chain.Pair.add(event.params.pair);
  }
);

// Build a fresh Token entity from fetched metadata; returns null when
// decimals could not be determined (subgraph: "bail if we couldn't figure out
// the decimals" — the pair is then never indexed).
async function fetchToken(
  context: any,
  chainId: number,
  tokenAddress: string
): Promise<Mutable<Token> | null> {
  const metadata = await context.effect(getTokenMetadataEffect, {
    address: tokenAddress,
    chainId,
  });

  if (metadata.decimals === null || metadata.decimals === undefined) {
    return null;
  }

  return {
    id: `${chainId}-${tokenAddress.toLowerCase()}`,
    symbol: metadata.symbol,
    name: metadata.name,
    decimals: BigInt(metadata.decimals),
    // Not fetched — see tokenMetadataEffect. Matches the v3 indexer; known
    // parity gap against the v2 subgraph, which reports the on-chain supply.
    totalSupply: 0n,
    tradeVolume: ZERO_BD,
    tradeVolumeUSD: ZERO_BD,
    untrackedVolumeUSD: ZERO_BD,
    txCount: ZERO_BI,
    totalLiquidity: ZERO_BD,
    derivedETH: ZERO_BD,
  };
}

indexer.onEvent(
  { contract: "Factory", event: "PairCreated" },
  async ({ event, context }) => {
    const { factoryAddress } = CHAIN_CONFIGS[event.chainId];
    const factoryId = `${event.chainId}-${factoryAddress.toLowerCase()}`;
    const token0Address = event.params.token0.toLowerCase();
    const token1Address = event.params.token1.toLowerCase();
    const pairAddress = event.params.pair.toLowerCase();

    const [factoryRO, token0RO, token1RO] = await Promise.all([
      context.UniswapFactory.get(factoryId),
      context.Token.get(`${event.chainId}-${token0Address}`),
      context.Token.get(`${event.chainId}-${token1Address}`),
    ]);

    // load factory (create if first exchange)
    let factory: Mutable<UniswapFactory>;
    if (factoryRO) {
      factory = { ...factoryRO };
    } else {
      factory = {
        id: factoryId,
        pairCount: 0,
        totalVolumeETH: ZERO_BD,
        totalLiquidityETH: ZERO_BD,
        totalVolumeUSD: ZERO_BD,
        untrackedVolumeUSD: ZERO_BD,
        totalLiquidityUSD: ZERO_BD,
        txCount: ZERO_BI,
      };

      // create new bundle
      const bundle: Bundle = {
        id: event.chainId.toString(),
        ethPrice: ZERO_BD,
      };
      context.Bundle.set(bundle);
    }

    factory.pairCount = factory.pairCount + 1;
    context.UniswapFactory.set(factory);

    // create the tokens — bail if we couldn't figure out the decimals
    // (subgraph parity: such pairs are never indexed)
    const token0 = token0RO
      ? { ...token0RO }
      : await fetchToken(context, event.chainId, token0Address);
    if (!token0) {
      return;
    }
    const token1 = token1RO
      ? { ...token1RO }
      : await fetchToken(context, event.chainId, token1Address);
    if (!token1) {
      return;
    }

    const pair: Pair = {
      id: `${event.chainId}-${pairAddress}`,
      token0_id: token0.id,
      token1_id: token1.id,
      liquidityProviderCount: ZERO_BI,
      createdAtTimestamp: BigInt(event.block.timestamp),
      createdAtBlockNumber: BigInt(event.block.number),
      txCount: ZERO_BI,
      reserve0: ZERO_BD,
      reserve1: ZERO_BD,
      trackedReserveETH: ZERO_BD,
      reserveETH: ZERO_BD,
      reserveUSD: ZERO_BD,
      totalSupply: ZERO_BD,
      volumeToken0: ZERO_BD,
      volumeToken1: ZERO_BD,
      volumeUSD: ZERO_BD,
      untrackedVolumeUSD: ZERO_BD,
      token0Price: ZERO_BD,
      token1Price: ZERO_BD,
    };

    context.Token.set(token0);
    context.Token.set(token1);
    context.Pair.set(pair);

    // lookups used by findEthPerToken to locate a token's whitelist pairs
    const pairLookup0: PairTokenLookup = {
      id: `${event.chainId}-${token0Address}-${token1Address}`,
      pair_id: pair.id,
    };
    context.PairTokenLookup.set(pairLookup0);

    const pairLookup1: PairTokenLookup = {
      id: `${event.chainId}-${token1Address}-${token0Address}`,
      pair_id: pair.id,
    };
    context.PairTokenLookup.set(pairLookup1);
  }
);

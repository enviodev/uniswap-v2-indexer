/**
 * Shared fixtures for the v2 indexer test suite.
 *
 * Uses real Ethereum mainnet addresses so the handlers' CHAIN_CONFIGS[1]
 * lookups behave exactly as in production. The USDC/WETH pair
 * (0xb4e16d01…, the first v2 pair ever created) is one of the chain's
 * STABLE_TOKEN_PAIRS, so sync tests exercise the Bundle price path
 * naturally.
 */
import { BigDecimal, Pair, Token, UniswapFactory, Bundle } from "envio";
import { ZERO_BD, ZERO_BI } from "../src/handlers/utils/constants";

export const CHAIN_ID = 1;
export const FACTORY_ADDRESS = "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f";
export const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
export const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";
// USDC/WETH — first v2 pair, mainnet STABLE_TOKEN_PAIRS[0]
export const USDC_WETH_PAIR = "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc";
// DAI/WETH — mainnet STABLE_TOKEN_PAIRS[1]
export const DAI_WETH_PAIR = "0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852";

export const FACTORY_ID = `${CHAIN_ID}-${FACTORY_ADDRESS}`;
export const BUNDLE_ID = CHAIN_ID.toString();
export const PAIR_ID = `${CHAIN_ID}-${USDC_WETH_PAIR}`;
export const USDC_ID = `${CHAIN_ID}-${USDC}`;
export const WETH_ID = `${CHAIN_ID}-${WETH}`;

export const TIMESTAMP = 1722420503;
export const BLOCK_NUMBER = 20428078;
export const TX_HASH =
  "0xd6005a794596212a1bdc19178e04e18eb8e9e0963d7073303bcb47d6186e757e";
export const TX_FROM = "0xa79d3b28a109f0e3e4919c9715748db6d88f313f";
export const LP_USER = "0x6f1cdbbb4d53d226cf4b917bf768b94acbab6168";

export const bd = (v: string | number) => new BigDecimal(v.toString());

export function makeFactory(overrides: Partial<UniswapFactory> = {}): UniswapFactory {
  return {
    id: FACTORY_ID,
    pairCount: 1,
    totalVolumeUSD: ZERO_BD,
    totalVolumeETH: ZERO_BD,
    untrackedVolumeUSD: ZERO_BD,
    totalLiquidityUSD: ZERO_BD,
    totalLiquidityETH: ZERO_BD,
    txCount: ZERO_BI,
    ...overrides,
  };
}

export function makeBundle(ethPrice: BigDecimal = ZERO_BD): Bundle {
  return { id: BUNDLE_ID, ethPrice };
}

export function makeToken(
  id: string,
  symbol: string,
  name: string,
  decimals: bigint,
  overrides: Partial<Token> = {}
): Token {
  return {
    id,
    symbol,
    name,
    decimals,
    totalSupply: ZERO_BI,
    tradeVolume: ZERO_BD,
    tradeVolumeUSD: ZERO_BD,
    untrackedVolumeUSD: ZERO_BD,
    txCount: ZERO_BI,
    totalLiquidity: ZERO_BD,
    derivedETH: ZERO_BD,
    ...overrides,
  };
}

export function makePair(overrides: Partial<Pair> = {}): Pair {
  return {
    id: PAIR_ID,
    token0_id: USDC_ID,
    token1_id: WETH_ID,
    reserve0: ZERO_BD,
    reserve1: ZERO_BD,
    totalSupply: ZERO_BD,
    reserveETH: ZERO_BD,
    reserveUSD: ZERO_BD,
    trackedReserveETH: ZERO_BD,
    token0Price: ZERO_BD,
    token1Price: ZERO_BD,
    volumeToken0: ZERO_BD,
    volumeToken1: ZERO_BD,
    volumeUSD: ZERO_BD,
    untrackedVolumeUSD: ZERO_BD,
    txCount: ZERO_BI,
    createdAtTimestamp: BigInt(TIMESTAMP),
    createdAtBlockNumber: BigInt(BLOCK_NUMBER),
    liquidityProviderCount: ZERO_BI,
    ...overrides,
  };
}

/** In-memory context standing in for the handler context in pure-function
 * tests (pricing, hourDayUpdates). */
export function makeMockContext(
  entities: { [name: string]: any[] | undefined } = {}
) {
  const stores = new Map<string, Map<string, any>>();
  const store = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };
  for (const [name, list] of Object.entries(entities)) {
    for (const e of list ?? []) store(name).set(e.id, e);
  }
  return new Proxy(
    {},
    {
      get: (_t, name: string) => ({
        get: async (id: string) => store(name).get(id),
        set: (entity: any) => {
          store(name).set(entity.id, entity);
        },
      }),
    }
  ) as any;
}

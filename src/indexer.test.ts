/**
 * E2E integration tests for the Uniswap V2 indexer.
 *
 * Replays real Ethereum mainnet history through the handlers via
 * createTestIndexer() (HyperSync-backed). Requires ENVIO_API_TOKEN and an
 * ENVIO_MAINNET_RPC_URL in .env (token metadata is fetched over RPC for
 * PairCreated events).
 *
 * Block anchors (verified against HyperSync):
 * - 10000834: factory deployment (config start_block)
 * - 10008355: first PairCreated — USDC/WETH (0xb4e16d01…), which is also
 *   the chain's first STABLE_TOKEN_PAIR
 * - 10008555: its first mint (lock transfer + LP transfer + Sync + Mint)
 * - 10008566: its first swap
 */
import { describe, it } from "vitest";
import { createTestIndexer } from "envio";
import * as dotenv from "dotenv";

dotenv.config();

const FACTORY_ID = "1-0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f";
const PAIR_ID = "1-0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc";
const USDC_ID = "1-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH_ID = "1-0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

describe("Uniswap V2 Indexer (mainnet replay)", () => {
  it(
    "replays the first pair's creation, first mint and first swap",
    { timeout: 300_000 },
    async (t) => {
      const indexer = createTestIndexer();

      // creation only
      await indexer.process({
        chains: { 1: { startBlock: 10000834, endBlock: 10008355 } },
      });

      const factory = await indexer.UniswapFactory.getOrThrow(FACTORY_ID);
      t.expect(factory.pairCount).toBe(1);

      const pair = await indexer.Pair.getOrThrow(PAIR_ID);
      t.expect(pair.token0_id).toBe(USDC_ID);
      t.expect(pair.token1_id).toBe(WETH_ID);
      t.expect(pair.totalSupply.isZero()).toBe(true);

      // token metadata fetched over RPC — real mainnet values
      const usdcToken = await indexer.Token.getOrThrow(USDC_ID);
      t.expect(usdcToken.symbol).toBe("USDC");
      t.expect(usdcToken.name).toBe("USD Coin");
      t.expect(usdcToken.decimals).toBe(6n);
      // Not fetched — hardcoded 0, matching the v3 indexer. The v2 subgraph
      // reports the real supply; known parity gap.
      t.expect(usdcToken.totalSupply).toBe(0n);

      const wethToken = await indexer.Token.getOrThrow(WETH_ID);
      t.expect(wethToken.symbol).toBe("WETH");
      t.expect(wethToken.decimals).toBe(18n);

      const lookup = await indexer.PairTokenLookup.getOrThrow(
        "1-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48-0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
      );
      t.expect(lookup.pair_id).toBe(PAIR_ID);

      // continue through the first mint
      await indexer.process({
        chains: { 1: { endBlock: 10008555 } },
      });

      const pairAfterMint = await indexer.Pair.getOrThrow(PAIR_ID);
      // real values from the first v2 mint ever
      t.expect(pairAfterMint.totalSupply.gt(0)).toBe(true);
      t.expect(pairAfterMint.reserve0.gt(0), "USDC reserve set by Sync").toBe(true);
      t.expect(pairAfterMint.reserve1.gt(0), "WETH reserve set by Sync").toBe(true);
      // token0Price = USDC per WETH ≈ ETH price in May 2020 (~$200)
      t.expect(pairAfterMint.token0Price.gt(100)).toBe(true);
      t.expect(pairAfterMint.token0Price.lt(400)).toBe(true);

      // the pair IS the stable pair → bundle priced from it
      const bundle = await indexer.Bundle.getOrThrow("1");
      t.expect(bundle.ethPrice.eq(pairAfterMint.token0Price)).toBe(true);
      t.expect((await indexer.Token.getOrThrow(WETH_ID)).derivedETH.toString()).toBe("1");

      const mints = await indexer.Mint.getAll();
      t.expect(mints).toHaveLength(1);
      const mint = mints[0]!;
      t.expect(mint.sender, "completed by the Mint event").toBeDefined();
      t.expect(mint.amount0?.gt(0)).toBe(true);
      t.expect(mint.liquidity.gt(0)).toBe(true);

      // continue through the first swap
      await indexer.process({
        chains: { 1: { endBlock: 10008566 } },
      });

      const swaps = await indexer.Swap.getAll();
      t.expect(swaps).toHaveLength(1);
      const swap = swaps[0]!;
      t.expect(swap.pair_id).toBe(PAIR_ID);
      t.expect(swap.from).toMatch(/^0x[0-9a-f]{40}$/);
      // reserves are far below mainnet's $400k new-pair threshold, so
      // tracked volume is 0 and amountUSD falls back to the derived value
      t.expect(swap.amountUSD.gt(0), "derived USD fallback").toBe(true);

      const pairAfterSwap = await indexer.Pair.getOrThrow(PAIR_ID);
      t.expect(
        pairAfterSwap.volumeUSD.isZero(),
        "below the new-pair reserve threshold → no tracked volume (subgraph parity)"
      ).toBe(true);
      t.expect(pairAfterSwap.untrackedVolumeUSD.gt(0)).toBe(true);
      t.expect(pairAfterSwap.txCount).toBe(2n); // mint + swap

      // the first pair held 1 USDC + 0.005 WETH — reserveETH (~0.01) is far
      // below the 2 ETH pricing threshold, so USDC must NOT be priced from
      // it (subgraph parity; STABLECOINS is empty on mainnet)
      const usdcPriced = await indexer.Token.getOrThrow(USDC_ID);
      t.expect(usdcPriced.derivedETH.isZero()).toBe(true);
    }
  );
});

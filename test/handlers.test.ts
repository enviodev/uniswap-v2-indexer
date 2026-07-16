/**
 * Handler lifecycle tests using createTestIndexer() with simulated events —
 * no network access. Tokens are preset (so PairCreated's metadata effect
 * never fires), then the full mint → sync → swap → burn lifecycle is
 * replayed through the real handlers, including the subgraph's staged
 * Transfer bookkeeping (initial-liquidity lock skip, needsComplete burns,
 * fee-mint extraction) and the bundle/derivedETH pricing flow.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestIndexer, type TestIndexer } from "envio";
import {
  CHAIN_ID,
  USDC,
  WETH,
  FACTORY_ID,
  BUNDLE_ID,
  PAIR_ID,
  USDC_ID,
  WETH_ID,
  USDC_WETH_PAIR,
  TIMESTAMP,
  BLOCK_NUMBER,
  TX_FROM,
  LP_USER,
  makeToken,
} from "./helpers";

const ZERO = "0x0000000000000000000000000000000000000000";
const txHash = (n: number) =>
  `0x${n.toString(16).padStart(64, "0")}`;

const USDC_RESERVE = 2000000n * 10n ** 6n; // 2,000,000 USDC
const WETH_RESERVE = 500n * 10n ** 18n; // 500 WETH
const LP_MINTED = 500n * 10n ** 18n;

async function presetAndCreatePair(indexer: TestIndexer) {
  // tokens preset so the metadata effect never fires; the factory is NOT
  // preset — PairCreated must create it (and the Bundle) itself
  indexer.Token.set(makeToken(USDC_ID, "USDC", "USD Coin", 6n));
  indexer.Token.set(makeToken(WETH_ID, "WETH", "Wrapped Ether", 18n));
  await indexer.process({
    chains: {
      [CHAIN_ID]: {
        simulate: [
          {
            contract: "Factory",
            event: "PairCreated",
            block: { number: BLOCK_NUMBER - 1, timestamp: TIMESTAMP - 12 },
            params: {
              token0: USDC,
              token1: WETH,
              pair: USDC_WETH_PAIR,
              _3: 1n,
            },
          },
        ],
      },
    },
  });
}

/** First mint: lock transfer (skipped) + LP transfer + Sync + Mint, one tx. */
async function processFirstMint(indexer: TestIndexer) {
  const tx = { hash: txHash(1), from: TX_FROM };
  const block = { number: BLOCK_NUMBER, timestamp: TIMESTAMP };
  return indexer.process({
    chains: {
      [CHAIN_ID]: {
        simulate: [
          {
            contract: "Pair",
            event: "Transfer",
            srcAddress: USDC_WETH_PAIR,
            block,
            transaction: tx,
            params: { from: ZERO, to: ZERO, value: 1000n }, // minimum-liquidity lock
          },
          {
            contract: "Pair",
            event: "Transfer",
            srcAddress: USDC_WETH_PAIR,
            block,
            transaction: tx,
            params: { from: ZERO, to: LP_USER, value: LP_MINTED },
          },
          {
            contract: "Pair",
            event: "Sync",
            srcAddress: USDC_WETH_PAIR,
            block,
            params: { reserve0: USDC_RESERVE, reserve1: WETH_RESERVE },
          },
          {
            contract: "Pair",
            event: "Mint",
            srcAddress: USDC_WETH_PAIR,
            block,
            transaction: tx,
            params: {
              sender: TX_FROM,
              amount0: USDC_RESERVE,
              amount1: WETH_RESERVE,
            },
          },
        ],
      },
    },
  });
}

/** A later sync in its own block — lets USDC pricing bootstrap. */
async function processSecondSync(indexer: TestIndexer) {
  return indexer.process({
    chains: {
      [CHAIN_ID]: {
        simulate: [
          {
            contract: "Pair",
            event: "Sync",
            srcAddress: USDC_WETH_PAIR,
            block: { number: BLOCK_NUMBER + 1, timestamp: TIMESTAMP + 12 },
            params: { reserve0: USDC_RESERVE, reserve1: WETH_RESERVE },
          },
        ],
      },
    },
  });
}

describe("PairCreated handler", () => {
  it("creates factory, bundle, pair and both lookup directions", async () => {
    const indexer = createTestIndexer();
    await presetAndCreatePair(indexer);

    const factory = await indexer.UniswapFactory.getOrThrow(FACTORY_ID);
    expect(factory.pairCount).toBe(1);

    const bundle = await indexer.Bundle.getOrThrow(BUNDLE_ID);
    expect(bundle.ethPrice.isZero()).toBe(true);

    const pair = await indexer.Pair.getOrThrow(PAIR_ID);
    expect(pair.token0_id).toBe(USDC_ID);
    expect(pair.token1_id).toBe(WETH_ID);
    expect(pair.totalSupply.isZero()).toBe(true);

    const lookup0 = await indexer.PairTokenLookup.getOrThrow(
      `${CHAIN_ID}-${USDC}-${WETH}`
    );
    expect(lookup0.pair_id).toBe(PAIR_ID);
    const lookup1 = await indexer.PairTokenLookup.getOrThrow(
      `${CHAIN_ID}-${WETH}-${USDC}`
    );
    expect(lookup1.pair_id).toBe(PAIR_ID);
  });
});

describe("Transfer + Mint + Sync lifecycle", () => {
  let indexer: TestIndexer;
  beforeEach(async () => {
    indexer = createTestIndexer();
    await presetAndCreatePair(indexer);
    await processFirstMint(indexer);
  });

  it("skips the minimum-liquidity lock and tracks totalSupply", async () => {
    const pair = await indexer.Pair.getOrThrow(PAIR_ID);
    // only the 500 LP mint counts — the 1000-wei lock transfer is ignored
    expect(pair.totalSupply.toString()).toBe("500");
  });

  it("stages the mint on Transfer and completes it on the Mint event", async () => {
    const transaction = await indexer.Transaction.getOrThrow(
      `${CHAIN_ID}-${txHash(1)}`
    );
    expect(transaction.mints).toHaveLength(1);

    const mint = await indexer.Mint.getOrThrow(transaction.mints[0]!);
    expect(mint.to).toBe(LP_USER);
    expect(mint.liquidity.toString()).toBe("500");
    // completed by handleMint
    expect(mint.sender).toBe(TX_FROM);
    expect(mint.amount0?.toString()).toBe("2000000");
    expect(mint.amount1?.toString()).toBe("500");
    // sync ran before the Mint event → WETH side priced at $4,000
    expect(mint.amountUSD?.toString()).toBe("2000000");
  });

  it("creates User entities for transfer parties", async () => {
    expect(await indexer.User.get(`${CHAIN_ID}-${LP_USER}`)).toBeDefined();
    expect(await indexer.User.get(`${CHAIN_ID}-${ZERO}`)).toBeDefined();
  });

  it("prices the bundle from the stable pair on Sync", async () => {
    const pair = await indexer.Pair.getOrThrow(PAIR_ID);
    expect(pair.reserve0.toString()).toBe("2000000");
    expect(pair.reserve1.toString()).toBe("500");
    expect(pair.token0Price.toString()).toBe("4000");

    const bundle = await indexer.Bundle.getOrThrow(BUNDLE_ID);
    expect(bundle.ethPrice.toString()).toBe("4000");

    const wethToken = await indexer.Token.getOrThrow(WETH_ID);
    expect(wethToken.derivedETH.toString()).toBe("1");
    // bootstrap: the first sync still sees the stored reserveETH of 0, so
    // USDC prices on the NEXT sync (subgraph parity)
    const usdcToken = await indexer.Token.getOrThrow(USDC_ID);
    expect(usdcToken.derivedETH.isZero()).toBe(true);

    await processSecondSync(indexer);
    const usdcAfter = await indexer.Token.getOrThrow(USDC_ID);
    expect(usdcAfter.derivedETH.toString()).toBe("0.00025");

    const pairAfter = await indexer.Pair.getOrThrow(PAIR_ID);
    expect(pairAfter.reserveETH.toString()).toBe("1000");
    expect(pairAfter.reserveUSD.toString()).toBe("4000000");
    expect(pairAfter.trackedReserveETH.toString()).toBe("1000");

    const factory = await indexer.UniswapFactory.getOrThrow(FACTORY_ID);
    expect(factory.totalLiquidityETH.toString()).toBe("1000");
    expect(factory.totalLiquidityUSD.toString()).toBe("4000000");
  });
});

describe("Swap handler", () => {
  let indexer: TestIndexer;
  beforeEach(async () => {
    indexer = createTestIndexer();
    await presetAndCreatePair(indexer);
    await processFirstMint(indexer);
    await processSecondSync(indexer);
  });

  it("tracks volume once and derives USD values (regression: volume was double-counted)", async () => {
    // 4,000 USDC in → ~1 WETH out
    await indexer.process({
      chains: {
        [CHAIN_ID]: {
          simulate: [
            {
              contract: "Pair",
              event: "Swap",
              srcAddress: USDC_WETH_PAIR,
              block: { number: BLOCK_NUMBER + 2, timestamp: TIMESTAMP + 24 },
              transaction: { hash: txHash(2), from: TX_FROM },
              params: {
                sender: TX_FROM,
                amount0In: 4000n * 10n ** 6n,
                amount1In: 0n,
                amount0Out: 0n,
                amount1Out: 1n * 10n ** 18n,
                to: LP_USER,
              },
            },
          ],
        },
      },
    });

    const transaction = await indexer.Transaction.getOrThrow(
      `${CHAIN_ID}-${txHash(2)}`
    );
    expect(transaction.swaps).toHaveLength(1);

    const swap = await indexer.Swap.getOrThrow(transaction.swaps[0]!);
    // both sides whitelisted → tracked = ($4,000 + $4,000)/2
    expect(swap.amountUSD.toString()).toBe("4000");
    expect(swap.from).toBe(TX_FROM); // event.transaction.from, not the sender alias
    expect(swap.to).toBe(LP_USER);
    expect(swap.amount0In.toString()).toBe("4000");
    expect(swap.amount1Out.toString()).toBe("1");

    const pair = await indexer.Pair.getOrThrow(PAIR_ID);
    // exactly once — the old port double-counted these
    expect(pair.volumeUSD.toString()).toBe("4000");
    expect(pair.untrackedVolumeUSD.toString()).toBe("4000");
    expect(pair.volumeToken0.toString()).toBe("4000");
    expect(pair.volumeToken1.toString()).toBe("1");

    const factory = await indexer.UniswapFactory.getOrThrow(FACTORY_ID);
    expect(factory.totalVolumeUSD.toString()).toBe("4000");
    expect(factory.totalVolumeETH.toString()).toBe("1");

    // day data
    const dayID = Math.floor((TIMESTAMP + 24) / 86400);
    const uniswapDayData = await indexer.UniswapDayData.getOrThrow(
      `${CHAIN_ID}-${dayID}`
    );
    expect(uniswapDayData.dailyVolumeUSD.toString()).toBe("4000");
    // vestigial in the subgraph — must NOT accumulate
    expect(uniswapDayData.totalVolumeUSD.isZero()).toBe(true);

    const pairDayData = await indexer.PairDayData.getOrThrow(
      `${PAIR_ID}-${dayID}`
    );
    expect(pairDayData.dailyVolumeUSD.toString()).toBe("4000");

    const tokenDayData = await indexer.TokenDayData.getOrThrow(
      `${WETH_ID}-${dayID}`
    );
    expect(tokenDayData.dailyVolumeToken.toString()).toBe("1");
    expect(tokenDayData.priceUSD.toString()).toBe("4000");
  });

  it("gives every swap in a transaction its own id (regression: ids were hardcoded -0)", async () => {
    const tx = { hash: txHash(3), from: TX_FROM };
    const block = { number: BLOCK_NUMBER + 2, timestamp: TIMESTAMP + 24 };
    const swapParams = {
      sender: TX_FROM,
      amount0In: 400n * 10n ** 6n,
      amount1In: 0n,
      amount0Out: 0n,
      amount1Out: 1n * 10n ** 17n,
      to: LP_USER,
    };
    await indexer.process({
      chains: {
        [CHAIN_ID]: {
          simulate: [
            {
              contract: "Pair",
              event: "Swap",
              srcAddress: USDC_WETH_PAIR,
              block,
              transaction: tx,
              params: swapParams,
            },
            {
              contract: "Pair",
              event: "Swap",
              srcAddress: USDC_WETH_PAIR,
              block,
              transaction: tx,
              params: swapParams,
            },
          ],
        },
      },
    });

    const transaction = await indexer.Transaction.getOrThrow(
      `${CHAIN_ID}-${txHash(3)}`
    );
    expect(transaction.swaps).toHaveLength(2);
    expect(new Set(transaction.swaps).size).toBe(2);

    const swaps = await indexer.Swap.getAll();
    expect(swaps).toHaveLength(2);
  });
});

describe("Burn lifecycle", () => {
  let indexer: TestIndexer;
  beforeEach(async () => {
    indexer = createTestIndexer();
    await presetAndCreatePair(indexer);
    await processFirstMint(indexer);
    await processSecondSync(indexer);
  });

  it("stages via direct send, decrements supply and completes on Burn", async () => {
    const tx = { hash: txHash(4), from: TX_FROM };
    const block = { number: BLOCK_NUMBER + 3, timestamp: TIMESTAMP + 36 };
    const burned = 100n * 10n ** 18n;
    await indexer.process({
      chains: {
        [CHAIN_ID]: {
          simulate: [
            // LP sends liquidity tokens to the pair
            {
              contract: "Pair",
              event: "Transfer",
              srcAddress: USDC_WETH_PAIR,
              block,
              transaction: tx,
              params: { from: LP_USER, to: USDC_WETH_PAIR, value: burned },
            },
            // pair burns them
            {
              contract: "Pair",
              event: "Transfer",
              srcAddress: USDC_WETH_PAIR,
              block,
              transaction: tx,
              params: { from: USDC_WETH_PAIR, to: ZERO, value: burned },
            },
            {
              contract: "Pair",
              event: "Burn",
              srcAddress: USDC_WETH_PAIR,
              block,
              transaction: tx,
              params: {
                sender: TX_FROM,
                amount0: 400000n * 10n ** 6n, // 400,000 USDC out
                amount1: 100n * 10n ** 18n, // 100 WETH out
                to: LP_USER,
              },
            },
          ],
        },
      },
    });

    const pair = await indexer.Pair.getOrThrow(PAIR_ID);
    expect(pair.totalSupply.toString()).toBe("400"); // 500 - 100

    const transaction = await indexer.Transaction.getOrThrow(
      `${CHAIN_ID}-${txHash(4)}`
    );
    expect(transaction.burns).toHaveLength(1);

    const burn = await indexer.Burn.getOrThrow(transaction.burns[0]!);
    expect(burn.liquidity.toString()).toBe("100");
    expect(burn.sender).toBe(LP_USER); // set by the staging transfer
    expect(burn.to).toBe(USDC_WETH_PAIR);
    expect(burn.needsComplete).toBe(true); // subgraph parity: stays true on the reused burn
    expect(burn.amount0?.toString()).toBe("400000");
    expect(burn.amount1?.toString()).toBe("100");
    // (400,000 × 0.00025 + 100 × 1) × 4000 = $800,000
    expect(burn.amountUSD?.toString()).toBe("800000");
    expect(burn.feeTo).toBeUndefined();
  });

  it("extracts the fee mint into the burn (subgraph fee-mint bookkeeping)", async () => {
    const tx = { hash: txHash(5), from: TX_FROM };
    const block = { number: BLOCK_NUMBER + 3, timestamp: TIMESTAMP + 36 };
    const feeTo = "0xf00d000000000000000000000000000000000001";
    const feeLiquidity = 5n * 10n ** 18n;
    const burned = 50n * 10n ** 18n;
    await indexer.process({
      chains: {
        [CHAIN_ID]: {
          simulate: [
            // protocol fee mint (looks like a mint, is actually fees)
            {
              contract: "Pair",
              event: "Transfer",
              srcAddress: USDC_WETH_PAIR,
              block,
              transaction: tx,
              params: { from: ZERO, to: feeTo, value: feeLiquidity },
            },
            // LP sends liquidity to the pair
            {
              contract: "Pair",
              event: "Transfer",
              srcAddress: USDC_WETH_PAIR,
              block,
              transaction: tx,
              params: { from: LP_USER, to: USDC_WETH_PAIR, value: burned },
            },
            // pair burns it
            {
              contract: "Pair",
              event: "Transfer",
              srcAddress: USDC_WETH_PAIR,
              block,
              transaction: tx,
              params: { from: USDC_WETH_PAIR, to: ZERO, value: burned },
            },
            {
              contract: "Pair",
              event: "Burn",
              srcAddress: USDC_WETH_PAIR,
              block,
              transaction: tx,
              params: {
                sender: TX_FROM,
                amount0: 200000n * 10n ** 6n,
                amount1: 50n * 10n ** 18n,
                to: LP_USER,
              },
            },
          ],
        },
      },
    });

    const transaction = await indexer.Transaction.getOrThrow(
      `${CHAIN_ID}-${txHash(5)}`
    );
    // the fee mint was removed from the transaction
    expect(transaction.mints).toHaveLength(0);
    expect(transaction.burns).toHaveLength(1);

    const burn = await indexer.Burn.getOrThrow(transaction.burns[0]!);
    expect(burn.feeTo).toBe(feeTo);
    expect(burn.feeLiquidity?.toString()).toBe("5");

    // the staged fee Mint entity is gone
    const mints = await indexer.Mint.getAll();
    const feeMints = mints.filter((m) => m.transaction_id === transaction.id);
    expect(feeMints).toHaveLength(0);

    // totalSupply: +5 (fee mint) - 50 (burn) relative to 500
    const pair = await indexer.Pair.getOrThrow(PAIR_ID);
    expect(pair.totalSupply.toString()).toBe("455");
  });
});

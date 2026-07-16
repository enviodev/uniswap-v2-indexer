import { describe, it, expect } from "vitest";
import { BigDecimal } from "envio";
import {
  getEthPriceInUSD,
  findEthPerToken,
  getTrackedVolumeUSD,
  getTrackedLiquidityUSD,
  MAX_PRICING_PAIR_VALUE_IMBALANCE,
} from "../src/handlers/utils/pricing";
import {
  CHAIN_ID,
  USDC,
  WETH,
  DAI,
  USDC_ID,
  WETH_ID,
  USDC_WETH_PAIR,
  DAI_WETH_PAIR,
  PAIR_ID,
  makeToken,
  makePair,
  makeBundle,
  makeMockContext,
  bd,
} from "./helpers";

const usdc = () => makeToken(USDC_ID, "USDC", "USD Coin", 6n);
const weth = () =>
  makeToken(WETH_ID, "WETH", "Wrapped Ether", 18n, { derivedETH: bd(1) });

describe("getEthPriceInUSD", () => {
  it("returns 0 before any stable pair exists", async () => {
    const context = makeMockContext({});
    const price = await getEthPriceInUSD(context, CHAIN_ID);
    expect(price.isZero()).toBe(true);
  });

  it("prices from a single live stable pair", async () => {
    // USDC/WETH: reserve0 = 2,000,000 USDC, reserve1 = 500 WETH → $4,000
    const pair = makePair({
      reserve0: bd("2000000"),
      reserve1: bd("500"),
      token0Price: bd("4000"), // reserve0/reserve1
      token1Price: bd("0.00025"),
    });
    const context = makeMockContext({ Pair: [pair] });
    const price = await getEthPriceInUSD(context, CHAIN_ID);
    expect(price.toString()).toBe("4000");
  });

  it("liquidity-weights multiple stable pairs (subgraph weighting)", async () => {
    // USDC/WETH: 300 WETH at $4,000 | DAI/WETH: 100 WETH at $4,080
    // weighted: 4000×(300/400) + 4080×(100/400) = 3000 + 1020 = 4020
    const usdcPair = makePair({
      reserve0: bd("1200000"),
      reserve1: bd("300"),
      token0Price: bd("4000"),
      token1Price: bd("0.00025"),
    });
    const daiPair = makePair({
      id: `${CHAIN_ID}-${DAI_WETH_PAIR}`,
      token0_id: `${CHAIN_ID}-${DAI}`,
      token1_id: WETH_ID,
      reserve0: bd("408000"),
      reserve1: bd("100"),
      token0Price: bd("4080"),
      token1Price: bd("0.000245098"),
    });
    const context = makeMockContext({ Pair: [usdcPair, daiPair] });
    const price = await getEthPriceInUSD(context, CHAIN_ID);
    expect(price.toString()).toBe("4020");
  });
});

describe("findEthPerToken", () => {
  const bundle = makeBundle(bd("4000"));

  it("prices the reference token at 1", async () => {
    const context = makeMockContext({});
    const price = await findEthPerToken(context, weth(), bundle, CHAIN_ID);
    expect(price.toString()).toBe("1");
  });

  it("prices non-reference tokens through their whitelist pair lookup", async () => {
    // mainnet STABLECOINS is EMPTY (subgraph parity) — USDC prices via its
    // WETH pair like any other token
    const pair = makePair({
      reserve0: bd("2000000"),
      reserve1: bd("500"),
      token0Price: bd("4000"),
      token1Price: bd("0.00025"),
      reserveETH: bd("1000"), // above the 2 ETH threshold
    });
    const context = makeMockContext({
      Pair: [pair],
      Token: [weth()],
      PairTokenLookup: [
        { id: `${CHAIN_ID}-${USDC}-${WETH}`, pair_id: PAIR_ID },
      ],
    });
    const price = await findEthPerToken(context, usdc(), bundle, CHAIN_ID);
    // token1 per our token × ETH per token1 = 0.00025 × 1
    expect(price.toString()).toBe("0.00025");
  });

  it("rejects pairs below the reserveETH threshold", async () => {
    const pair = makePair({
      reserve0: bd("4000"),
      reserve1: bd("1"),
      token0Price: bd("4000"),
      token1Price: bd("0.00025"),
      reserveETH: bd("1.5"), // below mainnet's 2 ETH threshold
    });
    const context = makeMockContext({
      Pair: [pair],
      Token: [weth()],
      PairTokenLookup: [
        { id: `${CHAIN_ID}-${USDC}-${WETH}`, pair_id: PAIR_ID },
      ],
    });
    const price = await findEthPerToken(context, usdc(), bundle, CHAIN_ID);
    expect(price.isZero()).toBe(true);
  });

  it("returns 0 when no whitelist pair exists", async () => {
    const junk = makeToken(`${CHAIN_ID}-0x01`, "JUNK", "Junk", 18n);
    const context = makeMockContext({});
    const price = await findEthPerToken(context, junk, bundle, CHAIN_ID);
    expect(price.isZero()).toBe(true);
  });

  describe("imbalance guard (deliberate deviation from the subgraph)", () => {
    it("rejects poison-and-park: 2+ ETH parked against a free-minted supply", async () => {
      const junkAddress = "0xbbbe40e7ae6e22aad49d6a7c9389ef25714be179";
      const junk = makeToken(`${CHAIN_ID}-${junkAddress}`, "junk", "junk", 18n);
      // 3 WETH (clears the 2 ETH gate) vs 1.3e9 tokens "worth" 1 ETH each
      const pool = makePair({
        id: `${CHAIN_ID}-0xdead`,
        token0_id: WETH_ID,
        token1_id: junk.id,
        reserve0: bd("3"),
        reserve1: bd("1300000000"),
        token0Price: bd("1"), // junk priced at exactly 1 ETH
        token1Price: bd("433333333"),
        reserveETH: bd("3"),
      });
      const context = makeMockContext({
        Pair: [pool],
        Token: [weth()],
        PairTokenLookup: [
          { id: `${CHAIN_ID}-${junkAddress}-${WETH}`, pair_id: pool.id },
        ],
      });
      const price = await findEthPerToken(context, junk, bundle, CHAIN_ID);
      expect(price.isZero()).toBe(true);
      expect(MAX_PRICING_PAIR_VALUE_IMBALANCE.toString()).toBe("1000");
    });

    it("accepts a balanced legit pair", async () => {
      const tokenAddress = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
      const pepe = makeToken(`${CHAIN_ID}-${tokenAddress}`, "PEPE", "Pepe", 18n);
      const pool = makePair({
        id: `${CHAIN_ID}-0xbeef`,
        token0_id: WETH_ID,
        token1_id: pepe.id,
        reserve0: bd("500"),
        reserve1: bd("85000000000"),
        token0Price: bd("5.88e-9"),
        token1Price: bd("170000000"),
        reserveETH: bd("1000"),
      });
      const context = makeMockContext({
        Pair: [pool],
        Token: [weth()],
        PairTokenLookup: [
          { id: `${CHAIN_ID}-${tokenAddress}-${WETH}`, pair_id: pool.id },
        ],
      });
      const price = await findEthPerToken(context, pepe, bundle, CHAIN_ID);
      expect(price.toString()).toBe("5.88e-9");
    });
  });
});

describe("getTrackedVolumeUSD", () => {
  const bundle = makeBundle(bd("4000"));
  const pricedUsdc = () => ({ ...usdc(), derivedETH: bd("0.00025") });

  // liquidityProviderCount is permanently 0 (subgraph no longer tracks
  // liquidity positions), so the <5 LP minimum-reserve check ALWAYS applies
  it("returns 0 for a thin both-whitelisted pair below the reserve threshold", () => {
    const pair = makePair({
      reserve0: bd("100000"), // $100k + $100k < $400k mainnet threshold
      reserve1: bd("25"),
    });
    const tracked = getTrackedVolumeUSD(
      bundle,
      bd("1000"),
      pricedUsdc() as any,
      bd("0.25"),
      weth() as any,
      pair as any,
      CHAIN_ID
    );
    expect(tracked.isZero()).toBe(true);
  });

  it("averages both sides for a deep both-whitelisted pair", () => {
    const pair = makePair({
      reserve0: bd("2000000"), // $2M + $2M ≥ $400k
      reserve1: bd("500"),
    });
    const tracked = getTrackedVolumeUSD(
      bundle,
      bd("1000"), // $1000 of USDC
      pricedUsdc() as any,
      bd("0.25"), // $1000 of WETH
      weth() as any,
      pair as any,
      CHAIN_ID
    );
    expect(tracked.toString()).toBe("1000");
  });

  it("takes the full whitelisted side when only one token is whitelisted", () => {
    const junk = makeToken(`${CHAIN_ID}-0x02`, "J", "J", 18n, {
      derivedETH: bd("1"),
    });
    const pair = makePair({
      token1_id: junk.id,
      reserve0: bd("2000000"),
      reserve1: bd("125"),
    });
    const tracked = getTrackedVolumeUSD(
      bundle,
      bd("1000"),
      pricedUsdc() as any,
      bd("999"),
      junk as any,
      pair as any,
      CHAIN_ID
    );
    expect(tracked.toString()).toBe("1000");
  });

  it("returns 0 when neither token is whitelisted", () => {
    const junk0 = makeToken(`${CHAIN_ID}-0x03`, "A", "A", 18n, {
      derivedETH: bd("1"),
    });
    const junk1 = makeToken(`${CHAIN_ID}-0x04`, "B", "B", 18n, {
      derivedETH: bd("1"),
    });
    const tracked = getTrackedVolumeUSD(
      bundle,
      bd("5"),
      junk0 as any,
      bd("5"),
      junk1 as any,
      makePair() as any,
      CHAIN_ID
    );
    expect(tracked.isZero()).toBe(true);
  });
});

describe("getTrackedLiquidityUSD", () => {
  const bundle = makeBundle(bd("4000"));

  it("sums both sides when both whitelisted", () => {
    const tracked = getTrackedLiquidityUSD(
      bundle,
      bd("2000000"),
      { ...usdc(), derivedETH: bd("0.00025") } as any,
      bd("500"),
      weth() as any,
      CHAIN_ID
    );
    expect(tracked.toString()).toBe("4000000");
  });

  it("doubles the whitelisted side when only one is whitelisted", () => {
    const junk = makeToken(`${CHAIN_ID}-0x05`, "J", "J", 18n, {
      derivedETH: bd("7"),
    });
    const tracked = getTrackedLiquidityUSD(
      bundle,
      bd("500"),
      weth() as any,
      bd("12345"),
      junk as any,
      CHAIN_ID
    );
    expect(tracked.toString()).toBe("4000000");
  });
});

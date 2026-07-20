# Uniswap V2 Indexer

[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-7289da?logo=discord&logoColor=white)](https://discord.com/invite/envio)

A multichain Uniswap V2 subgraph migration built with [Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview). A 1:1 behavioral port of the [Uniswap V2 Subgraph](https://github.com/Uniswap/v2-subgraph) (`src/v2`) — same entities, same staged Transfer bookkeeping, same pricing algorithm — with multichain support in a single deployment.

## Events Indexed

From `Factory` and `Pair` contracts:

- `PairCreated` - new pair deployments
- `Transfer` - LP token movements (stages Mint/Burn entities, tracks pair totalSupply, extracts protocol fee mints)
- `Sync` - reserve updates (prices, derivedETH, tracked/untracked liquidity)
- `Mint` / `Burn` - liquidity add/remove completion
- `Swap` - swaps with tracked/untracked volume

## Active Chains

All chains supported by the Uniswap v2 subgraph that have a HyperSync instance, with the subgraph's exact per-chain constants (factory address, start block, stable token pairs, whitelist, thresholds, SKIP_TOTAL_SUPPLY, static token definitions):

Ethereum, Optimism, Arbitrum One, Base, Polygon, BSC, Avalanche, Blast, World Chain, Unichain, Soneium, Ink, Linea, Monad

> Subgraph chains without a proven HyperSync endpoint (Arc, MegaETH, Robinhood, Tempo, X Layer) are not enabled; add a chain block in `config.yaml` and a `CHAIN_CONFIGS` entry in `src/handlers/utils/chains.ts` once one exists.

## Notes on Migration from Subgraph

- All entity IDs that use EVM addresses are stored in lowercase and prefixed with the chain ID: `<chainId>-<address>`; `Bundle.id` is the chain ID
- `Transaction.mints/burns/swaps` are stored id arrays exactly like the subgraph (NOT `@derivedFrom`) — the staged mint/burn bookkeeping pops and replaces entries, which a derived relation cannot express
- Token metadata (symbol, name, decimals, totalSupply) is fetched over RPC via the [Effect API](https://docs.envio.dev/docs/HyperIndex/effect-api) with caching, replicating the subgraph's fallbacks: static definitions first, then string reads, then bytes32 variants; decimals are read as uint256 (like the subgraph's ERC20BigDecimals) and pairs whose token decimals are unreadable or > 255 are never indexed; `SKIP_TOTAL_SUPPLY` tokens skip the totalSupply read
- The `< 5 liquidity providers` minimum-reserve check on tracked volume applies to every pair permanently — the modern subgraph no longer tracks liquidity positions, so `liquidityProviderCount` stays 0 (parity)
- GraphQL query structure differs from The Graph. See the [query conversion guide](https://docs.envio.dev/docs/HyperIndex/query-conversion)

### Deliberate deviations from the subgraph

1. **Pricing imbalance guard** (`src/handlers/utils/pricing.ts`): a whitelist pair may only set a token's `derivedETH` when the value it implies for the token side is ≤ 1000× the pair's verifiable (whitelisted) side. Kills the poison-and-park junk pricing class. Ported from the v3/v4 indexers.
2. **Higher BigDecimal precision**: division keeps 77 decimal places (bignumber.js defaults to 20, which zeroes micro-prices); `sanitizeBD` caps stored price-source values at 40 decimal places for Postgres btree index safety.
3. **Interval snapshots see the in-flight event** — the subgraph's helpers re-load entities mid-handler and lag the triggering event by one update; these receive the handler's updated entities.
4. **Vestigial subgraph schema not ported**: `TokenHourData` (never written by the v2 mappings) and `UniswapDayData.totalVolumeUSD/ETH` stay 0 (never accumulated by the subgraph).

## Prerequisites

- [Node.js](https://nodejs.org/en/download/current) v22 or newer
- [pnpm](https://pnpm.io/installation) v8 or newer
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## Quick Start

```bash
# Copy environment template and set your HyperSync token + RPC URLs
cp template.env .env

# Install dependencies
pnpm install

# Run locally (starts indexer + GraphQL API at http://localhost:8080)
pnpm dev
```

The GraphQL Playground is available at [http://localhost:8080](http://localhost:8080). Local password: `testing`.

## Tests

```bash
pnpm test
```

- `test/*.test.ts` — offline unit + handler tests (weighted ETH pricing, tracked volume/liquidity whitelist matrix, the full PairCreated → Transfer → Mint → Sync → Swap → Burn lifecycle incl. fee-mint extraction, via `createTestIndexer()` with simulated events)
- `src/indexer.test.ts` — E2E replay of pinned mainnet history through HyperSync (requires `ENVIO_API_TOKEN` and RPC URLs in `.env`): the first v2 pair's creation, mint and swap

## Regenerate Files

```bash
pnpm codegen
```

## Sample Queries

```graphql
# Get ETH price
{
  Bundle {
    id
    ethPrice
  }
}
```

```graphql
# Top pairs by tracked reserve
{
  Pair(limit: 10, order_by: {reserveUSD: desc}) {
    id
    token0 { symbol }
    token1 { symbol }
    reserveUSD
    volumeUSD
  }
}
```

```graphql
# Pair day data
{
  PairDayData(limit: 7, order_by: {date: desc}, where: {id: {_like: "1-0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc%"}}) {
    date
    reserveUSD
    dailyVolumeUSD
    dailyTxns
  }
}
```

## Built With

- [Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview) - multichain indexing framework
- [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) - high-performance blockchain data retrieval
- Migrated from the [Uniswap V2 Subgraph](https://github.com/Uniswap/v2-subgraph)

## Documentation

- [HyperIndex Docs](https://docs.envio.dev/docs/HyperIndex/overview)
- [Subgraph to HyperIndex query conversion](https://docs.envio.dev/docs/HyperIndex/query-conversion)
- [Migrate from The Graph to Envio](https://docs.envio.dev/docs/HyperIndex/migration-guide)

## Support

- [Discord community](https://discord.com/invite/envio)
- [Envio Docs](https://docs.envio.dev)

import { BigDecimal } from "envio";
import { StaticTokenDefinition } from "./staticTokenDefinition";

// Chain IDs (all chains supported by the Uniswap v2 subgraph that have a
// HyperSync instance; see config.yaml for the matching network entries)
export enum ChainId {
  MAINNET = 1,
  OPTIMISM = 10,
  ARBITRUM_ONE = 42161,
  BASE = 8453,
  MATIC = 137,
  BSC = 56,
  AVALANCHE = 43114,
  BLAST = 81457,
  WORLDCHAIN = 480,
  UNICHAIN = 130,
  SONEIUM = 1868,
  INK = 57073,
  LINEA = 59144,
  MONAD = 143,
}

// Configuration interface for each chain — mirrors the constants each
// v2-subgraph config/<chain>/chain.ts exposes.
export interface ChainConfig {
  factoryAddress: string;
  // REFERENCE_TOKEN — the wrapped native token used as the pricing reference
  referenceTokenAddress: string;
  // STABLE_TOKEN_PAIRS — reference/stable pairs whose liquidity-weighted
  // average prices the native token in USD. The Arc-style convention of
  // including the reference token itself in the list means "native IS a USD
  // stable; price = 1".
  stableTokenPairs: string[];
  // WHITELIST — tokens that count towards tracked volume and liquidity
  whitelistTokens: string[];
  // STABLECOINS — priced at 1/ethPrice directly (empty on mainnet!)
  stablecoinAddresses: string[];
  // minimum reserve USD for pairs with < 5 LPs to count towards tracked volume
  minimumUsdThresholdNewPairs: BigDecimal;
  // minimum pair reserveETH for a pair to be used as a derivedETH price source
  minimumLiquidityThresholdEth: BigDecimal;
  // tokens whose totalSupply() reads are skipped (gas-guzzlers)
  skipTotalSupply: string[];
  tokenOverrides: StaticTokenDefinition[]; // STATIC_TOKEN_DEFINITIONS
}

// Chain-specific configurations, generated 1:1 from
// v2-subgraph/config/<chain>/chain.ts. All addresses lowercase.
export const CHAIN_CONFIGS: { [chainId: number]: ChainConfig } = {
  // ethereum (startblock 10000834)
  [ChainId.MAINNET]: {
    factoryAddress: "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f",
    referenceTokenAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    stableTokenPairs: [
      "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc", // created 10008355
      "0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852", // created block 10093341
      "0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa", // created block 10100541
    ],
    whitelistTokens: [
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
      "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
      "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
      "0x0000000000085d4780b73119b644ae5ecd22b376", // TUSD
      "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643", // cDAI
      "0x39aa39c021dfbae8fac545936693ac917d5e7563", // cUSDC
      "0x86fadb80d8d2cff3c3680819e4da99c10232ba0f", // EBASE
      "0x57ab1ec28d129707052df4df418d58a2d46d5f51", // sUSD
      "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", // MKR
      "0xc00e94cb662c3520282e6f5717214004a7f26888", // COMP
      "0x514910771af9ca656af840dff83e8264ecf986ca", // LINK
      "0x960b236a07cf122663c4303350609a66a7b288c0", // ANT
      "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f", // SNX
      "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e", // YFI
      "0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8", // yCurv
      "0x853d955acef822db058eb8505911ed77f175b99e", // FRAX
      "0xa47c8bf37f92abed4a126bda807a7b7498661acd", // WUST
      "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", // UNI
      "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
      "0x956f47f50a910163d8bf957cf5846d573e7f87ca", // FEI
    ],
    stablecoinAddresses: [],
    minimumUsdThresholdNewPairs: new BigDecimal("400000"),
    minimumLiquidityThresholdEth: new BigDecimal("2"),
    skipTotalSupply: [
      "0x0000000000bf2686748e1c0255036e7617e7e8a5",
    ],
    tokenOverrides: [
      {
        address: "0xe0b7927c4af23765cb51314a0e0521a9645f0e2a",
        symbol: "DGD",
        name: "DGD",
        decimals: BigInt(9),
      },
      {
        address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
        symbol: "AAVE",
        name: "Aave Token",
        decimals: BigInt(18),
      },
      {
        address: "0xeb9951021698b42e4399f9cbb6267aa35f82d59d",
        symbol: "LIF",
        name: "Lif",
        decimals: BigInt(18),
      },
      {
        address: "0xbdeb4b83251fb146687fa19d1c660f99411eefe3",
        symbol: "SVD",
        name: "savedroid",
        decimals: BigInt(18),
      },
      {
        address: "0xbb9bc244d798123fde783fcc1c72d3bb8c189413",
        symbol: "TheDAO",
        name: "TheDAO",
        decimals: BigInt(16),
      },
      {
        address: "0x38c6a68304cdefb9bec48bbfaaba5c5b47818bb2",
        symbol: "HPB",
        name: "HPBCoin",
        decimals: BigInt(18),
      },
    ],
  },
  // optimism (startblock 112197986)
  [ChainId.OPTIMISM]: {
    factoryAddress: "0x0c3c1c532f1e39edf36be9fe0be1410313e074bf",
    referenceTokenAddress: "0x4200000000000000000000000000000000000006",
    stableTokenPairs: [
      "0x4c43646304492a925e335f2b6d840c1489f17815",
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC
    ],
    stablecoinAddresses: [
      "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("10000"),
    minimumLiquidityThresholdEth: new BigDecimal("1"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // arbitrum-one (startblock 150442611)
  [ChainId.ARBITRUM_ONE]: {
    factoryAddress: "0xf1d7cc64fb4452f05c498126312ebe29f30fbcf9",
    referenceTokenAddress: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    stableTokenPairs: [
      "0xf64dfe17c8b87f012fcf50fbda1d62bfa148366a",
    ],
    whitelistTokens: [
      "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
      "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC
    ],
    stablecoinAddresses: [
      "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("10000"),
    minimumLiquidityThresholdEth: new BigDecimal("1"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // base (startblock 6601915)
  [ChainId.BASE]: {
    factoryAddress: "0x8909dc15e40173ff4699343b6eb8132c65e18ec6",
    referenceTokenAddress: "0x4200000000000000000000000000000000000006",
    stableTokenPairs: [
      "0x88a43bbdf9d098eec7bceda4e2494615dfd9bb9c",
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
      "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbCC
      "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b", // VIRTUAL
    ],
    stablecoinAddresses: [
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
      "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("10000"),
    minimumLiquidityThresholdEth: new BigDecimal("1"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // matic (startblock 49948178)
  [ChainId.MATIC]: {
    factoryAddress: "0x9e5a52f57b3038f1b8eee45f28b3c1967e22799c",
    referenceTokenAddress: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    stableTokenPairs: [
      "0x1f0c5400a3c7e357cc7c9a3d2f7fe6ddf629d868",
    ],
    whitelistTokens: [
      "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WETH
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC
    ],
    stablecoinAddresses: [
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("10000"),
    minimumLiquidityThresholdEth: new BigDecimal("1"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // bsc (startblock 33496018)
  [ChainId.BSC]: {
    factoryAddress: "0x8909dc15e40173ff4699343b6eb8132c65e18ec6",
    referenceTokenAddress: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    stableTokenPairs: [
      "0x8a1ed8e124fdfbd534bf48baf732e26db9cc0cf4",
    ],
    whitelistTokens: [
      "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // Wrapped BNB
      "0x55d398326f99059ff775485246999027b3197955", // BSC USD
    ],
    stablecoinAddresses: [
      "0x55d398326f99059ff775485246999027b3197955", // BSC USD
      "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("10000"),
    minimumLiquidityThresholdEth: new BigDecimal("1"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // avalanche (startblock 37767795)
  [ChainId.AVALANCHE]: {
    factoryAddress: "0x9e5a52f57b3038f1b8eee45f28b3c1967e22799c",
    referenceTokenAddress: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
    stableTokenPairs: [
      "0x6239ae4d661379b71a90c4c79f0a95297342e391",
    ],
    whitelistTokens: [
      "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", // WAVAX
      "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC
    ],
    stablecoinAddresses: [
      "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("10000"),
    minimumLiquidityThresholdEth: new BigDecimal("1"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // blast-mainnet (startblock 399405)
  [ChainId.BLAST]: {
    factoryAddress: "0x5c346464d33f90babaf70db6388507cc889c1070",
    referenceTokenAddress: "0x4300000000000000000000000000000000000004",
    stableTokenPairs: [
      "0xad06cd451fe4034a6dd515af08e222a3d95b4a1c",
    ],
    whitelistTokens: [
      "0x4300000000000000000000000000000000000004", // WETH
      "0x4300000000000000000000000000000000000003", // USDB
    ],
    stablecoinAddresses: [
      "0x4300000000000000000000000000000000000003", // USDB
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("10000"),
    minimumLiquidityThresholdEth: new BigDecimal("1"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // worldchain-mainnet (startblock 4063439)
  [ChainId.WORLDCHAIN]: {
    factoryAddress: "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f",
    referenceTokenAddress: "0x4200000000000000000000000000000000000006",
    stableTokenPairs: [
      "0x5a5189307eae50b0ef16eff3812b798091a4dd52",
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0x79a02482a880bce3f13e09da970dc34db4cd24d1", // USDCE
      "0x03c7054bcb39f7b2e5b2c7acb37583e32d70cfa3", // WBTC
      "0x2cfc85d8e48f8eab294be644d9e25c3030863003", // WLD
      "0x859dbe24b90c9f2f7742083d3cf59ca41f55be5d", // SDAI
    ],
    stablecoinAddresses: [
      "0x79a02482a880bce3f13e09da970dc34db4cd24d1", // USDCE
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("40000"),
    minimumLiquidityThresholdEth: new BigDecimal("2"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // unichain-mainnet (startblock 0)
  [ChainId.UNICHAIN]: {
    factoryAddress: "0x1f98400000000000000000000000000000000002",
    referenceTokenAddress: "0x4200000000000000000000000000000000000006",
    stableTokenPairs: [
      "0x8cbf356ecf5ae7035583543479996250178527f4",
    ],
    whitelistTokens: [
      "0x20cab320a855b39f724131c69424240519573f81", // dai
      "0x4200000000000000000000000000000000000006", // weth
      "0x8f187aa05619a017077f5308904739877ce9ea21", // uniswa
    ],
    stablecoinAddresses: [
      "0x20cab320a855b39f724131c69424240519573f81", // dai
      "0x078d782b760474a361dda0af3839290b0ef57ad6", // usd
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("10000"),
    minimumLiquidityThresholdEth: new BigDecimal("1"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // soneium-mainnet (startblock 3254733)
  [ChainId.SONEIUM]: {
    factoryAddress: "0x97febbc2adbd5644ba22736e962564b23f5828ce",
    referenceTokenAddress: "0x4200000000000000000000000000000000000006",
    stableTokenPairs: [
      "0x50791d0846438124d630b5095c2a3ce95252a46b",
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0xba9986d2381edf1da03b0b9c1f8b00dc4aacc369", // bridged USDC
    ],
    stablecoinAddresses: [
      "0xba9986d2381edf1da03b0b9c1f8b00dc4aacc369", // bridged USDC
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("10000"),
    minimumLiquidityThresholdEth: new BigDecimal("1"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // ink (startblock 524511)
  [ChainId.INK]: {
    factoryAddress: "0xfe57a6ba1951f69ae2ed4abe23e0f095df500c04",
    referenceTokenAddress: "0x4200000000000000000000000000000000000006",
    stableTokenPairs: [
      "0xfa3a9015e5fd82485835e23260bc98adadca8a01", // WETH_USDCE
    ],
    whitelistTokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0xf1815bd50389c46847f0bda824ec8da914045d14", // USDCE
      "0x0200c29006150606b650577bbe7b6248f58470c1", // USDT0
    ],
    stablecoinAddresses: [
      "0xf1815bd50389c46847f0bda824ec8da914045d14", // USDCE
      "0x0200c29006150606b650577bbe7b6248f58470c1", // USDT0
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("40000"),
    minimumLiquidityThresholdEth: new BigDecimal("1"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // linea (startblock 29118440)
  [ChainId.LINEA]: {
    factoryAddress: "0x114a43df6c5f54ebb8a9d70cd1951d3dd68004c7",
    referenceTokenAddress: "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f",
    stableTokenPairs: [
      "0x85e140a505ac30857fcf7d082b6dac3ee14da396", // USDC_WETH
    ],
    whitelistTokens: [
      "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f", // WETH
      "0x176211869ca2b568f2a7d4ee941e073a821ee1ff", // USDC
      "0xaca92e438df0b2401ff60da7e4337b687a2435da", // MUSD
      "0xa219439258ca9da29e9cc4ce5596924745e12b93", // USDT
      "0x1789e0043623282d5dcc7f213d703c6d8bafbb04", // LINEA
      "0x3aab2285ddcddad8edf438c1bab47e1a9d05a9b4", // WBTC
      "0xe4eeb461ad1e4ef8b8ef71a33694ccd84af051c4", // REX33
      "0xb5bedd42000b71fdde22d3ee8a79bd49a568fc8f", // WSTETH
      "0x2416092f143378750bb29b79ed961ab195cceea5", // EZETH
      "0x1bf74c010e6320bab11e2e5a532b5ac15e0b8aa6", // WEETH
      "0x79a02482a880bce3f13e09da970dc34db4cd24d1", // USDCE
    ],
    stablecoinAddresses: [
      "0x176211869ca2b568f2a7d4ee941e073a821ee1ff", // USDC
      "0xa219439258ca9da29e9cc4ce5596924745e12b93", // USDT
      "0xaca92e438df0b2401ff60da7e4337b687a2435da", // MUSD
      "0x79a02482a880bce3f13e09da970dc34db4cd24d1", // USDCE
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("40000"),
    minimumLiquidityThresholdEth: new BigDecimal("1"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
  // monad (startblock 29255814)
  [ChainId.MONAD]: {
    factoryAddress: "0x182a927119d56008d921126764bf884221b10f59",
    referenceTokenAddress: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a",
    stableTokenPairs: [
      "0x3fe12728ea1b89e4bac6e59a9130b61a27d032f8",
    ],
    whitelistTokens: [
      "0x3bd359c1119da7da1d913d1c4d2b7c461115433a", // WMON
      "0x754704bc059f8c67012fed69bc8a327a5aafb603", // USDC
      "0x00000000efe302beaa2b3e6e1b18d08d69a9012a", // AUSD
      "0xe7cd86e13ac4309349f30b3435a9d337750fc82d", // USDT
      "0xee8c0e9f1bffb4eb878d8f15f368a02a35481242", // WETH
      "0xea17e5a9efebf1477db45082d67010e2245217f1", // WSOL
    ],
    stablecoinAddresses: [
      "0x754704bc059f8c67012fed69bc8a327a5aafb603", // USDC
      "0x00000000efe302beaa2b3e6e1b18d08d69a9012a", // AUSD
      "0xe7cd86e13ac4309349f30b3435a9d337750fc82d", // USDT
    ],
    minimumUsdThresholdNewPairs: new BigDecimal("10000"),
    minimumLiquidityThresholdEth: new BigDecimal("100000"),
    skipTotalSupply: [],
    tokenOverrides: [],
  },
};

// Helper function to get chain config by chainId
export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`No configuration found for chain ID ${chainId}`);
  }
  return config;
}

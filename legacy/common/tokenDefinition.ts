// Token definition functions from original subgraph
// Reference: original-subgraph/src/common/tokenDefinition.ts

export interface TokenDefinition {
  address: string;
  symbol: string;
  name: string;
  decimals: bigint;
}

// Static token definitions for tokens that have issues with on-chain calls
export const STATIC_TOKEN_DEFINITIONS: TokenDefinition[] = [
  {
    address: '0xe0b7927c4af23765cb51314a0e0521a9645f0e2a',
    symbol: 'DGD',
    name: 'DGD',
    decimals: BigInt(9),
  },
  {
    address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
    symbol: 'AAVE',
    name: 'Aave Token',
    decimals: BigInt(18),
  },
  {
    address: '0xeb9951021698b42e4399f9cbb6267aa35f82d59d',
    symbol: 'LIF',
    name: 'Lif',
    decimals: BigInt(18),
  },
  {
    address: '0xbdeb4b83251fb146687fa19d1c660f99411eefe3',
    symbol: 'SVD',
    name: 'savedroid',
    decimals: BigInt(18),
  },
  {
    address: '0xbb9bc244d798123fde783fcc1c72d3bb8c189413',
    symbol: 'TheDAO',
    name: 'TheDAO',
    decimals: BigInt(16),
  },
  {
    address: '0x38c6a68304cdefb9bec48bbfaaba5c5b47818bb2',
    symbol: 'HPB',
    name: 'HPBCoin',
    decimals: BigInt(18),
  },
];

// Tokens where totalSupply should be skipped due to issues
export const SKIP_TOTAL_SUPPLY: string[] = ['0x0000000000bf2686748e1c0255036e7617e7e8a5'];

// Helper for hardcoded tokens
export const getStaticDefinition = (tokenAddress: string): TokenDefinition | undefined => {
  const tokenAddressLower = tokenAddress.toLowerCase();

  // Search the definition using the address
  for (let i = 0; i < STATIC_TOKEN_DEFINITIONS.length; i++) {
    const staticDefinition = STATIC_TOKEN_DEFINITIONS[i];
    if (staticDefinition.address.toLowerCase() === tokenAddressLower) {
      return staticDefinition;
    }
  }

  // If not found, return undefined
  return undefined;
}

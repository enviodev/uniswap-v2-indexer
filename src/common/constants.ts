// Constants from original subgraph helpers
// Reference: original-subgraph/src/common/constants.ts

import { BigDecimal } from "envio";

export const ZERO_BI = BigInt(0);
export const ONE_BI = BigInt(1);
export const ZERO_BD = new BigDecimal(0);
export const ONE_BD = new BigDecimal(1);

// Additional constants from original subgraph
export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
export const BI_18 = BigInt(18);
export const ALMOST_ZERO_BD = new BigDecimal('0.000001');

// All chain-specific constants (FACTORY_ADDRESS, REFERENCE_TOKEN, etc.) 
// are now loaded dynamically from config/chainId/chain.ts files
// Use getChainConfig(chainId) to access them

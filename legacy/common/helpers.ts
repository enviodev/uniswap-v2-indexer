// Helper functions from original subgraph helpers
// Reference: original-subgraph/src/common/helpers.ts
// Note: RPC calls are now handled by the Effect API in effects.ts

import { ZERO_BI, ZERO_BD, ONE_BI } from './constants';
import { BigDecimal } from "envio";

export function exponentToBigDecimal(decimals: bigint): BigDecimal {
  let bd = new BigDecimal(1);
  for (let i = ZERO_BI; i < decimals; i = i + ONE_BI) {
    bd = bd.times(new BigDecimal(10));
  }
  return bd;
}

export function bigDecimalExp18(): BigDecimal {
  return new BigDecimal('1000000000000000000');
}

export function convertEthToDecimal(eth: bigint): BigDecimal {
  return new BigDecimal(eth.toString()).div(exponentToBigDecimal(BigInt(18)));
}

export function convertTokenToDecimal(tokenAmount: bigint, exchangeDecimals: bigint): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return new BigDecimal(tokenAmount.toString());
  }
  return new BigDecimal(tokenAmount.toString()).div(exponentToBigDecimal(exchangeDecimals));
}

export function equalToZero(value: BigDecimal): boolean {
  return value.isEqualTo(ZERO_BD);
}

export function isNullEthValue(value: string): boolean {
  return value == '0x0000000000000000000000000000000000000000000000000000000000000001';
}

// Note: This function needs to be called from within handlers where context is available
// The context parameter will be passed from the handler
export async function createUser(address: string, context: any): Promise<void> {
  // Check if user already exists
  const existingUser = await context.User.get(address);
  if (!existingUser) {
    // Create new user entity
    const user = {
      id: address,
      // Add any other user fields that might be needed
      // For now, just the ID is sufficient
    };
    context.User.set(user);
  }
}

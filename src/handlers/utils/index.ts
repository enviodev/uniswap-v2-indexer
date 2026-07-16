import { BigDecimal } from "envio";
import { ZERO_BD, ZERO_BI } from "./constants";

export function isAddressInList(address: string, list: string[]): boolean {
    address = address.toLowerCase();

    for (const item of list) {
        if (address === item.toLowerCase()) {
            return true;
        }
    }

    return false;
}

export function exponentToBigDecimal(decimals: bigint): BigDecimal {
    let resultString = "1";

    for (let i = 0n; i < decimals; i++) {
        resultString += "0";
    }

    return new BigDecimal(resultString);
}

// return 0 if denominator is 0 in division
export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
    return amount1.eq(ZERO_BD) ? ZERO_BD : amount0.div(amount1);
}

// Cap BigDecimal precision at 40 decimal places. Postgres btree indexes have a
// hard 2704-byte-per-row limit, so an unbounded BigDecimal (e.g. from a runaway
// derivedETH on a manipulated pair) can fail INSERTs on indexed numeric
// columns. Apply at indexed-column writes and at price-source values that
// propagate downstream (derivedETH, ethPrice).
export function sanitizeBD(value: BigDecimal): BigDecimal {
    return new BigDecimal(value.toFixed(40));
}

export const NULL_ETH_HEX_STRING =
    "0x0000000000000000000000000000000000000000000000000000000000000001";

export function isNullEthValue(value: string): boolean {
    return value === NULL_ETH_HEX_STRING;
}

export function convertTokenToDecimal(
    tokenAmount: bigint,
    exchangeDecimals: bigint
): BigDecimal {
    const val = new BigDecimal(tokenAmount.toString());
    return (exchangeDecimals === ZERO_BI) ? val :
            val.div(exponentToBigDecimal(exchangeDecimals));
}

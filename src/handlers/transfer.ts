import { indexer, Mint, Burn, Transaction } from "envio";
import { ADDRESS_ZERO, BI_18 } from "./utils/constants";
import { convertTokenToDecimal } from "./utils/index";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// Helper to check if a mint is complete (subgraph isCompleteMint)
function isCompleteMint(mint: Mint): boolean {
  return mint.sender !== undefined && mint.sender !== null; // sufficient checks
}

async function createUser(context: any, chainId: number, address: string) {
  const id = `${chainId}-${address}`;
  const user = await context.User.get(id);
  if (!user) {
    context.User.set({ id });
  }
}

/**
 * LP-token Transfer bookkeeping (subgraph handleTransfer): stages Mint and
 * Burn entities that the later Mint/Burn events complete, maintains
 * pair.totalSupply, and tracks the fee-mint special case. The ordered
 * mints/burns arrays live ON the Transaction entity, exactly like the
 * subgraph — their pop/replace semantics are load-bearing.
 */
indexer.onEvent(
  { contract: "Pair", event: "Transfer" },
  async ({ event, context }) => {
    const from = event.params.from.toLowerCase();
    const to = event.params.to.toLowerCase();
    const pairAddress = event.srcAddress.toLowerCase();

    // ignore initial transfers for first adds
    if (to === ADDRESS_ZERO && event.params.value === 1000n) {
      return;
    }

    // user stats
    await createUser(context, event.chainId, from);
    await createUser(context, event.chainId, to);

    // get pair
    const pairRO = await context.Pair.get(`${event.chainId}-${pairAddress}`);
    if (!pairRO) return;
    const pair = { ...pairRO };

    // liquidity token amount being transfered
    const value = convertTokenToDecimal(event.params.value, BI_18);

    // get or create transaction
    const transactionId = `${event.chainId}-${event.transaction.hash.toLowerCase()}`;
    const transactionRO = await context.Transaction.get(transactionId);
    const transaction: Mutable<Transaction> = transactionRO
      ? { ...transactionRO }
      : {
          id: transactionId,
          blockNumber: BigInt(event.block.number),
          timestamp: BigInt(event.block.timestamp),
          mints: [],
          burns: [],
          swaps: [],
        };

    // mints
    if (from === ADDRESS_ZERO) {
      // update total supply
      pair.totalSupply = pair.totalSupply.plus(value);
      context.Pair.set(pair);

      // create new mint if no mints so far or if last one is done already
      const mints = transaction.mints;
      const lastMint =
        mints.length > 0 ? await context.Mint.get(mints[mints.length - 1]) : undefined;
      if (mints.length === 0 || (lastMint && isCompleteMint(lastMint))) {
        const mint: Mint = {
          id: `${transactionId}-${mints.length}`,
          transaction_id: transaction.id,
          pair_id: pair.id,
          to,
          liquidity: value,
          timestamp: transaction.timestamp,
          sender: undefined,
          amount0: undefined,
          amount1: undefined,
          logIndex: undefined,
          amountUSD: undefined,
          feeTo: undefined,
          feeLiquidity: undefined,
        };
        context.Mint.set(mint);

        // update mints in transaction
        transaction.mints = mints.concat([mint.id]);
      }
    }

    // case where direct send first on ETH withdrawls
    if (to === pairAddress) {
      const burns = transaction.burns;
      const burn: Burn = {
        id: `${transactionId}-${burns.length}`,
        transaction_id: transaction.id,
        pair_id: pair.id,
        liquidity: value,
        timestamp: transaction.timestamp,
        to,
        sender: from,
        needsComplete: true,
        amount0: undefined,
        amount1: undefined,
        logIndex: undefined,
        amountUSD: undefined,
        feeTo: undefined,
        feeLiquidity: undefined,
      };
      context.Burn.set(burn);
      transaction.burns = burns.concat([burn.id]);
    }

    // burn: LP tokens move from the pair to the zero address
    if (to === ADDRESS_ZERO && from === pairAddress) {
      pair.totalSupply = pair.totalSupply.minus(value);
      context.Pair.set(pair);

      // this is a new instance of a logical burn
      const burns = [...transaction.burns];
      let burn: Mutable<Burn>;
      let reusedLastBurn = false;

      const lastBurn =
        burns.length > 0 ? await context.Burn.get(burns[burns.length - 1]) : undefined;

      if (lastBurn && lastBurn.needsComplete) {
        burn = { ...lastBurn };
        reusedLastBurn = true;
      } else {
        burn = {
          id: `${transactionId}-${burns.length}`,
          transaction_id: transaction.id,
          needsComplete: false,
          pair_id: pair.id,
          liquidity: value,
          timestamp: transaction.timestamp,
          to: undefined,
          sender: undefined,
          amount0: undefined,
          amount1: undefined,
          logIndex: undefined,
          amountUSD: undefined,
          feeTo: undefined,
          feeLiquidity: undefined,
        };
      }

      // if this logical burn included a fee mint, account for this
      const mints = [...transaction.mints];
      const lastMint =
        mints.length > 0 ? await context.Mint.get(mints[mints.length - 1]) : undefined;
      if (lastMint && !isCompleteMint(lastMint)) {
        burn.feeTo = lastMint.to;
        burn.feeLiquidity = lastMint.liquidity;
        // remove the logical mint
        context.Mint.deleteUnsafe(lastMint.id);
        mints.pop();
        transaction.mints = mints;
      }

      context.Burn.set(burn);

      if (reusedLastBurn) {
        // if accessing last one, replace it
        burns[burns.length - 1] = burn.id;
      } else {
        // else add new one
        burns.push(burn.id);
      }
      transaction.burns = burns;
    }

    context.Transaction.set(transaction);
  }
);

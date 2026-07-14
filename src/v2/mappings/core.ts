import { indexer } from "envio";
// Core event handlers for Uniswap V2 Pair contract
// Reference: original-subgraph/src/v2/mappings/core.ts

import { Pair } from "envio";
import {
  Mint_t,
  Burn_t,
  Swap_t,
  Transaction_t,
  Token_t,
  Pair_t,
  UniswapFactory_t,
  Bundle_t,
  PairDayData_t,
  TokenDayData_t,
  PairHourData_t,
  UniswapDayData_t,
  User_t,
} from "generated/src/db/Entities.gen";
import { ADDRESS_ZERO, ZERO_BD, ZERO_BI, ONE_BI, BI_18, ALMOST_ZERO_BD } from "../../common/constants";
import { getFactoryAddress } from "../../common/chainConfig";
import { BigDecimal } from "envio";
import { convertTokenToDecimal, createUser } from "../../common/helpers";
import { getTrackedVolumeUSD, getEthPriceInUSD, findEthPerToken, getTrackedLiquidityUSD } from "../../common/pricing";
import { updatePairDayData, updatePairHourData, updateUniswapDayData, updateTokenDayData } from "../../common/hourDayUpdates";

// Helper function to check if a mint is complete (matches subgraph logic)
function isCompleteMint(mint: Mint_t): boolean {
  return mint.sender !== undefined && mint.sender !== null;
}

// Transfer handler - handles LP token transfers and creates Mint/Burn entities
// Reference: original-subgraph/src/v2/mappings/core.ts - handleTransfer
indexer.onEvent(
  { contract: "Pair", event: "Transfer" },
  async ({ event, context }) => {
  try {
    const chainId = event.chainId;
    
    // ignore initial transfers for first adds
    if (event.params.to === ADDRESS_ZERO && event.params.value === BigInt(1000)) {
      return;
    }

    const factoryAddress = getFactoryAddress(chainId);
    const factory = await context.UniswapFactory.get(`${chainId}-${factoryAddress}`);
    if (!factory) {
      return;
    }

    // user stats
    const from = event.params.from;
    const to = event.params.to;
    
    // Create users if they don't exist
    let fromUser = await context.User.get(from);
    if (!fromUser) {
      fromUser = {
        id: from,
      };
      context.User.set(fromUser);
    }
    
    let toUser = await context.User.get(to);
    if (!toUser) {
      toUser = {
        id: to,
      };
      context.User.set(toUser);
    }

    // get pair and load contract
    const pair = await context.Pair.get(`${chainId}-${event.srcAddress}`);
    if (!pair) {
      return;
    }

    // liquidity token amount being transferred
    const value = convertTokenToDecimal(event.params.value, BI_18);

    // get or create transaction
    const transactionId = `${chainId}-${event.transaction.hash}`;
    let transaction = await context.Transaction.get(transactionId);
    if (!transaction) {
      transaction = {
        id: transactionId,
        blockNumber: BigInt(event.block.number),
        timestamp: BigInt(event.block.timestamp),
      };
      context.Transaction.set(transaction);
    }

    // mints - when from is ADDRESS_ZERO (pool minting LP tokens)
    if (from === ADDRESS_ZERO) {
      // update total supply
      const updatedPair: Pair_t = {
        ...pair,
        totalSupply: pair.totalSupply.plus(value),
      };
      context.Pair.set(updatedPair);

      // Check if we should create a new mint using getWhere query to simulate array behavior
      // In the subgraph: if (mints.length === 0 || isCompleteMint(mints[mints.length - 1]))
      const existingMints = await context.Mint.getWhere.transaction_id.eq(transactionId);
      
      if (existingMints.length === 0 || isCompleteMint(existingMints[existingMints.length - 1])) {
        // Create new mint with proper ID format: transactionId + "-" + array index
        const mintId = `${transactionId}-${existingMints.length}`;
        const mint: Mint_t = {
          id: mintId,
          transaction_id: transactionId,
          timestamp: BigInt(event.block.timestamp),
          pair_id: pair.id,
          to: to,
          liquidity: value,
          sender: undefined,
          amount0: undefined,
          amount1: undefined,
          logIndex: BigInt(event.logIndex),
          amountUSD: undefined,
          feeTo: undefined,
          feeLiquidity: undefined,
        };
        context.Mint.set(mint);
      }
    }

    // case where direct send first on ETH withdrawals
    // for every burn event, there is a transfer first from the LP to the pool (erc-20)
    if (to === pair.id) {
      // Get existing burns to simulate array behavior
      const existingBurns = await context.Burn.getWhere.transaction_id.eq(transactionId);
      const burnId = `${transactionId}-${existingBurns.length}`;
      
      const burn: Burn_t = {
        id: burnId,
        transaction_id: transactionId,
        timestamp: BigInt(event.block.timestamp),
        pair_id: pair.id,
        to: to,
        liquidity: value,
        sender: from,
        amount0: undefined,
        amount1: undefined,
        logIndex: BigInt(event.logIndex),
        amountUSD: undefined,
        needsComplete: true,
        feeTo: undefined,
        feeLiquidity: undefined,
      };
      context.Burn.set(burn);
    }

    // burn - when to is ADDRESS_ZERO and from is pair.id
    if (to === ADDRESS_ZERO && from === pair.id) {
      const updatedPair: Pair_t = {
        ...pair,
        totalSupply: pair.totalSupply.minus(value),
      };
      context.Pair.set(updatedPair);

      // Get existing burns to simulate array behavior (matches subgraph logic)
      const existingBurns = await context.Burn.getWhere.transaction_id.eq(transactionId);
      let burn: Burn_t;
      
      if (existingBurns.length > 0) {
        // Check if the last burn needs completion
        const currentBurn = existingBurns[existingBurns.length - 1];
        if (currentBurn.needsComplete) {
          // Complete the existing burn
          burn = {
            ...currentBurn,
            needsComplete: false,
          };
        } else {
          // Create new burn entity
          const burnId = `${transactionId}-${existingBurns.length}`;
          burn = {
            id: burnId,
            transaction_id: transactionId,
            timestamp: BigInt(event.block.timestamp),
            pair_id: pair.id,
            to: to,
            liquidity: value,
            sender: undefined,
            amount0: undefined,
            amount1: undefined,
            logIndex: BigInt(event.logIndex),
            amountUSD: undefined,
            needsComplete: false,
            feeTo: undefined,
            feeLiquidity: undefined,
          };
        }
      } else {
        // Create new burn entity (no existing burns)
        const burnId = `${transactionId}-${existingBurns.length}`;
        burn = {
          id: burnId,
          transaction_id: transactionId,
          timestamp: BigInt(event.block.timestamp),
          pair_id: pair.id,
          to: to,
          liquidity: value,
          sender: undefined,
          amount0: undefined,
          amount1: undefined,
          logIndex: BigInt(event.logIndex),
          amountUSD: undefined,
          needsComplete: false,
          feeTo: undefined,
          feeLiquidity: undefined,
        };
      }

      // Check for fee mint logic (matches subgraph logic)
      const existingMints = await context.Mint.getWhere.transaction_id.eq(transactionId);
      if (existingMints.length !== 0 && !isCompleteMint(existingMints[existingMints.length - 1])) {
        // This is a fee mint, not a real mint
        const feeMint = existingMints[existingMints.length - 1];
        
        // Update the burn with fee information
        burn = {
          ...burn,
          feeTo: feeMint.to,
          feeLiquidity: feeMint.liquidity,
        };
        
        // Remove the fee mint entity
        context.Mint.deleteUnsafe(feeMint.id);
      }

      // Save the burn entity
      context.Burn.set(burn);
    }

  } catch (error) {
    context.log.error(`Error in handleTransfer: ${error}`);
  }
}
);

// Implement handleMint function
// Reference: original-subgraph/src/v2/mappings/core.ts - handleMint
indexer.onEvent(
  { contract: "Pair", event: "Mint" },
  async ({ event, context }) => {
  try {
    const chainId = event.chainId;
    
    // 1. Load Transaction entity (created by handleTransfer)
    const transactionId = `${chainId}-${event.transaction.hash}`;
    const transaction = await context.Transaction.get(transactionId);
    if (!transaction) {
      return;
    }

    // 2. Load existing Mint entity (created by handleTransfer)
    // Note: In the subgraph, this loads from transaction.mints[mints.length - 1]
    // Since we can't access the array directly due to @derivedFrom, we'll use getWhere to simulate array behavior
    const existingMints = await context.Mint.getWhere.transaction_id.eq(transactionId);
    if (existingMints.length === 0) {
      return; // No mints found
    }
    const mint = existingMints[existingMints.length - 1]; // Get last mint (matches subgraph logic)
    if (!mint) {
      return;
    }

    // 3. Load Pair and UniswapFactory entities
    const pair = await context.Pair.get(`${chainId}-${event.srcAddress}`);
    if (!pair) {
      return;
    }

    const factoryAddress = getFactoryAddress(chainId);
    const factory = await context.UniswapFactory.get(`${chainId}-${factoryAddress}`);
    if (!factory) {
      return;
    }

    // 4. Load Token entities for token0 and token1
    const token0 = await context.Token.get(pair.token0_id);
    if (!token0) {
      return;
    }

    const token1 = await context.Token.get(pair.token1_id);
    if (!token1) {
      return;
    }

    // 5. Calculate amounts (but don't update pair reserves - Sync handler does that)
    const amount0 = convertTokenToDecimal(event.params.amount0, BigInt(token0.decimals));
    const amount1 = convertTokenToDecimal(event.params.amount1, BigInt(token1.decimals));

    // 6. Update token tx counts only
    const updatedToken0: Token_t = {
      ...token0,
      txCount: token0.txCount + ONE_BI,
    };

    const updatedToken1: Token_t = {
      ...token1,
      txCount: token1.txCount + ONE_BI,
    };

    // 7. Update pair tx count only (no reserve updates)
    const updatedPair: Pair_t = {
      ...pair,
      txCount: pair.txCount + ONE_BI,
    };

    // 8. Update factory tx count
    const updatedFactory: UniswapFactory_t = { 
      ...factory, 
      txCount: factory.txCount + ONE_BI 
    };

    // 9. Calculate USD value using derivedETH values
    const bundle = await context.Bundle.get(`${chainId}-1`);
    let amountTotalUSD = ZERO_BD;
    
    if (bundle && bundle.ethPrice && bundle.ethPrice.isGreaterThan(ZERO_BD)) {
      // Calculate USD value: (amount1 * token1.derivedETH + amount0 * token0.derivedETH) * bundle.ethPrice
      amountTotalUSD = token1.derivedETH
        .times(amount1)
        .plus(token0.derivedETH.times(amount0))
        .times(bundle.ethPrice);
    }

    // 10. Update existing mint entity with amounts and sender
    const updatedMint: Mint_t = {
      ...mint,
      sender: event.params.sender,
      amount0: amount0,
      amount1: amount1,
      logIndex: BigInt(event.logIndex),
      amountUSD: amountTotalUSD,
    };

    // 11. Save all entities
    context.Token.set(updatedToken0);
    context.Token.set(updatedToken1);
    context.Pair.set(updatedPair);
    context.UniswapFactory.set(updatedFactory);
    context.Mint.set(updatedMint);

    // 12. Update daily/hourly data
    if (!context.isPreload) {
      await updatePairDayData(updatedPair, event, context, String(chainId));
      await updatePairHourData(updatedPair, event, context, String(chainId));
      await updateUniswapDayData(event, context, String(chainId));
      await updateTokenDayData(updatedToken0, event, context, String(chainId));
      await updateTokenDayData(updatedToken1, event, context, String(chainId));
    }

  } catch (error) {
    context.log.error(`Error in handleMint: ${error}`);
  }
}
);

// Implement handleBurn function
// Reference: original-subgraph/src/v2/mappings/core.ts - handleBurn
indexer.onEvent(
  { contract: "Pair", event: "Burn" },
  async ({ event, context }) => {
  try {
    const chainId = event.chainId;
    
    // 1. Load Transaction entity (created by handleTransfer)
    const transactionId = `${chainId}-${event.transaction.hash}`;
    const transaction = await context.Transaction.get(transactionId);
    if (!transaction) {
      return;
    }

    // 2. Load existing Burn entity (created by handleTransfer)
    // Note: In the subgraph, this loads from transaction.burns[burns.length - 1]
    // Since we can't access the array directly due to @derivedFrom, we'll use getWhere to simulate array behavior
    const existingBurns = await context.Burn.getWhere.transaction_id.eq(transactionId);
    if (existingBurns.length === 0) {
      return; // No burns found
    }
    const burn = existingBurns[existingBurns.length - 1]; // Get last burn (matches subgraph logic)
    if (!burn) {
      return;
    }

    // 3. Load Pair and UniswapFactory entities
    const pair = await context.Pair.get(`${chainId}-${event.srcAddress}`);
    if (!pair) {
      return;
    }

    const factoryAddress = getFactoryAddress(chainId);
    const factory = await context.UniswapFactory.get(`${chainId}-${factoryAddress}`);
    if (!factory) {
      return;
    }

    // 4. Load Token entities for token0 and token1
    const token0 = await context.Token.get(pair.token0_id);
    if (!token0) {
      return;
    }

    const token1 = await context.Token.get(pair.token1_id);
    if (!token1) {
      return;
    }

    // 5. Calculate amounts (but don't update pair reserves - Sync handler does that)
    const amount0 = convertTokenToDecimal(event.params.amount0, BigInt(token0.decimals));
    const amount1 = convertTokenToDecimal(event.params.amount1, BigInt(token1.decimals));

    // 6. Update token tx counts only
    const updatedToken0: Token_t = {
      ...token0,
      txCount: token0.txCount + ONE_BI,
    };

    const updatedToken1: Token_t = {
      ...token1,
      txCount: token1.txCount + ONE_BI,
    };

    // 7. Update pair tx count only (no reserve updates)
    const updatedPair: Pair_t = {
      ...pair,
      txCount: pair.txCount + ONE_BI,
    };

    // 8. Update factory tx count
    const updatedFactory: UniswapFactory_t = { 
      ...factory, 
      txCount: factory.txCount + ONE_BI 
    };

    // 9. Calculate USD value using derivedETH values
    const bundle = await context.Bundle.get(`${chainId}-1`);
    let amountTotalUSD = ZERO_BD;
    
    if (bundle && bundle.ethPrice && bundle.ethPrice.isGreaterThan(ZERO_BD)) {
      // Calculate USD value: (amount1 * token1.derivedETH + amount0 * token0.derivedETH) * bundle.ethPrice
      amountTotalUSD = token1.derivedETH
        .times(amount1)
        .plus(token0.derivedETH.times(amount0))
        .times(bundle.ethPrice);
    }

    // 10. Update existing burn entity with amounts
    const updatedBurn: Burn_t = {
      ...burn,
      amount0: amount0,
      amount1: amount1,
      logIndex: BigInt(event.logIndex),
      amountUSD: amountTotalUSD,
    };

    // 11. Save all entities
    context.Token.set(updatedToken0);
    context.Token.set(updatedToken1);
    context.Pair.set(updatedPair);
    context.UniswapFactory.set(updatedFactory);
    context.Burn.set(updatedBurn);

    // 12. Update daily/hourly data
    if (!context.isPreload) {
      await updatePairDayData(updatedPair, event, context, String(chainId));
      await updatePairHourData(updatedPair, event, context, String(chainId));
      await updateUniswapDayData(event, context, String(chainId));
      await updateTokenDayData(updatedToken0, event, context, String(chainId));
      await updateTokenDayData(updatedToken1, event, context, String(chainId));
    }

  } catch (error) {
    context.log.error(`Error in handleBurn: ${error}`);
  }
}
);

// Implement handleSwap function
// Reference: original-subgraph/src/v2/mappings/core.ts - handleSwap
indexer.onEvent(
  { contract: "Pair", event: "Swap" },
  async ({ event, context }) => {
  try {
    // 1. Load Pair and UniswapFactory entities
    const chainId = event.chainId;
    let pair = await context.Pair.get(`${chainId}-${event.srcAddress}`);
    if (!pair) {
      return;
    }

    const factoryAddress = getFactoryAddress(chainId);
    const factory = await context.UniswapFactory.get(`${chainId}-${factoryAddress}`);
    if (!factory) {
      return;
    }

    // 2. Load Token entities for token0 and token1
    const token0 = await context.Token.get(pair.token0_id);
    if (!token0) {
      return;
    }

    const token1 = await context.Token.get(pair.token1_id);
    if (!token1) {
      return;
    }

    // 3. Calculate amounts
    const amount0In = convertTokenToDecimal(event.params.amount0In, BigInt(token0.decimals));
    const amount1In = convertTokenToDecimal(event.params.amount1In, BigInt(token1.decimals));
    const amount0Out = convertTokenToDecimal(event.params.amount0Out, BigInt(token0.decimals));
    const amount1Out = convertTokenToDecimal(event.params.amount1Out, BigInt(token1.decimals));

    // 4. Calculate totals for volume updates (matches subgraph exactly)
    const amount0Total = amount0Out.plus(amount0In);
    const amount1Total = amount1Out.plus(amount1In);

    // 7. Update token entities with basic volume
    const updatedToken0: Token_t = {
      ...token0,
      tradeVolume: token0.tradeVolume.plus(amount0Total),
      txCount: token0.txCount + ONE_BI,
    };

    const updatedToken1: Token_t = {
      ...token1,
      tradeVolume: token1.tradeVolume.plus(amount1Total),
      txCount: token1.txCount + ONE_BI,
    };

    // 8. Calculate USD values and derived amounts
    const bundle = await context.Bundle.get(`${chainId}-1`);
    let finalToken0: Token_t | undefined;
    let finalToken1: Token_t | undefined;
    let trackedAmountUSD = ZERO_BD;
    let trackedAmountETH = ZERO_BD;
    let derivedAmountUSD = ZERO_BD;
    let derivedAmountETH = ZERO_BD;
    
    if (bundle) {
      // Calculate tracked volume (whitelist-based) - always calculate this
      trackedAmountUSD = await getTrackedVolumeUSD(amount0Total, token0, amount1Total, token1, pair, context, Number(chainId));
      
      // Calculate tracked amount in ETH - handle case when ethPrice is 0
      if (bundle.ethPrice && bundle.ethPrice.isGreaterThan(ZERO_BD)) {
        trackedAmountETH = trackedAmountUSD.div(bundle.ethPrice);
      } else {
        trackedAmountETH = ZERO_BD;
      }

      // Calculate derived amounts (all volume converted to USD)
      const derivedEthToken1 = token1.derivedETH.times(amount1Total);
      const derivedEthToken0 = token0.derivedETH.times(amount0Total);
      
      // If any side is 0, don't divide by 2
      if (derivedEthToken0.isLessThanOrEqualTo(ALMOST_ZERO_BD) || derivedEthToken1.isLessThanOrEqualTo(ALMOST_ZERO_BD)) {
        derivedAmountETH = derivedEthToken0.plus(derivedEthToken1);
      } else {
        derivedAmountETH = derivedEthToken0.plus(derivedEthToken1).div(new BigDecimal(2));
      }
      
      // Calculate derived amount in USD - handle case when ethPrice is 0
      if (bundle.ethPrice && bundle.ethPrice.isGreaterThan(ZERO_BD)) {
        derivedAmountUSD = derivedAmountETH.times(bundle.ethPrice);
      } else {
        derivedAmountUSD = ZERO_BD;
      }

      // Update pair with all volume data
      pair = {
        ...pair,
        volumeUSD: pair.volumeUSD.plus(trackedAmountUSD),
        untrackedVolumeUSD: pair.untrackedVolumeUSD.plus(derivedAmountUSD),
      };

      // Update tokens with USD values
      finalToken0 = {
        ...updatedToken0,
        tradeVolumeUSD: updatedToken0.tradeVolumeUSD.plus(trackedAmountUSD),
        untrackedVolumeUSD: updatedToken0.untrackedVolumeUSD.plus(derivedAmountUSD),
      };

      finalToken1 = {
        ...updatedToken1,
        tradeVolumeUSD: updatedToken1.tradeVolumeUSD.plus(trackedAmountUSD),
        untrackedVolumeUSD: updatedToken1.untrackedVolumeUSD.plus(derivedAmountUSD),
      };

      // Update factory with all volume data
      const updatedFactory: UniswapFactory_t = {
        ...factory,
        totalVolumeUSD: factory.totalVolumeUSD.plus(trackedAmountUSD),
        totalVolumeETH: factory.totalVolumeETH.plus(trackedAmountETH),
        untrackedVolumeUSD: factory.untrackedVolumeUSD.plus(derivedAmountUSD),
        txCount: factory.txCount + ONE_BI,
      };

      // Save factory
      context.UniswapFactory.set(updatedFactory);

      // Save updated tokens
      context.Token.set(finalToken0);
      context.Token.set(finalToken1);
    }

    // 9. Create Swap entity
    const transactionId = `${chainId}-${event.transaction.hash}`;
    
    // Create Transaction entity if it doesn't exist (like in subgraph)
    let transaction = await context.Transaction.get(transactionId);
    if (!transaction) {
      transaction = {
        id: transactionId,
        blockNumber: BigInt(event.block.number),
        timestamp: BigInt(event.block.timestamp),
      };
      context.Transaction.set(transaction);
    }
    
    // Use array index format like subgraph: event.transaction.hash + "-" + swaps.length
    // Since we can't access the array directly, we'll use a simplified approach
    const swapId = `${transactionId}-0`; // Simplified ID format
    
    // Calculate USD value for swap - use tracked amount if available, otherwise derived amount
    let swapAmountUSD = trackedAmountUSD.isGreaterThan(ZERO_BD) ? trackedAmountUSD : derivedAmountUSD;
    
    const swap: Swap_t = {
      id: swapId,
      transaction_id: transactionId,
      timestamp: BigInt(event.block.timestamp),
      pair_id: pair.id,
      sender: event.params.sender,
      from: event.params.sender, // Use sender as from since 'from' doesn't exist
      amount0In: amount0In,
      amount1In: amount1In,
      amount0Out: amount0Out,
      amount1Out: amount1Out,
      to: event.params.to,
      logIndex: BigInt(event.logIndex),
      amountUSD: swapAmountUSD,
    };

    // 10. Update pair volume data (matches subgraph exactly)
    pair = {
      ...pair,
      volumeUSD: pair.volumeUSD.plus(trackedAmountUSD),
      volumeToken0: pair.volumeToken0.plus(amount0Total),
      volumeToken1: pair.volumeToken1.plus(amount1Total),
      untrackedVolumeUSD: pair.untrackedVolumeUSD.plus(derivedAmountUSD),
      txCount: pair.txCount + ONE_BI,
    };

    // 11. Save all entities
    context.Pair.set(pair);
    context.Swap.set(swap);

    // 12. Update daily/hourly data
    if (bundle) {
      const pairDayData = await updatePairDayData(pair, event, context, String(chainId));
      const pairHourData = await updatePairHourData(pair, event, context, String(chainId));
      const uniswapDayData = await updateUniswapDayData(event, context, String(chainId));
      const token0DayData = await updateTokenDayData(finalToken0 || updatedToken0, event, context, String(chainId));
      const token1DayData = await updateTokenDayData(finalToken1 || updatedToken1, event, context, String(chainId));

      // Swap-specific updating for UniswapDayData
      if (uniswapDayData) {
        const updatedUniswapDayData = {
          ...uniswapDayData,
          dailyVolumeUSD: uniswapDayData.dailyVolumeUSD.plus(trackedAmountUSD),
          dailyVolumeETH: uniswapDayData.dailyVolumeETH.plus(trackedAmountETH),
          dailyVolumeUntracked: uniswapDayData.dailyVolumeUntracked.plus(derivedAmountUSD),
          // Update total volume fields (matches subgraph exactly)
          totalVolumeUSD: uniswapDayData.totalVolumeUSD.plus(trackedAmountUSD),
          totalVolumeETH: uniswapDayData.totalVolumeETH.plus(trackedAmountETH),
        };
        context.UniswapDayData.set(updatedUniswapDayData);
      }

      // Swap-specific updating for PairDayData
      if (pairDayData) {
        const updatedPairDayData = {
          ...pairDayData,
          dailyVolumeToken0: pairDayData.dailyVolumeToken0.plus(amount0Total),
          dailyVolumeToken1: pairDayData.dailyVolumeToken1.plus(amount1Total),
          dailyVolumeUSD: pairDayData.dailyVolumeUSD.plus(trackedAmountUSD),
        };
        context.PairDayData.set(updatedPairDayData);
      }

      // Swap-specific updating for PairHourData
      if (pairHourData) {
        const updatedPairHourData = {
          ...pairHourData,
          hourlyVolumeToken0: pairHourData.hourlyVolumeToken0.plus(amount0Total),
          hourlyVolumeToken1: pairHourData.hourlyVolumeToken1.plus(amount1Total),
          hourlyVolumeUSD: pairHourData.hourlyVolumeUSD.plus(trackedAmountUSD),
        };
        context.PairHourData.set(updatedPairHourData);
      }

      // Swap-specific updating for Token0DayData
      if (token0DayData) {
        const updatedToken0DayData = {
          ...token0DayData,
          dailyVolumeToken: token0DayData.dailyVolumeToken.plus(amount0Total),
          dailyVolumeETH: token0DayData.dailyVolumeETH.plus(amount0Total.times((finalToken0 || updatedToken0).derivedETH)),
          dailyVolumeUSD: token0DayData.dailyVolumeUSD.plus(
            amount0Total.times((finalToken0 || updatedToken0).derivedETH).times(bundle.ethPrice)
          ),
        };
        context.TokenDayData.set(updatedToken0DayData);
      }

      // Swap-specific updating for Token1DayData
      if (token1DayData) {
        const updatedToken1DayData = {
          ...token1DayData,
          dailyVolumeToken: token1DayData.dailyVolumeToken.plus(amount1Total),
          dailyVolumeETH: token1DayData.dailyVolumeETH.plus(amount1Total.times((finalToken1 || updatedToken1).derivedETH)),
          dailyVolumeUSD: token1DayData.dailyVolumeUSD.plus(
            amount1Total.times((finalToken1 || updatedToken1).derivedETH).times(bundle.ethPrice)
          ),
        };
        context.TokenDayData.set(updatedToken1DayData);
      }
    }

  } catch (error) {
    context.log.error(`Error in handleSwap: ${error}`);
  }
}
);

// Implement handleSync function
// Reference: original-subgraph/src/v2/mappings/core.ts - handleSync
indexer.onEvent(
  { contract: "Pair", event: "Sync" },
  async ({ event, context }) => {
  try {
    // 1. Load Pair and UniswapFactory entities
    const chainId = event.chainId;
    const pairId = `${chainId}-${event.srcAddress}`;
    
    let pair = await context.Pair.get(pairId);
    if (!pair) {
      return;
    }

    const token0 = await context.Token.get(pair.token0_id);
    if (!token0) {
      return;
    }

    const token1 = await context.Token.get(pair.token1_id);
    if (!token1) {
      return;
    }

    const factoryAddress = getFactoryAddress(chainId);
    const factoryId = `${chainId}-${factoryAddress}`;
    const factory = await context.UniswapFactory.get(factoryId);
    if (!factory) {
      return;
    }

    // 2. Reset factory liquidity by subtracting only tracked liquidity
    const updatedFactory: UniswapFactory_t = {
      ...factory,
      totalLiquidityETH: factory.totalLiquidityETH.minus(pair.trackedReserveETH || ZERO_BD),
    };

    // 3. Reset token total liquidity amounts
    const updatedToken0: Token_t = {
      ...token0,
      totalLiquidity: token0.totalLiquidity.minus(pair.reserve0),
    };

    const updatedToken1: Token_t = {
      ...token1,
      totalLiquidity: token1.totalLiquidity.minus(pair.reserve1),
    };

    // 4. Update pair reserves from event parameters
    const reserve0 = convertTokenToDecimal(event.params.reserve0, BigInt(token0.decimals));
    const reserve1 = convertTokenToDecimal(event.params.reserve1, BigInt(token1.decimals));

    // 5. Update pair token prices (matches subgraph exactly)
    const token0Price = reserve1.isGreaterThan(ZERO_BD) ? reserve0.div(reserve1) : ZERO_BD;
    const token1Price = reserve0.isGreaterThan(ZERO_BD) ? reserve1.div(reserve0) : ZERO_BD;

    // 5.5. Save pair immediately with new reserves and prices (matches subgraph exactly)
    const updatedPairWithPrices: Pair_t = {
      ...pair,
      reserve0: reserve0,
      reserve1: reserve1,
      token0Price: token0Price,
      token1Price: token1Price,
    };
    context.Pair.set(updatedPairWithPrices);

    // 6. Update ETH price now that reserves could have changed
    const bundleId = `${chainId}-1`;
    const bundle = await context.Bundle.get(bundleId);
    if (bundle) {
      const newEthPrice = await getEthPriceInUSD(context, chainId);
      const updatedBundle: Bundle_t = {
        ...bundle,
        ethPrice: newEthPrice,
      };

      // Save bundle immediately (matches subgraph exactly)
      context.Bundle.set(updatedBundle);

      // 7. Recalculate derivedETH for both tokens (now with correct pair state)
      const token0DerivedETH = await findEthPerToken(updatedToken0, context, chainId);
      const token1DerivedETH = await findEthPerToken(updatedToken1, context, chainId);

      // 8. Update tokens with new derivedETH values
      const finalToken0: Token_t = {
        ...updatedToken0,
        derivedETH: token0DerivedETH,
      };

      const finalToken1: Token_t = {
        ...updatedToken1,
        derivedETH: token1DerivedETH,
      };

      // Save tokens immediately (matches subgraph exactly)
      context.Token.set(finalToken0);
      context.Token.set(finalToken1);

      // 9. Calculate derived values for pair
      const reserve0ETH = reserve0.times(token0DerivedETH);
      const reserve1ETH = reserve1.times(token1DerivedETH);
      const reserveETH = reserve0ETH.plus(reserve1ETH);

      // 10. Calculate USD value
      const reserveUSD = reserveETH.times(newEthPrice);

      // 11. Get tracked liquidity - will be 0 if neither is in whitelist
      let trackedLiquidityETH = ZERO_BD;
      if (newEthPrice.isGreaterThan(ZERO_BD)) {
        const trackedLiquidityUSD = await getTrackedLiquidityUSD(reserve0, reserve1, finalToken0, finalToken1, context, chainId);
        trackedLiquidityETH = trackedLiquidityUSD.div(newEthPrice);
      }

      // 12. Update pair with all calculated values (using already-saved pair)
      const updatedPair: Pair_t = {
        ...updatedPairWithPrices,
        reserveETH: reserveETH,
        reserveUSD: reserveUSD,
        trackedReserveETH: trackedLiquidityETH,
      };

      // 13. Update factory with new liquidity totals (matches subgraph exactly)
      const finalFactory: UniswapFactory_t = {
        ...updatedFactory,
        totalLiquidityETH: updatedFactory.totalLiquidityETH.plus(trackedLiquidityETH),
        totalLiquidityUSD: updatedFactory.totalLiquidityETH.plus(trackedLiquidityETH).times(newEthPrice),
      };

      // 14. Update tokens with new total liquidity amounts
      const finalToken0WithLiquidity: Token_t = {
        ...finalToken0,
        totalLiquidity: finalToken0.totalLiquidity.plus(reserve0),
      };

      const finalToken1WithLiquidity: Token_t = {
        ...finalToken1,
        totalLiquidity: finalToken1.totalLiquidity.plus(reserve1),
      };

      // 15. Save all entities (matches subgraph order exactly)
      context.Pair.set(updatedPair);
      context.UniswapFactory.set(finalFactory);
      context.Token.set(finalToken0WithLiquidity);
      context.Token.set(finalToken1WithLiquidity);
    }

  } catch (error) {
    context.log.error(`Error in handleSync: ${error}`);
  }
}
);

// Factory event handler for Uniswap V2 Factory contract
// Reference: original-subgraph/src/v2/mappings/factory.ts

import {
  Factory,  // Contract handler for Factory events
  Pair,    // Contract handler for Pair events
  Token,   // Contract handler for Token events
  OctoswapFactory,  // Contract handler for OctoswapFactory events
  Bundle,  // Contract handler for Bundle events
  PairTokenLookup,  // Contract handler for PairTokenLookup events
} from "generated";
import {
  Pair_t,
  Token_t,
  OctoswapFactory_t,
  Bundle_t,
  PairTokenLookup_t,
} from "generated/src/db/Entities.gen";
import { ZERO_BD, ZERO_BI } from "../../common/constants";
import { getFactoryAddress, getStableTokenPairs } from "../../common/chainConfig";
import { getTokenSymbol, getTokenName, getTokenTotalSupply, getTokenDecimals } from "../../common/effects";


// Register dynamic Pair contracts with Envio
Factory.PairCreated.contractRegister(({ event, context }) => {
  context.addPair(`${event.params.pair}`);
});

// Implement handleNewPair function
// Reference: original-subgraph/src/v2/mappings/core.ts - handleNewPair
Factory.PairCreated.handler(async ({ event, context }) => {
  try {
    // 1. Load/Create OctoswapFactory entity (id: factoryAddress)
    const factoryAddress = getFactoryAddress(event.chainId);
    let factory = await context.OctoswapFactory.get(`${event.chainId}-${factoryAddress}`);
    if (!factory) {
      factory = {
        id: `${event.chainId}-${factoryAddress}`,
        pairCount: 0,
        totalVolumeUSD: ZERO_BD,
        totalVolumeETH: ZERO_BD,
        untrackedVolumeUSD: ZERO_BD,
        totalLiquidityUSD: ZERO_BD,
        totalLiquidityETH: ZERO_BD,
        txCount: ZERO_BI,
      };
    }

    // Update factory pair count
    const updatedFactory: OctoswapFactory_t = {
      ...factory,
      pairCount: factory.pairCount + 1,
    };
    context.OctoswapFactory.set(updatedFactory);

    // 2. Load/Create Bundle entity (id: '1')
    const chainId = event.chainId;
    let bundle = await context.Bundle.get(`${chainId}-1`);
    if (!bundle) {
      bundle = {
        id: `${chainId}-1`,
        ethPrice: ZERO_BD,
      };
      context.Bundle.set(bundle);
    }

    // 3. Load/Create Token entities for token0 and token1
    let token0 = await context.Token.get(`${chainId}-${event.params.token0}`);
    if (!token0) {
      try {
        // Fetch token metadata using Effect API
        const [symbol0, name0, totalSupply0, decimals0] = await Promise.all([
          context.effect(getTokenSymbol, { tokenAddress: event.params.token0, chainId }),
          context.effect(getTokenName, { tokenAddress: event.params.token0, chainId }),
          context.effect(getTokenTotalSupply, { tokenAddress: event.params.token0, chainId }),
          context.effect(getTokenDecimals, { tokenAddress: event.params.token0, chainId })
        ]);
        
        // Bail if we couldn't figure out the decimals
        if (decimals0 === undefined) {
          context.log.error(`Failed to get decimals for token0: ${event.params.token0}`);
          return;
        }

        token0 = {
          id: `${chainId}-${event.params.token0}`,
          symbol: symbol0,
          name: name0,
          decimals: decimals0,
          totalSupply: totalSupply0,
          derivedETH: ZERO_BD,
          tradeVolume: ZERO_BD,
          tradeVolumeUSD: ZERO_BD,
          untrackedVolumeUSD: ZERO_BD,
          totalLiquidity: ZERO_BD,
          txCount: ZERO_BI,
        };
        context.Token.set(token0);
      } catch (error) {
        context.log.error(`Error fetching token0 metadata: ${error}`);
        throw error; // Re-throw to fail the transaction
      }
    }

    let token1 = await context.Token.get(`${chainId}-${event.params.token1}`);
    if (!token1) {
      try {
        // Fetch token metadata using Effect API
        const [symbol1, name1, totalSupply1, decimals1] = await Promise.all([
          context.effect(getTokenSymbol, { tokenAddress: event.params.token1, chainId }),
          context.effect(getTokenName, { tokenAddress: event.params.token1, chainId }),
          context.effect(getTokenTotalSupply, { tokenAddress: event.params.token1, chainId }),
          context.effect(getTokenDecimals, { tokenAddress: event.params.token1, chainId })
        ]);

        // Bail if we couldn't figure out the decimals
        if (decimals1 === undefined) {
          context.log.error(`Failed to get decimals for token1: ${event.params.token1}`);
          return;
        }

        token1 = {
          id: `${chainId}-${event.params.token1}`,
          symbol: symbol1,
          name: name1,
          decimals: decimals1,
          totalSupply: totalSupply1,
          derivedETH: ZERO_BD,
          tradeVolume: ZERO_BD,
          tradeVolumeUSD: ZERO_BD,
          untrackedVolumeUSD: ZERO_BD,
          totalLiquidity: ZERO_BD,
          txCount: ZERO_BI,
        };
        context.Token.set(token1);
      } catch (error) {
        context.log.error(`Error fetching token1 metadata: ${error}`);
        throw error; // Re-throw to fail the transaction
      }
    }

    // 4. Create new Pair entity
    const pair: Pair_t = {
      id: `${chainId}-${event.params.pair}`,
      token0_id: token0.id,
      token1_id: token1.id,
      reserve0: ZERO_BD,
      reserve1: ZERO_BD,
      totalSupply: ZERO_BD,
      reserveETH: ZERO_BD,
      reserveUSD: ZERO_BD,
      trackedReserveETH: ZERO_BD,
      token0Price: ZERO_BD,
      token1Price: ZERO_BD,
      volumeToken0: ZERO_BD,
      volumeToken1: ZERO_BD,
      volumeUSD: ZERO_BD,
      untrackedVolumeUSD: ZERO_BD,
      txCount: ZERO_BI,
      createdAtTimestamp: BigInt(event.block.timestamp),
      createdAtBlockNumber: BigInt(event.block.number),
      liquidityProviderCount: ZERO_BI,
    };
    context.Pair.set(pair);



    // 6. Create PairTokenLookup entities for efficient token-pair lookups
    // Create both directions: token0-token1 and token1-token0
    const pairLookup0: PairTokenLookup_t = {
      id: `${chainId}-${event.params.token0}-${event.params.token1}`,
      pair_id: pair.id,
    };
    context.PairTokenLookup.set(pairLookup0);

    const pairLookup1: PairTokenLookup_t = {
      id: `${chainId}-${event.params.token1}-${event.params.token0}`,
      pair_id: pair.id,
    };
    context.PairTokenLookup.set(pairLookup1);
  } catch (error) {
    context.log.error(`Error in handleNewPair: ${error}`);
  }
});

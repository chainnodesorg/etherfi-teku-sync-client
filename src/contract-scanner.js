import { ethers } from 'ethers';
import { ETHERFI_SC_KEY_STORAGE_MODE_CASES, getConfig } from './config.js';
import { getLastScannedBlock, setLastScannedBlock } from './vault-block-tracker.js';

// ABI fragments for the events we need to monitor
const AUCTION_MANAGER_ABI = [
  'event BidCreated(address indexed bidder, uint256 amountPerBid, uint256[] bidIdArray, uint64[] ipfsIndexArray)',
];

const STAKING_MANAGER_ABI = [
  'event ValidatorRegistered(address indexed operator, address indexed bNftOwner, address indexed tNftOwner, uint256 validatorId, bytes validatorPubKey, string ipfsHashForEncryptedValidatorKey)',
];

const NODES_MANAGER_ABI = ['event PubkeyLinked(bytes32 pubkeyHash, address nodeAddress, uint256 legacyId, bytes pubkey)'];

/**
 * Retrieves all bids from contract logs for a specific bidder
 * This is a drop-in replacement for the subgraph-based retrieveAllBidsIterated function
 *
 * @param {string} RPC_URL - Ethereum RPC endpoint URL
 * @param {string} BIDDER - Bidder address to filter for
 * @param {boolean} CLEANUP_EXITED_KEYS - Whether to filter for only LIVE/WAITING_FOR_APPROVAL validators
 * @returns {Promise<Array>} Array of bid objects matching the subgraph schema
 */
export async function retrieveAllBidsIterated(RPC_URL, BIDDER, CLEANUP_EXITED_KEYS) {
  console.log('Scanning contract logs for bids...');

  const {
    AUCTION_MANAGER_CONTRACT,
    STAKING_MANAGER_CONTRACT,
    NODES_MANAGER_CONTRACT,
    START_BLOCK,
    SCAN_CHUNK_SIZE,
    MAX_PARALLEL_REQUESTS,
    KEY_STORAGE_MODE,
  } = getConfig();

  // Initialize provider and contracts
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // Get the current finalized block
  const finalizedBlock = await provider.getBlock('finalized');
  const currentFinalizedBlockNumber = finalizedBlock.number;

  console.log(`Current finalized block: ${currentFinalizedBlockNumber}`);

  // Get last scanned block from vault
  let lastScannedBlock = undefined;
  if (KEY_STORAGE_MODE === ETHERFI_SC_KEY_STORAGE_MODE_CASES.VAULT) {
    lastScannedBlock = await getLastScannedBlock();
    console.log(`Got last scanned block from vault state: ${lastScannedBlock}`);
  }

  // If no previous scan, start from configured start block
  if (!lastScannedBlock || lastScannedBlock < START_BLOCK) {
    lastScannedBlock = START_BLOCK;
    console.log(`Starting scan from configured start block: ${START_BLOCK}`);
  } else {
    console.log(`Resuming scan from last scanned block: ${lastScannedBlock}`);
  }

  // Don't scan beyond finalized block
  const toBlock = currentFinalizedBlockNumber;

  if (lastScannedBlock >= toBlock) {
    console.log('Already up to date with finalized block. No new blocks to scan.');
    return [];
  }

  console.log(`Scanning from block ${lastScannedBlock + 1} to ${toBlock}`);
  console.log(`Using chunk size: ${SCAN_CHUNK_SIZE} blocks, parallel requests: ${MAX_PARALLEL_REQUESTS}`);

  // Scan BidCreated events to get pubKeyIndex mapping
  console.log('\nScanning BidCreated events from AuctionManager...');
  const bidCreatedEvents = await scanEventInChunks(
    provider,
    AUCTION_MANAGER_CONTRACT,
    AUCTION_MANAGER_ABI,
    'BidCreated',
    lastScannedBlock + 1,
    toBlock,
    SCAN_CHUNK_SIZE,
    MAX_PARALLEL_REQUESTS,
    [BIDDER], // Filter by bidder (first indexed param)
  );

  console.log(`Found ${bidCreatedEvents.length} BidCreated events for bidder ${BIDDER}`);

  // Build mapping of bidId -> pubKeyIndex
  const bidIdToPubKeyIndex = {};
  let totalBidsCreated = 0;

  for (const event of bidCreatedEvents) {
    const { bidIdArray, ipfsIndexArray } = event.args;

    // Each BidCreated event can create multiple bids
    for (let i = 0; i < bidIdArray.length; i++) {
      const bidId = bidIdArray[i].toString();
      const ipfsIndex = Number(ipfsIndexArray[i]);
      bidIdToPubKeyIndex[bidId] = ipfsIndex;
      totalBidsCreated++;
    }
  }

  console.log(`Total bids created: ${totalBidsCreated} (from ${bidCreatedEvents.length} BidCreated events)`);

  // Scan ValidatorRegistered events in chunks with parallel requests
  // Note: operator = getBidOwner (the bidder), bNftOwner/tNftOwner = liquidityPool
  console.log('\nScanning ValidatorRegistered events from StakingManager...');
  const allEvents = await scanEventInChunks(
    provider,
    STAKING_MANAGER_CONTRACT,
    STAKING_MANAGER_ABI,
    'ValidatorRegistered',
    lastScannedBlock + 1,
    toBlock,
    SCAN_CHUNK_SIZE,
    MAX_PARALLEL_REQUESTS,
    [BIDDER], // Filter by operator (first indexed param = bidder)
  );

  console.log(`Found ${allEvents.length} ValidatorRegistered events for bidder ${BIDDER}`);

  // Transform events to match subgraph schema
  const bids = await transformEventsToSubgraphSchema(allEvents, bidIdToPubKeyIndex, provider, BIDDER, CLEANUP_EXITED_KEYS);

  // Update last scanned and finalized blocks in vault
  if (KEY_STORAGE_MODE === ETHERFI_SC_KEY_STORAGE_MODE_CASES.VAULT) {
    console.log(`Setting last scanned block in vault state to ${toBlock}`);
    await setLastScannedBlock(toBlock);
  }

  console.log(`Completed scan. Processed up to block ${toBlock}. Found ${bids.length} matching bids.`);

  return bids;
}

/**
 * Retrieves cleanup bids (validators that are no longer LIVE or WAITING_FOR_APPROVAL)
 *
 * @param {string} RPC_URL - Ethereum RPC endpoint URL
 * @param {string} BIDDER - Bidder address to filter for
 * @returns {Promise<Array>} Array of bid objects to cleanup
 */
export async function retrieveAllCleanupBidsIterated(RPC_URL, BIDDER) {
  // For cleanup, we want to get all validators and then filter for non-active ones
  // In a contract-based approach, we would need to track validator phases
  // For now, return empty array as this requires more complex state tracking
  // The phase information needs to come from beacon chain or additional contract queries

  console.log('Cleanup bids scanning not yet implemented for contract-based approach');
  console.log('This requires beacon chain validator status tracking');

  return [];
}

/**
 * Scans for events in chunks with parallel requests
 *
 * @param {ethers.Provider} provider - Ethers provider
 * @param {string} contractAddress - Contract address to scan
 * @param {Array} abi - Contract ABI
 * @param {string} eventName - Event name to filter
 * @param {number} fromBlock - Starting block
 * @param {number} toBlock - Ending block
 * @param {number} chunkSize - Size of each chunk
 * @param {number} maxParallel - Maximum parallel requests
 * @param {Array} filterArgs - Arguments for event filter
 * @returns {Promise<Array>} All events found
 */
async function scanEventInChunks(provider, contractAddress, abi, eventName, fromBlock, toBlock, chunkSize, maxParallel, filterArgs = []) {
  const contract = new ethers.Contract(contractAddress, abi, provider);

  // Calculate chunks
  const chunks = [];
  for (let i = fromBlock; i <= toBlock; i += chunkSize) {
    const chunkStart = i;
    const chunkEnd = Math.min(i + chunkSize - 1, toBlock);
    const actualChunkSize = chunkEnd - chunkStart + 1;
    chunks.push({ start: chunkStart, end: chunkEnd });

    // Debug: log first chunk details
    if (chunks.length === 1) {
      console.log(`First chunk: blocks ${chunkStart} to ${chunkEnd} (${actualChunkSize} blocks)`);
    }
  }

  console.log(`Scanning ${chunks.length} chunks of up to ${chunkSize} blocks each`);

  // Process chunks in parallel batches
  const allEvents = [];

  for (let i = 0; i < chunks.length; i += maxParallel) {
    const batch = chunks.slice(i, Math.min(i + maxParallel, chunks.length));
    console.log(`Processing batch ${Math.floor(i / maxParallel) + 1}/${Math.ceil(chunks.length / maxParallel)}`);

    const batchPromises = batch.map((chunk) => queryChunkWithRetry(contract, eventName, chunk.start, chunk.end, filterArgs));

    const batchResults = await Promise.all(batchPromises);

    // Flatten and add to all events
    batchResults.forEach((events) => {
      allEvents.push(...events);
    });
  }

  return allEvents;
}

/**
 * Query a chunk with automatic retry on failure
 *
 * @param {ethers.Contract} contract - Contract instance
 * @param {string} eventName - Event name
 * @param {number} fromBlock - Start block
 * @param {number} toBlock - End block
 * @param {Array} filterArgs - Filter arguments
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Array>} Events found in chunk
 */
async function queryChunkWithRetry(contract, eventName, fromBlock, toBlock, filterArgs, maxRetries = 3) {
  let lastError;
  const chunkSize = toBlock - fromBlock + 1;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const filter = contract.filters[eventName](...filterArgs);
      console.log(`Querying chunk ${fromBlock}-${toBlock} (${chunkSize} blocks), attempt ${attempt}/${maxRetries}`);
      const events = await contract.queryFilter(filter, fromBlock, toBlock);
      return events;
    } catch (error) {
      lastError = error;
      console.error(`Error querying chunk ${fromBlock}-${toBlock} (${chunkSize} blocks, attempt ${attempt}/${maxRetries}):`, error.message);

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed to query chunk ${fromBlock}-${toBlock} after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Transform ValidatorRegistered events to match the subgraph schema
 *
 * @param {Array} events - Array of ValidatorRegistered events
 * @param {Object} bidIdToPubKeyIndex - Mapping of bidId to pubKeyIndex from BidCreated events
 * @param {ethers.Provider} provider - Ethers provider
 * @param {string} bidder - Bidder address
 * @param {boolean} filterActive - Whether to filter for active validators only
 * @returns {Promise<Array>} Transformed bid objects
 */
async function transformEventsToSubgraphSchema(events, bidIdToPubKeyIndex, provider, bidder, filterActive) {
  const bids = [];

  for (const event of events) {
    try {
      const { operator, bNftOwner, tNftOwner, validatorId, validatorPubKey, ipfsHashForEncryptedValidatorKey } = event.args;

      // Convert bytes to hex string
      const validatorPubKeyHex = ethers.hexlify(validatorPubKey);
      // ipfsHashForEncryptedValidatorKey is already a string, no conversion needed

      // Get transaction to extract more details
      // WARN: The below is broken, don't do this. It takes forever. Also it's unneeded.
      // const tx = await event.getTransaction();
      // const receipt = await event.getTransactionReceipt();

      // Get pubKeyIndex from BidCreated events mapping
      const bidId = validatorId.toString();
      const pubKeyIndex = bidIdToPubKeyIndex[bidId] ?? 0;

      if (pubKeyIndex === 0 && !bidIdToPubKeyIndex.hasOwnProperty(bidId)) {
        console.warn(`Warning: No BidCreated event found for validatorId ${bidId}, using pubKeyIndex=0`);
      }

      // Create bid object matching subgraph schema
      const bid = {
        id: bidId,
        bidderAddress: operator.toLowerCase(), // operator is the bidder (getBidOwner)
        pubKeyIndex: pubKeyIndex, // Extracted from BidCreated event
        validator: {
          id: bidId,
          phase: 'LIVE', // Default to LIVE - would need beacon chain query for actual status
          ipfsHashForEncryptedValidatorKey: ipfsHashForEncryptedValidatorKey,
          validatorPubKey: validatorPubKeyHex,
          etherfiNode: tNftOwner, // tNftOwner (liquidityPool in legacy event)
          BNFTHolder: bNftOwner, // bNftOwner (liquidityPool in legacy event)
        },
      };

      // If filtering for active validators and this is not active, skip
      // Note: In real implementation, would query beacon chain for actual validator status
      if (filterActive) {
        // For now, include all validators when filterActive is true
        // In production, would query validator status from beacon chain
        bids.push(bid);
      } else {
        bids.push(bid);
      }
    } catch (error) {
      console.error(`Error processing event for validatorId ${event.args.validatorId}:`, error.message);
      // Continue processing other events
    }
  }

  return bids;
}

/**
 * Helper function to get beacon chain validator status
 * This would need to be implemented to query actual validator phase
 *
 * @param {string} validatorPubKey - Validator public key
 * @returns {Promise<string>} Validator phase/status
 */
async function getValidatorPhaseFromBeaconChain(validatorPubKey) {
  // TODO: Implement beacon chain API query
  // For now, default to LIVE
  // Would use beacon chain API like:
  // https://beaconcha.in/api/v1/validator/{pubkey}
  // or run a local beacon node

  return 'LIVE';
}

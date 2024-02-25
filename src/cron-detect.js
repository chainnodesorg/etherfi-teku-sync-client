import { CronJob } from 'cron';
import { fetchFromIpfs } from './ipfs.js';
import { createFSBidOutput, validatorFilesExist, saveTekuProposerConfig, tekuProposerConfigExists, deleteFSBidOutput } from './file.js';
import { extractPrivateKeysFromFS, getKeyPairByPubKeyIndex, decryptKeyPairJSON, decryptValidatorKeyInfo } from './decrypt.js';
import { getConfig } from './config.js';
import { retrieveAllBidsIterated, retrieveAllCleanupBidsIterated } from './subgraph.js';
import { sigHupAllTekus, kubernetesSigHupTeku } from './teku.js';

async function run() {
  console.log('===== detecting new validators * start * =====');

  const {
    GRAPH_URL,
    BIDDER,
    PRIVATE_KEYS_FILE_LOCATION,
    OUTPUT_LOCATION,
    PASSWORD,
    TEKU_PROPOSER_FILE,
    RESTART_MODE,
    EXCLUDED_VALIDATORS,
  } = getConfig();

  const privateKeys = extractPrivateKeysFromFS(PRIVATE_KEYS_FILE_LOCATION);

  const validatorKey = decryptKeyPairJSON(privateKeys, PASSWORD);
  const { pubKeyArray, privKeyArray } = validatorKey;

  const bids = await retrieveAllBidsIterated(GRAPH_URL, BIDDER);

  let didChangeAnything = false;

  // Get new bids
  for (const bid of bids) {
    const { validator, pubKeyIndex } = bid;

    const { ipfsHashForEncryptedValidatorKey, validatorPubKey, etherfiNode } = validator;

    if (EXCLUDED_VALIDATORS.includes(bid.id.toLowerCase().trim()) || EXCLUDED_VALIDATORS.includes(validatorPubKey.toLowerCase().trim())) {
      // validator excluded. do not create locally
      if (deleteFSBidOutput(OUTPUT_LOCATION, bid.id)) {
        didChangeAnything = true;
      }
      continue;
    }

    if (validatorFilesExist(OUTPUT_LOCATION, bid.id) && tekuProposerConfigExists(TEKU_PROPOSER_FILE, validatorPubKey, etherfiNode)) {
      // file already exists. skip.
      continue;
    }
    didChangeAnything = true;

    console.log(`> start processing bid with id:${bid.id}`);

    // Fetch and decrypt
    const file = await fetchFromIpfs(ipfsHashForEncryptedValidatorKey);
    const keypairForIndex = getKeyPairByPubKeyIndex(pubKeyIndex, privKeyArray, pubKeyArray);
    const data = decryptValidatorKeyInfo(file, keypairForIndex);

    // Store
    console.log(`creating validator keys for bid:${bid.id}`);
    createFSBidOutput(OUTPUT_LOCATION, data, bid.id);

    // Add fee recipient
    console.log(`saving proposer config`);
    saveTekuProposerConfig(TEKU_PROPOSER_FILE, validatorPubKey, etherfiNode);

    console.log(`< end processing bid with id:${bid.id}`);
  }

  // Cleanup old bids
  const cleanupBids = await retrieveAllCleanupBidsIterated(GRAPH_URL, BIDDER);
  for (const bid of cleanupBids) {
    if (deleteFSBidOutput(OUTPUT_LOCATION, bid.id)) {
      didChangeAnything = true;
      console.log(`> cleaned up old, unhealthy bid with id:${bid.id}`);
    }
  }

  // Reload Teku if something happened
  if (didChangeAnything) {
    console.log('reloading teku now (sighup)');
    if (RESTART_MODE === 'docker') {
      await sigHupAllTekus();
    } else if (RESTART_MODE === 'kubernetes') {
      await kubernetesSigHupTeku();
    }
  }

  console.log('=====detecting new validators * end * =====');
}

const detectJob = new CronJob(
  '*/1 * * * *',
  function () {
    run();
  },
  null,
  true,
  'America/Los_Angeles',
);

export default detectJob;

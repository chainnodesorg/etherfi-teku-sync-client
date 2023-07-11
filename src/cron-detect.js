import { CronJob } from 'cron';
import { fetchFromIpfs } from './ipfs.js';
import { createFSBidOutput, validatorFilesExist, saveTekuProposerConfig } from './file.js';
import { extractPrivateKeysFromFS, getKeyPairByPubKeyIndex, decryptKeyPairJSON, decryptValidatorKeyInfo } from './decrypt.js';
import { getConfig } from './config.js';
import { retrieveBidsFromSubgraph } from './subgraph.js';
import { sigHupAllTekus } from './teku.js';

async function run() {
  console.log('=====detecting new validators * start * =====');

  const { GRAPH_URL, BIDDER, PRIVATE_KEYS_FILE_LOCATION, OUTPUT_LOCATION, PASSWORD, TEKU_PROPOSER_FILE } = getConfig();

  const privateKeys = extractPrivateKeysFromFS(PRIVATE_KEYS_FILE_LOCATION);

  const bids = await retrieveBidsFromSubgraph(GRAPH_URL, BIDDER);

  for (const bid of bids) {
    const { validator, pubKeyIndex } = bid;

    if (validatorFilesExist(OUTPUT_LOCATION, bid.id)) {
      // file already exists. skip.
      continue;
    }

    console.log(`> start processing bid with id:${bid.id}`);

    // Fetch and decrypt
    const { ipfsHashForEncryptedValidatorKey, validatorPubKey, etherfiNode } = validator;
    const file = await fetchFromIpfs(ipfsHashForEncryptedValidatorKey);
    const validatorKey = decryptKeyPairJSON(privateKeys, PASSWORD);
    const { pubKeyArray, privKeyArray } = validatorKey;
    const keypairForIndex = getKeyPairByPubKeyIndex(pubKeyIndex, privKeyArray, pubKeyArray);
    const data = decryptValidatorKeyInfo(file, keypairForIndex);

    // Store
    console.log(`creating validator keys for bid:${bid.id}`);
    createFSBidOutput(OUTPUT_LOCATION, data, bid.id);

    // Add fee recipient and reload teku (sighup)
    console.log(`saving proposer config and reloading teku`);
    saveTekuProposerConfig(TEKU_PROPOSER_FILE, validatorPubKey, etherfiNode);
    await sigHupAllTekus();

    console.log(`< end processing bid with id:${bid.id}`);
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

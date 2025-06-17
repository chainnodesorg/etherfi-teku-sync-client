import { CronJob } from 'cron';
import { fetchFromIpfs } from './ipfs.js';
import { createFSBidOutput, validatorFilesExist, saveTekuProposerConfig, tekuProposerConfigExists, deleteFSBidOutput } from './file.js';
import {
  extractPrivateKeysFromFS,
  getKeyPairByPubKeyIndex,
  decryptKeyPairJSON,
  decryptValidatorKeyInfo,
  decryptBLSKeystore,
} from './decrypt.js';
import { ETHERFI_SC_KEY_STORAGE_MODE_CASES, getConfig } from './config.js';
import { retrieveAllBidsIterated, retrieveAllCleanupBidsIterated } from './subgraph.js';
import { sigHupAllTekus, kubernetesSigHupTeku } from './teku.js';
import { doesValidatorKeyExistInVault, deleteValidatorKeyFromVault, storeValidatorKeyInVault } from './vault.js';

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
    CLEANUP_EXITED_KEYS,
    KEY_STORAGE_MODE,
  } = getConfig();

  const privateKeys = extractPrivateKeysFromFS(PRIVATE_KEYS_FILE_LOCATION);

  const validatorKey = decryptKeyPairJSON(privateKeys, PASSWORD);
  const { pubKeyArray, privKeyArray } = validatorKey;

  const bids = await retrieveAllBidsIterated(GRAPH_URL, BIDDER, CLEANUP_EXITED_KEYS);

  let didChangeAnything = false;

  if (KEY_STORAGE_MODE === ETHERFI_SC_KEY_STORAGE_MODE_CASES.DISK) {
    console.log(`**** Running in disk storage mode. ****`);
  } else if (KEY_STORAGE_MODE === ETHERFI_SC_KEY_STORAGE_MODE_CASES.VAULT) {
    console.log(`**** Running in vault storage mode. ****`);
  }

  // Get new bids
  for (const bid of bids) {
    const { validator, pubKeyIndex } = bid;

    const { ipfsHashForEncryptedValidatorKey, validatorPubKey, etherfiNode } = validator;

    if (KEY_STORAGE_MODE === ETHERFI_SC_KEY_STORAGE_MODE_CASES.DISK) {
      // **** Running in disk storage mode. ****

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
    } else if (KEY_STORAGE_MODE === ETHERFI_SC_KEY_STORAGE_MODE_CASES.VAULT) {
      // **** Running in vault storage mode. ****

      if (EXCLUDED_VALIDATORS.includes(bid.id.toLowerCase().trim()) || EXCLUDED_VALIDATORS.includes(validatorPubKey.toLowerCase().trim())) {
        // validator excluded. do not create in vault
        const didValidatorKeyExist = await deleteValidatorKeyFromVault(validatorPubKey);
        if (didValidatorKeyExist) {
          didChangeAnything = true;
        }
        continue;
      }

      const doesValidatorKeyExist = await doesValidatorKeyExistInVault(validatorPubKey);
      if (doesValidatorKeyExist && tekuProposerConfigExists(TEKU_PROPOSER_FILE, validatorPubKey, etherfiNode)) {
        // key already exists in vault. skip.
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
      const validatorKeyKeystore = data.validatorKeyFile;
      const validatorKeyPassword = data.validatorKeyPassword;
      const decryptedValidatorPrivateKey = await decryptBLSKeystore(validatorKeyKeystore, validatorKeyPassword);
      await storeValidatorKeyInVault(validatorPubKey, 'store_only_tmp_data_for_now');
    }

    // Add fee recipient
    if (TEKU_PROPOSER_FILE) {
      console.log(`saving proposer config`);
      saveTekuProposerConfig(TEKU_PROPOSER_FILE, validatorPubKey, etherfiNode);
    } else {
      console.log(`skipping teku proposer config saving as no path was defined in env.`);
    }

    console.log(`< end processing bid with id:${bid.id}`);
  }

  // Cleanup old bids
  if (CLEANUP_EXITED_KEYS) {
    const cleanupBids = await retrieveAllCleanupBidsIterated(GRAPH_URL, BIDDER);
    for (const bid of cleanupBids) {
      if (KEY_STORAGE_MODE === ETHERFI_SC_KEY_STORAGE_MODE_CASES.DISK) {
        if (deleteFSBidOutput(OUTPUT_LOCATION, bid.id)) {
          didChangeAnything = true;
          console.log(`> cleaned up old, unhealthy bid with id:${bid.id}`);
        }
      } else if (KEY_STORAGE_MODE === ETHERFI_SC_KEY_STORAGE_MODE_CASES.VAULT) {
        const didValidatorKeyExist = await deleteValidatorKeyFromVault(bid.validator.validatorPubKey);
        if (didValidatorKeyExist) {
          didChangeAnything = true;
          console.log(`> cleaned up old, unhealthy bid with id:${bid.id}`);
        }
      }
    }
  }

  // Restart vc if needed.
  if (didChangeAnything) {
    // Reload Teku if something happened
    if (RESTART_MODE === 'docker') {
      console.log('reloading teku now (sighup)');
      await sigHupAllTekus();
    } else if (RESTART_MODE === 'kubernetes') {
      console.log('reloading teku in kubernetes now (sighup)');
      await kubernetesSigHupTeku();
    }
  }

  console.log('=====detecting new validators * end * =====');
}

const detectJob = CronJob.from({
  cronTime: '*/5 * * * *',
  onTick: async function () {
    await run();
  },
  onComplete: null,
  start: true,
  timeZone: 'UTC',
  runOnInit: true,
  waitForCompletion: true,
});

export default detectJob;

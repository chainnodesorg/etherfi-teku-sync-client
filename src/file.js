import fs from 'fs';
import { getConfig } from './config.js';
import { getAddress } from 'ethers';

export const createFSBidOutput = (location, data, identifier) => {
  createDirSafe(location);
  createFile(`${location}/keystore-${identifier}.txt`, data.validatorKeyPassword);
  createFile(`${location}/keystore-${identifier}.json`, JSON.stringify(data.validatorKeyFile));
};

/**
 * Deletes a bid key if it exists
 * @param {string} location The location prefix for the validator keys.
 * @param {string} identifier The identifier of this validator key.
 * @returns {boolean} true if a change happened, false otherwise.
 */
export function deleteFSBidOutput(location, identifier) {
  const deletedOne = deleteFile(`${location}/keystore-${identifier}.txt`);
  const deletedTwo = deleteFile(`${location}/keystore-${identifier}.json`);

  if (deletedOne || deletedTwo) {
    return true;
  }

  return false;
}

export const validatorFilesExist = (location, identifier) => {
  if (!fs.existsSync(`${location}/keystore-${identifier}.txt`)) {
    return false;
  }
  if (!fs.existsSync(`${location}/keystore-${identifier}.json`)) {
    return false;
  }

  return true;
};

export async function saveTekuProposerConfig(tekuProposerConfigFile, allValidatorPubKeysAndFeeRecipients) {
  if (!tekuProposerConfigFile) {
    // undefined teku proposer file means we are not interested in this.
    return;
  }

  const proposerConfig = JSON.parse(fs.readFileSync(tekuProposerConfigFile));
  if (!proposerConfig.proposer_config) {
    proposerConfig.proposer_config = {};
  }

  for (const validatorPubKeyAndFeeRecipient of allValidatorPubKeysAndFeeRecipients) {
    proposerConfig.proposer_config[validatorPubKeyAndFeeRecipient.validatorPubKey.toLowerCase().trim()] = {
      fee_recipient: getAddress(validatorPubKeyAndFeeRecipient.validatorFeeRecipient.toLowerCase().trim()),
    };
  }

  // write back
  fs.writeFileSync(tekuProposerConfigFile, JSON.stringify(proposerConfig, null, 2));
}

export function tekuProposerConfigExists(tekuProposerConfigFile, pubKey, feeRecipient) {
  if (!tekuProposerConfigFile) {
    // undefined teku proposer file means we are not interested in this.
    return true;
  }

  const proposerConfig = JSON.parse(fs.readFileSync(tekuProposerConfigFile));
  if (!proposerConfig) {
    return false;
  }

  if (!proposerConfig.proposer_config) {
    return false;
  }

  const saved = proposerConfig.proposer_config[`0x${pubKey.replace(/0x/g, '')}`.toLowerCase().trim()];
  if (!saved) {
    return false;
  }

  if (saved.fee_recipient !== getAddress(feeRecipient.toLowerCase().trim())) {
    return false;
  }

  return true;
}

const createDirSafe = (location) => {
  if (fs.existsSync(location)) {
    return;
  }
  fs.mkdirSync(`${location}`);
};

const createFile = (location, content) => {
  if (fs.existsSync(location)) {
    return;
  }
  fs.writeFileSync(location, content);
};

/**
 * Delete the given file if it exists.
 * @param {string} location The path to delete
 * @returns {boolean} true if file was deleted, false if it wasn't because it didn't exist.
 */
const deleteFile = (location) => {
  if (!fs.existsSync(location)) {
    return false;
  }
  fs.unlinkSync(location);
  return true;
};

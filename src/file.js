import fs from 'fs';
import { getConfig } from './config.js';
import { getAddress } from 'ethers/lib/utils.js';

export const createFSBidOutput = (location, data, identifier) => {
  createDirSafe(location);
  createFile(`${location}/keystore-${identifier}.txt`, data.validatorKeyPassword);
  createFile(`${location}/keystore-${identifier}.json`, JSON.stringify(data.validatorKeyFile));
};

export const validatorFilesExist = (location, identifier) => {
  if (!fs.existsSync(`${location}/keystore-${identifier}.txt`)) {
    return false;
  }
  if (!fs.existsSync(`${location}/keystore-${identifier}.json`)) {
    return false;
  }

  return true;
};

export const saveTekuProposerConfig = (tekuProposerConfigFile, pubKey, feeRecipient) => {
  const proposerConfig = JSON.parse(fs.readFileSync(tekuProposerConfigFile));
  if (!proposerConfig.proposer_config) {
    proposerConfig.proposer_config = {};
  }

  proposerConfig.proposer_config[pubKey.toLowerCase().trim()] = {
    fee_recipient: getAddress(feeRecipient.toLowerCase().trim()),
  };

  // write back
  fs.writeFileSync(tekuProposerConfigFile, JSON.stringify(proposerConfig, null, 2));
};

export function tekuProposerConfigExists(tekuProposerConfigFile, pubKey, feeRecipient) {
  const proposerConfig = JSON.parse(fs.readFileSync(tekuProposerConfigFile));
  if (!proposerConfig) {
    return false;
  }

  if (!proposerConfig.proposer_config) {
    return false;
  }

  const saved = proposerConfig.proposer_config[pubKey.toLowerCase().trim()];
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

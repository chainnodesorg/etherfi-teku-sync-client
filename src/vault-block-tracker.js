import axios from 'axios';
import { getConfig } from './config.js';
import fs from 'fs';

/**
 * Reads the Vault token from the configured path
 * @returns {string} Vault token
 */
function readVaultToken() {
  const { VAULT_CLIENT_TOKEN_PATH } = getConfig();
  return fs.readFileSync(VAULT_CLIENT_TOKEN_PATH).toString().trim();
}

/**
 * Gets the last scanned block number from Vault
 * @returns {Promise<number|null>} Last scanned block number, or null if not found
 */
export async function getLastScannedBlock() {
  const { VAULT_URL, VAULT_VALIDATORS_SECRET_MOUNT_PATH, VAULT_STATE_PATH } = getConfig();

  try {
    const vaultToken = readVaultToken();

    const response = await axios.get(`${VAULT_URL}/v1/${VAULT_VALIDATORS_SECRET_MOUNT_PATH}/data/${VAULT_STATE_PATH}/block-tracker`, {
      headers: { 'X-Vault-Token': vaultToken, Accept: 'application/json' },
    });

    if (response.data && response.data.data && response.data.data.data) {
      const lastScanned = response.data.data.data.lastScannedBlock;
      if (lastScanned !== undefined && lastScanned !== null) {
        console.log(`Retrieved last scanned block from Vault: ${lastScanned}`);
        return parseInt(lastScanned, 10);
      }
    }

    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('No previous scan data found in Vault. Starting fresh.');
      return null;
    }
    console.error('Error retrieving last scanned block from Vault:', error.message);
    throw error;
  }
}

/**
 * Sets the last scanned block number in Vault
 * @param {number} blockNumber - Block number to store
 * @returns {Promise<void>}
 */
export async function setLastScannedBlock(blockNumber) {
  const { VAULT_URL, VAULT_VALIDATORS_SECRET_MOUNT_PATH, VAULT_STATE_PATH } = getConfig();

  try {
    const vaultToken = readVaultToken();

    // Get current data to preserve lastFinalizedBlock if it exists
    let currentData = {};
    try {
      const response = await axios.get(`${VAULT_URL}/v1/${VAULT_VALIDATORS_SECRET_MOUNT_PATH}/data/${VAULT_STATE_PATH}/block-tracker`, {
        headers: { 'X-Vault-Token': vaultToken, Accept: 'application/json' },
      });

      if (response.data && response.data.data && response.data.data.data) {
        currentData = response.data.data.data;
      }
    } catch (error) {
      // Ignore 404 errors - means no existing data
      if (error.response && error.response.status !== 404) {
        throw error;
      }
    }

    // Update with new lastScannedBlock
    const updatedData = {
      ...currentData,
      lastScannedBlock: blockNumber,
      lastUpdated: new Date().toISOString(),
    };

    await axios.post(
      `${VAULT_URL}/v1/${VAULT_VALIDATORS_SECRET_MOUNT_PATH}/data/${VAULT_STATE_PATH}/block-tracker`,
      {
        data: updatedData,
      },
      {
        headers: {
          'X-Vault-Token': vaultToken,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );

    console.log(`Stored last scanned block in Vault: ${blockNumber}`);
  } catch (error) {
    console.error('Error storing last scanned block in Vault:', error.message);
    throw error;
  }
}

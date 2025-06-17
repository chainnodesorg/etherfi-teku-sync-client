import axios, { isCancel, AxiosError } from 'axios';
import { getConfig } from './config.js';
import fs from 'fs';

function readVaultToken() {
  const { VAULT_CLIENT_TOKEN_PATH } = getConfig();
  return fs.readFileSync(VAULT_CLIENT_TOKEN_PATH).toString().trim();
}

function normalizePublicKey(publicKey) {
  return `0x${publicKey.replace(/0x/g, '')}`.toLowerCase().trim();
}

export async function emptyAllSecretsInConfiguredVaultPath() {
  const { VAULT_URL, VAULT_VALIDATORS_SECRET_MOUNT_PATH, VAULT_VALIDATORS_PATH } = getConfig();

  const vaultToken = readVaultToken();

  return await axios
    .get(`${VAULT_URL}/v1/${VAULT_VALIDATORS_SECRET_MOUNT_PATH}/metadata/${VAULT_VALIDATORS_PATH}?list=true`, {
      headers: { 'X-Vault-Token': vaultToken, Accept: 'application/json' },
    })
    .then(async (response) => {
      for (const key of response.data.data.keys) {
        await deleteValidatorKeyFromVault(key);
        console.log(`Deleted Public Key: ${key}`);
      }
    });
}

export async function doesValidatorKeyExistInVault(publicKey) {
  const { VAULT_URL, VAULT_VALIDATORS_SECRET_MOUNT_PATH, VAULT_VALIDATORS_PATH } = getConfig();

  const vaultToken = readVaultToken();

  const normalizedPubKey = normalizePublicKey(publicKey);

  return await axios
    .get(`${VAULT_URL}/v1/${VAULT_VALIDATORS_SECRET_MOUNT_PATH}/metadata/${VAULT_VALIDATORS_PATH}/${normalizedPubKey}`, {
      headers: { 'X-Vault-Token': vaultToken, Accept: 'application/json' },
    })
    .then((response) => {
      if (response.data.data && !response.data.errors) {
        return true;
      } else {
        return false;
      }
    })
    .catch((error) => {
      if (error.response.status === 404 && Array.isArray(error.response.data.errors) && error.response.data.errors.length === 0) {
        return false;
      } else {
        throw error;
      }
    });
}

export async function deleteValidatorKeyFromVault(publicKey) {
  const doesValidatorKeyExist = await doesValidatorKeyExistInVault(publicKey);
  if (!doesValidatorKeyExist) {
    return false;
  }

  const { VAULT_URL, VAULT_VALIDATORS_SECRET_MOUNT_PATH, VAULT_VALIDATORS_PATH } = getConfig();

  const vaultToken = readVaultToken();

  const normalizedPubKey = normalizePublicKey(publicKey);

  return await axios
    .delete(`${VAULT_URL}/v1/${VAULT_VALIDATORS_SECRET_MOUNT_PATH}/metadata/${VAULT_VALIDATORS_PATH}/${normalizedPubKey}`, {
      headers: { 'X-Vault-Token': vaultToken, Accept: 'application/json' },
    })
    .then((response) => {
      return true;
    });
}

export async function storeValidatorKeyInVault(publicKey, privateKey) {
  const { VAULT_URL, VAULT_VALIDATORS_SECRET_MOUNT_PATH, VAULT_VALIDATORS_PATH } = getConfig();

  const vaultToken = readVaultToken();

  const normalizedPubKey = normalizePublicKey(publicKey);

  return await axios.post(
    `${VAULT_URL}/v1/${VAULT_VALIDATORS_SECRET_MOUNT_PATH}/data/${VAULT_VALIDATORS_PATH}/${normalizedPubKey}`,
    {
      options: {
        // only allow newly created tokens. fail otherwise.
        cas: 0,
      },
      data: {
        value: privateKey,
      },
    },
    { headers: { 'X-Vault-Token': vaultToken, Accept: 'application/json', 'Content-Type': 'application/json' } },
  );
}

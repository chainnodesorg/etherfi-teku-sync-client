import axios, { isCancel, AxiosError } from 'axios';
import { getConfig } from './config.js';
import fs from 'fs';
import https from 'https';
import YAML from 'yaml';
import _ from 'lodash';

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

/// Returns true if a change was made, false otherwise.
export async function saveWeb3SignerConfig(web3SignerConfigFile, publicKeys) {
  if (!web3SignerConfigFile) {
    // undefined web3signer config file means we are not interested in this.
    return false;
  }
  let changeWasMade = false;

  const { VAULT_URL, VAULT_VALIDATORS_SECRET_MOUNT_PATH, VAULT_VALIDATORS_PATH } = getConfig();

  const vaultToken = readVaultToken();

  if (!fs.existsSync(web3SignerConfigFile)) {
    fs.writeFileSync(web3SignerConfigFile, '');
    changeWasMade = true;
  }

  const allConfigsToWrite = [];
  const allConfigsToWriteIndexed = {};
  for (const publicKey of publicKeys) {
    const normalizedPubKey = normalizePublicKey(publicKey);

    const newConfigKeyPath = `/v1/${VAULT_VALIDATORS_SECRET_MOUNT_PATH}/data/${VAULT_VALIDATORS_PATH}/${normalizedPubKey}`;
    const vaultUrlAsURL = new URL(VAULT_URL);
    const newServerHost = `${vaultUrlAsURL.protocol}//${vaultUrlAsURL.hostname}`;
    const newServerPort = `${vaultUrlAsURL.port}`;
    const newConfig = {
      type: 'hashicorp',
      keyType: 'BLS',
      tlsEnabled: 'true',
      keyPath: `${newConfigKeyPath}`,
      keyName: 'value',
      serverHost: `${newServerHost}`,
      serverPort: `${newServerPort}`,
      timeout: '10000',
      token: `${vaultToken}`,
      httpProtocolVersion: 'HTTP_2',
    };

    allConfigsToWrite.push(newConfig);
    allConfigsToWriteIndexed[newConfig.keyPath] = newConfig;
  }

  const web3SignerConfigs = YAML.parseAllDocuments(fs.readFileSync(web3SignerConfigFile).toString()).map((file) => file.toJS());
  const web3SignerConfigsIndexed = {};
  for (const element of web3SignerConfigs) {
    web3SignerConfigsIndexed[element.keyPath] = element;
  }
  const newWeb3SignerConfigs = [];
  for (const web3SignerConfig of web3SignerConfigs) {
    const foundConfig = allConfigsToWriteIndexed[web3SignerConfig.keyPath];
    if (!foundConfig) {
      newWeb3SignerConfigs.push(web3SignerConfig);
      changeWasMade = true;
    } else {
      if (_.isEqual(web3SignerConfig, foundConfig)) {
        // Literally the same means no change was made.
      } else {
        changeWasMade = true;
      }
    }
  }
  for (const newConfig of allConfigsToWrite) {
    const foundConfig = web3SignerConfigsIndexed[newConfig.keyPath];
    if (!foundConfig) {
      changeWasMade = true;
    }
    if (foundConfig && !_.isEqual(newConfig, foundConfig)) {
      changeWasMade = true;
    }

    newWeb3SignerConfigs.push(newConfig);
  }

  // write back
  fs.writeFileSync(
    web3SignerConfigFile,
    newWeb3SignerConfigs
      .map((element) => new YAML.Document(element))
      .map((element) => YAML.stringify(element))
      .join('---\n'),
  );

  return changeWasMade;
}

export async function reloadWeb3Signer() {
  const {
    WEB3SIGNER_RELOAD_URL,
    WEB3SIGNER_RELOAD_URL_CLIENT_CERT_PATH,
    WEB3SIGNER_RELOAD_URL_CLIENT_KEY_PATH,
    WEB3SIGNER_RELOAD_URL_CLIENT_KEY_PW_PATH,
    WEB3SIGNER_RELOAD_URL_SERVER_CERT_PATH,
    WEB3SIGNER_RELOAD_URL_SERVER_TLS_NAME,
  } = getConfig();

  let httpsAgent = undefined;
  if (
    WEB3SIGNER_RELOAD_URL_CLIENT_CERT_PATH &&
    WEB3SIGNER_RELOAD_URL_CLIENT_KEY_PATH &&
    WEB3SIGNER_RELOAD_URL_CLIENT_KEY_PW_PATH &&
    WEB3SIGNER_RELOAD_URL_SERVER_CERT_PATH &&
    WEB3SIGNER_RELOAD_URL_SERVER_TLS_NAME
  ) {
    // Use mTLS.
    httpsAgent = new https.Agent({
      key: fs.readFileSync(WEB3SIGNER_RELOAD_URL_CLIENT_KEY_PATH),
      cert: fs.readFileSync(WEB3SIGNER_RELOAD_URL_CLIENT_CERT_PATH),
      ca: fs.readFileSync(WEB3SIGNER_RELOAD_URL_SERVER_CERT_PATH),
      passphrase: fs.readFileSync(WEB3SIGNER_RELOAD_URL_CLIENT_KEY_PW_PATH).toString().trim(),
      rejectUnauthorized: true,
      servername: WEB3SIGNER_RELOAD_URL_SERVER_TLS_NAME,
    });
  }

  return await axios.post(`${WEB3SIGNER_RELOAD_URL}/reload`, null, { httpsAgent: httpsAgent });
}

import fs from 'fs';
import crypto from 'crypto';
import EC from 'elliptic';
import BN from 'bn.js';

function decrypt(text, ENCRYPTION_KEY) {
  // should have the form [iv]:[ciphertext]
  let textParts = text.split(':');
  let iv = Buffer.from(textParts.shift(), 'hex');
  let encryptedText = Buffer.from(textParts.join(':'), 'hex');
  let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);

  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString();
}

function decryptGCM(text, ENCRYPTION_KEY) {
  // should have the form [iv]:[data]:[authTag]
  let textParts = text.split(':');
  let iv = Buffer.from(textParts.shift(), 'hex');
  let encryptedText = Buffer.from(textParts.shift(), 'hex');
  let decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
  decipher.setAuthTag(Buffer.from(textParts.shift(), 'hex'));
  let decrypted = decipher.update(encryptedText);

  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString();
}

export const extractPrivateKeysFromFS = (location) => {
  const result = JSON.parse(fs.readFileSync(location));
  return result;
};

export const extractPasswordFromFS = (location) => {
  const result = JSON.parse(fs.readFileSync(location));
  const { passwordArray } = result;
  const [first] = passwordArray;
  return first;
};

const decryptPrivateKeys = (privateKeysJSON, privKeysPassword) => {
  let isCBC = false;
  if (!privateKeysJSON.authTag) {
    isCBC = true;
  }

  const iv = Buffer.from(privateKeysJSON.iv, 'hex');
  const salt = Buffer.from(privateKeysJSON.salt, 'hex');
  const encryptedData = Buffer.from(privateKeysJSON.data, 'hex');
  const key = crypto.pbkdf2Sync(privKeysPassword, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv(isCBC ? 'aes-256-cbc' : 'aes-256-gcm', key, iv);
  if (!isCBC) {
    decipher.setAuthTag(Buffer.from(privateKeysJSON.authTag, 'hex'));
  }
  const decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  let decryptedDataJSON = JSON.parse(decryptedData.toString('utf8'));
  return decryptedDataJSON;
};

export const decryptKeyPairJSON = (encryptedPrivateKeysJson, password) => {
  var privateKeysJson = null;
  try {
    privateKeysJson = decryptPrivateKeys(encryptedPrivateKeysJson, password);
  } catch (err) {
    console.error(err);
  }
  return privateKeysJson;
};

export const decryptValidatorKeyInfo = (file, keypairForIndex) => {
  const curve = new EC.ec('secp256k1');
  const { privateKey, publicKey } = keypairForIndex;
  const stakerPublicKeyHex = file['stakerPublicKey'];
  const receivedStakerPubKeyPoint = curve.keyFromPublic(stakerPublicKeyHex, 'hex').getPublic();
  const nodeOperatorPrivKey = new BN(privateKey);
  const nodeOperatorSharedSecret = receivedStakerPubKeyPoint.mul(nodeOperatorPrivKey).getX();
  const secretAsArray = nodeOperatorSharedSecret.toArrayLike(Buffer, 'be', 32);

  let isCBC = false;
  if (
    file['encryptedValidatorKey'].split(':').length === 2 &&
    file['encryptedPassword'].split(':').length === 2 &&
    file['encryptedKeystoreName'].split(':').length === 2
  ) {
    isCBC = true;
  }

  let validatorKeyString;
  let validatorKeyPassword;
  let keystoreName;
  if (isCBC) {
    validatorKeyString = decrypt(file['encryptedValidatorKey'], nodeOperatorSharedSecret.toArrayLike(Buffer, 'be', 32));
    validatorKeyPassword = decrypt(file['encryptedPassword'], secretAsArray);
    keystoreName = decrypt(file['encryptedKeystoreName'], secretAsArray);
  } else {
    validatorKeyString = decryptGCM(file['encryptedValidatorKey'], nodeOperatorSharedSecret.toArrayLike(Buffer, 'be', 32));
    validatorKeyPassword = decryptGCM(file['encryptedPassword'], secretAsArray);
    keystoreName = decryptGCM(file['encryptedKeystoreName'], secretAsArray);
  }

  return { validatorKeyFile: JSON.parse(validatorKeyString), validatorKeyPassword, keystoreName };
};

export const getKeyPairByPubKeyIndex = (pubkeyIndexString, privateKeys, publicKeys) => {
  const parseAsInt = parseInt(pubkeyIndexString);
  return {
    privateKey: privateKeys[parseAsInt],
    publicKey: publicKeys[parseAsInt],
  };
};

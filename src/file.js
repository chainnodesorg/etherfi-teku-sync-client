import fs from "fs";
import { getConfig } from "./config.js";

export const createFSBidOutput = (location, data, identifier) => {
  createDirSafe(location);
  createFile(
    `${location}/keystore-${identifier}.txt`,
    data.validatorKeyPassword
  );
  createFile(
    `${location}/keystore-${identifier}.json`,
    JSON.stringify(data.validatorKeyFile)
  );
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

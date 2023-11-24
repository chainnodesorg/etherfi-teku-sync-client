import 'dotenv/config';

export const getConfig = () => {
  const IPFS_GATEWAY = process.env.ETHERFI_SC_IPFS_GATEWAY;
  const GRAPH_URL = process.env.ETHERFI_SC_GRAPH_URL;
  const BIDDER = process.env.ETHERFI_SC_BIDDER;
  const PRIVATE_KEYS_FILE_LOCATION = process.env.ETHERFI_SC_PRIVATE_KEYS_FILE_LOCATION;
  const OUTPUT_LOCATION = process.env.ETHERFI_SC_OUTPUT_LOCATION;
  const PASSWORD = process.env.ETHERFI_SC_PASSWORD;
  const TEKU_PROPOSER_FILE = process.env.ETHERFI_SC_TEKU_PROPOSER_FILE;
  const RESTART_MODE = process.env.ETHERFI_SC_RESTART_MODE || 'none';

  const env = {
    GRAPH_URL,
    BIDDER,
    PRIVATE_KEYS_FILE_LOCATION,
    OUTPUT_LOCATION,
    PASSWORD,
    IPFS_GATEWAY,
    TEKU_PROPOSER_FILE,
    RESTART_MODE,
  };

  const valuesAsArray = Object.values(env);

  if (!valuesAsArray.every((x) => typeof x === 'string')) {
    throw Error('env did not load correctly, stopping');
  }
  if (!['none', 'docker', 'kubernetes'].includes(RESTART_MODE)) {
    throw Error('RESTART_MODE given not supported, stopping');
  }

  return env;
};

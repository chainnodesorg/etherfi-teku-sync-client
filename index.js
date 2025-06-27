import { getConfig } from './src/config.js';
import { cronJobDetectValidators, cronJobQuickReloadWeb3Signer } from './src/cron-detect.js';

// Make sure we validate env right away.
getConfig();

cronJobDetectValidators.start();
cronJobQuickReloadWeb3Signer.start();

import { getConfig } from './src/config.js';
import cronJobDetectValidators from './src/cron-detect.js';

// Make sure we validate env right away.
getConfig();

cronJobDetectValidators.start();

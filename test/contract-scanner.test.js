/**
 * Unit test for contract-scanner.js
 * Tests retrieveAllBidsIterated with real RPC endpoint and mocked Vault
 *
 * NOTE: This test uses your .env file for configuration.
 * Make sure your .env has all required ETHERFI_SC_* variables set.
 */

import { performance } from 'perf_hooks';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, '../.env') });

// Create a temporary vault token file for testing (overrides real vault)
const testVaultTokenPath = '/tmp/vault-token-test';
try {
  fs.mkdirSync('/tmp', { recursive: true });
  fs.writeFileSync(testVaultTokenPath, 'test-token-12345');
  // Override the vault token path to use test token
  process.env.ETHERFI_SC_VAULT_CLIENT_TOKEN_PATH = testVaultTokenPath;
} catch (err) {
  console.error('Failed to create test vault token:', err);
}

// Create a mock vault-block-tracker module file
const mockVaultTrackerContent = `
export async function getLastScannedBlock() {
  console.log('[MOCK] getLastScannedBlock called - returning null (first run)');
  return null;
}

export async function setLastScannedBlock(blockNumber) {
  console.log(\`[MOCK] setLastScannedBlock called with block: \${blockNumber}\`);
  return true;
}

export async function getLastFinalizedBlock() {
  console.log('[MOCK] getLastFinalizedBlock called - returning null');
  return null;
}

export async function setLastFinalizedBlock(blockNumber) {
  console.log(\`[MOCK] setLastFinalizedBlock called with block: \${blockNumber}\`);
  return true;
}
`;

// Write mock file
const mockFilePath = join(__dirname, '../src/vault-block-tracker-mock.js');
fs.writeFileSync(mockFilePath, mockVaultTrackerContent);

// Modify contract-scanner to use mock
const contractScannerPath = join(__dirname, '../src/contract-scanner.js');
const originalContent = fs.readFileSync(contractScannerPath, 'utf-8');
const modifiedContent = originalContent.replace(
  "from './vault-block-tracker.js'",
  "from './vault-block-tracker-mock.js'"
);

// Create temporary test version
const testScannerPath = join(__dirname, '../src/contract-scanner-test.js');
fs.writeFileSync(testScannerPath, modifiedContent);

// Now import the test version
const { retrieveAllBidsIterated } = await import('../src/contract-scanner-test.js');

/**
 * Test configuration - loaded from .env
 */
const TEST_CONFIG = {
  RPC_URL: process.env.ETHERFI_SC_RPC_URL,
  BIDDER: process.env.ETHERFI_SC_BIDDER,
  CLEANUP_EXITED_KEYS: process.env.ETHERFI_SC_CLEANUP_EXITED_KEYS === 'true',
};

// Validate required environment variables
if (!TEST_CONFIG.RPC_URL) {
  console.error('ERROR: ETHERFI_SC_RPC_URL is not set in .env file');
  process.exit(1);
}
if (!TEST_CONFIG.BIDDER) {
  console.error('ERROR: ETHERFI_SC_BIDDER is not set in .env file');
  process.exit(1);
}

/**
 * Formats milliseconds to human-readable time
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Main test function
 */
async function runTest() {
  console.log('='.repeat(80));
  console.log('CONTRACT SCANNER TEST');
  console.log('='.repeat(80));
  console.log();

  console.log('Test Configuration (from .env):');
  console.log(`  RPC URL: ${TEST_CONFIG.RPC_URL.substring(0, 50)}...`);
  console.log(`  Bidder: ${TEST_CONFIG.BIDDER}`);
  console.log(`  Cleanup Exited Keys: ${TEST_CONFIG.CLEANUP_EXITED_KEYS}`);
  console.log(`  Start Block: ${process.env.ETHERFI_SC_START_BLOCK || 'default'}`);
  console.log(`  Chunk Size: ${process.env.ETHERFI_SC_SCAN_CHUNK_SIZE || 'default'}`);
  console.log(`  Max Parallel Requests: ${process.env.ETHERFI_SC_MAX_PARALLEL_REQUESTS || 'default'}`);
  console.log();

  console.log('Vault Configuration:');
  console.log('  ✓ Using mocked Vault (returns null for last scanned block)');
  console.log('  ✓ Simulating first run from START_BLOCK');
  console.log();

  console.log('-'.repeat(80));
  console.log('Starting test execution...');
  console.log('-'.repeat(80));
  console.log();

  const startTime = performance.now();
  let result;
  let error;

  try {
    result = await retrieveAllBidsIterated(
      TEST_CONFIG.RPC_URL,
      TEST_CONFIG.BIDDER,
      TEST_CONFIG.CLEANUP_EXITED_KEYS
    );
  } catch (err) {
    error = err;
  }

  const endTime = performance.now();
  const duration = endTime - startTime;

  console.log();
  console.log('='.repeat(80));
  console.log('TEST RESULTS');
  console.log('='.repeat(80));
  console.log();

  console.log(`⏱️  Execution Time: ${formatDuration(duration)}`);
  console.log();

  // Cleanup temporary files
  try {
    fs.unlinkSync(mockFilePath);
    fs.unlinkSync(testScannerPath);
    fs.unlinkSync(testVaultTokenPath);
  } catch (cleanupErr) {
    // Ignore cleanup errors
  }

  if (error) {
    console.log('❌ TEST FAILED');
    console.log();
    console.log('Error Details:');
    console.log(`  Message: ${error.message}`);
    console.log(`  Stack: ${error.stack}`);
    process.exit(1);
  } else {
    console.log('✅ TEST PASSED');
    console.log();
    console.log('Results:');
    console.log(`  Total Bids Retrieved: ${result.length}`);
    console.log();

    if (result.length > 0) {
      console.log('Sample Bid (first result):');
      const sample = result[0];
      console.log(`  Bid ID: ${sample.id}`);
      console.log(`  Bidder Address: ${sample.bidderAddress}`);
      console.log(`  Pub Key Index: ${sample.pubKeyIndex}`);
      console.log(`  Validator:`);
      console.log(`    ID: ${sample.validator.id}`);
      console.log(`    Phase: ${sample.validator.phase}`);
      console.log(`    Public Key: ${sample.validator.validatorPubKey.substring(0, 20)}...`);
      console.log(`    IPFS Hash: ${sample.validator.ipfsHashForEncryptedValidatorKey.substring(0, 20)}...`);
      console.log(`    EtherFi Node: ${sample.validator.etherfiNode}`);
      console.log(`    BNFT Holder: ${sample.validator.BNFTHolder}`);
      console.log();

      if (result.length > 1) {
        console.log(`... and ${result.length - 1} more bid(s)`);
        console.log();
      }
    } else {
      console.log('  ⚠️  No bids found for this bidder address');
      console.log('  This could mean:');
      console.log('    - The bidder has no validators registered');
      console.log('    - The bidder address is incorrect');
      console.log('    - Events have not been indexed yet');
      console.log();
    }

    // Performance metrics
    console.log('Performance Metrics:');
    console.log(`  Total Duration: ${formatDuration(duration)}`);
    if (result.length > 0) {
      console.log(`  Time per Bid: ${formatDuration(duration / result.length)}`);
    }
    console.log();
  }

  console.log('='.repeat(80));
}

// Run the test
runTest().catch((error) => {
  console.error('Unhandled test error:', error);

  // Cleanup on error
  try {
    const mockFilePath = join(__dirname, '../src/vault-block-tracker-mock.js');
    const testScannerPath = join(__dirname, '../src/contract-scanner-test.js');
    const testVaultTokenPath = '/tmp/vault-token-test';
    fs.unlinkSync(mockFilePath);
    fs.unlinkSync(testScannerPath);
    fs.unlinkSync(testVaultTokenPath);
  } catch (cleanupErr) {
    // Ignore cleanup errors
  }

  process.exit(1);
});

import { ethers, JsonRpcProvider, Wallet, Contract, ContractFactory, JsonAbi, type TransactionReceipt } from 'ethers';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '..', 'artifacts', 'contracts');

export interface Artifact {
  abi: JsonAbi;
  bytecode: string;
}

/**
 * Load a compiled contract artifact by name.
 *
 * Hardhat v3 writes artifacts to artifacts/contracts/<Name>.sol/<Name>.json.
 */
export function loadArtifact(name: string): Artifact {
  const dirs = readdirSync(ARTIFACTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dir of dirs) {
    const path = join(ARTIFACTS_DIR, dir, `${name}.json`);
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        abi: parsed.abi ?? parsed.contractAbi,
        bytecode: parsed.bytecode ?? parsed.evm?.bytecode?.object,
      };
    } catch {
      // Try next directory
    }
  }
  throw new Error(`Artifact not found: ${name}`);
}

/**
 * Get a fresh test provider and funded deployer wallet.
 *
 * Creates a NEW provider and wallet each time (not a singleton) so ethers'
 * nonce tracking always syncs from the node. This avoids nonce races when
 * multiple test files share the same Hardhat node.
 *
 * Connects to a local Hardhat node at HARDHAT_NODE_URL (default
 * http://127.0.0.1:8545). Uses Hardhat's first pre-funded account.
 */
export async function setupTestEnv() {
  const url = process.env.HARDHAT_NODE_URL ?? 'http://127.0.0.1:8545';
  const provider = new JsonRpcProvider(url);

  // Use Hardhat's first pre-funded account (well-known private key).
  const deployer = new Wallet(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    provider,
  );
  const other = new Wallet(
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    provider,
  );

  return { provider, deployer, other };
}

/**
 * Deploy a contract and return a typed ethers Contract instance.
 *
 * Bypasses ethers' ContractFactory.deploy() and uses raw sendTransaction
 * with an explicit nonce, because ethers v6 + Hardhat v3 has a nonce-tracking
 * issue where the factory ignores the passed nonce and uses its own stale
 * internal counter.
 */
export async function deployContract(
  name: string,
  deployer: Wallet,
  ...args: unknown[]
): Promise<Contract> {
  const artifact = loadArtifact(name);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, deployer);

  // Encode the constructor args into the deployment data.
  const deployData = (artifact.bytecode +
    (args.length > 0 ? factory.interface.encodeDeploy(args).slice(2) : '')) as string;

  // Fetch the nonce fresh from the node (bypassing ethers' cache) and send
  // a raw legacy transaction.
  const nonce = await syncNonce(deployer);
  const tx = await deployer.sendTransaction({ data: deployData, nonce, type: 0, gasLimit: 5_000_000 });
  const receipt = await tx.wait();
  if (!receipt || !receipt.contractAddress) {
    throw new Error(`Deployment of ${name} failed: no contract address in receipt`);
  }
  return new Contract(receipt.contractAddress, artifact.abi, deployer);
}

/**
 * Get a Contract instance attached to an existing address.
 */
export function getContractAt(name: string, address: string, signer: Wallet): Contract {
  const artifact = loadArtifact(name);
  return new Contract(address, artifact.abi, signer);
}

/**
 * Force-sync the wallet's nonce from the node, bypassing ethers' cache.
 *
 * ethers v6's JsonRpcProvider caches getTransactionCount results and does NOT
 * invalidate them when a new block is mined. This means after a transaction
 * is mined, the next getTransactionCount call returns the STALE pre-tx nonce.
 *
 * This function uses a raw fetch() to eth_getTransactionCount, which always
 * returns the current nonce from the node. This is the root-cause fix for the
 * nonce-too-low errors that plagued earlier test runs.
 */
export async function syncNonce(wallet: Wallet): Promise<number> {
  const provider = wallet.provider as JsonRpcProvider;
  const url = (provider as any).connection?.url ?? 'http://127.0.0.1:18545';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [wallet.address, 'latest'],
      id: 1,
    }),
  });
  const json = (await resp.json()) as { result: string };
  return parseInt(json.result, 16);
}

/**
 * Send a state-changing transaction with explicit nonce + legacy tx type.
 *
 * Uses raw sendTransaction to bypass ethers' internal nonce tracking, which
 * can desync on Hardhat v3. Encodes the function call manually and sends it
 * with a nonce fetched fresh from the node.
 */
export async function sendTx(
  contract: Contract,
  method: string,
  ...args: unknown[]
): Promise<TransactionReceipt> {
  const wallet = contract.runner as Wallet;
  const nonce = await syncNonce(wallet);

  // Encode the function call manually.
  const data = contract.interface.encodeFunctionData(method, args);
  const to = await contract.getAddress();

  const tx = await wallet.sendTransaction({ to, data, nonce, type: 0, gasLimit: 3_000_000 });
  return tx.wait();
}

/**
 * Expect a transaction to revert with a specific reason string.
 *
 * Uses `callStatic` semantics: the promise is awaited, and if it throws
 * with a message containing the expected reason, the assertion passes.
 * If it succeeds, the assertion fails.
 *
 * IMPORTANT: ethers v6 does not advance the wallet's nonce counter when a
 * transaction reverts, but the Hardhat node DOES advance the nonce (because
 * the tx was submitted and mined, even though it reverted). This causes nonce
 * races on subsequent transactions. To avoid this, we use `callStatic` for
 * revert tests whenever possible — it simulates the call without submitting
 * a real transaction, so no nonce is consumed.
 *
 * For non-view functions, pass a `.staticCall` variant of the transaction.
 */
export async function expectRevert(promise: Promise<unknown>, reason: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected transaction to revert with "${reason}", but it succeeded`);
  } catch (err: any) {
    const msg = err?.shortMessage ?? err?.message ?? String(err);
    if (!msg.includes(reason)) {
      throw new Error(`Expected revert reason "${reason}", but got: ${msg}`);
    }
  }
}

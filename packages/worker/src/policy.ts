/**
 * Policy contract client.
 *
 * Typed ethers v6 wrapper over the deployed Policy contract — the singleton
 * that governs the on-chain bounds (max amount, rate floor/ceiling, allowed
 * terms, paused flag) every MIRA loan must satisfy before origination.
 *
 * Read paths (`validateDecision`, `maxLoanAmount`, `minRate`, `maxRate`,
 * `getAllowedTerms`) are gasless: they go through `staticCall`, which is an
 * `eth_call` that never submits a transaction. The worker uses these to
 * short-circuit bad decisions before they ever reach the Loan contract.
 *
 * Write paths (`setPaused`, `updateBounds`) are governance-only and accept a
 * Signer. They submit a real state-changing transaction, wait for the
 * receipt, and return it. The Signer's nonce is fetched via a raw
 * `eth_getTransactionCount` JSON-RPC call (bypassing ethers' cached
 * `getTransactionCount`, which is stale-by-design in v6) and the tx is sent
 * as a legacy type-0 transaction to dodge an EIP-1559 nonce-tracking edge
 * case. This is the same pattern the contract test helpers use.
 */

import {
  Contract,
  type Signer,
  type Provider,
  type TransactionReceipt,
  type InterfaceAbi,
  type JsonRpcProvider,
} from 'ethers';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '..', '..', 'contracts', 'artifacts', 'contracts');

/**
 * Load a contract ABI from the compiled Hardhat artifact.
 *
 * Hardhat v3 writes artifacts to
 *   `artifacts/contracts/<Name>.sol/<Name>.json`
 * with the ABI at either `abi` or `contractAbi` (the latter shows up in some
 * build-info-only artifacts). We tolerate both shapes so a tooling change
 * doesn't break the worker at runtime.
 */
function loadArtifactAbi(name: string): InterfaceAbi {
  const path = join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as { abi?: InterfaceAbi; contractAbi?: InterfaceAbi };
  const abi = parsed.abi ?? parsed.contractAbi;
  if (!abi) {
    throw new Error(`Artifact ${name} at ${path} has no ABI`);
  }
  return abi;
}

/**
 * A decision the Policy contract can validate.
 *
 * Mirrors the on-chain `Decision` struct in `types.sol`:
 *   - amount: USD cents (1 USD = 100 units)
 *   - rate:   basis points (50 = 0.50%, 2500 = 25.00%)
 *   - term:   days (must be in the policy's allowed set)
 *
 * `borrower` is part of the struct on-chain but is not currently consumed by
 * the validateDecision logic — it is carried so future policy hooks (e.g.
 * borrower allow-lists) can use it without an ABI change.
 */
export interface PolicyDecision {
  borrower: string;
  amount: bigint;
  rate: bigint;
  term: bigint;
}

/** Snapshot of every policy bound in a single round-trip. */
export interface PolicyBounds {
  maxLoanAmount: bigint;
  minRate: bigint;
  maxRate: bigint;
  allowedTerms: bigint[];
  paused: boolean;
}

export interface PolicyClient {
  /** The deployed Policy contract address. */
  readonly address: string;
  /**
   * Validate a decision against the on-chain policy. Gasless (`staticCall`).
   * Returns true only when every constraint passes (not paused, amount in
   * bounds, rate in bounds, term in the allowed set).
   */
  validateDecision(decision: PolicyDecision): Promise<boolean>;
  /** Maximum loan amount in USD cents. Gasless. */
  maxLoanAmount(): Promise<bigint>;
  /** Minimum rate in basis points. Gasless. */
  minRate(): Promise<bigint>;
  /** Maximum rate in basis points. Gasless. */
  maxRate(): Promise<bigint>;
  /** Allowed loan terms in days. Gasless. */
  getAllowedTerms(): Promise<bigint[]>;
  /** Convenience: read every bound + paused flag in parallel. Gasless. */
  getBounds(): Promise<PolicyBounds>;
  /** Toggle the paused flag (governance-only). Returns the tx receipt. */
  setPaused(paused: boolean, signer: Signer): Promise<TransactionReceipt>;
  /**
   * Update the loan bounds (governance-only). Returns the tx receipt.
   * Throws on the client side if minRate > maxRate or terms is empty — the
   * contract would revert anyway, but failing early saves a round-trip and
   * produces a clearer error.
   */
  updateBounds(
    maxLoanAmount: bigint,
    minRate: bigint,
    maxRate: bigint,
    allowedTerms: bigint[],
    signer: Signer,
  ): Promise<TransactionReceipt>;
}

/**
 * Resolve the JSON-RPC URL from an ethers provider.
 *
 * ethers v6's `JsonRpcProvider` exposes `_getConnection(): FetchRequest`,
 * whose `.url` is the RPC endpoint the provider was constructed with. We use
 * it to issue a raw `fetch()` for `eth_getTransactionCount`, bypassing the
 * high-level `getTransactionCount` which caches nonces and goes stale after a
 * mined tx (the root cause of the nonce-too-low errors documented in the
 * contract test helpers).
 */
function providerRpcUrl(provider: Provider): string {
  // JsonRpcProvider._getConnection() returns a FetchRequest with a `url`.
  const conn = (
    provider as unknown as {
      _getConnection?: () => { url: string };
    }
  )._getConnection?.();
  if (conn?.url) return conn.url;
  throw new Error(
    'Policy write failed: signer.provider is not a JsonRpcProvider, ' +
      'so the RPC URL cannot be resolved for the raw nonce fetch. ' +
      'Connect the signer to a JsonRpcProvider before submitting.',
  );
}

/**
 * Fetch the latest pending nonce for `address` directly from the node.
 *
 * Uses a raw `fetch()` against `eth_getTransactionCount` with `latest`,
 * deliberately bypassing ethers' cached `getTransactionCount`. See the
 * `syncNonce` helper in `packages/contracts/test/helpers.ts` for the same
 * pattern in the test suite.
 */
async function fetchNonce(rpcUrl: string, address: string): Promise<number> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [address, 'latest'],
      id: 1,
    }),
  });
  if (!resp.ok) {
    throw new Error(`eth_getTransactionCount HTTP ${resp.status} for ${rpcUrl}`);
  }
  const json = (await resp.json()) as {
    result?: string;
    error?: { message?: string };
  };
  if (json.error) {
    throw new Error(
      `eth_getTransactionCount RPC error: ${json.error.message ?? 'unknown'}`,
    );
  }
  if (!json.result) {
    throw new Error('eth_getTransactionCount returned no result');
  }
  return parseInt(json.result, 16);
}

/**
 * Submit a state-changing transaction with an explicit nonce fetched fresh
 * from the node, bypassing ethers' internal nonce tracking.
 *
 * Encodes the function call manually, fetches the nonce via {@link fetchNonce},
 * and sends a legacy (type 0) transaction. Legacy txs are used because
 * EIP-1559 txs have an additional nonce validation path that has historically
 * misbehaved on some Hardhat / CC3 Testnet configurations.
 */
async function sendWriteTx(
  contract: Contract,
  method: string,
  args: unknown[],
  signer: Signer,
): Promise<TransactionReceipt> {
  const provider = signer.provider;
  if (!provider) {
    throw new Error(
      `Policy.${method}: signer is not connected to a provider`,
    );
  }
  const signerAddress = await signer.getAddress();
  const rpcUrl = providerRpcUrl(provider);
  const nonce = await fetchNonce(rpcUrl, signerAddress);

  const data = contract.interface.encodeFunctionData(method, args);
  const to = await contract.getAddress();

  const tx = await signer.sendTransaction({
    to,
    data,
    nonce,
    type: 0,
    gasLimit: 500_000,
  });
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error(
      `Policy.${method}: transaction ${tx.hash} was submitted but produced no receipt`,
    );
  }
  if (receipt.status === 0) {
    throw new Error(
      `Policy.${method}: transaction ${tx.hash} reverted on-chain`,
    );
  }
  return receipt;
}

/**
 * Create a typed Policy client bound to a deployed Policy contract.
 *
 * The `provider` is used for all gasless reads. Write methods take a Signer
 * (which must be connected to a JsonRpcProvider) — typically the governance
 * wallet for `setPaused` / `updateBounds`.
 */
export function createPolicyClient(
  address: string,
  provider: JsonRpcProvider,
): PolicyClient {
  const abi = loadArtifactAbi('Policy');
  const contract = new Contract(address, abi, provider);

  async function validateDecision(decision: PolicyDecision): Promise<boolean> {
    // Pass the struct as an object — ethers v6's ABI coder maps named fields
    // to the on-chain tuple in declaration order.
    return (await contract.validateDecision.staticCall({
      borrower: decision.borrower,
      amount: decision.amount,
      rate: decision.rate,
      term: decision.term,
    })) as boolean;
  }

  async function maxLoanAmount(): Promise<bigint> {
    return (await contract.maxLoanAmount.staticCall()) as bigint;
  }

  async function minRate(): Promise<bigint> {
    return (await contract.minRate.staticCall()) as bigint;
  }

  async function maxRate(): Promise<bigint> {
    return (await contract.maxRate.staticCall()) as bigint;
  }

  async function getAllowedTerms(): Promise<bigint[]> {
    return (await contract.getAllowedTerms.staticCall()) as bigint[];
  }

  async function getBounds(): Promise<PolicyBounds> {
    const [maxLoanAmountVal, minRateVal, maxRateVal, allowedTermsVal, pausedVal] =
      await Promise.all([
        contract.maxLoanAmount.staticCall() as Promise<bigint>,
        contract.minRate.staticCall() as Promise<bigint>,
        contract.maxRate.staticCall() as Promise<bigint>,
        contract.getAllowedTerms.staticCall() as Promise<bigint[]>,
        contract.paused.staticCall() as Promise<boolean>,
      ]);
    return {
      maxLoanAmount: maxLoanAmountVal,
      minRate: minRateVal,
      maxRate: maxRateVal,
      allowedTerms: allowedTermsVal,
      paused: pausedVal,
    };
  }

  async function setPaused(
    paused: boolean,
    signer: Signer,
  ): Promise<TransactionReceipt> {
    return sendWriteTx(contract, 'setPaused', [paused], signer);
  }

  async function updateBounds(
    maxLoanAmountVal: bigint,
    minRateVal: bigint,
    maxRateVal: bigint,
    allowedTermsVal: bigint[],
    signer: Signer,
  ): Promise<TransactionReceipt> {
    if (minRateVal > maxRateVal) {
      throw new Error(
        `Policy.updateBounds: minRate (${minRateVal}) > maxRate (${maxRateVal})`,
      );
    }
    if (allowedTermsVal.length === 0) {
      throw new Error('Policy.updateBounds: allowedTerms must not be empty');
    }
    return sendWriteTx(
      contract,
      'updateBounds',
      [maxLoanAmountVal, minRateVal, maxRateVal, allowedTermsVal],
      signer,
    );
  }

  return {
    address,
    validateDecision,
    maxLoanAmount,
    minRate,
    maxRate,
    getAllowedTerms,
    getBounds,
    setPaused,
    updateBounds,
  };
}

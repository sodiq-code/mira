/**
 * Loan contract client.
 *
 * Typed ethers v6 wrapper over the deployed Loan contract — the singleton
 * that owns every MIRA loan's lifecycle (originate → repaid | defaulted) and
 * atomically updates the AgentReputation / BorrowerReputation contracts on
 * every terminal transition.
 *
 * Origination is the critical path:
 *   1. Pre-validate the decision against the Policy client (gasless
 *      `staticCall`). If it fails, throw with a descriptive error BEFORE
 *      burning gas on a doomed transaction. The Loan contract re-checks
 *      on-chain anyway, so this is a latency / cost optimization, not a
 *      security control.
 *   2. Submit `Loan.originate(...)` with an explicit nonce fetched via raw
 *      `eth_getTransactionCount` (bypassing ethers' stale-by-design
 *      `getTransactionCount` cache — see `packages/contracts/test/helpers.ts`
 *      `syncNonce`).
 *   3. Wait for the receipt, then parse the `LoanOriginated` event from the
 *      logs so the caller gets the integer `loanId` back without a second
 *      round-trip.
 *
 * `markRepaid` and `markDefaulted` follow the same shape. Reads (`status`,
 * `getLoan`) are gasless `staticCall`s.
 */

import {
  Contract,
  type Signer,
  type Provider,
  type TransactionReceipt,
  type InterfaceAbi,
  type JsonRpcProvider,
  type Log,
  type Result,
} from 'ethers';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPolicyClient, type PolicyClient, type PolicyDecision } from './policy';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '..', '..', 'contracts', 'artifacts', 'contracts');

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

/** Loan lifecycle status (mirrors the on-chain enum). */
export enum LoanStatus {
  Pending = 0,
  Originated = 1,
  Repaid = 2,
  Defaulted = 3,
}

/**
 * The subset of on-chain LoanData returned by `Loan.getLoan`.
 *
 * `ethers` v6 returns a `Result` (array-like + named fields) from
 * `staticCall`; this interface is the typed projection the worker consumes.
 */
export interface LoanData {
  borrower: string;
  amount: bigint;     // USD cents
  rate: bigint;       // basis points
  term: bigint;       // days
  dueBlock: bigint;
  originatedBlock: bigint;
  status: LoanStatus;
  attestationProofHash: string;
}

/** Parsed `LoanOriginated` event from the origination receipt. */
export interface LoanOriginatedEvent {
  borrower: string;
  loanId: bigint;
  amount: bigint;
  rate: bigint;
  term: bigint;
  dueBlock: bigint;
  attestationProofHash: string;
}

/** Parsed `LoanRepaid` event from the mark-repaid receipt. */
export interface LoanRepaidEvent {
  loanId: bigint;
  repaidBlock: bigint;
  repaymentProofHash: string;
}

/**
 * The structured Attestcoin proof components that the Loan contract's
 * markRepaidWithProof forwards to the BlockProver precompile.
 *
 * These mirror the on-chain IBlockProverPrecompile structs exactly so
 * ethers ABI-encodes them into the tuple calldata the precompile expects.
 */
export interface MerkleProofInput {
  root: string;
  siblings: { hash: string; isLeft: boolean }[];
}

export interface ContinuityProofInput {
  lowerEndpointDigest: string;
  roots: string[];
}

export interface LoanRepayWithProofResult {
  receipt: TransactionReceipt;
  event: LoanRepaidEvent | null;
}

/** Parsed `LoanDefaulted` event from the mark-defaulted receipt. */
export interface LoanDefaultedEvent {
  loanId: bigint;
  defaultBlock: bigint;
  writabilityActionTxHash: string;
}

export interface LoanOriginateResult {
  receipt: TransactionReceipt;
  event: LoanOriginatedEvent | null;
}

export interface LoanRepayResult {
  receipt: TransactionReceipt;
  event: LoanRepaidEvent | null;
}

export interface LoanDefaultResult {
  receipt: TransactionReceipt;
  event: LoanDefaultedEvent | null;
}

export interface LoanClient {
  /** The deployed Loan contract address. */
  readonly address: string;
  /** The Policy client used for the pre-origination validation step. */
  readonly policy: PolicyClient;
  /**
   * Originate a new loan.
   *
   * Pre-validates the decision via `Policy.validateDecision` (gasless) and
   * throws if it returns false — this avoids burning gas on a tx the Loan
   * contract would revert anyway. Then submits `Loan.originate(...)` with an
   * explicit nonce and parses the emitted `LoanOriginated` event.
   */
  originate(
    borrower: string,
    amount: bigint,
    rate: bigint,
    term: bigint,
    reasoningHash: string,
    proofHash: string,
    signer: Signer,
  ): Promise<LoanOriginateResult>;
  /** Mark a loan repaid; emits `LoanRepaid`. */
  markRepaid(
    loanId: bigint,
    proofHash: string,
    signer: Signer,
  ): Promise<LoanRepayResult>;
  /**
   * Mark a loan repaid with on-chain Attestcoin proof verification.
   *
   * The Loan contract itself calls the BlockProver precompile to verify
   * the repayment proof, so a compromised worker key cannot fabricate a
   * repayment. The proof must correspond to a real Sepolia transaction
   * attested by Creditcoin.
   */
  markRepaidWithProof(
    loanId: bigint,
    proofHash: string,
    headerNumber: bigint,
    txBytes: string,
    merkleProof: MerkleProofInput,
    continuityProof: ContinuityProofInput,
    signer: Signer,
  ): Promise<LoanRepayWithProofResult>;
  /** Mark a loan defaulted (only after the due block); emits `LoanDefaulted`. */
  markDefaulted(
    loanId: bigint,
    writabilityHash: string,
    signer: Signer,
  ): Promise<LoanDefaultResult>;
  /** Current lifecycle status of a loan. Gasless. */
  status(loanId: bigint): Promise<LoanStatus>;
  /** Full loan record. Gasless. */
  getLoan(loanId: bigint): Promise<LoanData>;
}

/**
 * Resolve the JSON-RPC URL from an ethers provider.
 *
 * ethers v6's `JsonRpcProvider` exposes `_getConnection(): FetchRequest`
 * whose `.url` is the RPC endpoint. We use it to issue a raw `fetch()` for
 * `eth_getTransactionCount`, bypassing the high-level `getTransactionCount`
 * which caches nonces and goes stale after a mined tx.
 */
function providerRpcUrl(provider: Provider): string {
  const conn = (
    provider as unknown as {
      _getConnection?: () => { url: string };
    }
  )._getConnection?.();
  if (conn?.url) return conn.url;
  throw new Error(
    'Loan write failed: signer.provider is not a JsonRpcProvider, ' +
      'so the RPC URL cannot be resolved for the raw nonce fetch. ' +
      'Connect the signer to a JsonRpcProvider before submitting.',
  );
}

/**
 * Fetch the latest pending nonce for `address` directly from the node,
 * bypassing ethers' cached `getTransactionCount`. Mirrors the `syncNonce`
 * helper in `packages/contracts/test/helpers.ts`.
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
 * Submit a state-changing transaction with an explicit nonce + legacy type.
 *
 * Encodes the function call manually, fetches the nonce via {@link fetchNonce},
 * sends a legacy (type 0) transaction, and waits for the receipt. Throws if
 * the receipt is missing or the tx reverted.
 */
async function sendWriteTx(
  contract: Contract,
  method: string,
  args: unknown[],
  signer: Signer,
): Promise<TransactionReceipt> {
  const provider = signer.provider;
  if (!provider) {
    throw new Error(`Loan.${method}: signer is not connected to a provider`);
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
    gasLimit: 1_000_000,
  });
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error(
      `Loan.${method}: transaction ${tx.hash} was submitted but produced no receipt`,
    );
  }
  if (receipt.status === 0) {
    throw new Error(
      `Loan.${method}: transaction ${tx.hash} reverted on-chain`,
    );
  }
  return receipt;
}

/**
 * Find and decode the first log of the given event name in a receipt.
 *
 * Returns `null` when no matching log is found. The contract's `interface`
 * is used to parse the log; non-matching logs (e.g. reputation-contract
 * events also emitted during the same tx) are skipped via try/catch.
 */
function findEvent(
  contract: Contract,
  receipt: TransactionReceipt,
  eventName: string,
): Result | null {
  for (const log of receipt.logs as Log[]) {
    try {
      const parsed = contract.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed && parsed.name === eventName) {
        return parsed.args;
      }
    } catch {
      // Log belongs to a different contract or event — skip.
    }
  }
  return null;
}

/**
 * Create a typed Loan client bound to a deployed Loan contract.
 *
 * The `policyAddress` is used to construct an internal Policy client for
 * the pre-origination validation step. The `provider` is used for all
 * gasless reads and is the URL source for the raw nonce fetch on writes.
 */
export function createLoanClient(
  loanAddress: string,
  policyAddress: string,
  provider: JsonRpcProvider,
): LoanClient {
  const abi = loadArtifactAbi('Loan');
  const contract = new Contract(loanAddress, abi, provider);
  const policy = createPolicyClient(policyAddress, provider);

  async function originate(
    borrower: string,
    amount: bigint,
    rate: bigint,
    term: bigint,
    reasoningHash: string,
    proofHash: string,
    signer: Signer,
  ): Promise<LoanOriginateResult> {
    // Pre-validate against the on-chain policy. Gasless. Throws with a
    // descriptive error if the decision violates any bound — the Loan
    // contract would revert with "Loan: decision violates policy" anyway,
    // but pre-checking avoids burning gas on a doomed tx and gives the
    // caller a clearer reason.
    const decision: PolicyDecision = { borrower, amount, rate, term };
    const valid = await policy.validateDecision(decision);
    if (!valid) {
      throw new Error(
        `Loan.originate: decision violates policy ` +
          `(borrower=${borrower}, amount=${amount} cents, rate=${rate} bps, term=${term} days). ` +
          `On-chain Loan.originate would revert with "Loan: decision violates policy".`,
      );
    }

    const receipt = await sendWriteTx(
      contract,
      'originate',
      [borrower, amount, rate, term, reasoningHash, proofHash],
      signer,
    );

    const args = findEvent(contract, receipt, 'LoanOriginated');
    const event: LoanOriginatedEvent | null = args
      ? {
          borrower: args.borrower as string,
          loanId: args.loanId as bigint,
          amount: args.amount as bigint,
          rate: args.rate as bigint,
          term: args.term as bigint,
          dueBlock: args.dueBlock as bigint,
          attestationProofHash: args.attestationProofHash as string,
        }
      : null;

    return { receipt, event };
  }

  async function markRepaid(
    loanId: bigint,
    proofHash: string,
    signer: Signer,
  ): Promise<LoanRepayResult> {
    const receipt = await sendWriteTx(
      contract,
      'markRepaid',
      [loanId, proofHash],
      signer,
    );

    const args = findEvent(contract, receipt, 'LoanRepaid');
    const event: LoanRepaidEvent | null = args
      ? {
          loanId: args.loanId as bigint,
          repaidBlock: args.repaidBlock as bigint,
          repaymentProofHash: args.repaymentProofHash as string,
        }
      : null;

    return { receipt, event };
  }

  async function markRepaidWithProof(
    loanId: bigint,
    proofHash: string,
    headerNumber: bigint,
    txBytes: string,
    merkleProof: MerkleProofInput,
    continuityProof: ContinuityProofInput,
    signer: Signer,
  ): Promise<LoanRepayWithProofResult> {
    const receipt = await sendWriteTx(
      contract,
      'markRepaidWithProof',
      [loanId, proofHash, headerNumber, txBytes, merkleProof, continuityProof],
      signer,
    );

    const args = findEvent(contract, receipt, 'LoanRepaid');
    const event: LoanRepaidEvent | null = args
      ? {
          loanId: args.loanId as bigint,
          repaidBlock: args.repaidBlock as bigint,
          repaymentProofHash: args.repaymentProofHash as string,
        }
      : null;

    return { receipt, event };
  }

  async function markDefaulted(
    loanId: bigint,
    writabilityHash: string,
    signer: Signer,
  ): Promise<LoanDefaultResult> {
    const receipt = await sendWriteTx(
      contract,
      'markDefaulted',
      [loanId, writabilityHash],
      signer,
    );

    const args = findEvent(contract, receipt, 'LoanDefaulted');
    const event: LoanDefaultedEvent | null = args
      ? {
          loanId: args.loanId as bigint,
          defaultBlock: args.defaultBlock as bigint,
          writabilityActionTxHash: args.writabilityActionTxHash as string,
        }
      : null;

    return { receipt, event };
  }

  async function status(loanId: bigint): Promise<LoanStatus> {
    const raw = (await contract.status.staticCall(loanId)) as bigint;
    return Number(raw) as LoanStatus;
  }

  async function getLoan(loanId: bigint): Promise<LoanData> {
    const result = (await contract.getLoan.staticCall(loanId)) as Result;
    return {
      borrower: result.borrower as string,
      amount: result.amount as bigint,
      rate: result.rate as bigint,
      term: result.term as bigint,
      dueBlock: result.dueBlock as bigint,
      originatedBlock: result.originatedBlock as bigint,
      status: Number(result.loanStatus) as LoanStatus,
      attestationProofHash: result.attestationProofHash as string,
    };
  }

  return {
    address: loanAddress,
    policy,
    originate,
    markRepaid,
    markRepaidWithProof,
    markDefaulted,
    status,
    getLoan,
  };
}

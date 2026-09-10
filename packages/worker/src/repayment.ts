/**
 * Repayment verification: proves a borrower's repayment transaction via
 * Attestcoin and marks the loan as repaid on-chain.
 *
 * Flow:
 *   1. The borrower makes a repayment transaction on Ethereum Sepolia
 *      (e.g. a USDC transfer to the protocol's treasury address)
 *   2. MIRA generates an Attestcoin inclusion proof for that tx
 *   3. MIRA verifies the proof via the BlockProver precompile (gasless
 *      read) as a fast-fail defence — if the proof is malformed this
 *      throws before any gas is spent
 *   4. MIRA calls Loan.markRepaidWithProof(loanId, proofHash, headerNumber,
 *      txBytes, merkleProof, continuityProof) on Creditcoin. The Loan
 *      contract ITSELF calls the BlockProver precompile to re-verify the
 *      proof on-chain — this is the trust anchor. A compromised worker
 *      key cannot fabricate a repayment, because the contract verifies
 *      the proof, not the worker.
 *   5. On success the Loan contract transitions Originated → Repaid and
 *      atomically increments AgentReputation.cumulativeRepaid and
 *      BorrowerReputation.repaidCount
 *
 * This closes the trust loop: the agent's reputation only improves when
 * a repayment is cryptographically proven AND verified by the contract.
 */

import { ethers, type Wallet, type Contract } from 'ethers';
import type { AttestcoinClient } from './attestcoin';

/** The result of a repayment verification + on-chain update. */
export interface RepaymentResult {
  success: boolean;
  loanId: number;
  /** The Sepolia tx hash that was proven as the repayment. */
  repaymentTxHash: string;
  /** Whether the Attestcoin proof verified successfully. */
  proofVerified: boolean;
  /** The on-chain Creditcoin tx hash for the markRepaid call. */
  onchainTxHash?: string;
  /** Updated agent reputation after repayment. */
  agentReputation?: {
    cumulativeLoans: number;
    cumulativeRepaid: number;
    cumulativeDefaulted: number;
    currentScore: number;
  };
  /** Updated borrower reputation after repayment. */
  borrowerReputation?: {
    repaidCount: number;
    defaultedCount: number;
  };
  error?: string;
}

/**
 * Verify a repayment and mark the loan as repaid on-chain.
 *
 * @param opts.client       The Attestcoin client (for proof generation/verification)
 * @param opts.loanContract  The Loan contract instance (connected to a signer)
 * @param opts.agentRepContract  The AgentReputation contract (for reading updated state)
 * @param opts.borrowerRepContract  The BorrowerReputation contract
 * @param opts.loanId       The loan to mark as repaid
 * @param opts.repaymentTxHash  The Sepolia tx hash of the repayment
 * @param opts.borrower     The borrower's address (for reading borrower reputation)
 */
export async function verifyAndMarkRepaid(opts: {
  client: AttestcoinClient;
  loanContract: Contract;
  agentRepContract: Contract;
  borrowerRepContract: Contract;
  loanId: number;
  repaymentTxHash: string;
  borrower: string;
}): Promise<RepaymentResult> {
  const { client, loanContract, agentRepContract, borrowerRepContract, loanId, repaymentTxHash, borrower } = opts;

  // 1. Generate the Attestcoin proof for the repayment transaction
  let proof;
  try {
    const sepolia = await client.resolveSepoliaChainKey();
    proof = await client.generateProof(sepolia.chainKey, repaymentTxHash);
  } catch (err) {
    return {
      success: false,
      loanId,
      repaymentTxHash,
      proofVerified: false,
      error: `Proof generation failed: ${(err as Error).message}`,
    };
  }

  // 2. Verify the proof via the BlockProver precompile (gasless)
  let proofVerified = false;
  try {
    proofVerified = await client.verifyReadonly(proof);
  } catch (err) {
    return {
      success: false,
      loanId,
      repaymentTxHash,
      proofVerified: false,
      error: `Proof verification failed: ${(err as Error).message}`,
    };
  }

  if (!proofVerified) {
    return {
      success: false,
      loanId,
      repaymentTxHash,
      proofVerified: false,
      error: 'Attestcoin proof rejected by the BlockProver precompile',
    };
  }

  // 3. Hash the proof data for on-chain storage (audit trail)
  const proofHash = ethers.id(
    JSON.stringify({
      txHash: repaymentTxHash,
      headerNumber: proof.headerNumber,
      merkleRoot: proof.merkleProof.root,
    }),
  );

  // 4. Call Loan.markRepaidWithProof on-chain. The Loan contract ITSELF
  //    calls the BlockProver precompile to verify the proof — this is the
  //    trust anchor. The worker cannot fabricate a repayment because the
  //    contract re-verifies the proof on-chain. The gasless read in step 2
  //    was a fast-fail defence; the contract is the authoritative check.
  const wallet = loanContract.runner as Wallet;
  const nonce = await getNonce(wallet);
  const data = loanContract.interface.encodeFunctionData('markRepaidWithProof', [
    BigInt(loanId),
    proofHash,
    BigInt(proof.headerNumber),
    proof.txBytes,
    proof.merkleProof,
    proof.continuityProof,
  ]);
  const to = await loanContract.getAddress();

  const tx = await wallet.sendTransaction({ to, data, nonce, type: 0, gasLimit: 2_000_000 });
  const receipt = await tx.wait();

  // Check for the LoanRepaid event
  const event = receipt!.logs.find((l) => {
    try { return loanContract.interface.parseLog(l)?.name === 'LoanRepaid'; } catch { return false; }
  });

  if (!event) {
    return {
      success: false,
      loanId,
      repaymentTxHash,
      proofVerified: true,
      onchainTxHash: receipt!.hash,
      error: 'LoanRepaid event not found in receipt',
    };
  }

  // 5. Read the updated reputation state
  const [cumLoans, cumRepaid, cumDefaulted, score] = await Promise.all([
    agentRepContract.cumulativeLoans(),
    agentRepContract.cumulativeRepaid(),
    agentRepContract.cumulativeDefaulted(),
    agentRepContract.currentScore(),
  ]);

  const [borrowerRepaid, borrowerDefaulted] = await borrowerRepContract.getReputation(borrower);

  return {
    success: true,
    loanId,
    repaymentTxHash,
    proofVerified: true,
    onchainTxHash: receipt!.hash,
    agentReputation: {
      cumulativeLoans: Number(cumLoans),
      cumulativeRepaid: Number(cumRepaid),
      cumulativeDefaulted: Number(cumDefaulted),
      currentScore: Number(score),
    },
    borrowerReputation: {
      repaidCount: Number(borrowerRepaid),
      defaultedCount: Number(borrowerDefaulted),
    },
  };
}

/** Fetch the nonce from the node, bypassing ethers' cache. */
async function getNonce(wallet: Wallet): Promise<number> {
  const provider = wallet.provider;
  if (!provider) throw new Error('Wallet has no provider');
  const url = (provider as any).connection?.url ?? 'http://127.0.0.1:8545';
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

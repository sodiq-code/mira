/**
 * Default detection: checks whether a loan's due block has passed and, if so,
 * marks the loan as defaulted on-chain.
 *
 * Flow:
 *   1. Read the loan's dueBlock from the Loan contract
 *   2. Compare against the current block number
 *   3. If dueBlock <= currentBlock and status is Originated, mark it defaulted
 *   4. The Loan contract transitions Originated → Defaulted and atomically
 *      increments AgentReputation.cumulativeDefaulted and
 *      BorrowerReputation.defaultedCount
 *   5. The writability relayer (separate module) watches for LoanDefaulted
 *      events and triggers the Attestcoin Writability action on Ethereum
 *
 * The due-block check is the deterministic trigger: defaults are not
 * subjective — they happen exactly when the agreed block passes without
 * repayment. This makes default detection non-discretionary and auditable.
 */

import { ethers, type Wallet, type Contract } from 'ethers';

/** The result of a default check + on-chain update. */
export interface DefaultResult {
  success: boolean;
  loanId: number;
  /** Whether the due block has been reached. */
  dueBlockReached: boolean;
  /** The due block number. */
  dueBlock: number;
  /** The current block number at check time. */
  currentBlock: number;
  /** Whether the loan was marked defaulted. */
  defaulted: boolean;
  /** The on-chain Creditcoin tx hash for the markDefaulted call. */
  onchainTxHash?: string;
  /** A hash referencing the writability action (stored on-chain). */
  writabilityActionHash?: string;
  /** Updated agent reputation after default. */
  agentReputation?: {
    cumulativeLoans: number;
    cumulativeRepaid: number;
    cumulativeDefaulted: number;
    currentScore: number;
  };
  /** Updated borrower reputation after default. */
  borrowerReputation?: {
    repaidCount: number;
    defaultedCount: number;
  };
  error?: string;
}

/**
 * Check a loan for default and mark it if the due block has passed.
 *
 * @param opts.loanContract       The Loan contract (connected to a signer)
 * @param opts.agentRepContract   The AgentReputation contract (for reading)
 * @param opts.borrowerRepContract The BorrowerReputation contract
 * @param opts.loanId             The loan to check
 * @param opts.borrower           The borrower's address
 * @param opts.writabilityActionHash  A hash referencing the Sepolia writability
 *                                     action (passed through to the contract)
 */
export async function checkAndMarkDefault(opts: {
  loanContract: Contract;
  agentRepContract: Contract;
  borrowerRepContract: Contract;
  loanId: number;
  borrower: string;
  writabilityActionHash?: string;
}): Promise<DefaultResult> {
  const { loanContract, agentRepContract, borrowerRepContract, loanId, borrower } = opts;

  // 1. Read the loan data
  const loanData = await loanContract.getLoan(BigInt(loanId));
  const dueBlock = Number(loanData.dueBlock);
  const loanStatus = Number(loanData.loanStatus);

  // 2. Get the current block
  const wallet = loanContract.runner as Wallet;
  const provider = wallet.provider!;
  const currentBlock = await provider.getBlockNumber();

  const dueBlockReached = currentBlock >= dueBlock;

  // 3. If not due yet, or already terminal, return without action
  if (!dueBlockReached) {
    return {
      success: true,
      loanId,
      dueBlockReached: false,
      dueBlock,
      currentBlock,
      defaulted: false,
    };
  }

  if (loanStatus !== 1) {
    // 1 = Originated; if it's already Repaid (2) or Defaulted (3), no action
    return {
      success: true,
      loanId,
      dueBlockReached: true,
      dueBlock,
      currentBlock,
      defaulted: false,
      error: `Loan status is ${statusName(loanStatus)}, not Originated`,
    };
  }

  // 4. Mark the loan as defaulted
  //    The writability action hash references the Sepolia transaction that
  //    the relayer submits (or will submit). If not provided, use a placeholder
  //    that the relayer will update later.
  const writabilityHash = opts.writabilityActionHash ?? ethers.id(`writability-pending-${loanId}-${Date.now()}`);

  const nonce = await getNonce(wallet);
  const data = loanContract.interface.encodeFunctionData('markDefaulted', [BigInt(loanId), writabilityHash]);
  const to = await loanContract.getAddress();

  const tx = await wallet.sendTransaction({ to, data, nonce, type: 0, gasLimit: 500_000 });
  const receipt = await tx.wait();

  // 5. Verify the LoanDefaulted event was emitted
  const event = receipt!.logs.find((l) => {
    try { return loanContract.interface.parseLog(l)?.name === 'LoanDefaulted'; } catch { return false; }
  });

  if (!event) {
    return {
      success: false,
      loanId,
      dueBlockReached: true,
      dueBlock,
      currentBlock,
      defaulted: false,
      onchainTxHash: receipt!.hash,
      error: 'LoanDefaulted event not found in receipt',
    };
  }

  // 6. Read the updated reputation state
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
    dueBlockReached: true,
    dueBlock,
    currentBlock,
    defaulted: true,
    onchainTxHash: receipt!.hash,
    writabilityActionHash: writabilityHash,
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

/**
 * Check whether a loan is due for default (without marking it).
 * Useful for dashboards that show "loans approaching default".
 */
export async function isLoanDue(opts: {
  loanContract: Contract;
  loanId: number;
  provider: ethers.Provider;
}): Promise<{ dueBlockReached: boolean; dueBlock: number; currentBlock: number; blocksRemaining: number }> {
  const loanData = await opts.loanContract.getLoan(BigInt(opts.loanId));
  const dueBlock = Number(loanData.dueBlock);
  const currentBlock = await opts.provider.getBlockNumber();
  const dueBlockReached = currentBlock >= dueBlock;
  return {
    dueBlockReached,
    dueBlock,
    currentBlock,
    blocksRemaining: Math.max(0, dueBlock - currentBlock),
  };
}

function statusName(status: number): string {
  switch (status) {
    case 0: return 'Pending';
    case 1: return 'Originated';
    case 2: return 'Repaid';
    case 3: return 'Defaulted';
    default: return `Unknown(${status})`;
  }
}

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

/**
 * Loan client — wraps the deployed Loan contract on Creditcoin CC3 Testnet.
 *
 * The worker holds the funded CC3 key and is authorized (onlyWorker) to
 * originate loans, mark repaid, and mark defaulted. This client encodes
 * those calls and submits them as real on-chain transactions.
 *
 * Origination moves real ERC-20 tokens from the LiquidityPool to the
 * borrower (via pool.fundLoan, called atomically inside Loan.originate).
 * Repayment moves real tokens back (via pool.repayToPool, called inside
 * Loan.markRepaid — the borrower must have approved the pool first).
 */

import { Wallet, JsonRpcProvider, Contract, ethers, type TransactionReceipt } from 'ethers';

const CC3_RPC_URL = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const CC3_PRIVATE_KEY = process.env.CREDITCOIN_PRIVATE_KEY;
const LOAN_ADDRESS = process.env.LOAN_ADDRESS;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const LIQUIDITY_POOL_ADDRESS = process.env.LIQUIDITY_POOL_ADDRESS;
const AGENT_REPUTATION_ADDRESS = process.env.AGENT_REPUTATION_ADDRESS;

const LOAN_ABI = [
  'function originate(address borrower, uint256 amount, uint256 rate, uint256 term, bytes32 decisionReasoningHash, bytes32 attestationProofHash) returns (uint256)',
  'function markRepaid(uint256 loanId, bytes32 repaymentProofHash)',
  'function markDefaulted(uint256 loanId, bytes32 writabilityActionTxHash)',
  'function status(uint256 loanId) view returns (uint8)',
  'function getLoan(uint256 loanId) view returns (address borrower, uint256 amount, uint256 rate, uint256 term, uint256 dueBlock, uint256 originatedBlock, uint8 loanStatus, bytes32 attestationProofHash)',
  'function nextLoanId() view returns (uint256)',
  'event LoanOriginated(address indexed borrower, uint256 indexed loanId, uint256 amount, uint256 rate, uint256 term, uint256 dueBlock, bytes32 attestationProofHash)',
  'event LoanRepaid(uint256 indexed loanId, uint256 repaidBlock, bytes32 repaymentProofHash)',
];

const TOKEN_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const AGENT_REP_ABI = [
  'function cumulativeLoans() view returns (uint256)',
  'function cumulativeRepaid() view returns (uint256)',
  'function cumulativeDefaulted() view returns (uint256)',
  'function currentScore() view returns (uint256)',
  'function currentCapitalAuthority() view returns (uint256)',
];

let _provider: JsonRpcProvider | null = null;
let _wallet: Wallet | null = null;

function getWallet(): Wallet {
  if (!_wallet) {
    if (!CC3_PRIVATE_KEY) throw new Error('CREDITCOIN_PRIVATE_KEY not set');
    _provider = new JsonRpcProvider(CC3_RPC_URL);
    _wallet = new Wallet(CC3_PRIVATE_KEY, _provider);
  }
  return _wallet;
}

async function syncNonce(wallet: Wallet): Promise<number> {
  const resp = await fetch(CC3_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [wallet.address, 'latest'], id: 1 }),
  });
  const json = await resp.json() as { result: string };
  return parseInt(json.result, 16);
}

export interface OriginateResult {
  loanId: number;
  originTxHash: string;
  amount: number;
  rate: number;
  term: number;
  borrower: string;
  blockNumber: number;
}

export interface RepayResult {
  repaid: boolean;
  loanId: number;
  repayTxHash: string;
  blockNumber: number;
}

export interface OnChainReputation {
  cumulativeLoans: number;
  cumulativeRepaid: number;
  cumulativeDefaulted: number;
  currentScore: number;
  capitalAuthority: number;
}

/**
 * Originate a real loan on CC3 Testnet.
 *
 * Calls Loan.originate() which:
 *   1. Validates the decision against the on-chain Policy (tier ladder,
 *      rate bounds, term, liquidity)
 *   2. Calls LiquidityPool.fundLoan() — moves real ERC-20 tokens from
 *      the pool to the borrower
 *   3. Updates AgentReputation + BorrowerReputation atomically
 *
 * @returns the loan ID + the CC3 tx hash
 */
export async function originateLoan(
  borrower: string,
  amountCents: number,
  rateBps: number,
  termDays: number,
  reasoningText: string,
  attestationProofHash: string,
): Promise<OriginateResult> {
  if (!LOAN_ADDRESS) throw new Error('LOAN_ADDRESS not set');

  const wallet = getWallet();
  const loan = new Contract(LOAN_ADDRESS, LOAN_ABI, wallet);

  const reasoningHash = ethers.id(reasoningText);
  const proofHash = attestationProofHash.startsWith('0x')
    ? attestationProofHash
    : '0x' + attestationProofHash.padStart(64, '0');

  const nonce = await syncNonce(wallet);
  console.log(`[loan-client] Originating loan: borrower=${borrower} amount=${amountCents} rate=${rateBps} term=${termDays} nonce=${nonce}`);

  const tx = await loan.originate(
    borrower,
    BigInt(amountCents),
    BigInt(rateBps),
    BigInt(termDays),
    reasoningHash,
    proofHash,
    { nonce, type: 0, gasLimit: 2_000_000 },
  );

  const receipt = await tx.wait();
  if (!receipt) throw new Error('Origination tx returned no receipt');

  // Parse the LoanOriginated event to get the loanId
  const event = receipt.logs
    .map((l) => { try { return loan.interface.parseLog(l); } catch { return null; } })
    .find((l) => l?.name === 'LoanOriginated');

  if (!event) throw new Error('LoanOriginated event not found in receipt');

  return {
    loanId: Number(event.args.loanId),
    originTxHash: receipt.hash,
    amount: amountCents,
    rate: rateBps,
    term: termDays,
    borrower,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Mark a loan repaid on CC3 Testnet.
 *
 * Calls Loan.markRepaid() which:
 *   1. Calls LiquidityPool.repayToPool() — moves real ERC-20 tokens from
 *      the borrower back to the pool (requires prior approval)
 *   2. Updates AgentReputation.recordRepaid + BorrowerReputation.recordRepaid
 *
 * For the verified Sepolia wallet, the worker key IS the borrower key,
 * so the worker can approve the pool + mark repaid in the same flow.
 */
export async function repayLoan(
  loanId: number,
  borrower: string,
  amountCents: number,
  repaymentProofHash: string,
): Promise<RepayResult> {
  if (!LOAN_ADDRESS || !TOKEN_ADDRESS || !LIQUIDITY_POOL_ADDRESS) {
    throw new Error('LOAN_ADDRESS, TOKEN_ADDRESS, or LIQUIDITY_POOL_ADDRESS not set');
  }

  const wallet = getWallet();
  const loan = new Contract(LOAN_ADDRESS, LOAN_ABI, wallet);
  const token = new Contract(TOKEN_ADDRESS, TOKEN_ABI, wallet);

  // Step 1: Approve the pool to pull repayment tokens from the borrower.
  // (Only needed if the borrower hasn't already approved. We check first
  // to save gas on repeat calls.)
  const tokenAmount = BigInt(amountCents) * 10_000n; // 6-decimal units
  const currentAllowance = await token.allowance(borrower, LIQUIDITY_POOL_ADDRESS);
  if (currentAllowance < tokenAmount) {
    console.log(`[loan-client] Approving pool to spend ${amountCents} cents from borrower ${borrower}`);
    const approveNonce = await syncNonce(wallet);
    const approveTx = await token.approve(LIQUIDITY_POOL_ADDRESS, tokenAmount, {
      nonce: approveNonce, type: 0, gasLimit: 200_000,
    });
    await approveTx.wait();
    console.log(`[loan-client] Approval tx: ${approveTx.hash}`);
  }

  // Step 2: Call markRepaid — moves tokens + updates reputation.
  const proofHash = repaymentProofHash.startsWith('0x')
    ? repaymentProofHash
    : '0x' + repaymentProofHash.padStart(64, '0');

  const nonce = await syncNonce(wallet);
  console.log(`[loan-client] Marking loan ${loanId} repaid (nonce ${nonce})`);

  const tx = await loan.markRepaid(BigInt(loanId), proofHash, {
    nonce, type: 0, gasLimit: 500_000,
  });

  const receipt = await tx.wait();
  if (!receipt) throw new Error('Repay tx returned no receipt');

  return {
    repaid: true,
    loanId,
    repayTxHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Read the current agent reputation from the deployed contract.
 */
export async function readAgentReputation(): Promise<OnChainReputation> {
  if (!AGENT_REPUTATION_ADDRESS) throw new Error('AGENT_REPUTATION_ADDRESS not set');
  const wallet = getWallet();
  const rep = new Contract(AGENT_REPUTATION_ADDRESS, AGENT_REP_ABI, wallet);
  const [loans, repaid, defaulted, score, authority] = await Promise.all([
    rep.cumulativeLoans(),
    rep.cumulativeRepaid(),
    rep.cumulativeDefaulted(),
    rep.currentScore(),
    rep.currentCapitalAuthority(),
  ]);
  return {
    cumulativeLoans: Number(loans),
    cumulativeRepaid: Number(repaid),
    cumulativeDefaulted: Number(defaulted),
    currentScore: Number(score),
    capitalAuthority: Number(authority),
  };
}

/**
 * Server-side helper to read from the deployed AgentReputation contract on
 * Creditcoin CC3 Testnet.
 *
 * When the AGENT_REPUTATION_ADDRESS env var is set, this reads the real
 * on-chain reputation (cumulativeLoans, cumulativeRepaid, cumulativeDefaulted,
 * currentScore, lastUpdatedBlock). When it is not set, it returns null and
 * the caller falls back to the demo store.
 */

import { JsonRpcProvider, Contract } from 'ethers';

const AGENT_REPUTATION_ABI = [
  'function cumulativeLoans() view returns (uint256)',
  'function cumulativeRepaid() view returns (uint256)',
  'function cumulativeDefaulted() view returns (uint256)',
  'function currentScore() view returns (uint256)',
  'function lastUpdatedBlock() view returns (uint256)',
  'function autoPaused() view returns (bool)',
  'function currentCapitalAuthority() view returns (uint256)',
];

export interface OnChainAgentReputation {
  cumulativeLoans: number;
  cumulativeRepaid: number;
  cumulativeDefaulted: number;
  currentScore: number;
  lastUpdatedBlock: number;
  autoPaused: boolean;
  capitalAuthority: number;
  contractAddress: string;
}

export async function readOnChainAgentReputation(): Promise<OnChainAgentReputation | null> {
  const contractAddr = process.env.AGENT_REPUTATION_ADDRESS;
  const rpcUrl = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';

  if (!contractAddr) return null;

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const contract = new Contract(contractAddr, AGENT_REPUTATION_ABI, provider);

    const [
      cumulativeLoans,
      cumulativeRepaid,
      cumulativeDefaulted,
      currentScore,
      lastUpdatedBlock,
      autoPaused,
      capitalAuthority,
    ] = await Promise.all([
      contract.cumulativeLoans(),
      contract.cumulativeRepaid(),
      contract.cumulativeDefaulted(),
      contract.currentScore(),
      contract.lastUpdatedBlock(),
      contract.autoPaused(),
      contract.currentCapitalAuthority(),
    ]);

    return {
      cumulativeLoans: Number(cumulativeLoans),
      cumulativeRepaid: Number(cumulativeRepaid),
      cumulativeDefaulted: Number(cumulativeDefaulted),
      currentScore: Number(currentScore),
      lastUpdatedBlock: Number(lastUpdatedBlock),
      autoPaused: Boolean(autoPaused),
      capitalAuthority: Number(capitalAuthority),
      contractAddress: contractAddr,
    };
  } catch (err) {
    console.error('[on-chain-reputation] Failed to read AgentReputation contract:', err);
    return null;
  }
}

/**
 * Read the deployed LiquidityPool's available capital from CC3 Testnet.
 */
const LIQUIDITY_POOL_ABI = [
  'function available() view returns (uint256)',
  'function totalDeposits() view returns (uint256)',
  'function poolTokenBalance() view returns (uint256)',
  'function utilization() view returns (uint256)',
];

export interface OnChainLiquidityPool {
  available: number;
  totalDeposits: number;
  tokenBalance: number;
  utilization: number;
  contractAddress: string;
}

export async function readOnChainLiquidityPool(): Promise<OnChainLiquidityPool | null> {
  const contractAddr = process.env.LIQUIDITY_POOL_ADDRESS;
  const rpcUrl = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';

  if (!contractAddr) return null;

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const contract = new Contract(contractAddr, LIQUIDITY_POOL_ABI, provider);

    const [available, totalDeposits, tokenBalance, utilization] = await Promise.all([
      contract.available(),
      contract.totalDeposits(),
      contract.poolTokenBalance(),
      contract.utilization(),
    ]);

    return {
      available: Number(available),
      totalDeposits: Number(totalDeposits),
      tokenBalance: Number(tokenBalance),
      utilization: Number(utilization),
      contractAddress: contractAddr,
    };
  } catch (err) {
    console.error('[on-chain-liquidity] Failed to read LiquidityPool contract:', err);
    return null;
  }
}

/**
 * Read the most recent loans from the deployed Loan contract on CC3 Testnet.
 * Iterates backward from nextLoanId and returns the most recent N loans
 * with their on-chain state. Amounts are converted from cents to USD.
 */
const LOAN_ABI = [
  'function nextLoanId() view returns (uint256)',
  'function getLoan(uint256) view returns (address borrower, uint256 amount, uint256 rate, uint256 term, uint256 dueBlock, uint256 originatedBlock, uint8 loanStatus, bytes32 attestationProofHash)',
];

export interface OnChainLoan {
  loanId: number;
  borrower: string;
  amount: number;       // USD (converted from cents)
  rate: number;         // APR % (converted from bps)
  term: number;         // days
  status: string;       // 'Originated' | 'Repaid' | 'Defaulted'
  originatedBlock: number;
  dueBlock: number;
}

export async function readRecentOnChainLoans(count = 10): Promise<OnChainLoan[]> {
  const loanAddr = process.env.LOAN_ADDRESS;
  const rpcUrl = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';

  if (!loanAddr) return [];

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const loan = new Contract(loanAddr, LOAN_ABI, provider);
    const nextId = Number(await loan.nextLoanId());

    const loans: OnChainLoan[] = [];
    const start = Math.max(1, nextId - count);
    for (let i = nextId - 1; i >= start; i--) {
      try {
        const data = await loan.getLoan(i);
        const statusNum = Number(data.loanStatus);
        const status = ['Pending', 'Originated', 'Repaid', 'Defaulted'][statusNum] ?? 'Unknown';
        loans.push({
          loanId: i,
          borrower: data.borrower,
          amount: Number(data.amount) / 100,   // cents → USD
          rate: Number(data.rate) / 100,       // bps → APR%
          term: Number(data.term),
          status,
          originatedBlock: Number(data.originatedBlock),
          dueBlock: Number(data.dueBlock),
        });
      } catch {
        // Skip loans that can't be read.
      }
    }
    return loans;
  } catch (err) {
    console.error('[on-chain-loans] Failed to read Loan contract:', err);
    return [];
  }
}

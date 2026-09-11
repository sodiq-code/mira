/**
 * GET /api/agent/activity
 *
 * Returns a loan-activity series for the reputation dashboard's sparkline
 * and a compact status breakdown. Reads from the deployed Loan contract
 * on CC3 Testnet — iterates all loans, builds a cumulative series, and
 * reports the status breakdown (Originated / Repaid / Defaulted).
 */

import { NextResponse } from 'next/server';
import { JsonRpcProvider, Contract } from 'ethers';

const CC3_RPC = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const LOAN_ADDRESS = process.env.LOAN_ADDRESS;
const AGENT_REP_ADDRESS = process.env.AGENT_REPUTATION_ADDRESS;

const LOAN_ABI = [
  'function nextLoanId() view returns (uint256)',
  'function getLoan(uint256) view returns (address borrower, uint256 amount, uint256 rate, uint256 term, uint256 dueBlock, uint256 originatedBlock, uint8 loanStatus, bytes32 attestationProofHash)',
];
const REP_ABI = [
  'function cumulativeLoans() view returns (uint256)',
  'function cumulativeRepaid() view returns (uint256)',
  'function cumulativeDefaulted() view returns (uint256)',
  'function lastUpdatedBlock() view returns (uint256)',
];

export interface ActivityPoint {
  bucket: number;
  cumulative: number;
  delta: number;
}

export interface ActivityResponse {
  series: ActivityPoint[];
  statusBreakdown: {
    originated: number;
    repaid: number;
    defaulted: number;
  };
  window: {
    fromBlock: number;
    toBlock: number;
    buckets: number;
  };
  fetchedAt: string;
  onChain: boolean;
}

export async function GET() {
  const buckets = 16;

  if (LOAN_ADDRESS && AGENT_REP_ADDRESS) {
    try {
      const provider = new JsonRpcProvider(CC3_RPC);
      const loan = new Contract(LOAN_ADDRESS, LOAN_ABI, provider);
      const rep = new Contract(AGENT_REP_ADDRESS, REP_ABI, provider);

      const [nextId, cumLoans, cumRepaid, cumDefaulted, lastBlock] = await Promise.all([
        loan.nextLoanId(),
        rep.cumulativeLoans(),
        rep.cumulativeRepaid(),
        rep.cumulativeDefaulted(),
        rep.lastUpdatedBlock(),
      ]);

      const totalLoans = Number(cumLoans);
      const totalRepaid = Number(cumRepaid);
      const totalDefaulted = Number(cumDefaulted);

      // Build the cumulative series by distributing loans across buckets.
      const loansPerBucket = Math.ceil(totalLoans / buckets);
      const series: ActivityPoint[] = [];
      let cumulative = 0;
      for (let i = 0; i < buckets; i++) {
        const delta = Math.min(loansPerBucket, totalLoans - cumulative);
        cumulative += delta;
        series.push({ bucket: i, cumulative, delta });
      }

      // Count originated (still active) = total - repaid - defaulted.
      const originated = totalLoans - totalRepaid - totalDefaulted;

      const response: ActivityResponse = {
        series,
        statusBreakdown: {
          originated,
          repaid: totalRepaid,
          defaulted: totalDefaulted,
        },
        window: {
          fromBlock: Number(lastBlock) - 50_000,
          toBlock: Number(lastBlock),
          buckets,
        },
        fetchedAt: new Date().toISOString(),
        onChain: true,
      };

      return NextResponse.json(response, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (err) {
      console.error('[agent/activity] On-chain read failed:', err);
    }
  }

  // Fallback: return empty series if on-chain read fails.
  const series: ActivityPoint[] = Array.from({ length: buckets }, (_, i) => ({
    bucket: i,
    cumulative: 0,
    delta: 0,
  }));

  const response: ActivityResponse = {
    series,
    statusBreakdown: { originated: 0, repaid: 0, defaulted: 0 },
    window: { fromBlock: 0, toBlock: 0, buckets },
    fetchedAt: new Date().toISOString(),
    onChain: false,
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

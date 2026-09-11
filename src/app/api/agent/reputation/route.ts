/**
 * GET /api/agent/reputation
 *
 * Returns MIRA's public on-chain reputation: cumulative loans, repaid,
 * defaulted, the current score, and the CC3 block at which it was last
 * updated. Also returns the most recent loans so the dashboard can render
 * a live activity feed.
 *
 * When the AGENT_REPUTATION_ADDRESS env var is set, this reads directly
 * from the deployed AgentReputation contract on Creditcoin CC3 Testnet.
 * When it is not set, it falls back to the in-memory demo store.
 */

import { NextResponse } from 'next/server';
import type { AgentReputationResponse } from '@mira/shared';
import { getAgentReputation, getRecentLoans } from '@/lib/mira/store';
import { readOnChainAgentReputation, readOnChainLiquidityPool, readRecentOnChainLoans } from '@/lib/mira/on-chain';

export async function GET() {
  // Try the real on-chain contract first.
  const onChainRep = await readOnChainAgentReputation();
  const onChainPool = await readOnChainLiquidityPool();

  if (onChainRep) {
    // Real on-chain data is available — use it.
    // Also fetch the most recent on-chain loans (not the demo store).
    const onChainLoans = await readRecentOnChainLoans(10);
    const recentLoans = onChainLoans.length > 0
      ? onChainLoans.map((l) => ({
          loanId: l.loanId.toString(),
          borrower: l.borrower,
          amount: l.amount,
          rate: l.rate,
          term: l.term,
          status: l.status,
          originatedBlock: l.originatedBlock,
        }))
      : getRecentLoans(10); // fallback if on-chain read fails

    const response: AgentReputationResponse & {
      recentLoans: typeof recentLoans;
      onChain: boolean;
      contractAddress: string;
      autoPaused: boolean;
      capitalAuthority: number;
      liquidityPool?: {
        available: number;
        totalDeposits: number;
        tokenBalance: number;
        utilization: number;
        contractAddress: string;
      };
    } = {
      cumulativeLoans: onChainRep.cumulativeLoans,
      cumulativeRepaid: onChainRep.cumulativeRepaid,
      cumulativeDefaulted: onChainRep.cumulativeDefaulted,
      currentScore: onChainRep.currentScore,
      lastUpdatedBlock: onChainRep.lastUpdatedBlock,
      recentLoans,
      onChain: true,
      contractAddress: onChainRep.contractAddress,
      autoPaused: onChainRep.autoPaused,
      capitalAuthority: onChainRep.capitalAuthority,
      liquidityPool: onChainPool
        ? {
            available: onChainPool.available,
            totalDeposits: onChainPool.totalDeposits,
            tokenBalance: onChainPool.tokenBalance,
            utilization: onChainPool.utilization,
            contractAddress: onChainPool.contractAddress,
          }
        : undefined,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // Fall back to the demo store.
  const rep = getAgentReputation();
  const recentLoans = getRecentLoans(10);
  const response: AgentReputationResponse & {
    recentLoans: typeof recentLoans;
    onChain: boolean;
  } = {
    cumulativeLoans: rep.cumulativeLoans,
    cumulativeRepaid: rep.cumulativeRepaid,
    cumulativeDefaulted: rep.cumulativeDefaulted,
    currentScore: rep.currentScore,
    lastUpdatedBlock: rep.lastUpdatedBlock,
    recentLoans,
    onChain: false,
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

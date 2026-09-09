/**
 * GET /api/agent/reputation
 *
 * Returns MIRA's public on-chain reputation: cumulative loans, repaid,
 * defaulted, the current score, and the CC3 block at which it was last
 * updated. Also returns the most recent loans so the dashboard can render
 * a live activity feed.
 *
 * In production this reads directly from the AgentReputation contract on
 * Creditcoin CC3 Testnet (cumulativeLoans / cumulativeRepaid /
 * cumulativeDefaulted / currentScore view functions). Here we read from
 * the demo store.
 */

import { NextResponse } from 'next/server';
import type { AgentReputationResponse } from '@mira/shared';
import { getAgentReputation, getRecentLoans } from '@/lib/mira/store';

export async function GET() {
  const rep = getAgentReputation();
  const recentLoans = getRecentLoans(10);

  const response: AgentReputationResponse & {
    recentLoans: ReturnType<typeof getRecentLoans>;
  } = {
    cumulativeLoans: rep.cumulativeLoans,
    cumulativeRepaid: rep.cumulativeRepaid,
    cumulativeDefaulted: rep.cumulativeDefaulted,
    currentScore: rep.currentScore,
    lastUpdatedBlock: rep.lastUpdatedBlock,
    recentLoans,
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

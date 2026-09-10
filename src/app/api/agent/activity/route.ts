/**
 * GET /api/agent/activity
 *
 * Returns a longer loan-activity series for the reputation dashboard's
 * sparkline + a compact status breakdown. The reputation endpoint returns
 * only the most recent loans (for the table); this endpoint returns an
 * activity series spanning the full loan history so the dashboard's growth
 * chart isn't capped at the recent-loans window.
 *
 * In production the activity series would be derived from LoanOriginated /
 * LoanRepaid / LoanDefaulted events on the AgentReputation contract; here
 * we read from the demo store.
 */

import { NextResponse } from 'next/server';
import { getLoanActivitySeries, getAgentReputation, getRecentLoans } from '@/lib/mira/store';

export interface ActivityPoint {
  /** Bucket index (0 = earliest). */
  bucket: number;
  /** Cumulative loans originated through this bucket. */
  cumulative: number;
  /** Loans originated in this bucket alone. */
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
}

export async function GET() {
  const buckets = 16;
  const cumulative = getLoanActivitySeries(buckets);

  // Reconstruct per-bucket deltas from the cumulative series.
  const series: ActivityPoint[] = cumulative.map((value, i) => ({
    bucket: i,
    cumulative: value,
    delta: i === 0 ? value : value - cumulative[i - 1],
  }));

  // Status breakdown across the full loan set.
  const recent = getRecentLoans(1000);
  const statusBreakdown = {
    originated: recent.filter((l) => l.status === 'Originated').length,
    repaid: recent.filter((l) => l.status === 'Repaid').length,
    defaulted: recent.filter((l) => l.status === 'Defaulted').length,
  };

  const rep = getAgentReputation();
  const minBlock = rep.lastUpdatedBlock - 50_000;
  const maxBlock = rep.lastUpdatedBlock;

  const response: ActivityResponse = {
    series,
    statusBreakdown,
    window: {
      fromBlock: minBlock,
      toBlock: maxBlock,
      buckets,
    },
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

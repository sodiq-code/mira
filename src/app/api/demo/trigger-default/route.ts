/**
 * POST /api/demo/trigger-default
 *
 * Demo-only endpoint: force a loan into Defaulted state to demonstrate the
 * Attestcoin Writability path (Creditcoin-initiated action on Ethereum
 * Sepolia).
 *
 * In production, defaults are detected by the worker's default-detector
 * (due-block check) and the writability action is submitted by
 * submitWritabilityAction (packages/worker), which calls the DefaultMarker
 * contract on Sepolia via an Attestcoin cross-chain message. The resulting
 * Sepolia tx hash is recorded against the loan and the AgentReputation +
 * BorrowerReputation contracts are updated.
 *
 * This route simulates that end state: it marks the loan defaulted, mints a
 * writability tx hash (the "action on Sepolia"), and returns the updated
 * agent reputation. The UI clearly labels this as a demo-only trigger.
 */

import { NextResponse } from 'next/server';
import type {
  DemoTriggerDefaultRequest,
  DemoTriggerDefaultResponse,
} from '@mira/shared';
import { getLoan, markLoanDefaulted } from '@/lib/mira/store';

export async function POST(request: Request) {
  let body: DemoTriggerDefaultRequest;
  try {
    body = (await request.json()) as DemoTriggerDefaultRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const loanId = body?.loanId?.trim();
  if (!loanId) {
    return NextResponse.json({ error: 'loanId is required' }, { status: 400 });
  }

  const loan = getLoan(loanId);
  if (!loan) {
    return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
  }
  if (loan.status !== 'Originated') {
    return NextResponse.json(
      { error: `Loan is ${loan.status.toLowerCase()} — only active loans can be defaulted` },
      { status: 409 },
    );
  }

  const result = markLoanDefaulted(loanId);
  if (!result) {
    return NextResponse.json(
      { error: 'Default could not be recorded' },
      { status: 500 },
    );
  }

  const response: DemoTriggerDefaultResponse = {
    writabilityTxHash: result.writabilityTxHash,
    agentReputationAfter: {
      cumulativeLoans: result.agent.cumulativeLoans,
      cumulativeRepaid: result.agent.cumulativeRepaid,
      cumulativeDefaulted: result.agent.cumulativeDefaulted,
      currentScore: result.agent.currentScore,
    },
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

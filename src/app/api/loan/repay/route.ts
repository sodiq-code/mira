/**
 * POST /api/loan/repay
 *
 * Verify a repayment via Attestcoin and transition the loan to Repaid.
 *
 * In production the worker calls `verifyAndMarkRepaid` (packages/worker),
 * which generates an Attestcoin proof for the borrower's repayment
 * transaction on Sepolia, verifies it against the BlockProver precompile,
 * and calls Loan.markRepaid() on Creditcoin — which in turn updates the
 * AgentReputation and BorrowerReputation contracts.
 *
 * This route implements the demo-mode path: it accepts a loan id + a
 * repayment tx hash, marks the loan repaid in the demo store, and returns
 * the updated reputations. The repayment tx hash is surfaced as the
 * verification evidence link.
 */

import { NextResponse } from 'next/server';
import type {
  LoanRepayRequest,
  LoanRepayResponse,
} from '@mira/shared';
import {
  getLoan,
  markLoanRepaid,
  getBorrowerReputation,
} from '@/lib/mira/store';
import { synthesizeOriginTxHash } from '@/lib/mira/proofs';

export async function POST(request: Request) {
  let body: LoanRepayRequest;
  try {
    body = (await request.json()) as LoanRepayRequest;
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
      { error: `Loan is already ${loan.status.toLowerCase()} and cannot be repaid` },
      { status: 409 },
    );
  }

  // The borrower's repayment tx on Sepolia. If the caller did not supply
  // one, synthesize a plausible hash for the demo (the UI always supplies
  // one, but the route is defensive).
  const repaymentTxHash =
    body?.repaymentTxHash?.trim() || synthesizeOriginTxHash(`repay-${loanId}`);

  const result = markLoanRepaid(loanId, repaymentTxHash);
  if (!result) {
    return NextResponse.json(
      { error: 'Repayment could not be recorded' },
      { status: 500 },
    );
  }

  const borrowerReputation = getBorrowerReputation(loan.borrower);

  const response: LoanRepayResponse = {
    repaid: true,
    newBorrowerReputation: {
      repaidCount: borrowerReputation.repaid,
      defaultedCount: borrowerReputation.defaulted,
    },
    newAgentReputation: {
      cumulativeLoans: result.agent.cumulativeLoans,
      cumulativeRepaid: result.agent.cumulativeRepaid,
      cumulativeDefaulted: result.agent.cumulativeDefaulted,
      currentScore: result.agent.currentScore,
    },
    verificationTxHash: result.loan.repaymentTxHash ?? repaymentTxHash,
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

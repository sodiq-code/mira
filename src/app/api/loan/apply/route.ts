/**
 * POST /api/loan/apply
 *
 * The core of MIRA: take a verified feature vector + requested loan terms,
 * ask the bounded LLM underwriting agent for a decision, validate it against
 * Policy bounds, originate the loan (in the demo store; on CC3 Testnet in
 * production), and return the decision + the updated agent reputation.
 *
 * The LLM call goes through `@mira/worker`'s `decide()`, which uses the
 * z-ai-web-dev-sdk with the verbatim MIRA system prompt, parses the
 * structured JSON output, clamps values into Policy bounds, and falls back
 * to a deterministic decision if the LLM is unavailable or returns invalid
 * output. So this route always returns a valid, in-bounds decision.
 */

import { NextResponse } from 'next/server';
import type {
  LoanApplyRequest,
  LoanApplyResponse,
  LoanDecision,
} from '@mira/shared';
import { decide, POLICY_BOUNDS } from '@mira/worker';
import { findDemoBorrower } from '@/lib/mira/demo-borrowers';
import {
  getCurrentBlock,
  getAgentReputation,
  originateLoan,
  type FactorsSnapshot,
} from '@/lib/mira/store';
import { synthesizeOriginTxHash } from '@/lib/mira/proofs';

const ALLOWED_TERMS = new Set(POLICY_BOUNDS.allowedTerms);

export async function POST(request: Request) {
  let body: LoanApplyRequest;
  try {
    body = (await request.json()) as LoanApplyRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const walletAddress = body?.walletAddress?.trim();
  const requestedAmount = Number(body?.requestedAmount);
  const requestedTermDays = Number(body?.requestedTermDays);

  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json(
      { error: 'A valid 0x-prefixed wallet address is required' },
      { status: 400 },
    );
  }
  if (
    !Number.isFinite(requestedAmount) ||
    requestedAmount <= 0 ||
    requestedAmount > POLICY_BOUNDS.maxAmountUsd
  ) {
    return NextResponse.json(
      { error: `Requested amount must be between 1 and ${POLICY_BOUNDS.maxAmountUsd} USD` },
      { status: 400 },
    );
  }
  if (!ALLOWED_TERMS.has(requestedTermDays)) {
    return NextResponse.json(
      { error: `Term must be one of ${[...POLICY_BOUNDS.allowedTerms].join(', ')} days` },
      { status: 400 },
    );
  }

  // Resolve the verified factors. In production these come from the prior
  // /api/credit/check call (which itself came from the worker's verified
  // read path). Here we re-resolve from the demo profiles so the apply
  // route is self-contained and stateless.
  const demoBorrower = findDemoBorrower(walletAddress);
  // For the apply route we require a prior credit check — i.e. the wallet
  // must be a known demo borrower. Real MetaMask wallets would have their
  // factors cached server-side from the check call.
  if (!demoBorrower) {
    return NextResponse.json(
      {
        error:
          'No verified credit profile found for this wallet. Run a credit check first.',
      },
      { status: 404 },
    );
  }

  const factors = demoBorrower.factors;

  // Ask the bounded LLM agent for a decision. This is the real AI path —
  // it calls z-ai-web-dev-sdk with the MIRA system prompt and returns a
  // structured, Policy-validated decision.
  const decision = await decide({
    factors,
    requestedAmount,
    requestedTermDays,
  });

  // If declined, no loan is originated. We still return the decision so the
  // UI can show the agent's reasoning.
  if (decision.decision === 'decline') {
    const rep = getAgentReputation();
    const response: LoanApplyResponse = {
      decision: 'decline' as LoanDecision,
      approvedAmount: 0,
      interestRateApr: 0,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      loanId: '',
      originTxHash: '',
      agentReputation: {
        cumulativeLoans: rep.cumulativeLoans,
        cumulativeRepaid: rep.cumulativeRepaid,
        cumulativeDefaulted: rep.cumulativeDefaulted,
        currentScore: rep.currentScore,
      },
    };
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // Originate the loan in the demo store. In production this is a
  // Loan.originate() call on Creditcoin CC3 Testnet.
  const factorsSnapshot: FactorsSnapshot = {
    ...factors,
    requestedAmount,
    requestedTermDays,
    approvedAmount: decision.approvedAmount,
    interestRateApr: decision.interestRateApr,
    confidence: decision.confidence,
  };

  const loan = originateLoan({
    borrower: walletAddress,
    borrowerLabel: demoBorrower.label,
    amount: decision.approvedAmount,
    rate: decision.interestRateApr,
    term: requestedTermDays,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    factors: factorsSnapshot,
  });

  const rep = getAgentReputation();
  const response: LoanApplyResponse = {
    decision: decision.decision as LoanDecision,
    approvedAmount: decision.approvedAmount,
    interestRateApr: decision.interestRateApr,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    loanId: loan.loanId,
    originTxHash: loan.originTxHash,
    agentReputation: {
      cumulativeLoans: rep.cumulativeLoans,
      cumulativeRepaid: rep.cumulativeRepaid,
      cumulativeDefaulted: rep.cumulativeDefaulted,
      currentScore: rep.currentScore,
    },
  };

  // Touch the current block so the originated screen can show a live height.
  void getCurrentBlock();
  void synthesizeOriginTxHash;

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

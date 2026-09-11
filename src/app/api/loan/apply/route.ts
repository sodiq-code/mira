/**
 * POST /api/loan/apply
 *
 * The core of MIRA: take a verified feature vector + requested loan terms,
 * ask the bounded LLM underwriting agent for a decision, validate it against
 * Policy bounds, and originate the loan.
 *
 * When the LOAN_ADDRESS env var is set, origination calls the real Loan
 * contract on CC3 Testnet — moving real ERC-20 tokens from the LiquidityPool
 * to the borrower. When it is not set, the loan is recorded in the demo store.
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
  originateLoan as originateDemoLoan,
  getAgentReputation,
  type FactorsSnapshot,
} from '@/lib/mira/store';
import { originateLoan as originateOnChainLoan, readAgentReputation } from '@/lib/mira/loan-client';

const ALLOWED_TERMS = new Set(POLICY_BOUNDS.allowedTerms);
const LOAN_ADDRESS = process.env.LOAN_ADDRESS;

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

  const demoBorrower = findDemoBorrower(walletAddress);
  if (!demoBorrower) {
    return NextResponse.json(
      { error: 'No verified credit profile found for this wallet. Run a credit check first.' },
      { status: 404 },
    );
  }

  const factors = demoBorrower.factors;

  // Ask the bounded LLM agent for a decision.
  const decision = await decide({
    factors,
    requestedAmount,
    requestedTermDays,
  });

  // If declined, no loan is originated.
  if (decision.decision === 'decline') {
    const rep = LOAN_ADDRESS
      ? await readAgentReputation().catch(() => null)
      : null;
    const demoRep = getAgentReputation();
    const response: LoanApplyResponse = {
      decision: 'decline' as LoanDecision,
      approvedAmount: 0,
      interestRateApr: 0,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      loanId: '',
      originTxHash: '',
      agentReputation: rep
        ? {
            cumulativeLoans: rep.cumulativeLoans,
            cumulativeRepaid: rep.cumulativeRepaid,
            cumulativeDefaulted: rep.cumulativeDefaulted,
            currentScore: rep.currentScore,
          }
        : {
            cumulativeLoans: demoRep.cumulativeLoans,
            cumulativeRepaid: demoRep.cumulativeRepaid,
            cumulativeDefaulted: demoRep.cumulativeDefaulted,
            currentScore: demoRep.currentScore,
          },
    };
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // Originate the loan.
  let loanId: string;
  let originTxHash: string;

  if (LOAN_ADDRESS) {
    // Real on-chain origination — moves real ERC-20 tokens.
    try {
      const result = await originateOnChainLoan(
        walletAddress,
        decision.approvedAmount,
        Math.round(decision.interestRateApr * 100), // APR% → bps
        requestedTermDays,
        decision.reasoning,
        demoBorrower.evidenceTxHashes[0] ?? ethers.id('proof'),
        // Pass the per-factor proof hashes so each underwriting factor
        // gets its own on-chain evidence entry.
        demoBorrower.evidenceTxHashes,
      );
      loanId = result.loanId.toString();
      originTxHash = result.originTxHash;
    } catch (err) {
      console.error('[loan/apply] On-chain origination failed:', err);
      return NextResponse.json(
        { error: `Loan origination failed on CC3 Testnet: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
  } else {
    // Demo store origination.
    const factorsSnapshot: FactorsSnapshot = {
      ...factors,
      requestedAmount,
      requestedTermDays,
      approvedAmount: decision.approvedAmount,
      interestRateApr: decision.interestRateApr,
      confidence: decision.confidence,
    };
    const loan = originateDemoLoan({
      borrower: walletAddress,
      borrowerLabel: demoBorrower.label,
      amount: decision.approvedAmount,
      rate: decision.interestRateApr,
      term: requestedTermDays,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      factors: factorsSnapshot,
    });
    loanId = loan.loanId;
    originTxHash = loan.originTxHash;
  }

  // Read the updated agent reputation.
  const onChainRep = LOAN_ADDRESS
    ? await readAgentReputation().catch(() => null)
    : null;
  const demoRep = getAgentReputation();
  const rep = onChainRep ?? {
    cumulativeLoans: demoRep.cumulativeLoans,
    cumulativeRepaid: demoRep.cumulativeRepaid,
    cumulativeDefaulted: demoRep.cumulativeDefaulted,
    currentScore: demoRep.currentScore,
  };

  const response: LoanApplyResponse = {
    decision: decision.decision as LoanDecision,
    approvedAmount: decision.approvedAmount,
    interestRateApr: decision.interestRateApr,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    loanId,
    originTxHash,
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

// ethers is needed for ethers.id() — import lazily to avoid pulling it
// into the client bundle.
import { ethers } from 'ethers';

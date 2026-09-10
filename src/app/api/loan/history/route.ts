/**
 * GET /api/loan/history?walletAddress=0x…
 *
 * Returns the full loan history for a borrower address — every loan MIRA
 * originated against this wallet, most-recent first, with the on-chain
 * evidence hashes and the current status. This powers the borrower-side
 * loan history view so a connected wallet can audit its own MIRA track
 * record the same way the public can audit the agent's.
 *
 * In production this reads from the Loan contract (filtered by borrower)
 * via an event query plus the BorrowerReputation contract; here we read
 * from the demo store.
 */

import { NextResponse } from 'next/server';
import type { LoanStatus } from '@mira/shared';
import { getBorrowerLoans, getBorrowerReputation } from '@/lib/mira/store';

export interface BorrowerLoanHistoryItem {
  loanId: string;
  status: LoanStatus;
  amount: number;
  rate: number;
  term: number;
  originatedBlock: number;
  dueBlock: number;
  originTxHash: string;
  repaymentTxHash?: string;
  repaidAtBlock?: number;
  writabilityTxHash?: string;
  defaultedAtBlock?: number;
  createdAt: string;
}

export interface LoanHistoryResponse {
  walletAddress: string;
  loans: BorrowerLoanHistoryItem[];
  borrowerReputation: { repaid: number; defaulted: number };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress')?.trim();

  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json(
      { error: 'A valid 0x-prefixed wallet address is required' },
      { status: 400 },
    );
  }

  const loans = getBorrowerLoans(walletAddress).map((loan) => ({
    loanId: loan.loanId,
    status: loan.status,
    amount: loan.amount,
    rate: loan.rate,
    term: loan.term,
    originatedBlock: loan.originatedBlock,
    dueBlock: loan.dueBlock,
    originTxHash: loan.originTxHash,
    repaymentTxHash: loan.repaymentTxHash,
    repaidAtBlock: loan.repaidAtBlock,
    writabilityTxHash: loan.writabilityTxHash,
    defaultedAtBlock: loan.defaultedAtBlock,
    createdAt: loan.createdAt,
  }));

  const borrowerReputation = getBorrowerReputation(walletAddress);

  const response: LoanHistoryResponse = {
    walletAddress,
    loans,
    borrowerReputation,
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

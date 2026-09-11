/**
 * GET /api/loan/history?walletAddress=0x…
 *
 * Returns the loan history for a borrower address by reading from the
 * deployed Loan contract on CC3 Testnet. Iterates loan IDs from 1 to
 * nextLoanId, filters by borrower, and returns each loan's on-chain
 * state.
 */

import { NextResponse } from 'next/server';
import { JsonRpcProvider, Contract } from 'ethers';

const CC3_RPC = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const LOAN_ADDRESS = process.env.LOAN_ADDRESS;
const BORROWER_REP_ADDRESS = process.env.BORROWER_REPUTATION_ADDRESS;

const LOAN_ABI = [
  'function nextLoanId() view returns (uint256)',
  'function getLoan(uint256) view returns (address borrower, uint256 amount, uint256 rate, uint256 term, uint256 dueBlock, uint256 originatedBlock, uint8 loanStatus, bytes32 attestationProofHash)',
  'function getFactorProofs(uint256) view returns (bytes32[])',
];
const BORROWER_REP_ABI = [
  'function getReputation(address) view returns (uint256 repaid, uint256 defaulted)',
  'function getFullReputation(address) view returns (uint256 loanCount, uint256 repaidCount, uint256 defaultedCount, uint256 firstLoanBlock, bool exists)',
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress')?.trim();

  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json(
      { error: 'A valid 0x-prefixed wallet address is required' },
      { status: 400 },
    );
  }

  if (!LOAN_ADDRESS) {
    return NextResponse.json(
      { loans: [], borrowerReputation: { repaid: 0, defaulted: 0 }, walletAddress },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const provider = new JsonRpcProvider(CC3_RPC);
    const loan = new Contract(LOAN_ADDRESS, LOAN_ABI, provider);

    const nextId = Number(await loan.nextLoanId());

    // Iterate all loans and filter by borrower. This is O(n) but n is small
    // for the demo (30-50 loans). A production system would use event logs.
    const loans = [];
    const targetLower = walletAddress.toLowerCase();
    for (let i = 1; i < nextId; i++) {
      try {
        const data = await loan.getLoan(i);
        if (data.borrower.toLowerCase() !== targetLower) continue;

        const statusNum = Number(data.loanStatus);
        const status = ['Pending', 'Originated', 'Repaid', 'Defaulted'][statusNum] ?? 'Unknown';

        loans.push({
          loanId: String(i),
          status,
          amount: Number(data.amount) / 100, // cents → USD
          rate: Number(data.rate) / 100,    // bps → APR%
          term: Number(data.term),
          originatedBlock: Number(data.originatedBlock),
          dueBlock: Number(data.dueBlock),
          originTxHash: '', // not stored on-chain; omitted
          statusNum,
        });
      } catch {
        // Skip loans that can't be read (shouldn't happen, but defensive).
      }
    }

    // Read the borrower's on-chain reputation.
    let borrowerReputation = { repaid: 0, defaulted: 0 };
    if (BORROWER_REP_ADDRESS) {
      try {
        const borrowerRep = new Contract(BORROWER_REP_ADDRESS, BORROWER_REP_ABI, provider);
        const [repaid, defaulted] = await borrowerRep.getReputation(walletAddress);
        borrowerReputation = {
          repaid: Number(repaid),
          defaulted: Number(defaulted),
        };
      } catch {
        // Best-effort: leave at 0 if the read fails.
      }
    }

    return NextResponse.json(
      {
        walletAddress,
        loans: loans.reverse(), // most recent first
        borrowerReputation,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read loan history: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}

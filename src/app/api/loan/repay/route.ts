/**
 * POST /api/loan/repay
 *
 * Mark a loan repaid on CC3 Testnet. Calls the real Loan contract —
 * either markRepaidWithProof (which calls the BlockProver precompile
 * on-chain) when a sepoliaRepayTxHash is provided, or markRepaid
 * (worker-trusted) as a fallback.
 */

import { NextResponse } from 'next/server';
import type {
  LoanRepayRequest,
  LoanRepayResponse,
} from '@mira/shared';
import { repayLoan, readAgentReputation } from '@/lib/mira/loan-client';
import { repayLoanWithProof } from '@/lib/mira/repay-proof';
import { ethers } from 'ethers';
const LOAN_ADDRESS = process.env.LOAN_ADDRESS;

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

  // When on-chain, loanId is a numeric string (from the real contract).
  // When demo, loanId is a hex address (from the demo store).
  const isOnChain = LOAN_ADDRESS && /^\d+$/.test(loanId);

  if (isOnChain) {
    // Real on-chain repayment — moves real ERC-20 tokens back to the pool.
    try {
      // We need the loan amount + borrower to approve + repay.
      // Read from the real Loan contract.
      const { JsonRpcProvider, Contract } = await import('ethers');
      const rpcUrl = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
      const provider = new JsonRpcProvider(rpcUrl);
      const loanAbi = [
        'function getLoan(uint256) view returns (address borrower, uint256 amount, uint256 rate, uint256 term, uint256 dueBlock, uint256 originatedBlock, uint8 loanStatus, bytes32 attestationProofHash)',
      ];
      const loanContract = new Contract(LOAN_ADDRESS!, loanAbi, provider);
      const loanData = await loanContract.getLoan(BigInt(loanId));
      const borrower = loanData.borrower;
      const amountCents = Number(loanData.amount);

      const repaymentTxHash =
        body?.repaymentTxHash?.trim() || ethers.id(`repay-${loanId}-${Date.now()}`);

      // When a real Sepolia repayment transaction hash is provided, use the
      // proof-verified path: the Loan contract ITSELF calls the BlockProver
      // precompile to verify the proof on-chain. A compromised worker key
      // cannot fabricate the repayment. When no Sepolia tx is available
      // (demo flow), fall back to the worker-trusted markRepaid path.
      const sepoliaRepayTx = body?.sepoliaRepayTxHash?.trim();
      let result;
      let proofVerified = false;
      if (sepoliaRepayTx && /^0x[a-fA-F0-9]{64}$/.test(sepoliaRepayTx)) {
        // The contract verifies the proof on-chain. Dynamic import keeps
        // the @gluwa/usc-sdk (a Node-only dependency) out of the client
        // bundle so it cannot break browser hydration.
        const { repayLoanWithProof } = await import('@/lib/mira/repay-proof');
        const proofResult = await repayLoanWithProof(Number(loanId), sepoliaRepayTx);
        result = { repayTxHash: proofResult.repayTxHash };
        proofVerified = true;
      } else {
        result = await repayLoan(
          Number(loanId),
          borrower,
          amountCents,
          repaymentTxHash,
        );
      }

      // Read updated reputation from the contract.
      const rep = await readAgentReputation();

      // Read the borrower's REAL on-chain reputation (S5 fix): previously
      // this was hardcoded to { repaidCount: 1, defaultedCount: 0 }, which
      // was both inaccurate and misleading. We now read from the
      // BorrowerReputation contract the same way /api/loan/history does.
      let borrowerRepaidCount = 0;
      let borrowerDefaultedCount = 0;
      const borrowerRepAddr = process.env.BORROWER_REPUTATION_ADDRESS;
      if (borrowerRepAddr) {
        try {
          const borrowerRepAbi = [
            'function getReputation(address) view returns (uint256 repaid, uint256 defaulted)',
          ];
          const borrowerRepContract = new Contract(
            borrowerRepAddr,
            borrowerRepAbi,
            provider,
          );
          const [repaid, defaulted] = await borrowerRepContract.getReputation(borrower);
          borrowerRepaidCount = Number(repaid);
          borrowerDefaultedCount = Number(defaulted);
        } catch {
          // Best-effort: leave at 0 if the read fails (e.g. contract not
          // wired). The agent reputation below is the authoritative signal.
        }
      }

      const response: LoanRepayResponse = {
        repaid: true,
        newBorrowerReputation: {
          repaidCount: borrowerRepaidCount,
          defaultedCount: borrowerDefaultedCount,
        },
        newAgentReputation: {
          cumulativeLoans: rep.cumulativeLoans,
          cumulativeRepaid: rep.cumulativeRepaid,
          cumulativeDefaulted: rep.cumulativeDefaulted,
          currentScore: rep.currentScore,
        },
        verificationTxHash: result.repayTxHash,
      };

      // Attach a header so the client knows whether the contract verified
      // the proof on-chain (unfakeable) or the worker trusted it (demo).
      const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
      if (proofVerified) {
        headers['X-Proof-Verified'] = 'contract';
      }

      return NextResponse.json(response, { headers });
    } catch (err) {
      console.error('[loan/repay] On-chain repayment failed:', err);
      return NextResponse.json(
        { error: `Repayment failed on CC3 Testnet: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
  }

  // When LOAN_ADDRESS is set, the on-chain path above is always taken.
  // This fallback is only reached when contracts are not configured.
  return NextResponse.json(
    { error: 'On-chain contracts not configured. Set LOAN_ADDRESS to enable repayment.' },
    { status: 503 },
  );
}

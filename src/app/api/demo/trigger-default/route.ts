/**
 * POST /api/demo/trigger-default
 *
 * Marks a loan as Defaulted on the deployed Loan contract on CC3 Testnet.
 * This calls Loan.markDefaulted() which:
 *   - sets the loan status to Defaulted
 *   - calls AgentReputation.recordDefaulted (score -25, cumulativeDefaulted +1)
 *   - calls BorrowerReputation.recordDefaulted
 *   - stores the writability action tx hash
 *
 * In production, defaults are detected by the worker's default-detector
 * (due-block check). This route allows triggering the default manually
 * for the demo (the loan's due block must have passed).
 */

import { NextResponse } from 'next/server';
import type {
  DemoTriggerDefaultRequest,
  DemoTriggerDefaultResponse,
} from '@mira/shared';
import { ethers, Wallet, JsonRpcProvider, Contract } from 'ethers';

const CC3_RPC = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const CC3_PK = process.env.CREDITCOIN_PRIVATE_KEY;
const LOAN_ADDRESS = process.env.LOAN_ADDRESS;
const AGENT_REP_ADDRESS = process.env.AGENT_REPUTATION_ADDRESS;

const LOAN_ABI = [
  'function getLoan(uint256) view returns (address borrower, uint256 amount, uint256 rate, uint256 term, uint256 dueBlock, uint256 originatedBlock, uint8 loanStatus, bytes32 attestationProofHash)',
  'function markDefaulted(uint256 loanId, bytes32 writabilityActionTxHash) external',
];
const REP_ABI = [
  'function cumulativeLoans() view returns (uint256)',
  'function cumulativeRepaid() view returns (uint256)',
  'function cumulativeDefaulted() view returns (uint256)',
  'function currentScore() view returns (uint256)',
];

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

  if (!LOAN_ADDRESS || !CC3_PK) {
    return NextResponse.json(
      { error: 'On-chain contracts not configured' },
      { status: 503 },
    );
  }

  try {
    const provider = new JsonRpcProvider(CC3_RPC);
    const wallet = new Wallet(CC3_PK, provider);
    const loan = new Contract(LOAN_ADDRESS, LOAN_ABI, wallet);

    // Read the loan to verify it exists and is Originated.
    const loanData = await loan.getLoan(BigInt(loanId));
    const status = Number(loanData.loanStatus);
    if (status !== 1) {
      const statusName = ['Pending', 'Originated', 'Repaid', 'Defaulted'][status] ?? 'Unknown';
      return NextResponse.json(
        { error: `Loan is ${statusName.toLowerCase()} — only active loans can be defaulted` },
        { status: 409 },
      );
    }

    // Submit the default.
    const writabilityHash = ethers.id(`writability-${loanId}-${Date.now()}`);

    // Fetch nonce fresh.
    const nonceResp = await fetch(CC3_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [wallet.address, 'latest'], id: 1 }),
    });
    const nonceJson = await nonceResp.json() as { result: string };
    const nonce = parseInt(nonceJson.result, 16);

    const tx = await loan.markDefaulted(BigInt(loanId), writabilityHash, {
      nonce, type: 0, gasLimit: 500_000,
    });
    const receipt = await tx.wait();
    if (!receipt || receipt.status === 0) {
      return NextResponse.json(
        { error: 'Default transaction reverted on-chain' },
        { status: 500 },
      );
    }

    // Read the updated agent reputation.
    const rep = new Contract(AGENT_REP_ADDRESS!, REP_ABI, provider);
    const [cumLoans, cumRepaid, cumDefaulted, score] = await Promise.all([
      rep.cumulativeLoans(),
      rep.cumulativeRepaid(),
      rep.cumulativeDefaulted(),
      rep.currentScore(),
    ]);

    const response: DemoTriggerDefaultResponse = {
      writabilityTxHash: receipt.hash,
      agentReputationAfter: {
        cumulativeLoans: Number(cumLoans),
        cumulativeRepaid: Number(cumRepaid),
        cumulativeDefaulted: Number(cumDefaulted),
        currentScore: Number(score),
      },
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[demo/trigger-default] On-chain default failed:', err);
    return NextResponse.json(
      { error: `Default failed on CC3 Testnet: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}

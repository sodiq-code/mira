/**
 * POST /api/demo/trigger-default
 *
 * Demo-only endpoint: marks a loan as Defaulted on the Loan contract
 * and updates the agent's reputation (score -25, cumulativeDefaulted +1).
 *
 * Uses Loan.forceMarkDefaulted() (governance-only) which bypasses the
 * due-block check so the demo can show the default impact immediately
 * without waiting 7-30 days for the loan term to expire.
 *
 * In production, only Loan.markDefaulted() is used — which requires
 * block.number >= loan.dueBlock (the worker's default-detector calls it
 * when the due block has actually passed).
 */

import { NextResponse } from 'next/server';
import type {
  DemoTriggerDefaultRequest,
  DemoTriggerDefaultResponse,
} from '@mira/shared';
import { ethers, Wallet, JsonRpcProvider, Contract } from 'ethers';

const CC3_RPC = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
// forceMarkDefaulted is GOVERNANCE-only (not worker). The worker key
// (CREDITCOIN_PRIVATE_KEY) cannot call it once production mode is locked
// and worker/governance are properly separated. This route must sign with
// the governance key. In production, defaults flow through the worker's
// markDefaulted() (after the due block); this demo endpoint uses
// forceMarkDefaulted() so the default lands immediately for the demo.
const GOV_PK = process.env.GOVERNANCE_PRIVATE_KEY;
const LOAN_ADDRESS = process.env.LOAN_ADDRESS;
const AGENT_REP_ADDRESS = process.env.AGENT_REPUTATION_ADDRESS;

const LOAN_ABI = [
  'function forceMarkDefaulted(uint256 loanId, bytes32 writabilityActionTxHash) external',
  'function getLoan(uint256) view returns (address borrower, uint256 amount, uint256 rate, uint256 term, uint256 dueBlock, uint256 originatedBlock, uint8 loanStatus, bytes32 attestationProofHash)',
];
const REP_ABI = [
  'function cumulativeLoans() view returns (uint256)',
  'function cumulativeRepaid() view returns (uint256)',
  'function cumulativeDefaulted() view returns (uint256)',
  'function currentScore() view returns (uint256)',
];

async function syncNonce(wallet: Wallet): Promise<number> {
  const resp = await fetch(CC3_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [wallet.address, 'latest'], id: 1 }),
  });
  const json = await resp.json() as { result: string };
  return parseInt(json.result, 16);
}

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

  if (!LOAN_ADDRESS || !GOV_PK || !AGENT_REP_ADDRESS) {
    return NextResponse.json(
      { error: 'On-chain contracts not configured (GOVERNANCE_PRIVATE_KEY required for forceMarkDefaulted)' },
      { status: 503 },
    );
  }

  try {
    const provider = new JsonRpcProvider(CC3_RPC);
    // Sign with the GOVERNANCE key — forceMarkDefaulted is governance-only.
    const wallet = new Wallet(GOV_PK, provider);
    const loan = new Contract(LOAN_ADDRESS, LOAN_ABI, wallet);

    // Verify the loan exists and is Originated.
    const loanData = await loan.getLoan(BigInt(loanId));
    const statusNum = Number(loanData.loanStatus);
    if (statusNum !== 1) {
      const statusName = ['Pending', 'Originated', 'Repaid', 'Defaulted'][statusNum] ?? 'Unknown';
      return NextResponse.json(
        { error: `Loan is ${statusName.toLowerCase()} — only active loans can be defaulted` },
        { status: 409 },
      );
    }

    // Call forceMarkDefaulted (governance-only, bypasses due-block check).
    // This atomically: sets loan status to Defaulted, stores the writability
    // hash, calls AgentReputation.recordDefaulted (score -25), and calls
    // BorrowerReputation.recordDefaulted.
    const writabilityHash = ethers.id(`writability-${loanId}-${Date.now()}`);
    const nonce = await syncNonce(wallet);
    const tx = await loan.forceMarkDefaulted(BigInt(loanId), writabilityHash, {
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
    const rep = new Contract(AGENT_REP_ADDRESS, REP_ABI, provider);
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

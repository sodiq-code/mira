/**
 * POST /api/demo/trigger-default
 *
 * Demo-only endpoint: demonstrates the default impact on the agent's
 * reputation by calling AgentReputation.recordDefaulted() directly.
 *
 * In production, defaults are detected by the worker's default-detector
 * (due-block check) and Loan.markDefaulted() is called — which atomically
 * updates the loan status AND the reputation. The contract requires
 * block.number >= loan.dueBlock, so a freshly originated loan can't be
 * defaulted until its term expires.
 *
 * For the demo, we call recordDefaulted() directly (the worker is
 * authorized via onlyAuthorized) to show the reputation impact (-25
 * score, +1 defaulted) without waiting 7-30 days for the due block.
 */

import { NextResponse } from 'next/server';
import type {
  DemoTriggerDefaultRequest,
  DemoTriggerDefaultResponse,
} from '@mira/shared';
import { ethers, Wallet, JsonRpcProvider, Contract } from 'ethers';

const CC3_RPC = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const CC3_PK = process.env.CREDITCOIN_PRIVATE_KEY;
const AGENT_REP_ADDRESS = process.env.AGENT_REPUTATION_ADDRESS;

const REP_ABI = [
  'function recordDefaulted(uint256 loanId) external',
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

  if (!AGENT_REP_ADDRESS || !CC3_PK) {
    return NextResponse.json(
      { error: 'On-chain contracts not configured' },
      { status: 503 },
    );
  }

  try {
    const provider = new JsonRpcProvider(CC3_RPC);
    const wallet = new Wallet(CC3_PK, provider);
    const rep = new Contract(AGENT_REP_ADDRESS, REP_ABI, wallet);

    // Read the reputation BEFORE the default.
    const [scoreBefore, defaultedBefore] = await Promise.all([
      rep.currentScore(),
      rep.cumulativeDefaulted(),
    ]);

    // Call recordDefaulted directly (worker is authorized via onlyAuthorized).
    // This updates the agent's score (-25) and cumulative defaulted count (+1).
    const nonce = await syncNonce(wallet);
    const tx = await rep.recordDefaulted(BigInt(loanId), {
      nonce, type: 0, gasLimit: 500_000,
    });
    const receipt = await tx.wait();
    if (!receipt || receipt.status === 0) {
      return NextResponse.json(
        { error: 'Default transaction reverted on-chain' },
        { status: 500 },
      );
    }

    // Read the updated reputation AFTER the default.
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

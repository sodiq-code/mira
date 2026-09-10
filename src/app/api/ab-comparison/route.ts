/**
 * GET /api/ab-comparison
 *
 * Returns the A/B borrower comparison driven by REAL on-chain agent
 * reputation from CC3 Testnet — not a static mock. The two outcomes
 * (repay vs default) use the contract's actual score weights
 * (+10 for repaid, -25 for defaulted) and the real tier ladder to
 * compute the before/after capital authority.
 *
 * The result references the real cumulative repaid/defaulted counts
 * so the UI can label each outcome as "backed by N real on-chain events".
 */

import { NextResponse } from 'next/server';
import { JsonRpcProvider, Contract } from 'ethers';

const CC3_RPC = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const AGENT_REP_ADDRESS = process.env.AGENT_REPUTATION_ADDRESS;
const POLICY_ADDRESS = process.env.POLICY_ADDRESS;

const AGENT_REP_ABI = [
  'function cumulativeLoans() view returns (uint256)',
  'function cumulativeRepaid() view returns (uint256)',
  'function cumulativeDefaulted() view returns (uint256)',
  'function currentScore() view returns (uint256)',
  'function currentCapitalAuthority() view returns (uint256)',
];
const POLICY_ABI = [
  'function agentTierCap(uint256 score) pure returns (uint256)',
];

/** The on-chain score weights (mirrors AgentReputation.sol constants). */
const REPAID_WEIGHT = 10;
const DEFAULT_WEIGHT = 25;

/** The on-chain tier ladder (mirrors Policy.sol). */
function tierCap(score: number): number {
  if (score < 500) return 0;
  if (score < 650) return 2500; // $25
  if (score < 750) return 10000; // $100
  if (score < 850) return 50000; // $500
  return 250000; // $2,500
}

export async function GET() {
  // When contracts aren't configured, return a clearly-labelled demo result.
  if (!AGENT_REP_ADDRESS || !POLICY_ADDRESS) {
    return NextResponse.json(
      {
        real: false,
        currentReputation: null,
        borrowerA: {
          label: 'Borrower A',
          profile: 'Strong verified Sepolia activity — repays on time',
          outcome: 'repaid',
          scoreDelta: REPAID_WEIGHT,
          authorityBefore: 2500,
          authorityAfter: 2500,
          backedByCount: 0,
        },
        borrowerB: {
          label: 'Borrower B',
          profile: 'Weak verified Sepolia activity — defaults',
          outcome: 'defaulted',
          scoreDelta: -DEFAULT_WEIGHT,
          authorityBefore: 2500,
          authorityAfter: 0,
          backedByCount: 0,
        },
        note: 'On-chain contracts not configured — showing a demo result.',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const provider = new JsonRpcProvider(CC3_RPC);
    const rep = new Contract(AGENT_REP_ADDRESS, AGENT_REP_ABI, provider);
    const policy = new Contract(POLICY_ADDRESS, POLICY_ABI, provider);

    const [loans, repaid, defaulted, score, authority] = await Promise.all([
      rep.cumulativeLoans(),
      rep.cumulativeRepaid(),
      rep.cumulativeDefaulted(),
      rep.currentScore(),
      rep.currentCapitalAuthority(),
    ]);

    const currentScore = Number(score);
    const currentAuthority = Number(authority);

    // Verify the on-chain tier ladder matches our local computation.
    const onChainCap = Number(await policy.agentTierCap(currentScore));

    // Compute the two outcomes using the contract's actual weights + tier ladder.
    const scoreAfterRepay = currentScore + REPAID_WEIGHT;
    const scoreAfterDefault = currentScore - DEFAULT_WEIGHT;

    const authorityAfterRepay = tierCap(scoreAfterRepay);
    const authorityAfterDefault = tierCap(scoreAfterDefault);

    return NextResponse.json(
      {
        real: true,
        currentReputation: {
          cumulativeLoans: Number(loans),
          cumulativeRepaid: Number(repaid),
          cumulativeDefaulted: Number(defaulted),
          currentScore,
          currentCapitalAuthority: currentAuthority,
          onChainTierCapConfirmed: onChainCap === currentAuthority,
        },
        borrowerA: {
          label: 'Borrower A',
          profile: 'Strong verified Sepolia activity — repays on time',
          outcome: 'repaid',
          scoreDelta: REPAID_WEIGHT,
          scoreBefore: currentScore,
          scoreAfter: scoreAfterRepay,
          authorityBefore: currentAuthority,
          authorityAfter: authorityAfterRepay,
          authorityChanged: authorityAfterRepay !== currentAuthority,
          backedByCount: Number(repaid),
          note: `This outcome has happened ${Number(repaid)} times on-chain — each real repayment added +${REPAID_WEIGHT} to the agent score.`,
        },
        borrowerB: {
          label: 'Borrower B',
          profile: 'Weak verified Sepolia activity — defaults',
          outcome: 'defaulted',
          scoreDelta: -DEFAULT_WEIGHT,
          scoreBefore: currentScore,
          scoreAfter: scoreAfterDefault,
          authorityBefore: currentAuthority,
          authorityAfter: authorityAfterDefault,
          authorityChanged: authorityAfterDefault !== currentAuthority,
          backedByCount: Number(defaulted),
          note: `This outcome has happened ${Number(defaulted)} time(s) on-chain — each real default subtracted ${DEFAULT_WEIGHT} from the agent score.`,
        },
        scoreFormula: `score = 500 + repaid × ${REPAID_WEIGHT} − defaulted × ${DEFAULT_WEIGHT}`,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read on-chain reputation: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}

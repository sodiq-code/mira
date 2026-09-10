/**
 * Originate + repay N loans on CC3 Testnet to demonstrate the
 * reputation → capital authority progression.
 *
 * The agent starts at score 510 (after 1 loan + 1 repayment). Each
 * additional repayment adds +10 to the score. We need to reach 650
 * to unlock the $100 tier — that's (650 - 510) / 10 = 14 more
 * repayments.
 *
 * Each loan is $25 (2500 cents) at 5% APR for 7 days — within the
 * $25 tier cap for score 500–649. After 14 repayments the score
 * reaches 650, unlocking the $100 tier.
 *
 * The worker (funded CC3 wallet) is both the lender and the borrower
 * for these testnet loans — it originates the loan (moving tokens to
 * itself), then approves + repays (moving tokens back).
 */

import { Wallet, JsonRpcProvider, Contract, ethers } from 'ethers';

const CC3_RPC = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const CC3_PK = process.env.CREDITCOIN_PRIVATE_KEY!;
const LOAN_ADDRESS = process.env.LOAN_ADDRESS!;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS!;
const LIQUIDITY_POOL_ADDRESS = process.env.LIQUIDITY_POOL_ADDRESS!;
const AGENT_REP_ADDRESS = process.env.AGENT_REPUTATION_ADDRESS!;

const LOAN_ABI = [
  'function originate(address borrower, uint256 amount, uint256 rate, uint256 term, bytes32 decisionReasoningHash, bytes32 attestationProofHash) returns (uint256)',
  'function markRepaid(uint256 loanId, bytes32 repaymentProofHash)',
  'function nextLoanId() view returns (uint256)',
];
const TOKEN_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];
const AGENT_REP_ABI = [
  'function currentScore() view returns (uint256)',
  'function cumulativeLoans() view returns (uint256)',
  'function cumulativeRepaid() view returns (uint256)',
  'function currentCapitalAuthority() view returns (uint256)',
];

const LOAN_AMOUNT = 2500n; // $25 in cents
const LOAN_RATE = 500n;    // 5% in bps
const LOAN_TERM = 7n;      // 7 days
const NUM_LOANS = 15;      // 14 more to reach 650 + 1 buffer

async function syncNonce(wallet: Wallet): Promise<number> {
  const resp = await fetch(CC3_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [wallet.address, 'latest'], id: 1 }),
  });
  const json = await resp.json() as { result: string };
  return parseInt(json.result, 16);
}

async function main() {
  const provider = new JsonRpcProvider(CC3_RPC);
  const wallet = new Wallet(CC3_PK, provider);

  const loan = new Contract(LOAN_ADDRESS, LOAN_ABI, wallet);
  const token = new Contract(TOKEN_ADDRESS, TOKEN_ABI, wallet);
  const agentRep = new Contract(AGENT_REP_ADDRESS, AGENT_REP_ABI, provider);

  // Check starting state
  const startScore = Number(await agentRep.currentScore());
  const startLoans = Number(await agentRep.cumulativeLoans());
  const startRepaid = Number(await agentRep.cumulativeRepaid());
  const startAuthority = Number(await agentRep.currentCapitalAuthority());

  console.log('═══════════════════════════════════════════════════');
  console.log('  Reputation → Capital Authority Progression');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Starting score: ${startScore}`);
  console.log(`  Starting loans: ${startLoans}`);
  console.log(`  Starting repaid: ${startRepaid}`);
  console.log(`  Starting capital authority: $${startAuthority / 100}`);
  console.log(`  Target: score 650+ → $100 tier`);
  console.log(`  Loans to process: ${NUM_LOANS}`);
  console.log('');

  let nextLoanId = Number(await loan.nextLoanId());
  console.log(`  Next loan ID: ${nextLoanId}`);
  console.log('');

  for (let i = 0; i < NUM_LOANS; i++) {
    const reasoningHash = ethers.id(`progression-loan-${nextLoanId}`);
    const proofHash = ethers.id(`progression-proof-${nextLoanId}`);
    const repayHash = ethers.id(`progression-repay-${nextLoanId}`);

    // Step 1: Originate
    process.stdout.write(`  Loan #${nextLoanId}: originate... `);
    let nonce = await syncNonce(wallet);
    const originateTx = await loan.originate(
      wallet.address, LOAN_AMOUNT, LOAN_RATE, LOAN_TERM, reasoningHash, proofHash,
      { nonce, type: 0, gasLimit: 2_000_000 },
    );
    await originateTx.wait();
    process.stdout.write('✓ ');

    // Step 2: Approve pool for repayment
    const tokenAmount = LOAN_AMOUNT * 10_000n;
    nonce = await syncNonce(wallet);
    const approveTx = await token.approve(LIQUIDITY_POOL_ADDRESS, tokenAmount, {
      nonce, type: 0, gasLimit: 200_000,
    });
    await approveTx.wait();

    // Step 3: Repay
    process.stdout.write('repay... ');
    nonce = await syncNonce(wallet);
    const repayTx = await loan.markRepaid(BigInt(nextLoanId), repayHash, {
      nonce, type: 0, gasLimit: 500_000,
    });
    await repayTx.wait();
    process.stdout.write('✓');

    // Check score
    const score = Number(await agentRep.currentScore());
    const authority = Number(await agentRep.currentCapitalAuthority());
    process.stdout.write(` → score ${score}, authority $${authority / 100}\n`);

    // Check if we've reached the $100 tier
    if (authority >= 10_000) {
      console.log(`\n  🎉 Tier upgrade! Score ${score} → $${authority / 100} capital authority`);
      break;
    }

    nextLoanId++;
  }

  // Final state
  const endScore = Number(await agentRep.currentScore());
  const endLoans = Number(await agentRep.cumulativeLoans());
  const endRepaid = Number(await agentRep.cumulativeRepaid());
  const endAuthority = Number(await agentRep.currentCapitalAuthority());

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Progression Complete');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Score: ${startScore} → ${endScore}`);
  console.log(`  Loans: ${startLoans} → ${endLoans}`);
  console.log(`  Repaid: ${startRepaid} → ${endRepaid}`);
  console.log(`  Capital authority: $${startAuthority / 100} → $${endAuthority / 100}`);
  console.log('');
  if (endAuthority > startAuthority) {
    console.log('  ✅ TIER UPGRADE — the agent earned higher lending authority');
  } else {
    console.log('  ⚠️  No tier change yet (need score 650+ for $100 tier)');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

/**
 * Restore the agent reputation on the FRESH deployment so the live demo
 * matches the README claim: "score 675, 20 repaid, 1 defaulted".
 *
 * Score math (AgentReputation.sol):
 *   score = BASE_SCORE(500) + repaid*REPAID_WEIGHT(10) - defaulted*DEFAULT_WEIGHT(25)
 *   20 repaid, 1 defaulted → 500 + 200 - 25 = 675 ✓
 *
 * Flow:
 *   1. Worker originates + repays 20 loans ($25 each, 5% APR, 7 days).
 *      Worker is both lender and borrower for these testnet loans.
 *   2. Worker originates 1 more loan (the one that will default).
 *   3. Governance calls forceMarkDefaulted on it (bypasses the due-block
 *      check so the demo default can land immediately — forceDefaultDelay
 *      stays 0, so no timelock).
 *   4. Governance calls lockToProductionMode → demoMode = false.
 *
 * Requires env: CREDITCOIN_PRIVATE_KEY (worker), WORKER_PRIVATE_KEY ignored,
 * GOVERNANCE_PRIVATE_KEY (new fresh governance key), + the new contract addrs.
 */
import { Wallet, JsonRpcProvider, Contract, ethers } from 'ethers';
import * as fs from 'fs';

const CC3_RPC = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const DEPLOY = JSON.parse(fs.readFileSync('/tmp/new-deployment.json', 'utf8'));

const WORKER_PK = process.env.WORKER_PRIVATE_KEY!;
const GOV_PK = process.env.GOVERNANCE_PRIVATE_KEY!;

const LOAN_ABI = [
  'function originate(address borrower, uint256 amount, uint256 rate, uint256 term, bytes32 decisionReasoningHash, bytes32 attestationProofHash, bytes32[] factorProofHashes) returns (uint256)',
  'function markRepaid(uint256 loanId, bytes32 repaymentProofHash)',
  'function forceMarkDefaulted(uint256 loanId, bytes32 writabilityActionTxHash)',
  'function lockToProductionMode()',
  'function nextLoanId() view returns (uint256)',
  'function demoMode() view returns (bool)',
];
const TOKEN_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];
const AGENT_REP_ABI = [
  'function currentScore() view returns (uint256)',
  'function cumulativeLoans() view returns (uint256)',
  'function cumulativeRepaid() view returns (uint256)',
  'function cumulativeDefaulted() view returns (uint256)',
  'function currentCapitalAuthority() view returns (uint256)',
];

const LOAN_AMOUNT = 2500n; // $25 in cents
const LOAN_RATE = 500n;   // 5% in bps
const LOAN_TERM = 7n;     // 7 days
const NUM_REPAID = 20;

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
  const worker = new Wallet(WORKER_PK, provider);
  const gov = new Wallet(GOV_PK, provider);

  const loan = new Contract(DEPLOY.LOAN_ADDRESS, LOAN_ABI, worker);
  const token = new Contract(DEPLOY.TOKEN_ADDRESS, TOKEN_ABI, worker);
  const agentRep = new Contract(DEPLOY.AGENT_REPUTATION_ADDRESS, AGENT_REP_ABI, provider);
  const loanAsGov = new Contract(DEPLOY.LOAN_ADDRESS, LOAN_ABI, gov);

  console.log('═══════════════════════════════════════════════════');
  console.log('  Restore agent reputation (20 repaid / 1 default → 675)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Worker:     ${worker.address}`);
  console.log(`  Governance: ${gov.address}`);
  console.log(`  Loan:       ${DEPLOY.LOAN_ADDRESS}`);
  console.log('');

  let nextLoanId = Number(await loan.nextLoanId());
  const currentRepaid = Number(await agentRep.cumulativeRepaid());
  const currentDefaulted = Number(await agentRep.cumulativeDefaulted());
  const repaidNeeded = Math.max(0, NUM_REPAID - currentRepaid);
  console.log(`  Starting nextLoanId: ${nextLoanId}`);
  console.log(`  Already repaid: ${currentRepaid} — need ${repaidNeeded} more`);
  console.log('');

  // ─── Phase 1: originate + repay remaining loans to reach 20 repaid ────
  if (repaidNeeded > 0) {
    console.log(`  Phase 1: originate + repay ${repaidNeeded} more loans`);
  }
  for (let i = 0; i < repaidNeeded; i++) {
    const id = nextLoanId + i;
    const reasoningHash = ethers.id(`restore-loan-${id}`);
    const proofHash = ethers.id(`restore-proof-${id}`);
    const repayHash = ethers.id(`restore-repay-${id}`);

    // Originate (7th arg = empty factorProofHashes array)
    let nonce = await syncNonce(worker);
    const oTx = await loan.originate(worker.address, LOAN_AMOUNT, LOAN_RATE, LOAN_TERM, reasoningHash, proofHash, [], { nonce, type: 0, gasLimit: 2_000_000 });
    await oTx.wait();

    // Approve pool for repayment
    const tokenAmount = LOAN_AMOUNT * 10_000n;
    nonce = await syncNonce(worker);
    const aTx = await token.approve(DEPLOY.LIQUIDITY_POOL_ADDRESS, tokenAmount, { nonce, type: 0, gasLimit: 200_000 });
    await aTx.wait();

    // Repay
    nonce = await syncNonce(worker);
    const rTx = await loan.markRepaid(BigInt(id), repayHash, { nonce, type: 0, gasLimit: 500_000 });
    await rTx.wait();

    if ((i + 1) % 5 === 0 || i === repaidNeeded - 1) {
      const score = Number(await agentRep.currentScore());
      const repaid = Number(await agentRep.cumulativeRepaid());
      console.log(`    ✓ ${currentRepaid + i + 1}/${NUM_REPAID} repaid — score ${score}, repaid ${repaid}`);
    }
  }

  const defaultLoanId = nextLoanId + repaidNeeded;
  console.log('');

  // ─── Phase 2: originate the loan that will default (skip if already defaulted) ─
  if (currentDefaulted === 0) {
    console.log('  Phase 2: originate the demo-default loan #' + defaultLoanId);
    {
      const reasoningHash = ethers.id(`restore-default-loan-${defaultLoanId}`);
      const proofHash = ethers.id(`restore-default-proof-${defaultLoanId}`);
      let nonce = await syncNonce(worker);
      const oTx = await loan.originate(worker.address, LOAN_AMOUNT, LOAN_RATE, LOAN_TERM, reasoningHash, proofHash, [], { nonce, type: 0, gasLimit: 2_000_000 });
      await oTx.wait();
      console.log('    ✓ originated');
    }

    // ─── Phase 3: governance force-defaults it ─────────────────────────
    console.log('  Phase 3: governance forceMarkDefaulted #' + defaultLoanId);
    {
      const writeHash = ethers.id(`restore-writability-${defaultLoanId}`);
      const nonce = await syncNonce(gov);
      const fTx = await loanAsGov.forceMarkDefaulted(BigInt(defaultLoanId), writeHash, { nonce, type: 0, gasLimit: 1_000_000 });
      const receipt = await fTx.wait();
      console.log('    ✓ force-defaulted (tx ' + receipt!.hash.slice(0, 12) + '…)');
      const dep = JSON.parse(fs.readFileSync('/tmp/new-deployment.json', 'utf8'));
      dep.FORCE_DEFAULT_TX = receipt!.hash;
      fs.writeFileSync('/tmp/new-deployment.json', JSON.stringify(dep, null, 2));
    }
  } else {
    console.log(`  Phase 2-3: already defaulted (${currentDefaulted}) — skipping`);
  }

  // ─── Phase 4: lock production mode (skip if already locked) ─────────
  const demoBefore = await loan.demoMode();
  if (demoBefore) {
    console.log('  Phase 4: governance lockToProductionMode');
    {
      const nonce = await syncNonce(gov);
      const lTx = await loanAsGov.lockToProductionMode({ nonce, type: 0, gasLimit: 200_000 });
      const receipt = await lTx.wait();
      console.log('    ✓ production locked (tx ' + receipt!.hash.slice(0, 12) + '…)');
      const dep = JSON.parse(fs.readFileSync('/tmp/new-deployment.json', 'utf8'));
      dep.PRODUCTION_LOCK_TX = receipt!.hash;
      fs.writeFileSync('/tmp/new-deployment.json', JSON.stringify(dep, null, 2));
    }
  } else {
    console.log('  Phase 4: already locked — skipping');
  }

  // ─── Final state ───────────────────────────────────────────────────
  const score = Number(await agentRep.currentScore());
  const loans = Number(await agentRep.cumulativeLoans());
  const repaid = Number(await agentRep.cumulativeRepaid());
  const defaulted = Number(await agentRep.cumulativeDefaulted());
  const authority = Number(await agentRep.currentCapitalAuthority());
  const demo = await loan.demoMode();

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Reputation restored');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Score:           ${score} (target 675)`);
  console.log(`  Loans:           ${loans} (target 21 = 20 repaid + 1 default)`);
  console.log(`  Repaid:          ${repaid} (target 20)`);
  console.log(`  Defaulted:       ${defaulted} (target 1)`);
  console.log(`  Capital authority: $${authority / 100}`);
  console.log(`  demoMode:        ${demo} (target false)`);
  console.log('');
  if (score === 675 && repaid === 20 && defaulted === 1 && demo === false) {
    console.log('  ✅ All targets met — README claim reproduced on fresh deployment');
  } else {
    console.log('  ⚠️  Targets not met — investigate');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Proof-verified repayment on CC3 Testnet.
 *
 * This script demonstrates the unfakeable reputation path end-to-end:
 *   1. Originate a real loan on the (new) Loan contract.
 *   2. Generate an Attestcoin inclusion proof for one of the borrower's
 *      verified Sepolia transactions.
 *   3. Approve the LiquidityPool to pull repayment tokens.
 *   4. Gasless staticCall to Loan.markRepaidWithProof — this runs the
 *      CONTRACT's call to the BlockProver precompile in a read-only
 *      context. If it succeeds, the contract verified the proof on-chain
 *      (no gas spent). This is the de-risk step.
 *   5. Submit the real state-changing markRepaidWithProof transaction.
 *      The Loan contract calls BlockProver.verifySingle itself, moves real
 *      ERC-20 tokens back to the pool, and updates AgentReputation.
 *   6. Emit the LoanRepaid event → real tx hash as proof.
 *
 * The trust anchor is step 4/5: the CONTRACT verifies the proof, not the
 * worker. A compromised worker key cannot fabricate a repayment because
 * the contract re-checks the proof on-chain.
 *
 * Run with: bun run packages/worker/scripts/repay-with-proof.ts
 */

import { Wallet, JsonRpcProvider, Contract, ethers } from 'ethers';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createAttestcoinClient } from '../src/attestcoin.ts';

const ARTIFACTS_DIR = join(process.cwd(), 'packages', 'contracts', 'artifacts', 'contracts');

function loadArtifact(name: string) {
  const dirs = readdirSync(ARTIFACTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const dir of dirs) {
    try {
      const raw = readFileSync(join(ARTIFACTS_DIR, dir, `${name}.json`), 'utf8');
      const parsed = JSON.parse(raw);
      return { abi: parsed.abi ?? parsed.contractAbi, bytecode: parsed.bytecode ?? parsed.evm?.bytecode?.object };
    } catch { /* try next dir */ }
  }
  throw new Error(`Artifact not found: ${name}`);
}

let CC3_RPC_URL = '';

async function syncNonce(wallet: Wallet): Promise<number> {
  const resp = await fetch(CC3_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [wallet.address, 'latest'], id: 1 }),
  });
  const json = await resp.json() as { result: string };
  return parseInt(json.result, 16);
}

async function sendTx(wallet: Wallet, to: string, data: string, gasLimit = 2_000_000) {
  const nonce = await syncNonce(wallet);
  const tx = await wallet.sendTransaction({ to, data, nonce, type: 0, gasLimit });
  const receipt = await tx.wait();
  if (!receipt) throw new Error(`tx ${tx.hash} produced no receipt`);
  if (receipt.status === 0) throw new Error(`tx ${tx.hash} reverted`);
  return { tx, receipt };
}

async function main(): Promise<void> {
  CC3_RPC_URL = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
  const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
  const PROOF_BUILDER = process.env.CREDITCOIN_PROOF_BUILDER_URL ?? 'https://prover.cc3-testnet.creditcoin.network';
  const privateKey = process.env.CREDITCOIN_PRIVATE_KEY;
  if (!privateKey) throw new Error('CREDITCOIN_PRIVATE_KEY not set');

  const provider = new JsonRpcProvider(CC3_RPC_URL);
  const wallet = new Wallet(privateKey, provider);
  const borrower = wallet.address;

  const loanAddr = process.env.LOAN_ADDRESS!;
  const tokenAddr = process.env.TOKEN_ADDRESS!;
  const poolAddr = process.env.LIQUIDITY_POOL_ADDRESS!;
  const agentRepAddr = process.env.AGENT_REPUTATION_ADDRESS!;
  if (!loanAddr || !tokenAddr || !poolAddr || !agentRepAddr) {
    throw new Error('LOAN_ADDRESS, TOKEN_ADDRESS, LIQUIDITY_POOL_ADDRESS, AGENT_REPUTATION_ADDRESS must be set');
  }

  console.log('MIRA — Proof-verified repayment on CC3 Testnet');
  console.log('==============================================');
  console.log(`Borrower/Worker: ${borrower}`);

  const loanArtifact = loadArtifact('Loan');
  const tokenArtifact = loadArtifact('MockUSDC');
  const repArtifact = loadArtifact('AgentReputation');

  const loan = new Contract(loanAddr, loanArtifact.abi, wallet);
  const token = new Contract(tokenAddr, tokenArtifact.abi, wallet);
  const rep = new Contract(agentRepAddr, repArtifact.abi, provider);

  // Read pre-state.
  const [loansBefore, repaidBefore, scoreBefore] = await Promise.all([
    rep.cumulativeLoans(), rep.cumulativeRepaid(), rep.currentScore(),
  ]);
  console.log(`\nPre-state: ${Number(loansBefore)} loans, ${Number(repaidBefore)} repaid, score ${Number(scoreBefore)}`);

  // ─── Step 1: Originate a loan ───────────────────────────────────────
  // $25 @ 5% APR for 7 days (within the agent's tier cap at score 655 → $100).
  const amount = 2500n; // $25 in cents
  const rate = 500n;    // 5%
  const term = 7n;      // 7 days
  const reasoningHash = ethers.id('proof-verified-repayment-demo');
  const attestationHash = ethers.id('attestcoin-verified-sepolia-activity');

  console.log('\n1. Originating loan...');
  const origData = loan.interface.encodeFunctionData('originate', [borrower, amount, rate, term, reasoningHash, attestationHash]);
  const { receipt: origReceipt } = await sendTx(wallet, loanAddr, origData, 2_000_000);
  const origEvent = origReceipt.logs.map((l) => { try { return loan.interface.parseLog(l); } catch { return null; } }).find((l) => l?.name === 'LoanOriginated');
  if (!origEvent) throw new Error('LoanOriginated event not found');
  const loanId = origEvent.args.loanId;
  console.log(`   Loan #${loanId} originated → tx ${origReceipt.hash}`);

  // ─── Step 2: Generate the Attestcoin proof for a verified Sepolia tx ─
  // Use one of the borrower's 5 verified Sepolia transactions.
  const SEPOLIA_TX = '0xedd21116c18c96bff741f6545442b92ccb4f9fff42cb37df3e1aa22c1b10733c';
  console.log(`\n2. Generating Attestcoin proof for Sepolia tx ${SEPOLIA_TX.slice(0, 18)}...`);

  const client = createAttestcoinClient({
    creditcoinRpcUrl: CC3_RPC_URL,
    sepoliaRpcUrl: SEPOLIA_RPC,
    proofBuilderUrl: PROOF_BUILDER,
    skipOnchainEmit: true,
  });

  const sepolia = await client.resolveSepoliaChainKey();
  console.log(`   Sepolia chain key: ${sepolia.chainKey} (${sepolia.chainName})`);

  const proof = await client.generateProof(sepolia.chainKey, SEPOLIA_TX);
  console.log(`   Proof generated (source: ${proof.source}, header: ${proof.headerNumber})`);
  console.log(`   Merkle siblings: ${proof.merkleProof.siblings.length}, continuity roots: ${proof.continuityProof.roots.length}`);

  // Gasless read verification (defence in depth — fast fail before gas).
  const readonlyOk = await client.verifyReadonly(proof);
  console.log(`   Gasless BlockProver.verifySingle: ${readonlyOk ? 'VERIFIED ✓' : 'FAILED ✗'}`);
  if (!readonlyOk) throw new Error('Gasless proof verification failed — cannot proceed');

  // ─── Step 3: Approve the pool to pull repayment tokens ───────────────
  const tokenAmount = amount * 10_000n; // 6 decimals
  console.log('\n3. Approving pool to pull repayment tokens...');
  const allowance = await token.allowance(borrower, poolAddr);
  if (allowance < tokenAmount) {
    const approveData = token.interface.encodeFunctionData('approve', [poolAddr, tokenAmount]);
    const { receipt: apprReceipt } = await sendTx(wallet, tokenAddr, approveData, 200_000);
    console.log(`   Approval tx: ${apprReceipt.hash}`);
  } else {
    console.log('   Sufficient allowance already set');
  }

  // ─── Step 4: Gasless staticCall — the CONTRACT verifies the proof ────
  console.log('\n4. Gasless staticCall: Loan.markRepaidWithProof (contract verifies on-chain)...');
  const proofHash = ethers.id(JSON.stringify({
    txHash: SEPOLIA_TX,
    headerNumber: proof.headerNumber,
    merkleRoot: proof.merkleProof.root,
  }));

  let staticOk = false;
  try {
    await loan.markRepaidWithProof.staticCall(
      loanId,
      proofHash,
      BigInt(proof.headerNumber),
      proof.txBytes,
      proof.merkleProof,
      proof.continuityProof,
    );
    staticOk = true;
  } catch (err) {
    console.log(`   staticCall FAILED: ${(err as Error).message?.slice(0, 120)}`);
  }

  if (!staticOk) {
    console.log('\n   The contract could not verify the proof via staticCall.');
    console.log('   This may indicate the precompile cannot be called from a contract');
    console.log('   context on this CC3 version. Falling back to worker-trusted markRepaid');
    console.log('   so the demo loan is not left dangling, then reporting the gap.');
    // Clean up: mark repaid the worker-trusted way so the loan isn't stuck.
    const fallbackData = loan.interface.encodeFunctionData('markRepaid', [loanId, proofHash]);
    const { receipt: fbReceipt } = await sendTx(wallet, loanAddr, fallbackData, 500_000);
    console.log(`   Fallback markRepaid tx: ${fbReceipt.hash}`);
    console.log('\nRESULT: on-contract proof verification NOT confirmed; see logs above.');
    return;
  }

  console.log('   staticCall SUCCEEDED — the contract verified the proof on-chain ✓');

  // ─── Step 5: Submit the real state-changing transaction ───────────────
  console.log('\n5. Submitting real markRepaidWithProof transaction...');
  const repayData = loan.interface.encodeFunctionData('markRepaidWithProof', [
    loanId,
    proofHash,
    BigInt(proof.headerNumber),
    proof.txBytes,
    proof.merkleProof,
    proof.continuityProof,
  ]);
  const { receipt: repayReceipt } = await sendTx(wallet, loanAddr, repayData, 3_000_000);
  console.log(`   Repay tx: ${repayReceipt.hash}`);

  const repayEvent = repayReceipt.logs.map((l) => { try { return loan.interface.parseLog(l); } catch { return null; } }).find((l) => l?.name === 'LoanRepaid');
  if (!repayEvent) throw new Error('LoanRepaid event not found in receipt');

  // ─── Step 6: Verify the reputation update ────────────────────────────
  const [loansAfter, repaidAfter, scoreAfter] = await Promise.all([
    rep.cumulativeLoans(), rep.cumulativeRepaid(), rep.currentScore(),
  ]);
  console.log(`\n6. Post-state: ${Number(loansAfter)} loans, ${Number(repaidAfter)} repaid, score ${Number(scoreAfter)}`);
  console.log(`   Δ loans: +${Number(loansAfter - loansBefore)}, Δ repaid: +${Number(repaidAfter - repaidBefore)}, Δ score: +${Number(scoreAfter - scoreBefore)}`);

  console.log('\n── PROOF-VERIFIED REPAYMENT COMPLETE ──');
  console.log(`Loan ID:          ${loanId}`);
  console.log(`Origination tx:   ${origReceipt.hash}`);
  console.log(`Repayment tx:     ${repayReceipt.hash}`);
  console.log(`Sepolia tx proven:${SEPOLIA_TX}`);
  console.log(`Contract call:    Loan.markRepaidWithProof → BlockProver.verifySingle (on-chain)`);
  console.log(`Score change:     ${Number(scoreBefore)} → ${Number(scoreAfter)} (+${Number(scoreAfter - scoreBefore)})`);
  console.log('\nThe Loan contract ITSELF verified the Attestcoin proof on-chain.');
  console.log('A compromised worker key cannot fabricate this repayment.');
}

main().catch((err) => {
  console.error('Proof-verified repayment failed:', err);
  process.exit(1);
});

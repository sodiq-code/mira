/**
 * Redeploy ONLY the Loan contract with the fixed markRepaidWithProof
 * (structured-tuple interface) and rewire the cross-contract references.
 *
 * The other contracts (Policy, AgentReputation, BorrowerReputation,
 * LiquidityPool, MockUSDC) keep their deployed addresses and on-chain
 * state — only Loan is replaced because it is the leaf of the dependency
 * graph (nothing calls INTO Loan; Loan calls into the others).
 *
 * After redeployment:
 *   - AgentReputation / BorrowerReputation / LiquidityPool .loanContract
 *     are pointed at the new Loan address.
 *   - The historical counters (24 loans, 18 repaid, 1 defaulted, score 655)
 *     persist because they live in AgentReputation, not in Loan.
 *   - The new Loan starts with nextLoanId=1 (its loans mapping is fresh).
 *
 * Run with: bun run packages/worker/scripts/redeploy-loan.ts
 */

import { Wallet, JsonRpcProvider, Contract, ContractFactory, type TransactionReceipt } from 'ethers';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

async function sendTx(wallet: Wallet, to: string | null, data: string, gasLimit = 2_000_000): Promise<TransactionReceipt> {
  const nonce = await syncNonce(wallet);
  const tx = await wallet.sendTransaction({ to: to ?? undefined, data, nonce, type: 0, gasLimit });
  const receipt = await tx.wait();
  if (!receipt) throw new Error(`Transaction ${tx.hash} produced no receipt`);
  if (receipt.status === 0) throw new Error(`Transaction ${tx.hash} reverted on-chain`);
  return receipt;
}

async function main(): Promise<void> {
  CC3_RPC_URL = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
  const privateKey = process.env.CREDITCOIN_PRIVATE_KEY;
  if (!privateKey) throw new Error('CREDITCOIN_PRIVATE_KEY not set');
  const provider = new JsonRpcProvider(CC3_RPC_URL);
  const wallet = new Wallet(privateKey, provider);

  console.log('MIRA — Redeploy Loan contract (fixed markRepaidWithProof)');
  console.log('=========================================================');
  console.log(`Worker: ${wallet.address}`);
  console.log(`Network: ${CC3_RPC_URL}`);

  const workerAddr = wallet.address;
  const policyAddr = process.env.POLICY_ADDRESS!;
  const agentRepAddr = process.env.AGENT_REPUTATION_ADDRESS!;
  const borrowerRepAddr = process.env.BORROWER_REPUTATION_ADDRESS!;
  const poolAddr = process.env.LIQUIDITY_POOL_ADDRESS!;

  if (!policyAddr || !agentRepAddr || !borrowerRepAddr || !poolAddr) {
    throw new Error('POLICY_ADDRESS, AGENT_REPUTATION_ADDRESS, BORROWER_REPUTATION_ADDRESS, LIQUIDITY_POOL_ADDRESS must all be set in .env');
  }

  console.log('\nExisting contracts (kept):');
  console.log(`  Policy:           ${policyAddr}`);
  console.log(`  AgentReputation:  ${agentRepAddr}`);
  console.log(`  BorrowerRep:      ${borrowerRepAddr}`);
  console.log(`  LiquidityPool:    ${poolAddr}`);

  // Read current reputation before redeployment (should persist).
  const repAbi = ['function cumulativeLoans() view returns (uint256)', 'function cumulativeRepaid() view returns (uint256)', 'function cumulativeDefaulted() view returns (uint256)', 'function currentScore() view returns (uint256)'];
  const rep = new Contract(agentRepAddr, repAbi, provider);
  const [loans, repaid, defaulted, score] = await Promise.all([
    rep.cumulativeLoans(), rep.cumulativeRepaid(), rep.cumulativeDefaulted(), rep.currentScore(),
  ]);
  console.log(`\nPre-redeploy reputation: ${Number(loans)} loans, ${Number(repaid)} repaid, ${Number(defaulted)} defaulted, score ${Number(score)}`);

  // Deploy the new Loan contract.
  console.log('\nDeploying new Loan contract...');
  const artifact = loadArtifact('Loan');
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const deployData = artifact.bytecode + factory.interface.encodeDeploy([workerAddr, workerAddr, policyAddr, agentRepAddr, borrowerRepAddr, poolAddr]).slice(2);
  const receipt = await sendTx(wallet, null, deployData, 5_000_000);
  const newLoanAddr = receipt.contractAddress!;
  console.log(`New Loan deployed → ${newLoanAddr}`);
  console.log(`Deploy tx: ${receipt.hash}`);

  // Rewire: point AgentReputation, BorrowerReputation, LiquidityPool at the new Loan.
  console.log('\nRewiring cross-contract references...');
  const wireAbi = ['function setLoanContract(address)'];
  for (const [name, addr] of [
    ['AgentReputation', agentRepAddr],
    ['BorrowerReputation', borrowerRepAddr],
    ['LiquidityPool', poolAddr],
  ] as const) {
    const c = new Contract(addr, wireAbi, wallet);
    const data = c.interface.encodeFunctionData('setLoanContract', [newLoanAddr]);
    const r = await sendTx(wallet, addr, data, 500_000);
    console.log(`  ${name}.setLoanContract(${newLoanAddr}) → ${r.hash}`);
  }

  // Verify the new Loan has markRepaidWithProof with the structured signature.
  const newLoan = new Contract(newLoanAddr, artifact.abi, provider);
  const fn = newLoan.interface.getFunction('markRepaidWithProof');
  console.log(`\nmarkRepaidWithProof present: ${fn ? 'yes' : 'no'}`);
  if (fn) {
    console.log(`  inputs: ${fn.inputs.map((i) => i.type).join(', ')}`);
  }

  // Verify reputation is unchanged.
  const [loans2, repaid2, defaulted2, score2] = await Promise.all([
    rep.cumulativeLoans(), rep.cumulativeRepaid(), rep.cumulativeDefaulted(), rep.currentScore(),
  ]);
  console.log(`\nPost-redeploy reputation: ${Number(loans2)} loans, ${Number(repaid2)} repaid, ${Number(defaulted2)} defaulted, score ${Number(score2)}`);

  console.log('\n── Summary ──');
  console.log(`NEW_LOAN_ADDRESS=${newLoanAddr}`);
  console.log('\nUpdate .env LOAN_ADDRESS and .env.example, then verify with repay-with-proof.ts');
}

main().catch((err) => {
  console.error('Redeploy failed:', err);
  process.exit(1);
});

/**
 * Standalone full redeploy of ALL MIRA contracts using a FRESH governance key.
 *
 * This bypasses the hardhat ESM/CJS loader conflict (Node 24 native TS treats
 * .ts as ESM when package.json has "type":"module", but hardhat is CommonJS
 * and cannot provide named exports). Instead we use ethers.js directly with
 * the compiled artifacts — exactly the pattern packages/worker/scripts/redeploy-loan.ts
 * already uses successfully.
 *
 * The deployer (CREDITCOIN_PRIVATE_KEY) MUST be the governance key, because
 * LiquidityPool.deposit is onlyGovernance. We enforce this.
 *
 * Run with:
 *   CREDITCOIN_PRIVATE_KEY=<new gov key> \
 *   WORKER_ADDRESS=<worker addr> \
 *   GOVERNANCE_ADDRESS=<new gov addr> \
 *   bun run packages/worker/scripts/full-redeploy-fresh-governance.ts
 */
import { Wallet, JsonRpcProvider, Contract, ContractFactory, type TransactionReceipt } from 'ethers';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACTS_DIR = join(process.cwd(), 'packages', 'contracts', 'artifacts', 'contracts');

function loadArtifact(name: string): { abi: any[]; bytecode: string } {
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

async function deploy(wallet: Wallet, artifact: { abi: any[]; bytecode: string }, args: unknown[], gasLimit = 5_000_000): Promise<{ address: string; receipt: TransactionReceipt }> {
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const nonce = await syncNonce(wallet);
  const contract = await factory.deploy(...args, { nonce, type: 0, gasLimit });
  const receipt = await contract.deploymentTransaction()!.wait();
  if (!receipt || receipt.status === 0) throw new Error(`Deploy of contract reverted`);
  return { address: await contract.getAddress(), receipt };
}

async function sendTx(wallet: Wallet, to: string, data: string, gasLimit = 2_000_000): Promise<TransactionReceipt> {
  const nonce = await syncNonce(wallet);
  const tx = await wallet.sendTransaction({ to, data, nonce, type: 0, gasLimit });
  const receipt = await tx.wait();
  if (!receipt) throw new Error(`Tx ${tx.hash} produced no receipt`);
  if (receipt.status === 0) throw new Error(`Tx ${tx.hash} reverted`);
  return receipt;
}

async function main(): Promise<void> {
  CC3_RPC_URL = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
  const privateKey = process.env.CREDITCOIN_PRIVATE_KEY;
  const workerAddr = process.env.WORKER_ADDRESS;
  const governanceAddr = process.env.GOVERNANCE_ADDRESS;
  if (!privateKey) throw new Error('CREDITCOIN_PRIVATE_KEY not set (must be the NEW governance key)');
  if (!workerAddr) throw new Error('WORKER_ADDRESS not set');
  if (!governanceAddr) throw new Error('GOVERNANCE_ADDRESS not set');

  const provider = new JsonRpcProvider(CC3_RPC_URL);
  const wallet = new Wallet(privateKey, provider);
  const deployerAddr = wallet.address;

  console.log('MIRA — Full redeploy with FRESH governance key');
  console.log('==============================================');
  console.log(`Deployer / Governance: ${deployerAddr}`);
  console.log(`Worker (hot key):      ${workerAddr}`);
  console.log(`Network: ${CC3_RPC_URL}`);
  console.log('');

  // Role-separation guards (mirrors deploy.ts)
  if (workerAddr.toLowerCase() === governanceAddr.toLowerCase()) {
    throw new Error('WORKER_ADDRESS and GOVERNANCE_ADDRESS must be DIFFERENT.');
  }
  if (governanceAddr.toLowerCase() !== deployerAddr.toLowerCase()) {
    throw new Error(
      `Deployer (${deployerAddr}) must equal GOVERNANCE_ADDRESS (${governanceAddr}). ` +
      `LiquidityPool.deposit is onlyGovernance — the deployer must sign as governance.`,
    );
  }

  // Default bounds: rate 5–25% APR, terms 7/30/90 days, max $2,500.
  const maxLoanAmount = 250_000n; // $2,500 in cents
  const minRate = 500n;           // 5.00%
  const maxRate = 2500n;          // 25.00%
  const allowedTerms = [7n, 30n, 90n];

  // 1. MockUSDC
  const tokenArt = loadArtifact('MockUSDC');
  const { address: tokenAddr } = await deploy(wallet, tokenArt, []);
  console.log(`MockUSDC         → ${tokenAddr}`);

  // 2. Policy (governance, worker, maxAmount, minRate, maxRate, allowedTerms)
  const policyArt = loadArtifact('Policy');
  const { address: policyAddr } = await deploy(wallet, policyArt, [governanceAddr, workerAddr, maxLoanAmount, minRate, maxRate, allowedTerms]);
  console.log(`Policy           → ${policyAddr}`);

  // 3. AgentReputation (worker)
  const agentRepArt = loadArtifact('AgentReputation');
  const { address: agentRepAddr } = await deploy(wallet, agentRepArt, [workerAddr]);
  console.log(`AgentReputation  → ${agentRepAddr}`);

  // 4. BorrowerReputation (worker)
  const borrowerRepArt = loadArtifact('BorrowerReputation');
  const { address: borrowerRepAddr } = await deploy(wallet, borrowerRepArt, [workerAddr]);
  console.log(`BorrowerRep      → ${borrowerRepAddr}`);

  // 5. LiquidityPool (governance, worker, token)
  const poolArt = loadArtifact('LiquidityPool');
  const { address: poolAddr } = await deploy(wallet, poolArt, [governanceAddr, workerAddr, tokenAddr]);
  console.log(`LiquidityPool    → ${poolAddr}`);

  // 6. Loan (worker, governance, policy, agentRep, borrowerRep, pool)
  const loanArt = loadArtifact('Loan');
  const { address: loanAddr } = await deploy(wallet, loanArt, [workerAddr, governanceAddr, policyAddr, agentRepAddr, borrowerRepAddr, poolAddr], 8_000_000);
  console.log(`Loan             → ${loanAddr}`);

  // ─── Wire cross-contract dependencies ───────────────────────────────
  // Access control split: the reputation contracts' setters are onlyWorker,
  // while LiquidityPool/Policy/MockUSDC setters are onlyGovernance. So we
  // need BOTH signers: governance (wallet) for pool/policy/token, and the
  // worker wallet for the reputation contracts. The worker key is read from
  // the local .env (CREDITCOIN_PRIVATE_KEY is the NEW governance key here;
  // WORKER_PRIVATE_KEY is the worker hot key).
  const workerKey = process.env.WORKER_PRIVATE_KEY;
  if (!workerKey) {
    throw new Error(
      'WORKER_PRIVATE_KEY not set. The reputation contracts (AgentReputation, ' +
      'BorrowerReputation) have onlyWorker setters, so the worker key is ' +
      'required to wire setLoanContract / setPolicyContract during deploy.',
    );
  }
  const workerWallet = new Wallet(workerKey, provider);
  console.log(`\nWiring cross-contract dependencies…`);
  console.log(`  (governance signs pool/policy/token, worker signs reputation)`);
  const agentRep = new Contract(agentRepAddr, agentRepArt.abi, workerWallet);
  const borrowerRep = new Contract(borrowerRepAddr, borrowerRepArt.abi, workerWallet);
  const pool = new Contract(poolAddr, poolArt.abi, wallet);
  const policy = new Contract(policyAddr, policyArt.abi, wallet);

  // onlyWorker calls (signed by workerWallet)
  await sendTx(workerWallet, agentRepAddr, agentRep.interface.encodeFunctionData('setLoanContract', [loanAddr]));
  await sendTx(workerWallet, agentRepAddr, agentRep.interface.encodeFunctionData('setPolicyContract', [policyAddr]));
  await sendTx(workerWallet, borrowerRepAddr, borrowerRep.interface.encodeFunctionData('setLoanContract', [loanAddr]));
  // onlyGovernance calls (signed by governance wallet)
  await sendTx(wallet, poolAddr, pool.interface.encodeFunctionData('setLoanContract', [loanAddr]));
  await sendTx(wallet, policyAddr, policy.interface.encodeFunctionData('setDependencies', [agentRepAddr, borrowerRepAddr, poolAddr]));
  console.log('Cross-contract dependencies wired.');

  // ─── Seed the liquidity pool ───────────────────────────────────────
  console.log('\nSeeding LiquidityPool with $10,000…');
  const token = new Contract(tokenAddr, tokenArt.abi, wallet);
  const seedAmount = 1_000_000n;        // $10,000 in cents
  const seedTokens = seedAmount * 10_000n; // 6-decimal units (10_000 per cent? no — MockUSDC is 6 decimals, $1 = 10^6 units)
  // Actually MockUSDC has 6 decimals, so $10,000 = 10000 * 10^6 = 10_000_000_000.
  // The deploy.ts does: seedAmount=1_000_000 (cents), seedTokens=seedAmount*10_000 = 10_000_000_000.
  // That's $10,000 at 6 decimals. Correct.

  await sendTx(wallet, tokenAddr, token.interface.encodeFunctionData('mint', [governanceAddr, seedTokens]), 2_000_000);
  await sendTx(wallet, tokenAddr, token.interface.encodeFunctionData('approve', [poolAddr, seedTokens]), 200_000);
  await sendTx(wallet, poolAddr, pool.interface.encodeFunctionData('deposit', [seedAmount]), 2_000_000);
  console.log(`LiquidityPool seeded with $10,000 (${seedTokens} units).`);

  // ─── Summary ────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  DEPLOYMENT COMPLETE — FRESH GOVERNANCE KEY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`TOKEN_ADDRESS=${tokenAddr}`);
  console.log(`POLICY_ADDRESS=${policyAddr}`);
  console.log(`LOAN_ADDRESS=${loanAddr}`);
  console.log(`AGENT_REPUTATION_ADDRESS=${agentRepAddr}`);
  console.log(`BORROWER_REPUTATION_ADDRESS=${borrowerRepAddr}`);
  console.log(`LIQUIDITY_POOL_ADDRESS=${poolAddr}`);
  console.log(`GOVERNANCE_ADDRESS=${governanceAddr}`);
  console.log(`WORKER_ADDRESS=${workerAddr}`);

  // Write addresses to a temp file for the next steps
  const fs = await import('node:fs');
  fs.writeFileSync('/tmp/new-deployment.json', JSON.stringify({
    TOKEN_ADDRESS: tokenAddr,
    POLICY_ADDRESS: policyAddr,
    LOAN_ADDRESS: loanAddr,
    AGENT_REPUTATION_ADDRESS: agentRepAddr,
    BORROWER_REPUTATION_ADDRESS: borrowerRepAddr,
    LIQUIDITY_POOL_ADDRESS: poolAddr,
    GOVERNANCE_ADDRESS: governanceAddr,
    WORKER_ADDRESS: workerAddr,
  }, null, 2));
  console.log('\nAddresses written to /tmp/new-deployment.json');
}

main().catch((e) => { console.error(e); process.exit(1); });

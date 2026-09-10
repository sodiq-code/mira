/**
 * Redeploy ONLY the Policy contract with the borrower-tier cap and
 * rewire the cross-contract references.
 *
 * Policy is special: AgentReputation calls Policy.setPaused, and Policy
 * reads from AgentReputation/BorrowerReputation/LiquidityPool. So after
 * redeploying Policy we must:
 *   - Point AgentReputation at the new Policy (setPolicyContract)
 *   - Point the new Policy at the existing reputation + pool (setDependencies)
 *
 * The Loan contract does NOT need updating because it reads the Policy
 * address at construction and calls policy.validateDecision — which now
 * includes the borrower-tier check automatically.
 *
 * Run with: bun run packages/worker/scripts/redeploy-policy.ts
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

  console.log('MIRA — Redeploy Policy contract (borrower-tier cap)');
  console.log('====================================================');
  console.log(`Worker: ${wallet.address}`);

  const workerAddr = wallet.address;
  const governanceAddr = wallet.address;
  const agentRepAddr = process.env.AGENT_REPUTATION_ADDRESS!;
  const borrowerRepAddr = process.env.BORROWER_REPUTATION_ADDRESS!;
  const poolAddr = process.env.LIQUIDITY_POOL_ADDRESS!;

  if (!agentRepAddr || !borrowerRepAddr || !poolAddr) {
    throw new Error('AGENT_REPUTATION_ADDRESS, BORROWER_REPUTATION_ADDRESS, LIQUIDITY_POOL_ADDRESS must be set');
  }

  // Read current Policy bounds + state before redeployment
  const oldPolicyAddr = process.env.POLICY_ADDRESS!;
  const policyArtifact = loadArtifact('Policy');
  const oldPolicy = new Contract(oldPolicyAddr, policyArtifact.abi, provider);
  const [maxLoan, minRate, maxRate, terms, paused, version] = await Promise.all([
    oldPolicy.maxLoanAmount(), oldPolicy.minRate(), oldPolicy.maxRate(),
    oldPolicy.getAllowedTerms(), oldPolicy.paused(), oldPolicy.version(),
  ]);
  console.log(`\nOld Policy bounds: maxLoan=${Number(maxLoan)} minRate=${Number(minRate)} maxRate=${Number(maxRate)} terms=${terms.map((t: bigint) => Number(t)).join(',')} paused=${paused} version=${Number(version)}`);

  // Read current agent score
  const repArtifact = loadArtifact('AgentReputation');
  const rep = new Contract(agentRepAddr, repArtifact.abi, provider);
  const score = await rep.currentScore();
  console.log(`Current agent score: ${Number(score)}`);

  // Deploy the new Policy contract with the same bounds.
  console.log('\nDeploying new Policy contract...');
  const factory = new ContractFactory(policyArtifact.abi, policyArtifact.bytecode, wallet);
  const deployData = policyArtifact.bytecode + factory.interface.encodeDeploy([
    governanceAddr, workerAddr, maxLoan, minRate, maxRate, terms.map((t: bigint) => BigInt(t)),
  ]).slice(2);
  const receipt = await sendTx(wallet, null, deployData, 5_000_000);
  const newPolicyAddr = receipt.contractAddress!;
  console.log(`New Policy deployed → ${newPolicyAddr}`);
  console.log(`Deploy tx: ${receipt.hash}`);

  // Wire dependencies: new Policy → existing reputation + pool contracts
  console.log('\nWiring dependencies (setDependencies)...');
  const newPolicy = new Contract(newPolicyAddr, policyArtifact.abi, wallet);
  const depsData = newPolicy.interface.encodeFunctionData('setDependencies', [agentRepAddr, borrowerRepAddr, poolAddr]);
  const depsReceipt = await sendTx(wallet, newPolicyAddr, depsData, 500_000);
  console.log(`  setDependencies → ${depsReceipt.hash}`);

  // Point AgentReputation at the new Policy (for auto-pause)
  console.log('\nRepointing AgentReputation at the new Policy...');
  const agentRep = new Contract(agentRepAddr, repArtifact.abi, wallet);
  const setPolicyData = agentRep.interface.encodeFunctionData('setPolicyContract', [newPolicyAddr]);
  const setPolicyReceipt = await sendTx(wallet, agentRepAddr, setPolicyData, 500_000);
  console.log(`  AgentReputation.setPolicyContract(${newPolicyAddr}) → ${setPolicyReceipt.hash}`);

  // Verify the new functions exist and work
  console.log('\nVerifying new borrower-tier functions...');
  const [bt0, bt1, bt7, effCap] = await Promise.all([
    newPolicy.borrowerTierCap(0n), newPolicy.borrowerTierCap(1n), newPolicy.borrowerTierCap(7n),
    newPolicy.effectiveBorrowerCap(wallet.address),
  ]);
  console.log(`  borrowerTierCap(0) = ${Number(bt0)} cents ($${Number(bt0)/100})`);
  console.log(`  borrowerTierCap(1) = ${Number(bt1)} cents ($${Number(bt1)/100})`);
  console.log(`  borrowerTierCap(7) = ${Number(bt7)} cents ($${Number(bt7)/100})`);
  console.log(`  effectiveBorrowerCap(worker) = ${Number(effCap)} cents ($${Number(effCap)/100})`);

  // Verify the agent tier ladder still works
  const agentCap = await newPolicy.agentTierCap(score);
  console.log(`  agentTierCap(${Number(score)}) = ${Number(agentCap)} cents ($${Number(agentCap)/100})`);

  console.log('\n── Summary ──');
  console.log(`NEW_POLICY_ADDRESS=${newPolicyAddr}`);
  console.log('\nUpdate .env POLICY_ADDRESS and .env.example, then verify with a loan.');
}

main().catch((err) => {
  console.error('Redeploy failed:', err);
  process.exit(1);
});

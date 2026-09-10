/**
 * Deploy all MIRA contracts to Creditcoin CC3 Testnet.
 *
 * Standalone script (no Hardhat dependency) that loads compiled artifacts
 * and deploys via raw ethers transactions — the same pattern the test
 * helpers use, which works reliably on CC3 Testnet's Substrate-EVM.
 *
 * Deployment order:
 *   1. MockUSDC (ERC-20 lending token)
 *   2. Policy (governance bounds)
 *   3. AgentReputation (agent track record)
 *   4. BorrowerReputation (per-borrower history)
 *   5. LiquidityPool (ERC-20 custody, depends on MockUSDC)
 *   6. Loan (lifecycle manager, depends on all above)
 *
 * After deployment, cross-contract dependencies are wired and the pool
 * is seeded with real minted tokens.
 *
 * Run with: bun run packages/worker/scripts/deploy-contracts.ts
 */

import { Wallet, JsonRpcProvider, Contract, ContractFactory, type TransactionReceipt } from 'ethers';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorkerConfig } from '../src/config.ts';

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

/** The CC3 RPC URL (passed in from config, avoids ethers v6 provider URL access). */
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

async function deploy(name: string, deployer: Wallet, ...args: unknown[]): Promise<Contract> {
  const artifact = loadArtifact(name);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const deployData = artifact.bytecode + (args.length > 0 ? factory.interface.encodeDeploy(args).slice(2) : '');
  const nonce = await syncNonce(deployer);
  console.log(`  Deploying ${name} (nonce ${nonce})...`);
  const tx = await deployer.sendTransaction({ data: deployData, nonce, type: 0, gasLimit: 5_000_000 });
  const receipt = await tx.wait();
  if (!receipt || !receipt.contractAddress) throw new Error(`Deployment of ${name} failed`);
  console.log(`  ✓ ${name} → ${receipt.contractAddress}`);
  return new Contract(receipt.contractAddress, artifact.abi, deployer);
}

async function sendTx(contract: Contract, method: string, ...args: unknown[]): Promise<TransactionReceipt> {
  const wallet = contract.runner as Wallet;
  const nonce = await syncNonce(wallet);
  const data = contract.interface.encodeFunctionData(method, args);
  const to = await contract.getAddress();
  const tx = await wallet.sendTransaction({ to, data, nonce, type: 0, gasLimit: 500_000 });
  return tx.wait();
}

async function main() {
  const config = loadWorkerConfig();
  if (!config.creditcoinPrivateKey) throw new Error('CREDITCOIN_PRIVATE_KEY not set');

  const provider = new JsonRpcProvider(config.creditcoinRpcUrl);
  const deployer = new Wallet(config.creditcoinPrivateKey, provider);
  CC3_RPC_URL = config.creditcoinRpcUrl;

  console.log('════════════════════════════════════════════════════');
  console.log('  MIRA Contract Deployment — Creditcoin CC3 Testnet');
  console.log('════════════════════════════════════════════════════');
  console.log(`  Deployer: ${deployer.address}`);
  const balance = await provider.getBalance(deployer.address);
  console.log(`  Balance:  ${Number(balance) / 1e18} CTC`);
  console.log(`  Network:  ${config.creditcoinRpcUrl}`);
  console.log('');

  const worker = deployer.address;
  const governance = deployer.address;
  const maxLoanAmount = 250_000n; // $2,500
  const minRate = 500n;           // 5%
  const maxRate = 2500n;          // 25%
  const allowedTerms = [7n, 30n, 90n];

  // 1. MockUSDC
  const token = await deploy('MockUSDC', deployer);
  const tokenAddr = await token.getAddress();

  // 2. Policy
  const policy = await deploy('Policy', deployer, governance, worker, maxLoanAmount, minRate, maxRate, allowedTerms);
  const policyAddr = await policy.getAddress();

  // 3. AgentReputation
  const agentRep = await deploy('AgentReputation', deployer, worker);
  const agentRepAddr = await agentRep.getAddress();

  // 4. BorrowerReputation
  const borrowerRep = await deploy('BorrowerReputation', deployer, worker);
  const borrowerRepAddr = await borrowerRep.getAddress();

  // 5. LiquidityPool (depends on MockUSDC)
  const pool = await deploy('LiquidityPool', deployer, governance, worker, tokenAddr);
  const poolAddr = await pool.getAddress();

  // 6. Loan (depends on Policy, AgentReputation, BorrowerReputation, LiquidityPool)
  const loan = await deploy('Loan', deployer, worker, policyAddr, agentRepAddr, borrowerRepAddr, poolAddr);
  const loanAddr = await loan.getAddress();

  console.log('');
  console.log('── Wiring cross-contract dependencies ──');
  await sendTx(agentRep, 'setLoanContract', loanAddr);
  console.log('  ✓ AgentReputation → Loan');
  await sendTx(agentRep, 'setPolicyContract', policyAddr);
  console.log('  ✓ AgentReputation → Policy');
  await sendTx(borrowerRep, 'setLoanContract', loanAddr);
  console.log('  ✓ BorrowerReputation → Loan');
  await sendTx(pool, 'setLoanContract', loanAddr);
  console.log('  ✓ LiquidityPool → Loan');
  await sendTx(policy, 'setDependencies', agentRepAddr, borrowerRepAddr, poolAddr);
  console.log('  ✓ Policy → AgentReputation + BorrowerReputation + LiquidityPool');

  console.log('');
  console.log('── Seeding liquidity pool with real tokens ──');
  const seedAmount = 1_000_000n; // $10,000 in cents
  const seedTokens = seedAmount * 10_000n; // 6-decimal units
  await sendTx(token, 'mint', governance, seedTokens);
  console.log(`  ✓ Minted ${Number(seedTokens) / 1e6} USDC to governance`);
  await sendTx(token, 'approve', poolAddr, seedTokens);
  console.log('  ✓ Approved pool to spend seed tokens');
  await sendTx(pool, 'deposit', seedAmount);
  console.log(`  ✓ Deposited $10,000 into LiquidityPool`);

  // Verify the pool holds real tokens
  const poolBal = await pool.poolTokenBalance();
  console.log(`  ✓ Pool token balance: ${Number(poolBal) / 1e6} USDC`);

  console.log('');
  console.log('════════════════════════════════════════════════════');
  console.log('  Deployment Complete');
  console.log('════════════════════════════════════════════════════');
  console.log(`  MOCK_USDC_ADDRESS=${tokenAddr}`);
  console.log(`  POLICY_ADDRESS=${policyAddr}`);
  console.log(`  LOAN_ADDRESS=${loanAddr}`);
  console.log(`  AGENT_REPUTATION_ADDRESS=${agentRepAddr}`);
  console.log(`  BORROWER_REPUTATION_ADDRESS=${borrowerRepAddr}`);
  console.log(`  LIQUIDITY_POOL_ADDRESS=${poolAddr}`);
  console.log('');
  console.log('  Add these to .env:');
  console.log(`  TOKEN_ADDRESS=${tokenAddr}`);
  console.log(`  POLICY_ADDRESS=${policyAddr}`);
  console.log(`  LOAN_ADDRESS=${loanAddr}`);
  console.log(`  AGENT_REPUTATION_ADDRESS=${agentRepAddr}`);
  console.log(`  BORROWER_REPUTATION_ADDRESS=${borrowerRepAddr}`);
  console.log(`  LIQUIDITY_POOL_ADDRESS=${poolAddr}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

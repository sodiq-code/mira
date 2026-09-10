import { ethers } from 'hardhat';

/**
 * Deploy all MIRA contracts to the configured network.
 *
 * Deployment order respects dependencies:
 *   1. MockUSDC (no deps) — the ERC-20 lending token
 *   2. Policy (no deps)
 *   3. AgentReputation (no deps)
 *   4. BorrowerReputation (no deps)
 *   5. LiquidityPool (depends on MockUSDC)
 *   6. Loan (depends on Policy, AgentReputation, BorrowerReputation, LiquidityPool)
 *
 * After deployment, all cross-contract dependencies are wired:
 *   - AgentReputation → Loan contract + Policy contract (for auto-pause)
 *   - BorrowerReputation → Loan contract
 *   - LiquidityPool → Loan contract
 *   - Policy → AgentReputation + BorrowerReputation + LiquidityPool
 *
 * The pool is then seeded with real ERC-20 tokens (minted + approved +
 * deposited) so loans move actual value.
 *
 * Run with: `bun run contracts:deploy` (from the repo root).
 */
async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log(`Deploying with account: ${deployerAddress}`);
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}`);

  const worker = deployerAddress;
  const governance = deployerAddress;

  // Default bounds: rate 5–25% APR, terms 7/30/90 days, max $2,500.
  const maxLoanAmount = 250_000n; // $2,500 in cents
  const minRate = 500n;           // 5.00%
  const maxRate = 2500n;          // 25.00%
  const allowedTerms = [7n, 30n, 90n];

  // 1. MockUSDC
  const MockUSDC = await ethers.getContractFactory('MockUSDC');
  const token = await MockUSDC.deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`MockUSDC         → ${tokenAddr}`);

  // 2. Policy
  const Policy = await ethers.getContractFactory('Policy');
  const policy = await Policy.deploy(
    governance,
    worker,
    maxLoanAmount,
    minRate,
    maxRate,
    allowedTerms,
  );
  await policy.waitForDeployment();
  const policyAddr = await policy.getAddress();
  console.log(`Policy           → ${policyAddr}`);

  // 3. AgentReputation
  const AgentReputation = await ethers.getContractFactory('AgentReputation');
  const agentRep = await AgentReputation.deploy(worker);
  await agentRep.waitForDeployment();
  const agentRepAddr = await agentRep.getAddress();
  console.log(`AgentReputation  → ${agentRepAddr}`);

  // 4. BorrowerReputation
  const BorrowerReputation = await ethers.getContractFactory('BorrowerReputation');
  const borrowerRep = await BorrowerReputation.deploy(worker);
  await borrowerRep.waitForDeployment();
  const borrowerRepAddr = await borrowerRep.getAddress();
  console.log(`BorrowerRep      → ${borrowerRepAddr}`);

  // 5. LiquidityPool (depends on MockUSDC)
  const LiquidityPool = await ethers.getContractFactory('LiquidityPool');
  const pool = await LiquidityPool.deploy(governance, worker, tokenAddr);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log(`LiquidityPool    → ${poolAddr}`);

  // 6. Loan (depends on Policy, AgentReputation, BorrowerReputation, LiquidityPool)
  const Loan = await ethers.getContractFactory('Loan');
  const loan = await Loan.deploy(worker, policyAddr, agentRepAddr, borrowerRepAddr, poolAddr);
  await loan.waitForDeployment();
  const loanAddr = await loan.getAddress();
  console.log(`Loan             → ${loanAddr}`);

  // ─── Wire cross-contract dependencies ───────────────────────────────

  await (await agentRep.setLoanContract(loanAddr)).wait();
  await (await agentRep.setPolicyContract(policyAddr)).wait();
  await (await borrowerRep.setLoanContract(loanAddr)).wait();
  await (await pool.setLoanContract(loanAddr)).wait();
  await (await policy.setDependencies(agentRepAddr, borrowerRepAddr, poolAddr)).wait();
  console.log('Cross-contract dependencies wired.');

  // ─── Seed the liquidity pool with real tokens ───────────────────────

  const seedAmount = 1_000_000n; // $10,000 in cents
  const seedTokens = seedAmount * 10_000n; // 6-decimal units

  await (await token.mint(governance, seedTokens)).wait();
  await (await token.approve(poolAddr, seedTokens)).wait();
  await (await pool.deposit(seedAmount)).wait();
  console.log(`LiquidityPool seeded with $10,000 real tokens (${seedTokens} units).`);

  console.log('\n── Deployment summary ──');
  console.log(`MOCK_USDC_ADDRESS=${tokenAddr}`);
  console.log(`POLICY_ADDRESS=${policyAddr}`);
  console.log(`LOAN_ADDRESS=${loanAddr}`);
  console.log(`AGENT_REPUTATION_ADDRESS=${agentRepAddr}`);
  console.log(`BORROWER_REPUTATION_ADDRESS=${borrowerRepAddr}`);
  console.log(`LIQUIDITY_POOL_ADDRESS=${poolAddr}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { ethers } from 'hardhat';

/**
 * Deploy all five MIRA contracts to the configured network.
 *
 * Deployment order respects dependencies:
 *   1. Policy (no deps)
 *   2. AgentReputation (no deps)
 *   3. BorrowerReputation (no deps)
 *   4. LiquidityPool (no deps)
 *   5. Loan (depends on Policy, AgentReputation, BorrowerReputation)
 *
 * After deployment, the Loan address is wired back into the reputation
 * contracts so they accept calls from it.
 *
 * Prints every address at the end so it can be captured into .env.
 *
 * Run with: `bun run contracts:deploy` (from the repo root).
 */
async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log(`Deploying with account: ${deployerAddress}`);
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}`);

  // The worker is the deployer for now — in production a separate key
  // would be used, but for the testnet demo the same key is fine.
  const worker = deployerAddress;
  const governance = deployerAddress;

  // Default bounds from the agent prompt constraints (Section 25.4):
  // rate 5.00–25.00% APR, terms 7/30/90 days, max $1,000.
  const maxLoanAmount = 100_000n; // $1,000 in cents
  const minRate = 500n;           // 5.00% in bps
  const maxRate = 2500n;          // 25.00% in bps
  const allowedTerms = [7n, 30n, 90n];

  // 1. Policy
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
  console.log(`Policy          → ${policyAddr}`);

  // 2. AgentReputation
  const AgentReputation = await ethers.getContractFactory('AgentReputation');
  const agentRep = await AgentReputation.deploy(worker);
  await agentRep.waitForDeployment();
  const agentRepAddr = await agentRep.getAddress();
  console.log(`AgentReputation → ${agentRepAddr}`);

  // 3. BorrowerReputation
  const BorrowerReputation = await ethers.getContractFactory('BorrowerReputation');
  const borrowerRep = await BorrowerReputation.deploy(worker);
  await borrowerRep.waitForDeployment();
  const borrowerRepAddr = await borrowerRep.getAddress();
  console.log(`BorrowerRep     → ${borrowerRepAddr}`);

  // 4. LiquidityPool
  const LiquidityPool = await ethers.getContractFactory('LiquidityPool');
  const pool = await LiquidityPool.deploy(governance, worker);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log(`LiquidityPool   → ${poolAddr}`);

  // 5. Loan (depends on the three above)
  const Loan = await ethers.getContractFactory('Loan');
  const loan = await Loan.deploy(worker, policyAddr, agentRepAddr, borrowerRepAddr);
  await loan.waitForDeployment();
  const loanAddr = await loan.getAddress();
  console.log(`Loan            → ${loanAddr}`);

  // Wire the Loan contract into the reputation contracts so they accept
  // its calls (recordLoan, recordRepaid, recordDefaulted).
  await (await agentRep.setLoanContract(loanAddr)).wait();
  await (await borrowerRep.setLoanContract(loanAddr)).wait();
  console.log('Loan contract wired into reputation contracts.');

  // Seed the liquidity pool with demo capital ($10,000 = 1,000,000 cents).
  await (await pool.deposit(1_000_000n)).wait();
  console.log('LiquidityPool seeded with $10,000 demo capital.');

  console.log('\n── Deployment summary ──');
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

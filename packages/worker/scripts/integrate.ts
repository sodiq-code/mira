/**
 * End-to-end integration: the full live decision path.
 *
 * "Full live path works end-to-end: wallet → proof → verify → decide → originate"
 *
 * This script exercises the complete flow:
 *   1. Take an Ethereum Sepolia address (auto-discovered or from env)
 *   2. Generate + verify Attestcoin proofs for its transactions
 *   3. Build the verified feature vector
 *   4. Call the LLM agent for a structured-output decision
 *   5. Validate the decision against the on-chain Policy contract
 *   6. Originate the loan on-chain (local Hardhat or CC3 Testnet)
 *
 * The LLM decision is the real one — no stub. If the LLM declines, no loan
 * is originated. If it approves, the decision is validated against Policy
 * and then written to the Loan contract.
 *
 * Run with: `bun run worker:integrate` (from the repo root).
 */

import { ethers, Wallet, JsonRpcProvider, Contract } from 'ethers';
import { createAttestcoinClient, loadWorkerConfig, type WorkerConfig } from '../src';
import { runCreditCheck, type CreditCheckResult } from '../src/credit-check';
import { decide, type AgentDecision } from '../src/agent';

interface IntegrationResult {
  walletAddress: string;
  creditCheck: CreditCheckResult;
  decision: AgentDecision;
  policyValidation: boolean;
  loanOrigination: {
    originated: boolean;
    loanId?: number;
    txHash?: string;
    error?: string;
  };
}

function log(section: string, msg: string, detail?: unknown): void {
  console.log(`\n── ${section} ──────────────────────────────`);
  console.log(`  ${msg}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}

async function main(): Promise<void> {
  console.log('MIRA — Full Live Decision Path: verify → decide → originate');
  console.log('=============================================================');

  const config = loadWorkerConfig();
  const client = createAttestcoinClient(config);

  // 1. Resolve Sepolia chain key
  log('Chain resolution', 'Resolving Sepolia chain key on Creditcoin...');
  const sepolia = await client.resolveSepoliaChainKey();
  log('Chain resolution', 'Sepolia resolved', `chainKey=${sepolia.chainKey}`);

  // 2. Pick a borrower address
  const borrowerAddress = config.sepoliaTxHash
    ? (await client.sepoliaProvider.getTransaction(config.sepoliaTxHash))?.from ?? config.sepoliaTxHash
    : await findActiveSepoliaWallet(client.sepoliaProvider);
  log('Borrower', 'Address', borrowerAddress);

  // 3. Run the credit check (generates + verifies Attestcoin proofs)
  log('Credit check', 'Generating Attestcoin proofs and building verified feature vector...');
  const creditCheck = await runCreditCheck({
    walletAddress: borrowerAddress,
    attestcoinClient: client,
    maxTxsToProve: 3,
    maxBlockScanRange: 500,
  });

  log('Credit check', creditCheck.verified ? 'VERIFIED' : 'DECLINED', {
    verified: creditCheck.verified,
    factors: creditCheck.factors,
    proofCount: creditCheck.proofTxHashes.length,
    reason: creditCheck.reason,
  });

  if (!creditCheck.verified) {
    console.log('\nRESULT: Borrower declined — insufficient verified Sepolia activity.');
    console.log('The read path works (proofs generated + verified), but this wallet');
    console.log('does not have enough attested activity to underwrite a loan.');
    process.exit(0);
  }

  // 4. Call the LLM agent for a structured-output decision
  log('Agent decision', 'Calling LLM with verified feature vector...');
  const decision = await decide({
    factors: creditCheck.factors,
    requestedAmount: 500, // $500 requested
    requestedTermDays: 30, // 30-day term
  });

  log('Agent decision', decision.decision.toUpperCase(), {
    decision: decision.decision,
    amount: `$${decision.approvedAmount}`,
    rate: `${decision.interestRateApr}% APR`,
    confidence: decision.confidence,
    source: decision.source,
    reasoning: decision.reasoning,
  });

  // 5. If declined, stop here
  if (decision.decision === 'decline') {
    console.log('\nRESULT: Loan declined by the agent.');
    console.log(`  Reason: ${decision.reasoning}`);
    console.log('The full path ran end-to-end (verify → decide); the agent chose not to originate.');
    process.exit(0);
  }

  // 6. Validate + originate on a Hardhat node (or CC3 Testnet if funded)
  log('Origination', 'Validating against Policy and originating loan...');

  let loanOrigination: IntegrationResult['loanOrigination'];

  if (config.creditcoinPrivateKey) {
    loanOrigination = await originateOnCreditcoin(config, borrowerAddress, decision, creditCheck);
  } else {
    loanOrigination = await originateOnHardhat(borrowerAddress, decision, creditCheck);
  }

  log('Origination', loanOrigination.originated ? 'ORIGINATED' : 'FAILED', loanOrigination);

  const result: IntegrationResult = {
    walletAddress: borrowerAddress,
    creditCheck,
    decision,
    policyValidation: loanOrigination.originated,
    loanOrigination,
  };

  console.log('\n── Summary ──────────────────────────────────────────────');
  console.log(`  Borrower:    ${result.walletAddress}`);
  console.log(`  Verified:    ${result.creditCheck.verified}`);
  console.log(`  Proofs:      ${result.creditCheck.proofTxHashes.length} Attestcoin proofs verified`);
  console.log(`  Decision:    ${decision.decision.toUpperCase()} at ${decision.interestRateApr}% APR ($${decision.approvedAmount})`);
  console.log(`  Source:      ${decision.source}`);
  console.log(`  Policy:      ${result.policyValidation ? 'validated' : 'rejected'}`);
  console.log(`  Loan:        ${loanOrigination.originated ? `originated (ID ${loanOrigination.loanId})` : 'not originated'}`);
  if (loanOrigination.txHash) {
    console.log(`  Tx hash:     ${loanOrigination.txHash}`);
  }

  // Write evidence
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir('/home/z/my-project/research', { recursive: true });
  await writeFile(
    '/home/z/my-project/research/integration-result.json',
    JSON.stringify(result, null, 2),
    'utf8',
  );
  console.log('\nEvidence: /home/z/my-project/research/integration-result.json');
}

/**
 * Originate a loan on a local Hardhat node (no gas required).
 *
 * Deploys all contracts, validates the decision against Policy, and
 * originates the loan. The LLM's decision (approvedAmount in dollars,
 * interestRateApr in percentage) is converted to the contract's units
 * (cents and basis points) before origination.
 */
async function originateOnHardhat(
  borrower: string,
  decision: AgentDecision,
  creditCheck: CreditCheckResult,
): Promise<IntegrationResult['loanOrigination']> {
  const { spawn } = await import('node:child_process');
  const { execSync } = await import('node:child_process');

  const HARDHAT_PORT = 18546;

  const nodeProc = spawn('npx', ['hardhat', 'node', '--port', String(HARDHAT_PORT)], {
    cwd: '/home/z/my-project/packages/contracts',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Hardhat node startup timeout')), 15000);
      const check = async () => {
        try {
          const resp = await fetch(`http://127.0.0.1:${HARDHAT_PORT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
          });
          if (resp.ok) {
            clearTimeout(timeout);
            resolve();
          }
        } catch { /* not ready */ }
        setTimeout(check, 300);
      };
      check();
    });

    const provider = new JsonRpcProvider(`http://127.0.0.1:${HARDHAT_PORT}`);
    const worker = new Wallet(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      provider,
    );

    const { readFileSync } = await import('node:fs');
    const loadArtifact = (name: string) => {
      const path = `/home/z/my-project/packages/contracts/artifacts/contracts/${name}.sol/${name}.json`;
      return JSON.parse(readFileSync(path, 'utf8'));
    };

    const deploy = async (name: string, args: unknown[]) => {
      const artifact = loadArtifact(name);
      const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, worker);
      const data = artifact.bytecode + (args.length > 0 ? factory.interface.encodeDeploy(args).slice(2) : '');
      const nonce = await getNonce(HARDHAT_PORT, worker.address);
      const tx = await worker.sendTransaction({ data, nonce, type: 0, gasLimit: 5_000_000 });
      const receipt = await tx.wait();
      return new Contract(receipt!.contractAddress!, artifact.abi, worker);
    };

    const policy = await deploy('Policy', [worker.address, worker.address, 100000n, 500n, 2500n, [7n, 30n, 90n]]);
    const agentRep = await deploy('AgentReputation', [worker.address]);
    const borrowerRep = await deploy('BorrowerReputation', [worker.address]);
    const loan = await deploy('Loan', [worker.address, await policy.getAddress(), await agentRep.getAddress(), await borrowerRep.getAddress()]);

    // Wire reputation contracts
    for (const [contract, method, arg] of [
      [agentRep, 'setLoanContract', await loan.getAddress()],
      [borrowerRep, 'setLoanContract', await loan.getAddress()],
    ] as const) {
      const nonce = await getNonce(HARDHAT_PORT, worker.address);
      const data = (contract as Contract).interface.encodeFunctionData(method, [arg]);
      const tx = await worker.sendTransaction({ to: await (contract as Contract).getAddress(), data, nonce, type: 0, gasLimit: 500_000 });
      await tx.wait();
    }

    // Convert LLM decision to contract units:
    //   approvedAmount (USD dollars) → cents (× 100)
    //   interestRateApr (percentage) → basis points (× 100)
    const amountCents = BigInt(decision.approvedAmount * 100);
    const rateBps = BigInt(Math.round(decision.interestRateApr * 100));
    const termDays = 30n;

    // Validate against policy first (gasless)
    const valid = await policy.validateDecision.staticCall({
      borrower,
      amount: amountCents,
      rate: rateBps,
      term: termDays,
    });

    if (!valid) {
      return { originated: false, error: 'Policy validation failed — decision out of bounds' };
    }

    // Originate the loan
    const reasoningHash = ethers.id(decision.reasoning);
    const proofHash = ethers.id(creditCheck.proofTxHashes.join('|'));

    const nonce = await getNonce(HARDHAT_PORT, worker.address);
    const data = loan.interface.encodeFunctionData('originate', [borrower, amountCents, rateBps, termDays, reasoningHash, proofHash]);
    const tx = await worker.sendTransaction({ to: await loan.getAddress(), data, nonce, type: 0, gasLimit: 500_000 });
    const receipt = await tx.wait();

    const event = receipt!.logs.find((l) => {
      try { return loan.interface.parseLog(l)?.name === 'LoanOriginated'; } catch { return false; }
    });
    const parsed = event ? loan.interface.parseLog(event) : null;
    const loanId = parsed?.args?.loanId ? Number(parsed.args.loanId) : undefined;

    return { originated: true, loanId, txHash: receipt!.hash };
  } finally {
    nodeProc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    if (!nodeProc.killed) nodeProc.kill('SIGKILL');
  }
}

async function originateOnCreditcoin(
  _config: WorkerConfig,
  _borrower: string,
  _decision: AgentDecision,
  _creditCheck: CreditCheckResult,
): Promise<IntegrationResult['loanOrigination']> {
  return {
    originated: false,
    error: 'CC3 Testnet origination requires deployed contract addresses in .env',
  };
}

async function findActiveSepoliaWallet(provider: JsonRpcProvider): Promise<string> {
  const latestBlock = await provider.getBlockNumber();
  for (let i = 0; i < 50; i++) {
    const block = await provider.getBlock(latestBlock - i, true);
    if (block?.prefetchedTransactions?.length) {
      const tx = block.prefetchedTransactions[0];
      const from = typeof tx === 'string' ? null : (tx as { from?: string }).from;
      if (from) return from;
    }
  }
  throw new Error('Could not find an active Sepolia wallet in recent blocks');
}

/** Fetch the nonce from the node, bypassing ethers' cache. */
async function getNonce(port: number, address: string): Promise<number> {
  const resp = await fetch(`http://127.0.0.1:${port}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [address, 'latest'], id: 1 }),
  });
  const json = (await resp.json()) as { result: string };
  return parseInt(json.result, 16);
}

main().catch((err) => {
  console.error('Integration failed:', err);
  process.exit(1);
});

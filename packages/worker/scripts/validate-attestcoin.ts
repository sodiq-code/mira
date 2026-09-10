/**
 * End-to-end Attestcoin feasibility check.
 *
 * Proves the single load-bearing assumption of the whole project: that a real
 * Ethereum Sepolia transaction can be turned into an Attestcoin inclusion proof
 * and verified by the Creditcoin BlockProver precompile on CC3 Testnet.
 *
 * The script intentionally exercises the real protocol path — no mocks — so a
 * green result here means the rest of the build rests on solid ground. It is
 * safe to run repeatedly; every step is either a read or a gasless eth_call,
 * except the optional on-chain emit which only runs when a funded wallet key
 * is provided.
 *
 * Run with: `bun run validate` (from packages/worker) or `bun run worker:validate`
 * (from the repo root). Configuration is read from the environment; see
 * .env.example at the repo root for every supported variable.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createAttestcoinClient, findSepoliaChainKey, decodeChainName, loadWorkerConfig, createCreditcoinSigner } from '../src';
import type { SupportedChain } from '../src';

/** Where structured evidence is persisted (gitignored local artifact). */
const EVIDENCE_PATH = '/home/z/my-project/research/attestcoin-validation.json';

interface Step {
  name: string;
  status: 'pass' | 'fail' | 'skip' | 'info';
  detail?: unknown;
}

class Report {
  private steps: Step[] = [];
  private startedAt = new Date();

  add(step: Step): void {
    this.steps.push(step);
    const icon =
      step.status === 'pass' ? '✓' : step.status === 'fail' ? '✗' : step.status === 'skip' ? '·' : '→';
    const detail =
      step.detail === undefined ? '' : typeof step.detail === 'string' ? step.detail : JSON.stringify(step.detail);
    console.log(`  ${icon} ${step.name}${detail ? ` — ${detail}` : ''}`);
  }

  async flush(success: boolean, payload: Record<string, unknown>): Promise<void> {
    const record = {
      success,
      startedAt: this.startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      steps: this.steps,
      ...payload,
    };
    await mkdir(dirname(EVIDENCE_PATH), { recursive: true });
    await writeFile(EVIDENCE_PATH, JSON.stringify(record, null, 2), 'utf8');
    console.log(`\nEvidence written to ${EVIDENCE_PATH}`);
    console.log(success ? '\nRESULT: PASS — Attestcoin verification confirmed end-to-end.' : '\nRESULT: FAIL');
  }
}

function logSection(title: string): void {
  console.log(`\n── ${title} ──────────────────────────────`);
}

async function pickProvableSepoliaTx(
  sepoliaProvider: import('ethers').JsonRpcProvider,
  latestAttestedHeight: number,
): Promise<{ txHash: string; blockNumber: number } | null> {
  // Start at the latest attested block and walk backwards up to 20 blocks to
  // find one that contains at least one transaction. Sepolia occasionally
  // produces empty blocks, so a small search window keeps the run robust.
  for (let offset = 0; offset <= 20; offset++) {
    const blockNumber = latestAttestedHeight - offset;
    if (blockNumber < 0) break;
    const block = await sepoliaProvider.getBlock(blockNumber, true);
    if (block && block.prefetchedTransactions && block.prefetchedTransactions.length > 0) {
      const first = block.prefetchedTransactions[0];
      const hash = typeof first === 'string' ? first : (first as { hash: string }).hash;
      return { txHash: hash, blockNumber };
    }
  }
  return null;
}

async function main(): Promise<void> {
  const report = new Report();
  console.log('MIRA — Attestcoin feasibility check');
  console.log('====================================');

  let config;
  try {
    config = loadWorkerConfig();
  } catch (err) {
    report.add({ name: 'Load configuration', status: 'fail', detail: (err as Error).message });
    await report.flush(false, {});
    process.exit(1);
  }
  report.add({
    name: 'Configuration loaded',
    status: 'pass',
    detail: {
      cc3Rpc: config.creditcoinRpcUrl,
      sepoliaRpc: config.sepoliaRpcUrl,
      proofBuilder: config.proofBuilderUrl,
      onchainEmit: config.skipOnchainEmit ? 'skipped' : 'enabled',
    },
  });

  const client = createAttestcoinClient(config);

  // 1. Connectivity — confirm the CC3 Testnet RPC answers.
  logSection('Creditcoin CC3 Testnet connectivity');
  try {
    const blockNumber = await client.creditcoinProvider.getBlockNumber();
    report.add({ name: 'CC3 Testnet RPC reachable', status: 'pass', detail: `block #${blockNumber}` });
  } catch (err) {
    report.add({ name: 'CC3 Testnet RPC reachable', status: 'fail', detail: (err as Error).message });
    await report.flush(false, {});
    process.exit(1);
  }

  // 2. Supported chains — list them and locate Sepolia.
  logSection('Supported source chains');
  let chains: SupportedChain[];
  try {
    chains = await client.getSupportedChains();
    report.add({
      name: 'ChainInfo precompile responded',
      status: 'pass',
      detail: chains.map((c) => `${c.chainKey}:${decodeChainName(c.chainName)}`).join(', '),
    });
  } catch (err) {
    report.add({ name: 'ChainInfo precompile responded', status: 'fail', detail: (err as Error).message });
    await report.flush(false, {});
    process.exit(1);
  }

  let sepolia: SupportedChain | undefined;
  try {
    sepolia = config.sepoliaChainKey
      ? chains.find((c) => c.chainKey === config.sepoliaChainKey)
      : findSepoliaChainKey(chains);
    if (!sepolia) throw new Error('Sepolia not found among supported chains');
    report.add({
      name: 'Ethereum Sepolia resolved',
      status: 'pass',
      detail: `chainKey=${sepolia.chainKey} encoding=${sepolia.chainEncoding}`,
    });
  } catch (err) {
    report.add({ name: 'Ethereum Sepolia resolved', status: 'fail', detail: (err as Error).message });
    await report.flush(false, {});
    process.exit(1);
  }

  // 3. Latest attested Sepolia height on Creditcoin.
  logSection('Cross-chain attestation state');
  let latestAttested: number;
  try {
    const attested = await client.getLatestAttestedSepoliaHeight(sepolia.chainKey);
    if (!attested.exists) throw new Error('No attestation exists yet for Sepolia');
    latestAttested = attested.height;
    report.add({
      name: 'Latest attested Sepolia block',
      status: 'pass',
      detail: `height=${attested.height} attestation=${attested.isAttestation}`,
    });
  } catch (err) {
    report.add({ name: 'Latest attested Sepolia block', status: 'fail', detail: (err as Error).message });
    await report.flush(false, {});
    process.exit(1);
  }

  // 4. Choose the Sepolia tx to prove. Prefer an explicit env override; fall
  //    back to auto-discovery from the latest attested block.
  logSection('Selecting a Sepolia transaction to prove');
  let txHash = config.sepoliaTxHash;
  let txBlock: number | undefined;
  if (txHash) {
    report.add({ name: 'Using configured tx hash', status: 'info', detail: txHash });
  } else {
    const found = await pickProvableSepoliaTx(client.sepoliaProvider, latestAttested);
    if (!found) {
      report.add({ name: 'Auto-discover a provable Sepolia tx', status: 'fail', detail: 'no txs in recent attested blocks' });
      await report.flush(false, {});
      process.exit(1);
    }
    txHash = found.txHash;
    txBlock = found.blockNumber;
    report.add({ name: 'Auto-discovered Sepolia tx', status: 'pass', detail: `${txHash} (block ${txBlock})` });
  }

  // 5. If we auto-discovered, the block is already attested. If the tx was
  //    user-supplied, wait for its block to be attested before proving.
  if (txBlock === undefined) {
    try {
      const tx = await client.sepoliaProvider.getTransaction(txHash!);
      txBlock = tx?.blockNumber ?? undefined;
      if (txBlock !== undefined) {
        report.add({ name: 'Resolved tx block', status: 'info', detail: `block ${txBlock}` });
        await client.waitForSepoliaAttestation(sepolia.chainKey, txBlock);
        report.add({ name: 'Block attested on Creditcoin', status: 'pass', detail: `block ${txBlock}` });
      }
    } catch (err) {
      report.add({ name: 'Wait for attestation', status: 'fail', detail: (err as Error).message });
      await report.flush(false, {});
      process.exit(1);
    }
  }

  // 6. Generate the Attestcoin proof.
  logSection('Attestcoin proof generation');
  let proof;
  try {
    proof = await client.generateProof(sepolia.chainKey, txHash!);
    report.add({
      name: `Proof generated via ${proof.source} builder`,
      status: 'pass',
      detail: `header=${proof.headerNumber} txIndex=${proof.txIndex}`,
    });
  } catch (err) {
    report.add({ name: 'Proof generation', status: 'fail', detail: (err as Error).message });
    await report.flush(false, {});
    process.exit(1);
  }

  // 7. Verify the proof against the BlockProver precompile (gasless eth_call).
  logSection('On-chain verification (BlockProver precompile)');
  let readonlyVerification = false;
  try {
    readonlyVerification = await client.verifyReadonly(proof);
    report.add({
      name: 'Precompile verifySingle',
      status: readonlyVerification ? 'pass' : 'fail',
      detail: readonlyVerification ? 'returned true' : 'returned false',
    });
  } catch (err) {
    report.add({ name: 'Precompile verifySingle', status: 'fail', detail: (err as Error).message });
    await report.flush(false, {});
    process.exit(1);
  }

  // 8. Optional on-chain emit — only when a funded wallet is configured.
  let onchainTxHash: string | undefined;
  if (!config.skipOnchainEmit) {
    logSection('On-chain emit (TransactionVerified event)');
    try {
      const signer = createCreditcoinSigner(config);
      if (!signer) throw new Error('Signer unavailable');
      const tx = await client.verifyAndEmit(signer, proof);
      const receipt = await tx.wait();
      onchainTxHash = receipt?.hash ?? tx.hash;
      report.add({ name: 'TransactionVerified event emitted', status: 'pass', detail: onchainTxHash });
    } catch (err) {
      report.add({ name: 'TransactionVerified event emitted', status: 'fail', detail: (err as Error).message });
    }
  } else {
    report.add({
      name: 'On-chain emit',
      status: 'skip',
      detail: 'no funded wallet configured (set CREDITCOIN_PRIVATE_KEY to enable)',
    });
  }

  const success = readonlyVerification;
  await report.flush(success, {
    chainKey: sepolia.chainKey,
    sepoliaTxHash: txHash,
    sepoliaBlock: txBlock,
    proofSource: proof.source,
    headerNumber: proof.headerNumber,
    readonlyVerification,
    onchainTxHash,
    cc3ExplorerTxUrl: onchainTxHash
      ? `https://creditcoin-testnet.blockscout.com/tx/${onchainTxHash}`
      : undefined,
  });

  process.exit(success ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Validation crashed:', err);
  process.exit(1);
});

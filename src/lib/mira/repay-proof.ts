/**
 * Proof-verified repayment client.
 *
 * Generates an Attestcoin inclusion proof for a real Sepolia repayment
 * transaction and calls Loan.markRepaidWithProof — the function that
 * makes the Loan contract ITSELF verify the proof via the BlockProver
 * precompile. A compromised worker key cannot fabricate a repayment
 * because the contract re-verifies the proof on-chain.
 *
 * This is the unfakeable-reputation path. It is used for the verified
 * Sepolia wallet (real borrower activity). Demo wallets fall back to
 * the worker-trusted markRepaid path (clearly labelled demoMode).
 */

import {
  chainInfo,
  blockProver,
  proofProvider,
  encoding,
} from '@gluwa/usc-sdk';
import { Wallet, JsonRpcProvider, Contract, ethers } from 'ethers';

const CC3_RPC = process.env.CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const PROOF_BUILDER_URL = process.env.CREDITCOIN_PROOF_BUILDER_URL ?? 'https://prover.cc3-testnet.creditcoin.network';
const CC3_PK = process.env.CREDITCOIN_PRIVATE_KEY;
const LOAN_ADDRESS = process.env.LOAN_ADDRESS;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const LIQUIDITY_POOL_ADDRESS = process.env.LIQUIDITY_POOL_ADDRESS;

const LOAN_ABI = [
  'function markRepaidWithProof(uint256 loanId, bytes32 repaymentProofHash, uint256 headerNumber, bytes txBytes, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) external',
  'function getLoan(uint256 loanId) view returns (address borrower, uint256 amount, uint256 rate, uint256 term, uint256 dueBlock, uint256 originatedBlock, uint8 loanStatus, bytes32 attestationProofHash)',
];
const TOKEN_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

export interface RepayWithProofResult {
  repaid: boolean;
  loanId: number;
  repayTxHash: string;
  sepoliaTxHash: string;
  proofVerifiedByContract: boolean;
  blockNumber: number;
}

async function syncNonce(wallet: Wallet): Promise<number> {
  const resp = await fetch(CC3_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [wallet.address, 'latest'], id: 1 }),
  });
  const json = await resp.json() as { result: string };
  return parseInt(json.result, 16);
}

/**
 * Repay a loan with on-chain Attestcoin proof verification.
 *
 * @param loanId          The loan to repay
 * @param sepoliaTxHash   A real Sepolia transaction hash to prove as the repayment
 * @returns The repayment result including the CC3 tx hash
 */
export async function repayLoanWithProof(
  loanId: number,
  sepoliaTxHash: string,
): Promise<RepayWithProofResult> {
  if (!LOAN_ADDRESS || !TOKEN_ADDRESS || !LIQUIDITY_POOL_ADDRESS || !CC3_PK) {
    throw new Error('LOAN_ADDRESS, TOKEN_ADDRESS, LIQUIDITY_POOL_ADDRESS, and CREDITCOIN_PRIVATE_KEY must be set for proof-verified repayment');
  }

  const cc3Provider = new JsonRpcProvider(CC3_RPC);
  const sepoliaProvider = new JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new Wallet(CC3_PK, cc3Provider);

  const loan = new Contract(LOAN_ADDRESS, LOAN_ABI, wallet);
  const token = new Contract(TOKEN_ADDRESS, TOKEN_ABI, wallet);

  // 1. Read the loan to get the borrower + amount.
  const loanData = await loan.getLoan(BigInt(loanId));
  const borrower = loanData.borrower as string;
  const amountCents = Number(loanData.amount);

  // 2. Generate the Attestcoin inclusion proof for the Sepolia repayment tx.
  const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(cc3Provider);
  const allChains = (await chainInfoProvider.getSupportedChains()) as { chainKey: number; chainName: string; chainEncoding: number }[];
  const sepoliaChain = allChains.find((c) => {
    const name = c.chainName;
    const decoded = name.startsWith('0x')
      ? Buffer.from(name.slice(2), 'hex').toString('utf8').replace(/\u0000+$/, '').trim()
      : name;
    return decoded.toLowerCase().includes('sepolia');
  });
  if (!sepoliaChain) throw new Error('Sepolia chain not found on Creditcoin');

  const hosted = new proofProvider.service.ProofBuilder(sepoliaChain.chainKey, PROOF_BUILDER_URL);
  const hostedResult = await hosted.getProof(sepoliaTxHash);
  let proof = hostedResult.data;
  if (!hostedResult.success || !proof) {
    // Fallback: raw proof builder.
    const blockProvider = new proofProvider.raw.blockProvider.SimpleBlockProvider(sepoliaProvider);
    const rawBuilder = new proofProvider.raw.RawProofBuilder(
      sepoliaChain.chainKey, blockProvider, chainInfoProvider, encoding.EncodingVersion.V1,
    );
    const rawResult = await rawBuilder.getProof(sepoliaTxHash);
    if (!rawResult.success || !rawResult.data) {
      throw new Error(`Proof generation failed: hosted=${hostedResult.error}, raw=${rawResult.error}`);
    }
    proof = rawResult.data;
  }

  // 3. Approve the pool to pull repayment tokens (if needed).
  const tokenAmount = BigInt(amountCents) * 10_000n;
  const allowance = await token.allowance(borrower, LIQUIDITY_POOL_ADDRESS);
  if (allowance < tokenAmount) {
    const approveNonce = await syncNonce(wallet);
    const approveTx = await token.approve(LIQUIDITY_POOL_ADDRESS, tokenAmount, {
      nonce: approveNonce, type: 0, gasLimit: 200_000,
    });
    await approveTx.wait();
  }

  // 4. Hash the proof data for the audit trail.
  const proofHash = ethers.id(JSON.stringify({
    txHash: sepoliaTxHash,
    headerNumber: proof.headerNumber,
    merkleRoot: proof.merkleProof.root,
  }));

  // 5. Submit markRepaidWithProof — the contract verifies the proof on-chain.
  const nonce = await syncNonce(wallet);
  const tx = await loan.markRepaidWithProof(
    BigInt(loanId),
    proofHash,
    BigInt(proof.headerNumber),
    proof.txBytes,
    proof.merkleProof,
    proof.continuityProof,
    { nonce, type: 0, gasLimit: 3_000_000 },
  );
  const receipt = await tx.wait();
  if (!receipt) throw new Error('markRepaidWithProof tx returned no receipt');

  return {
    repaid: true,
    loanId,
    repayTxHash: receipt.hash,
    sepoliaTxHash,
    proofVerifiedByContract: true,
    blockNumber: receipt.blockNumber,
  };
}

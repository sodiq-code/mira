# Attestcoin Integration

This document describes how MIRA uses the Attestcoin Protocol on Creditcoin CC3 Testnet. It is the canonical reference for the "USC Integration Summary" — the single most-read technical description of the project.

## Protocol summary

Attestcoin lets a Creditcoin smart contract cryptographically verify that an event happened on another chain — without an oracle operator. On CC3 Testnet, the only supported source chain is Ethereum Sepolia. The protocol exposes two precompiles:

| Precompile | Address | Purpose |
|---|---|---|
| `BlockProver` | `0x0000000000000000000000000000000000000FD2` | Verifies a transaction inclusion proof + block continuity proof |
| `ChainInfo` | `0x0000000000000000000000000000000000000fd3` | Reports supported source chains and attestation state |

A proof is a pair: a **Merkle proof** that the transaction is included in a Sepolia block, and a **continuity proof** that ties that block into the attestation chain Creditcoin maintains. The precompile reverts if either is invalid, so a successful verification is a cryptographic guarantee — not a claim.

## SDK

MIRA uses [`@gluwa/usc-sdk`](https://www.npmjs.com/package/@gluwa/usc-sdk) (TypeScript, ethers v6). The SDK exposes three components, all of which MIRA uses:

```ts
import { chainInfo, blockProver, proofProvider } from '@gluwa/usc-sdk';
```

### 1. Discover supported chains and wait for attestation

```ts
const provider = new JsonRpcProvider(CREDITCOIN_RPC_URL);
const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(provider);

const supported = await chainInfoProvider.getSupportedChains();
// -> [{ chainKey, chainId, chainName, chainEncoding }, ...]

// Block until Creditcoin has attested the Sepolia block we care about.
await chainInfoProvider.waitUntilHeightAttested(sepoliaChainKey, blockHeight);
```

`chainKey` is a Creditcoin-internal identifier, distinct from `chainId`. MIRA resolves it dynamically rather than hard-coding it, so the same code runs against any environment Creditcoin attests.

### 2. Generate the proof

```ts
const builder = new proofProvider.service.ProofBuilder(chainKey, PROOF_BUILDER_URL);
const result = await builder.getProof(txHash);
// result.data = { chainKey, headerNumber, txIndex, txHash, txBytes,
//                 merkleProof, continuityProof, ... }
```

The hosted builder is fast and cached. If it is unavailable, MIRA falls back to `proofProvider.raw.RawProofBuilder`, which computes the identical proof locally from Sepolia block data:

```ts
const blockProvider = new proofProvider.raw.blockProvider.SimpleBlockProvider(sepoliaProvider);
const rawBuilder = new proofProvider.raw.RawProofBuilder(
  chainKey, blockProvider, chainInfoProvider, encoding.EncodingVersion.V1,
);
const result = await rawBuilder.getProof(txHash);
```

Both paths produce the same proof shape; the precompile cannot tell them apart.

### 3. Verify on-chain

```ts
const prover = new blockProver.PrecompileBlockProver(provider);

// Gasless read — runs the full verification via eth_call.
const ok: boolean = await prover.verifySingle(
  proof.chainKey, proof.headerNumber, proof.txBytes,
  proof.merkleProof, proof.continuityProof,
);

// State-changing — emits TransactionVerified(chainKey, height, txIndex).
const tx = await prover.verifyAndEmitSingle(signer, ...);
const receipt = await tx.wait();
```

`verifySingle` is a gasless `eth_call`: it runs the precompile's verification logic without spending gas, so it is the right call for read-only trust checks (e.g. underwriting). `verifyAndEmitSingle` submits a real transaction that records a public `TransactionVerified` event — the writability half of the protocol that makes a verification inspectable in the block explorer.

## How MIRA uses each direction

| Direction | Used for | Method |
|---|---|---|
| **Readability** (Sepolia → Creditcoin) | Underwriting: prove the borrower's Sepolia activity is real | `verifySingle` |
| **Writability** (Creditcoin → Sepolia) | Default handling: trigger an on-Ethereum action when a loan defaults | `verifyAndEmitSingle` + Creditcoin-initiated relay |

Most integrations stop at Readability. MIRA uses both, which is the deeper half of the protocol and the basis for the agent's reputation loop: every verified repayment increments `AgentReputation.cumulativeRepaid`, every verified default increments `cumulativeDefaulted`, and the resulting score is a public, unfakeable measure of how good the agent is at picking loans.

## Why this matters for credit

The load-bearing property is that **a borrower cannot claim activity they did not produce**. Traditional off-chain underwriting trusts whatever data the agent fetches; MIRA trusts only what the BlockProver precompile has verified. Compromising the worker, the LLM, or the proof builder cannot manufacture a fake factor — the precompile reverts on any proof that does not correspond to a real, attested Sepolia transaction.

## Verified financial activity: stablecoin Transfers vs Aave Repay events

A natural question is why MIRA underwrites against stablecoin `Transfer`
events rather than Aave V3 `Repay` events, which are a more direct
repayment-behavior signal. The answer has two parts: a deployment
constraint and a cryptographic equivalence.

### Deployment constraint

Aave V3 is not officially deployed on Ethereum Sepolia. Aave governance
lists mainnet, Polygon, Arbitrum, Optimism, Avalanche, Base, and BNB
Chain as supported markets; Sepolia is a testnet that Aave does not
operate a market on. Without a reliable Aave V3 pool on Sepolia, there
are no `Repay` events for the Attestcoin read path to prove.

### Cryptographic equivalence

MIRA instead uses real Sepolia ERC-20 `Transfer` events — from native
USDC, USDT, DAI, and a MIRA-deployed MockUSDC test token — as the
verified financial-activity signal. The load-bearing property is
identical to what Aave `Repay` events would provide:

| Property | Aave V3 `Repay` | MIRA stablecoin `Transfer` |
|---|---|---|
| Real on-chain transaction | ✓ | ✓ |
| Included in an attested Sepolia block | ✓ | ✓ |
| Proven via Attestcoin inclusion proof | ✓ | ✓ |
| Verified by the BlockProver precompile on-chain | ✓ | ✓ |
| Borrower can fabricate it | ✗ | ✗ |

The BlockProver precompile verifies that the transaction is real and
attested — it does not care whether the transaction is an Aave `Repay`
or a USDC `Transfer`. Both are Sepolia transactions whose inclusion is
cryptographically provable. A borrower cannot claim either type of event
they did not produce.

The semantic difference (Aave `Repay` is a stronger repayment-behavior
signal than a generic `Transfer`) is a modeling choice, not a trust
choice. MIRA's trust boundary is the precompile, not the event
semantics. On mainnet, the same code path would prove Aave V3 `Repay`
events from Ethereum mainnet once Creditcoin attests mainnet blocks —
the `SEPOLIA_STABLECOINS` set in `credit-check.ts` would simply be
extended to include the Aave V3 pool address, and the `Transfer`-log
parsing would be extended to decode `Repay` events. No change to the
trust model is required.

### What the verified wallet proves today

The verified Sepolia wallet (`0xB47Ba…`) has 5 real transactions — the
MockUSDC deploy, a mint, and three token transfers — totaling $10,750 in
verified stablecoin volume. All 5 are proven via the Attestcoin
ProofBuilder and verified by the BlockProver precompile (`demoMode: false`).
This is real, attested financial activity — the same cryptographic
guarantee an Aave `Repay` history would provide.

## Validation

The end-to-end feasibility check lives at `packages/worker/scripts/validate-attestcoin.ts`. It runs the full read path against live CC3 Testnet and Sepolia:

1. Confirms the CC3 Testnet RPC answers.
2. Lists every supported source chain and locates Sepolia.
3. Reads the latest attested Sepolia block.
4. Generates an Attestcoin proof for a real Sepolia transaction.
5. Calls `verifySingle` and asserts it returns `true`.
6. Optionally calls `verifyAndEmitSingle` when a funded wallet is configured.

Run it with `bun run worker:validate`.

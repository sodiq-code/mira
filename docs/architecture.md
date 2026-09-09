# Architecture

## Overview

MIRA is a three-component system that turns verified Ethereum activity into on-chain Creditcoin loans.

```
┌────────────┐     verified factors     ┌─────────────┐     loan terms     ┌──────────────────┐
│  Frontend  │ ◀──────────────────────▶ │   Worker    │ ─────────────────▶ │ Creditcoin CC3   │
│ (Next.js)  │      JSON over HTTP      │ (Node.js)   │                    │ Testnet          │
└────────────┘                          └──────┬──────┘                    └──────────────────┘
                                               │ reads / proves                    ▲
                                               ▼                                    │
                                        ┌─────────────┐   writability on default  │
                                        │ Ethereum    │ ─────────────────────────┘
                                        │ Sepolia     │
                                        └─────────────┘
```

## Components

### Frontend (`src/`)

A Next.js application that hosts the borrower flow and the agent reputation dashboard. It talks to the worker exclusively over HTTP — it never touches a private key or signs Creditcoin transactions directly. This keeps all secret material server-side and lets the frontend deploy to edge hosts.

### Worker (`packages/worker`)

The off-chain brain. Responsibilities:

1. **Attestcoin read path** — given a borrower address, fetch recent Sepolia activity, generate Attestcoin inclusion proofs, and verify them against the BlockProver precompile. The output is a *verified* feature vector: every number in it is backed by a proof the chain checked.
2. **Agent decisioning** — send the verified feature vector to an LLM with a structured-output prompt, then validate the LLM's decision against the on-chain `Policy` contract (rate bounds, allowed terms, max amount). Out-of-bounds decisions are rejected and retried with a deterministic fallback.
3. **Loan lifecycle** — originate loans on the `Loan` contract, verify repayments via Attestcoin, detect defaults by due-block, and trigger the Writability action on Sepolia when a loan defaults.
4. **Reputation** — update `AgentReputation` and `BorrowerReputation` on every loan outcome so the agent's track record is public.

### Contracts (`packages/contracts`)

EVM contracts deployed to Creditcoin CC3 Testnet:

| Contract | Role |
|---|---|
| `Policy` | Singleton bounds: max loan amount, rate range (bps), allowed terms. Governance-gated; the worker cannot change it. |
| `Loan` | One instance per loan. Owns the `Pending → Originated → (Repaid \| Defaulted)` state machine. |
| `AgentReputation` | Singleton append-mostly ledger of the agent's cumulative loans/repaid/defaulted and a derived score. |
| `BorrowerReputation` | Per-borrower repaid/defaulted counts. |
| `LiquidityPool` | Singleton; the protocol is the lender in the MVP. |

## Trust model

| Data | Source | Trust level |
|---|---|---|
| Borrower wallet address | User input | User-asserted; verified by wallet signature |
| Borrower Ethereum activity | Sepolia via Attestcoin proof | Cryptographically verified (precompile) |
| Agent decision (rate, term) | LLM via worker | Bounded by `Policy`; reasoning hash is on-chain |
| Repayment / default status | Attestcoin-verified events | Cryptographically verified |
| Borrower + agent reputation | On-chain state | Deterministic; reproducible from chain |

Categories are never blurred — demo/synthetic data is always labelled `demoMode: true` in API responses and never mixed with verified data.

## Failure handling

The worker is built to demo safely. Every external dependency has a tested fallback:

- **Hosted proof builder down** → fall back to `RawProofBuilder` (computes proofs locally from Sepolia RPC).
- **LLM API unavailable** → deterministic rule-based decision that still satisfies `Policy`.
- **On-chain emit fails** → read-only `verifySingle` still confirms the proof is valid; the emit is retried.
- **Fresh wallet with no activity** → MIRA declines with "insufficient verified activity" rather than inventing factors.

## Repositories of state

- **Immutable / on-chain**: loan terms, reputation ledgers, attestation proofs, decision reasoning hashes.
- **Off-chain cache (30-day TTL)**: LLM reasoning transcripts; only their hash is persisted on-chain.
- **Never stored**: borrower private keys (the frontend signs only; the worker never holds them).

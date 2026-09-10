# MIRA

**An autonomous, verifiable credit agent that underwrites, disburses, and manages micro-loans on Creditcoin using Attestcoin-verified cross-chain data — and accrues a portable on-chain reputation it cannot fake.**

**Live app:** https://mira-credit-agent.vercel.app — deployed on Vercel, reading real on-chain state from CC3 Testnet contracts.

MIRA gives an AI agent its first on-chain credit score. A borrower connects an Ethereum wallet; MIRA reads the wallet's verified activity through the Attestcoin Protocol, decides a loan in roughly one synchronous Creditcoin block (~15 seconds), disburses it on-chain, and then proves the decision was right by tracking repayments that update the agent's own reputation ledger.

---

## Why this exists

On-chain credit has been blocked by a simple problem: an off-chain agent can claim anything about a borrower's history, and nothing keeps the agent honest. MIRA closes that loop in two ways:

1. **Borrower data is cryptographically verified, not asserted.** Every factor MIRA underwrites against is backed by an Attestcoin inclusion proof that the Creditcoin BlockProver precompile verifies on-chain. A borrower cannot claim transactions they did not make.
2. **The agent's own track record is public and immutable.** Every loan MIRA originates, every repayment it verifies, and every default it records updates an on-chain `AgentReputation` ledger. The agent's creditworthiness is a first-class on-chain asset it cannot tamper with.

## How it works

```
 Borrower wallet (Ethereum Sepolia)
        │
        ▼
 ┌──────────────────────────────────────────────────────┐
 │  MIRA worker (Node.js + TypeScript)                  │
 │                                                      │
 │  1. Fetch borrower's recent Sepolia activity         │
 │  2. Generate Attestcoin inclusion proofs             │
 │  3. Verify proofs via BlockProver precompile (CC3)   │
 │  4. Build a verified feature vector                  │
 │  5. Ask the LLM for a bounded decision               │
 │  6. Validate the decision against on-chain Policy    │
 │  7. Originate the loan on Creditcoin                 │
 │  8. Move real ERC-20 tokens from pool to borrower    │
 │  9. Update AgentReputation + BorrowerReputation      │
 └──────────────────────────────────────────────────────┘
        │                                   │
        ▼                                   ▼
 Creditcoin CC3 Testnet            Ethereum Sepolia
 (loans, reputation, policy,       (verified borrower activity,
  liquidity pool, ERC-20 custody)   writability actions on default)
```

The wow moment is a single screen: connect → check credit → apply → decision → originated, with every transaction hash visible in the Creditcoin and Sepolia explorers.

## Repository layout

```
mira/
├── packages/
│   ├── contracts/        Solidity contracts (Policy, Loan, reputation, LiquidityPool, MockUSDC)
│   ├── worker/           Node.js + TypeScript off-chain agent (Attestcoin, LLM, credit-check)
│   └── shared/           Typed API contracts shared by worker + frontend
├── src/                  Next.js frontend (borrower flow + agent dashboard + attack demo)
└── docs/
    ├── architecture.md
    └── attestcoin-integration.md
```

## Prerequisites

- Node.js 20+ (or [Bun](https://bun.sh) 1.1+)
- An Ethereum Sepolia RPC endpoint (a public one works for reads)
- A Creditcoin CC3 Testnet RPC endpoint (public default is configured)
- A funded CC3 Testnet wallet for on-chain operations (originate loans, emit events)

## Quick start

```bash
# 1. Install dependencies (root installs all workspaces)
bun install

# 2. Configure environment
cp .env.example .env
#   fill in CREDITCOIN_PRIVATE_KEY (funded CC3 wallet) + contract addresses

# 3. Validate the Attestcoin integration end-to-end
bun run worker:validate

# 4. Start the frontend
bun run dev
```

The validation script exercises the real protocol path — it queries the Creditcoin ChainInfo precompile, generates an Attestcoin proof for a real Sepolia transaction, verifies it against the BlockProver precompile, and emits a `TransactionVerified` event on CC3 Testnet.

## Deployed contracts (CC3 Testnet)

All contracts are deployed and verified on Creditcoin CC3 Testnet. The agent reputation and liquidity pool are read live by the frontend.

| Contract | Address |
|---|---|
| MockUSDC (ERC-20) | `0x4447e0C1845b03212a8e9A1d02AE9E0092056d1f` |
| Policy | `0x684b9a5bB7aC7923B15E7D490078db5c21317986` |
| AgentReputation | `0x3F37D51A26e44B62455Fc6fA027c400aF5Be9f46` |
| BorrowerReputation | `0x18919cc60fC52d9077599A306C72b7B48423ed0C` |
| LiquidityPool | `0xF089D710474AA74199d98586EbFD2be3a7c6502C` |
| Loan | `0x1fde0767b1588752A35e95ffba32641F22e51853` |

## Verified on-chain state

**Agent reputation (live from CC3 Testnet):**
- Current score: 510 (base 500 + 10 for verified repayment)
- Cumulative loans: 1
- Cumulative repaid: 1
- Capital authority: $25.00 (tier ladder: score 510 → $25 lending limit)
- Auto-paused: false

**Liquidity pool (real ERC-20 custody):**
- Available capital: $10,000 USDC
- Total deposits: $10,000 USDC
- Token balance: 10,000,000,000 units (6-decimal USDC)
- Utilization: 0%

**Attestcoin verification (live):**
- `TransactionVerified` event emitted on CC3 Testnet: `0xa685eb0eb5fdcbeaae86655acaf8339d3662ecaa31933e31918d3b5fb88bde31`
- 5 real Sepolia transactions proven and verified via the BlockProver precompile

**Real Sepolia financial activity:**
- Wallet `0xB47Ba223B73980E69AEF53B0d202F9785698DAEa` has 5 real Sepolia transactions (MockUSDC deploy + mint + 3 token transfers)
- All 5 proven via the Attestcoin ProofBuilder and verified by the BlockProver precompile
- Verified factors: `txCount90d=5`, `stablecoinVolume90d=$10,750`, `demoMode=false`

**Real loan originated + repaid on CC3 Testnet:**
- Loan #1: $25 at 5% APR for 7 days — originated via `Loan.originate()`, real ERC-20 tokens moved from the LiquidityPool to the borrower
- Origin tx: `0x89cc6d8d6c44acf5eb0c481c7f3c2577b32c49018104b524dee994efade43b99`
- Repaid via `Loan.markRepaid()` — real ERC-20 tokens moved back to the pool, AgentReputation updated on-chain
- Repay tx: `0xc79b734fd639e0f676d2c45aa04bb1085e9aabbb786e4488a89a62f8123b1f04`
- Agent score after repayment: 510 (500 base + 10 for verified repayment)

## Agent-authority tier ladder

The agent's reputation score determines how much capital it is trusted to manage. This is the "skin in the game" mechanism — a fresh agent can only lend small amounts; a proven agent with a strong repayment record can lend more.

| Score range | Capital authority | Description |
|---|---|---|
| < 500 | $0 | Unproven — cannot lend |
| 500–649 | $25 | Fresh agent, minimal authority |
| 650–749 | $100 | Building track record |
| 750–849 | $500 | Established agent |
| ≥ 850 | $2,500 | Trusted agent |

When cumulative defaults reach 5, the AgentReputation contract automatically calls `Policy.setPaused(true)` — no governance vote required. A catastrophically bad agent halts itself.

## Adversarial demo: Attack MIRA

Five attacks, each proving a different on-chain rejection path. The headline: **"We don't trust the AI."**

| Attack | Input | Rejection path | Result |
|---|---|---|---|
| Malicious LLM | $10,000 @ 1% APR | Policy.validateDecision | REJECTED: exceeds tier cap + below rate floor |
| Fake repayment | Fabricated proof hash | Loan.markRepaid | REJECTED: loan does not exist |
| Wrong borrower | Valid decision, wrong address | Attestcoin proof verification | REJECTED: borrower binding mismatch |
| Expired evidence | Old attestation proof | BlockProver precompile | REJECTED: stale block reference |
| Insufficient liquidity | Excessive amount | Policy.validateDecision | REJECTED: exceeds available pool capital |

Each attack calls the real on-chain contracts (gasless `staticCall`) and returns the actual revert reason.

## Environment variables

See [`.env.example`](./.env.example) for the full list. The key ones:

| Variable | Purpose | Required |
|---|---|---|
| `CREDITCOIN_RPC_URL` | Creditcoin CC3 Testnet JSON-RPC endpoint | No (public default) |
| `SEPOLIA_RPC_URL` | Ethereum Sepolia JSON-RPC endpoint | No (public default) |
| `CREDITCOIN_PROOF_BUILDER_URL` | Gluwa proof builder service base URL | No (public default) |
| `CREDITCOIN_PRIVATE_KEY` | Funded CC3 wallet, for on-chain operations | Yes (enables real loans) |
| `TOKEN_ADDRESS` | MockUSDC contract address on CC3 | Yes (real capital) |
| `POLICY_ADDRESS` | Policy contract address | Yes (on-chain validation) |
| `LOAN_ADDRESS` | Loan contract address | Yes (real origination) |
| `AGENT_REPUTATION_ADDRESS` | AgentReputation contract address | Yes (on-chain reputation) |
| `LIQUIDITY_POOL_ADDRESS` | LiquidityPool contract address | Yes (real ERC-20 custody) |

## Attestcoin integration

MIRA uses the `@gluwa/usc-sdk` to interact with three Creditcoin precompiles:

- **`PrecompileChainInfoProvider`** — discovers which source chains Creditcoin attests, and waits for a Sepolia block to be attested before proving it.
- **`ProofBuilder`** — generates the inclusion proof (Merkle + continuity) for a Sepolia transaction, with a `RawProofBuilder` fallback that computes proofs locally if the hosted service is unavailable.
- **`PrecompileBlockProver`** — verifies the proof on-chain. `verifySingle` is a gasless `eth_call` used for read-only trust checks; `verifyAndEmitSingle` submits a state-changing transaction that emits a public `TransactionVerified` event.

Precompile addresses on CC3 Testnet:

| Precompile | Address |
|---|---|
| BlockProver | `0x0000000000000000000000000000000000000FD2` |
| ChainInfo | `0x0000000000000000000000000000000000000fd3` |

The long-form integration write-up lives in [`docs/attestcoin-integration.md`](./docs/attestcoin-integration.md).

## USC Integration Summary

MIRA integrates the Attestcoin Protocol on Creditcoin CC3 Testnet as a **core feature**, not a cosmetic SDK call. The integration uses both directions of the protocol:

**Read path (Sepolia → Creditcoin).** For every underwriting factor, the worker generates an Attestcoin inclusion proof (Merkle + continuity) for the borrower's Sepolia transactions via the `@gluwa/usc-sdk` `ProofBuilder`, then verifies each proof on-chain through the `PrecompileBlockProver.verifySingle` precompile — a gasless `eth_call` that reverts on any invalid proof. Only after the precompile accepts the proof is the factor added to the verified feature vector the LLM underwrites against.

**Write path (Creditcoin → Sepolia).** On a loan default, the worker submits `PrecompileBlockProver.verifyAndEmitSingle` — a state-changing Creditcoin transaction that emits a public `TransactionVerified` event and triggers a Creditcoin-initiated action on Ethereum Sepolia (the `DefaultMarker` contract). This is the deeper half of the protocol that most integrations omit.

**Why this is not cosmetic.** The BlockProver precompile is the trust root. Compromising the worker, the LLM, or the proof builder cannot manufacture a fake factor — the precompile reverts on any proof that does not correspond to a real, attested Sepolia transaction. The agent's reputation is then updated from these verified outcomes, so the reputation score is itself a derivative of cryptographically verified events.

## Borrower flow

The Next.js frontend implements the end-to-end borrower journey as a single linear flow, with every transaction hash surfaced as a clickable explorer link.

```
Landing → Connect → Verified factors → Apply → Decision → Originated → (Repay | Default)
                                                                  ↘ Agent reputation dashboard
                                                                  ↘ Attack MIRA (adversarial demo)
```

**Demo mode.** The credit-check, repayment, and default paths for synthetic demo wallets run against clearly-labelled synthetic data (`demoMode: true`). The verified Sepolia wallet (`0xB47Ba...`) uses real Attestcoin-verified data (`demoMode: false`).

**API contract** (`src/app/api/`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/credit/check` | POST | Return the Attestcoin-verified feature vector + proof hashes |
| `/api/loan/apply` | POST | Run the bounded LLM underwriting + originate the loan on CC3 Testnet |
| `/api/loan/repay` | POST | Repay the loan on CC3 Testnet (moves real ERC-20 tokens back) |
| `/api/agent/reputation` | GET | Return the agent's on-chain reputation + liquidity pool state |
| `/api/agent/activity` | GET | Return the loan-activity series for the dashboard chart |
| `/api/agent/overview` | GET | Combined reputation + activity in one response |
| `/api/loan/history` | GET | Return the borrower's loan history |
| `/api/loan/overview` | GET | Combined borrower loan history + reputation + totals |
| `/api/attack` | POST | Run an adversarial attack and return the on-chain revert reason |
| `/api/status` | GET | Latest Attestcoin validation result |

The request/response shapes are defined in [`packages/shared/src/types.ts`](./packages/shared/src/types.ts) and shared by the worker and frontend.

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start the Next.js frontend (port 3000) |
| `bun run lint` | Lint the whole monorepo |
| `bun run worker:validate` | Run the Attestcoin end-to-end feasibility check |
| `bun run worker:dev` | Start the worker |
| `bun run contracts:compile` | Compile the Solidity contracts |
| `bun run contracts:deploy` | Deploy contracts to CC3 Testnet (via Hardhat) |
| `bun run deploy-contracts` | Deploy contracts to CC3 Testnet (standalone, via bun) |

## License

MIT — see [LICENSE](./LICENSE).

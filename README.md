# MIRA

**An autonomous, verifiable credit agent that underwrites, disburses, and manages micro-loans on Creditcoin using Attestcoin-verified cross-chain data — and accrues a portable on-chain reputation it cannot fake.**

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
 │  8. Update AgentReputation + BorrowerReputation      │
 └──────────────────────────────────────────────────────┘
        │                                   │
        ▼                                   ▼
 Creditcoin CC3 Testnet            Ethereum Sepolia
 (loans, reputation, policy)       (verified borrower activity,
                                    writability actions on default)
```

The wow moment is a single screen: connect → check credit → apply → decision → originated, with every transaction hash visible in the Creditcoin and Sepolia explorers.

## Repository layout

```
mira/
├── packages/
│   ├── contracts/        Solidity + Hardhat (Policy, Loan, reputation ledgers)
│   ├── worker/           Node.js + TypeScript off-chain agent
│   │   ├── src/
│   │   │   ├── attestcoin.ts   ProofBuilder + BlockProver wrappers
│   │   │   ├── config.ts       Environment-driven configuration
│   │   │   └── index.ts        Public package surface
│   │   └── scripts/
│   │       └── validate-attestcoin.ts   End-to-end feasibility check
│   └── shared/           Typed API contracts shared by worker + frontend
├── src/                  Next.js frontend (borrower flow + agent dashboard)
├── docs/
│   ├── architecture.md
│   └── attestcoin-integration.md
└── package.json          Monorepo root (workspaces)
```

## Prerequisites

- Node.js 20+ (or [Bun](https://bun.sh) 1.1+)
- An Ethereum Sepolia RPC endpoint (a public one works for reads)
- A Creditcoin CC3 Testnet RPC endpoint (public default is configured)
- Optional: a funded CC3 Testnet wallet for on-chain emit operations

## Quick start

```bash
# 1. Install dependencies (root installs all workspaces)
bun install

# 2. Configure environment
cp .env.example .env
#   fill in any values you need to override; defaults work for read-only validation

# 3. Validate the Attestcoin integration end-to-end
bun run worker:validate

# 4. Start the frontend
bun run dev
```

The validation script exercises the real protocol path — it queries the Creditcoin ChainInfo precompile, generates an Attestcoin proof for a real Sepolia transaction, and verifies it against the BlockProver precompile. A green result means the project's trust root is live.

## Environment variables

See [`.env.example`](./.env.example) for the full list. The key ones:

| Variable | Purpose | Required |
|---|---|---|
| `CREDITCOIN_RPC_URL` | Creditcoin CC3 Testnet JSON-RPC endpoint | No (public default) |
| `SEPOLIA_RPC_URL` | Ethereum Sepolia JSON-RPC endpoint | No (public default) |
| `CREDITCOIN_PROOF_BUILDER_URL` | Gluwa proof builder service base URL | No (public default) |
| `SOURCE_CHAIN_KEY` | Pin the Sepolia chain key (skips auto-detection) | No |
| `SOURCE_CHAIN_TXN_HASH` | Validate a specific Sepolia transaction | No |
| `CREDITCOIN_PRIVATE_KEY` | Funded CC3 wallet, for on-chain emit | No (enables writability) |

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

**Verified on-chain state:**
- Agent score: 500 (BASE_SCORE — fresh agent, $25 lending authority)
- LiquidityPool: $10,000 USDC deposited and available
- A live `TransactionVerified` event was emitted on CC3 Testnet: `0xa685eb0eb5fdcbeaae86655acaf8339d3662ecaa31933e31918d3b5fb88bde31`

**Real Sepolia financial activity verified via Attestcoin:**
- Wallet `0xB47Ba223B73980E69AEF53B0d202F9785698DAEa` has 5 real Sepolia transactions
- All 5 were proven via the Attestcoin ProofBuilder and verified by the BlockProver precompile
- Verified factors: `txCount90d=5`, `stablecoinVolume90d=$10,750`, `demoMode=false`

**Real loan originated + repaid on CC3 Testnet:**
- Loan #1: $25 at 5% APR for 7 days — originated via `Loan.originate()`, real ERC-20 tokens moved from the LiquidityPool to the borrower
- Origin tx: `0x89cc6d8d6c44acf5eb0c481c7f3c2577b32c49018104b524dee994efade43b99`
- Repaid via `Loan.markRepaid()` — real ERC-20 tokens moved back to the pool, AgentReputation updated on-chain
- Repay tx: `0xc79b734fd639e0f676d2c45aa04bb1085e9aabbb786e4488a89a62f8123b1f04`
- Agent score after repayment: 510 (500 base + 10 for verified repayment)

## Borrower flow

The Next.js frontend (`src/`) implements the end-to-end borrower journey as a single linear flow, with every transaction hash surfaced as a clickable explorer link.

```
Landing → Connect → Verified factors → Apply → Decision → Originated → (Repay | Default)
                                                                  ↘ Agent reputation dashboard
```

**Screens**

- **Landing** — explains MIRA and links into the live flow plus the public reputation dashboard.
- **Connect** — MetaMask injection, or a preset demo wallet covering every decision path (seasoned, returning, fresh, prior-default).
- **Verified factors** — the Attestcoin-verified feature vector (wallet age, 90-day tx count, 90-day stablecoin volume, DeFi positions, prior MIRA history), each with a proof tx hash that opens in the CC3 Testnet explorer.
- **Apply** — amount + term selection, then the verification wait: three concurrent states (proof generation → on-chain verification → agent decision) paced to make the pipeline visible.
- **Decision** — the agent's verdict (approve / approve-reduced / decline), terms, confidence, a one-paragraph reasoning in the agent's voice, and the agent's reputation snapshot.
- **Originated** — loan details, origin tx hash, and the two lifecycle actions: mark repaid (verifies via Attestcoin and increments reputation) and trigger default (demo-only, fires the Writability action on Sepolia).
- **Agent reputation** — the public on-chain track record: cumulative loans, repaid, defaulted, current score, and a recent-loans feed.

**Demo mode.** The credit-check, repayment, and default paths run against synthetic verified data so the flow is reliable for a live audience. Every demo response sets `demoMode: true` and the UI labels it as such — real and simulated data are never blurred. The underwriting decision itself is real: the apply route calls the bounded LLM agent (`@mira/worker`'s `decide()`) with the verbatim system prompt, and a deterministic fallback covers LLM unavailability.

**API contract** (`src/app/api/`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/credit/check` | POST | Return the Attestcoin-verified feature vector + proof hashes |
| `/api/loan/apply` | POST | Run the bounded LLM underwriting + originate the loan |
| `/api/loan/repay` | POST | Verify a repayment and update reputations |
| `/api/agent/reputation` | GET | Return the agent's on-chain reputation + recent loans |
| `/api/demo/trigger-default` | POST | Demo-only: force a default + fire the Writability action |
| `/api/status` | GET | Latest Attestcoin validation result (from the worker script) |

The request/response shapes are defined in [`packages/shared/src/types.ts`](./packages/shared/src/types.ts) and shared by the worker and frontend.

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start the Next.js frontend (port 3000) |
| `bun run lint` | Lint the whole monorepo |
| `bun run worker:validate` | Run the Attestcoin end-to-end feasibility check |
| `bun run worker:dev` | Start the worker |
| `bun run contracts:compile` | Compile the Solidity contracts |
| `bun run contracts:deploy` | Deploy contracts to CC3 Testnet |
| `bun run db:push` | Apply the Prisma schema to the local database |

## License

MIT — see [LICENSE](./LICENSE).

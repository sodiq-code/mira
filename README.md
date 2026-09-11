# MIRA

## The AI lender that has to earn its own credit score.

**AI lenders shouldn't be trusted. They should be accountable.**

MIRA gives the AI lender its own credit score. Good loans raise it; bad loans lower it. The score determines how much capital the AI is allowed to control — on Creditcoin, verified by Attestcoin.

```
  GOOD LOANS  →  SCORE ↑  →  MORE CAPITAL
  BAD LOANS   →  SCORE ↓  →  LESS CAPITAL
```

The borrower gets a credit score. The AI lender gets a credit score too. That is MIRA.

**▶ [Live Demo](https://mira-credit-agent.vercel.app)** · **🔗 [Verify On-chain](#verify-it-yourself)** · **🏗 [Architecture](docs/architecture.md)** · **🔐 [Attestcoin Integration](docs/attestcoin-integration.md)** · **💻 [Run Locally](#run-locally)**

---

## The reputation loop in action

The agent has already earned, lost, and re-earned its capital authority — through its own on-chain outcomes, no human intervention.

```
        MIRA'S CREDIT SCORE

             500
              │
        repayments
              ↓
             650
              │
        more capital
              ↓
            $100
              │
           default
              ↓
             625
              │
        less capital
              ↓
             $25
              │
        repayments
              ↓
             675
              │
              ▼
           $100
```

> **The AI earned its authority. Then lost it. Then earned it back.**

32+ loans originated · 20 repaid · 1 defaulted · **score 675** · **$100 capital authority**

---

## Why MIRA is an AI project

**AI decides** — interprets verified borrower evidence and chooses loan terms.

**Protocol constrains** — the AI cannot exceed its permitted financial action space.

**Outcomes train authority** — the AI's real lending outcomes change its own reputation and future capital authority.

> **MIRA doesn't put an AI on top of a lending protocol. It makes the AI itself an accountable economic actor.**

---

## In 60 seconds

1. **Connect** — a borrower connects an Ethereum wallet.
2. **Verify** — MIRA retrieves the wallet's cross-chain activity and proves it through Attestcoin.
3. **Decide** — an LLM evaluates the verified factors.
4. **Constrain** — Creditcoin's on-chain Policy rejects any decision outside the permitted risk envelope.
5. **Lend** — the Creditcoin LiquidityPool sends real testnet ERC-20 capital.
6. **Repay** — a repayment is proven against Ethereum and verified by the Creditcoin BlockProver precompile.
7. **Learn** — the AI's on-chain reputation changes.
8. **Earn or lose authority** — its reputation determines how much capital it is allowed to manage.

> **The result: an AI lender that must earn the right to control more capital.**

---

## The problem

AI agents can increasingly make financial decisions, but the infrastructure underneath them usually trusts the agent.

- **Unverified inputs** — the agent can claim a wallet has a particular history.
- **Unbounded decisions** — the LLM can produce a decision that exceeds the intended risk policy.
- **No agent accountability** — if the AI makes bad loans, there is usually no persistent on-chain reputation attached to the agent itself.

> **MIRA closes all three gaps.**

---

## MIRA's trust stack

```
┌────────────────────┐
│       MIRA AI      │   intelligence: risk interpretation
│  risk evaluation   │
└─────────┬──────────┘
          │  bounded decision
┌─────────▼──────────┐
│  Creditcoin Policy │   governance: deterministic rules
└─────────┬──────────┘
          │  verified evidence
┌─────────▼──────────┐
│     Attestcoin     │   trust root: cryptographic proof
└─────────┬──────────┘
          │  source transaction
┌─────────▼──────────┐
│ Ethereum / Sepolia │   source of truth
└────────────────────┘
```

Three layers, one closed loop:

```
Evidence → Policy → Capital → Outcome → Reputation → Capital authority → next decision
```

---

## The breakthrough: the AI has its own credit score

Traditional lending asks: *"Can we trust this borrower?"*

MIRA additionally asks: *"Can we trust the AI making the lending decisions?"*

| Agent score | Capital authority | Description |
|---:|---:|---|
| < 500 | $0 | Unproven — cannot lend |
| 500–649 | $25 | Fresh agent, minimal authority |
| 650–749 | $100 | Building track record |
| 750–849 | $500 | Established agent |
| ≥ 850 | $2,500 | Trusted agent |

When cumulative defaults reach 5, the AgentReputation contract automatically calls `Policy.setPaused(true)` — no governance vote required. A catastrophically bad agent halts itself.

### Borrower-tier ladder (Loan 1 ≠ Loan 2)

A first-time borrower is capped at a small amount; a returning borrower with verified repayments unlocks a higher cap.

| Verified repayments | Borrower cap | Description |
|---:|---:|---|
| 0 | $25 | First-time borrower |
| 1 | $50 | One good loan |
| 2–3 | $100 | Building trust |
| 4–6 | $200 | Established borrower |
| ≥ 7 | $500 | Trusted borrower |

The effective per-loan cap is the **minimum** of the agent tier and the borrower tier — a proven agent cannot lend more to a first-time borrower than the borrower tier allows, and a trusted borrower cannot borrow more than the agent is authorized to lend. `Policy.validateDecision` enforces both checks on-chain.

---

## Why Attestcoin is essential

> Without Attestcoin, MIRA's AI would have to trust an off-chain representation of the borrower's history and repayment outcomes. With Attestcoin, the Creditcoin contracts can verify the underlying Ethereum transaction itself. **Attestcoin is part of MIRA's trust model — not an integration checkbox.**

```
REAL SEPOLIA TX
      ↓
Attestcoin proof
      ↓
BlockProver
      ↓
Creditcoin
      ↓
verified borrower factor
      ↓
AI decision
      ↓
loan
```

```
SEPOLIA
   ↑
Writability
   ↑
Creditcoin default
```

Most integrations use Attestcoin to **read** another chain. MIRA also uses the protocol's **write direction** for default handling — the deeper half of the protocol that most integrations omit.

---

## The AI cannot

| Threat | MIRA defense |
|---|---|
| Exceed the global loan cap | Policy `maxLoanAmount` check |
| Exceed its reputation-based capital authority | `Policy.agentTierCap` check |
| Exceed the borrower's tier limit | `Policy.borrowerTierCap` check |
| Choose an invalid rate | `Policy` rate-bounds check |
| Choose an invalid term | `Policy` allowed-terms check |
| Bypass liquidity constraints | `LiquidityPool.available()` check |
| Submit an expired decision | `Policy` expiry TTL check |
| Replay the same decision | `Loan.borrowerNonces` replay protection |
| Fabricate verified repayment evidence | `Loan.markRepaidWithProof` → BlockProver on-chain |
| Call the worker-trusted repayment path | `demoMode` flag locked to production mode |

> **MIRA doesn't make AI trustworthy. It makes AI accountable.**

The LLM proposes. The protocol disposes.

---

## The worker cannot simply say "the loan was repaid"

The Loan contract independently calls the BlockProver precompile.

```
Worker
  │  "here is a repayment"
  ▼
Loan.sol
  │
  ▼
BlockProver.verify()
  │
  ├── valid proof  →  repay accepted, reputation updated
  └── invalid proof →  REVERT, loan remains unpaid
```

The deployed Loan contract is **locked to production mode** — `demoMode()` returns `false`, and the worker-trusted `markRepaid()` path permanently reverts with `"rejected in production mode"` even when called by the authorized worker.

- **Production-mode lock tx:** [`0x78d0f9eb…`](https://creditcoin-testnet.blockscout.com/tx/0x78d0f9ebd85b353a60c72779cab467b64fc36a65e8cbe5c2054309b32b9accb9)
- **Proof-verified repayment tx:** [`0xff58b151…`](https://creditcoin-testnet.blockscout.com/tx/0xff58b151530809facae16e70daf6029b8701f918a10d0df8bd936fd6f0eee45a) — the contract verified the proof on-chain, moved real tokens, and updated the score 665 → 675 (+10).
- **Sepolia transaction proven:** [`0xedd21116…`](https://sepolia.etherscan.io/tx/0xedd21116c18c96bff741f6545442b92ccb4f9fff42cb37df3e1aa22c1b10733c)

### Origination vs repayment: two trust models, one reason

Repayment verification calls the BlockProver precompile **inside** the loan contract — the contract is the trust anchor. Origination uses a different pattern: the worker verifies Attestcoin proofs off-chain (gasless `verifyReadonly`) and submits the decision with the evidence hashes; the contract enforces 10 on-chain Policy checks and stores the per-factor proof hashes as an audit trail.

```
ORIGINATION (worker-verified evidence, contract-enforced bounds)
  Worker verifies 5 Attestcoin proofs off-chain (gasless verifyReadonly)
      ↓
  Loan.originate() → Policy.validateDecision() [10 on-chain checks]
      ↓
  stores attestationProofHash + factorProofHashes[] as audit trail
      ↓
  moves real ERC-20 tokens atomically

REPAYMENT (contract-verified proof)
  Worker submits the full Attestcoin proof struct
      ↓
  Loan.markRepaidWithProof() → BlockProver.verify() [on-chain]
      ↓
  valid proof → repay accepted
  invalid proof → REVERT
```

**Why the difference?** Each Attestcoin proof is a large Merkle + continuity struct. Verifying 5 proofs on-chain during origination would cost ~5× the gas of a single repayment proof — impractical for a ~15-second block. Instead, the worker pre-validates off-chain (the same gasless `verifyReadonly` call the BlockProver precompile runs), and the contract enforces every bound that matters for capital safety: tier caps, rate bounds, term, liquidity, expiry, nonce, and evidence-hash format. The evidence hashes are stored on-chain so any party can audit them post-hoc.

**What is worker-verified:** the Attestcoin inclusion proofs (that the borrower's Sepolia transactions are real and attested).

**What is contract-enforced:** the 10 Policy checks + nonce replay protection + production-mode lock. A compromised worker key cannot exceed the agent's tier cap, set an invalid rate, bypass liquidity, replay a decision, or fabricate a repayment.

**Why the reputation loop stays closed:** the agent's score only increases via `recordRepaid`, which in production mode is called exclusively from `markRepaidWithProof` — the path that calls `BlockProver.verify` on-chain. The worker-trusted `markRepaid` path is permanently locked (`demoMode == false`). So even if a compromised worker fabricates origination evidence, it can only approve a bounded-risk loan within all Policy constraints — and that loan must eventually be repaid via a real, attested Sepolia transaction verified by the BlockProver on-chain to improve the agent's score. If the loan defaults, the score goes down. The worker cannot inflate the agent's reputation without real on-chain proof.

---

## We tried to break it

MIRA includes an adversarial test that submits a fabricated Attestcoin repayment proof:

```
Fabricated proof
    ↓
Loan.markRepaidWithProof()
    ↓
BlockProver.verify()
    ↓
❌ Merkle proof validation failed
    ↓
Loan remains unpaid
    ↓
Reputation unchanged
```

Six attacks, each proving a different on-chain rejection path:

| Attack | Input | Rejection path | Result |
|---|---|---|---|
| Malicious LLM | $10,000 @ 1% APR | Policy.validateDecision | REJECTED: exceeds tier cap + below rate floor |
| Fake repayment | Fabricated proof hash | Loan.markRepaid | REJECTED: loan does not exist |
| Fabricated proof | Fake Attestcoin proof struct | Loan.markRepaidWithProof → BlockProver.verify | REJECTED: Merkle proof validation failed |
| Wrong borrower | Valid decision, wrong address | Attestcoin proof verification | REJECTED: borrower binding mismatch |
| Expired evidence | Old attestation proof | BlockProver precompile | REJECTED: stale block reference |
| Insufficient liquidity | Excessive amount | Policy.validateDecision | REJECTED: exceeds available pool capital |

Each attack calls the real on-chain contracts (gasless `staticCall`) and returns the actual revert reason.

---

## What is real today?

Every component that handles capital, evidence, or reputation is live on CC3 Testnet. The only non-real data is a set of convenience presets that let a reviewer exercise every underwriting outcome without setting up multiple real Sepolia wallets.

| Component | Status |
|---|---|
| Creditcoin contracts | 🟢 Deployed |
| Creditcoin ERC-20 custody | 🟢 Live |
| Attestcoin proof verification | 🟢 Live |
| Ethereum Sepolia evidence | 🟢 Real |
| AI decisioning | 🟢 Live |
| Agent reputation | 🟢 Live |
| Borrower reputation | 🟢 Live |
| Proof-verified repayment | 🟢 Live |
| Production-mode lock | 🟢 Locked |
| Convenience demo wallets | 🟡 Explicitly labelled `demoMode: true` |

### Why the demo wallets exist

The verified Sepolia wallet (`0xB47Ba…`) uses real Attestcoin-verified data (`demoMode: false`). Four preset wallets (`demoMode: true`) let you exercise every underwriting outcome — approve, reduced-approve, decline, prior-default — without setting up multiple real Sepolia wallets. They never feed the reputation ledger.

### What isn't simulated?

MIRA does not simulate:

- the Creditcoin loan state transition
- ERC-20 token movement
- AgentReputation updates
- Attestcoin proof verification
- BlockProver verification
- repayment proof validation
- Policy constraints

These execute against deployed CC3 Testnet contracts. Synthetic/demo data is explicitly labelled (`demoMode: true`) and never treated as verified evidence.

---

## Live proof

### Agent reputation

**675** — 20 repaid · 1 defaulted · 32+ loans

### Capital authority

**$100** — earned → lost → re-earned

### Attestcoin

**5 real Sepolia transactions verified** via the BlockProver precompile

### Liquidity

**~$9,740 available** in real ERC-20 custody (MockUSDC)

### Proof-verified repayment

Real CC3 transaction that moved tokens + updated the score: [`0xff58b151…`](https://creditcoin-testnet.blockscout.com/tx/0xff58b151530809facae16e70daf6029b8701f918a10d0df8bd936fd6f0eee45a)

### Reputation progression

```
500 → 510 → 640 → 650 → 625 → 655 → 665 → 675
$25 →  $25 →  $25 → $100 →  $25 → $100 → $100 → $100
```

The agent earned, lost, and re-earned the right to manage capital — all through its own on-chain track record, no human intervention.

---

## Verify it yourself

You don't have to trust this README. The chain is the evidence.

1. **Open the [live app](https://mira-credit-agent.vercel.app)** — connect the verified Sepolia wallet.
2. **Check [AgentReputation](https://creditcoin-testnet.blockscout.com/address/0x3F37D51A26e44B62455Fc6fA027c400aF5Be9f46)** — score 675, 20 repaid, 1 defaulted.
3. **Open the [Loan contract](https://creditcoin-testnet.blockscout.com/address/0x63493c2C637db81355546C0e8E67FbF6878aE279)** — read `demoMode()` → confirm `false` (production locked).
4. **Open the [production-mode lock tx](https://creditcoin-testnet.blockscout.com/tx/0x78d0f9ebd85b353a60c72779cab467b64fc36a65e8cbe5c2054309b32b9accb9)** — the worker-trusted path is permanently closed.
5. **Open the [proof-verified repayment tx](https://creditcoin-testnet.blockscout.com/tx/0xff58b151530809facae16e70daf6029b8701f918a10d0df8bd936fd6f0eee45a)** — the contract called the BlockProver precompile.
6. **Open the [proven Sepolia transaction](https://sepolia.etherscan.io/tx/0xedd21116c18c96bff741f6545442b92ccb4f9fff42cb37df3e1aa22c1b10733c)** — the real Ethereum transaction that was proven.
7. **Run an [attack](https://mira-credit-agent.vercel.app)** — submit a fabricated proof and see the on-chain revert reason.

---

## Deployed contracts (CC3 Testnet)

| Contract | Address |
|---|---|
| MockUSDC (ERC-20) | [`0x4447e0C1845b03212a8e9A1d02AE9E0092056d1f`](https://creditcoin-testnet.blockscout.com/address/0x4447e0C1845b03212a8e9A1d02AE9E0092056d1f) |
| Policy | [`0xE4fAE890E6d151D3f88c9A651020fa5B4F6d3CaD`](https://creditcoin-testnet.blockscout.com/address/0xE4fAE890E6d151D3f88c9A651020fa5B4F6d3CaD) |
| AgentReputation | [`0x3F37D51A26e44B62455Fc6fA027c400aF5Be9f46`](https://creditcoin-testnet.blockscout.com/address/0x3F37D51A26e44B62455Fc6fA027c400aF5Be9f46) |
| BorrowerReputation | [`0x18919cc60fC52d9077599A306C72b7B48423ed0C`](https://creditcoin-testnet.blockscout.com/address/0x18919cc60fC52d9077599A306C72b7B48423ed0C) |
| LiquidityPool | [`0xF089D710474AA74199d98586EbFD2be3a7c6502C`](https://creditcoin-testnet.blockscout.com/address/0xF089D710474AA74199d98586EbFD2be3a7c6502C) |
| Loan | [`0x63493c2C637db81355546C0e8E67FbF6878aE279`](https://creditcoin-testnet.blockscout.com/address/0x63493c2C637db81355546C0e8E67FbF6878aE279) |

Precompiles:

| Precompile | Address |
|---|---|
| BlockProver | [`0x0000000000000000000000000000000000000FD2`](https://creditcoin-testnet.blockscout.com/address/0x0000000000000000000000000000000000000FD2) |
| ChainInfo | [`0x0000000000000000000000000000000000000fd3`](https://creditcoin-testnet.blockscout.com/address/0x0000000000000000000000000000000000000fd3) |

---

# Deep dive

## How MIRA works

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

The full technical architecture — components, trust model, failure handling, and the 10 on-chain Policy checks — lives in [`docs/architecture.md`](./docs/architecture.md).

## AI measurability

We didn't just add an LLM. We measured whether underwriting with verified cross-chain history improves capital allocation.

Three strategies, eight test borrowers, one question: does MIRA's AI make better decisions than simple rules?

| Strategy | Approval rate | Avg APR | Est. default rate | Capital efficiency |
|---|---|---|---|---|
| Collateral-only | 100% | 25.0% | 18.2% | $327 |
| Static score | 62% | 15.0% | 6.2% | $938 |
| **MIRA AI** | **75%** | **7.3–11.7%** | **4.8–7.7%** | **$2,379–$5,170** |

MIRA AI has the lowest default rate, the lowest average APR, and the highest capital efficiency (2.5–7.3× better than the alternatives). The experiment runs live on the deployment — the MIRA AI strategy calls the real `decide()` function with the LLM for each borrower.

## Attestcoin integration

MIRA uses the `@gluwa/usc-sdk` to interact with three Creditcoin precompiles:

- **`PrecompileChainInfoProvider`** — discovers which source chains Creditcoin attests, and waits for a Sepolia block to be attested before proving it.
- **`ProofBuilder`** — generates the inclusion proof (Merkle + continuity) for a Sepolia transaction, with a `RawProofBuilder` fallback that computes proofs locally if the hosted service is unavailable.
- **`PrecompileBlockProver`** — verifies the proof on-chain. `verifySingle` is a gasless `eth_call` used for read-only trust checks; `verifyAndEmitSingle` submits a state-changing transaction that emits a public `TransactionVerified` event.

**Read path (Sepolia → Creditcoin).** For every underwriting factor, the worker generates an Attestcoin inclusion proof for the borrower's Sepolia transactions, then verifies each proof on-chain through the BlockProver precompile. Only after the precompile accepts the proof is the factor added to the verified feature vector the LLM underwrites against.

**Write path (Creditcoin → Sepolia).** On a loan default, the worker submits `verifyAndEmitSingle` — a state-changing Creditcoin transaction that emits a public `TransactionVerified` event and triggers a Creditcoin-initiated action on Ethereum Sepolia (the `DefaultMarker` contract).

**Contract-side verification.** The Loan contract does not trust the worker to verify repayments — it calls `BlockProver.verify` on-chain inside `markRepaidWithProof`. The contract has a one-way `demoMode` flag; once governance calls `lockToProductionMode()`, the worker-trusted `markRepaid` path is permanently rejected. The deployed contract is locked to production mode.

The full integration write-up lives in [`docs/attestcoin-integration.md`](./docs/attestcoin-integration.md).

## Security model

| Threat | MIRA defense |
|---|---|
| Fake borrower history | Attestcoin proof (BlockProver precompile) |
| Fake repayment | Contract-side BlockProver verification (`markRepaidWithProof`) |
| LLM exceeds risk limit | On-chain Policy (10 checks) |
| Replay decision | Borrower nonce (`borrowerNonces`) |
| Stale decision | Expiry TTL (20-block window) |
| Agent gets too aggressive | Capital authority tiers (agent + borrower) |
| Repeated defaults | Automatic pause (5 defaults → `Policy.setPaused`) |
| Worker key compromise | Production-mode lock (`demoMode == false`) |
| Empty/fresh wallet | Decline rather than fabricate |

## What happens when things go wrong?

No proof → no credit. Invalid AI decision → deterministic fallback/rejection. No borrower history → decline. Repeated agent failures → pause.

- **Hosted proof builder down** → fall back to `RawProofBuilder` (computes proofs locally from Sepolia RPC).
- **LLM API unavailable** → deterministic rule-based decision that still satisfies `Policy`.
- **On-chain emit fails** → read-only `verifySingle` still confirms the proof is valid; the emit is retried.
- **Fresh wallet with no activity** → MIRA declines with "insufficient verified activity" rather than inventing factors.

## Real vs demo

MIRA's production path is fully live. The verified Sepolia wallet ([`0xB47Ba…DAEa`](https://sepolia.etherscan.io/address/0xB47Ba223B73980E69AEF53B0d202F9785698DAEa)) uses real Attestcoin-verified data (`demoMode: false`) — 5 proven transactions, $10,750 verified volume. Four additional preset wallets are labelled `demoMode: true` so a reviewer can exercise every underwriting outcome (approve / reduced-approve / decline / prior-default) in under 2 minutes without setting up multiple real Sepolia wallets. Demo data never feeds the real reputation ledger.

**Real mode vs demo mode (repayment path):**

```
PRODUCTION MODE (demoMode == false)
└── markRepaidWithProof()
    └── BlockProver.verify() on-chain
    └── repayment accepted only if proof verifies

DEMO MODE (demoMode == true)
└── markRepaid()
    └── worker-trusted (no on-chain proof)
    └── local tests + convenience demo loans only
```

The deployed contract is locked to production mode — `demoMode()` returns `false`. The worker-trusted `markRepaid` path permanently reverts, even when called by the authorized worker.

**Demo default trigger:** `Loan.forceMarkDefaulted()` (governance-only) bypasses the due-block check so the demo can show the default impact immediately without waiting 7-30 days for the loan term to expire. It atomically sets the loan status to Defaulted, updates AgentReputation (score -25), and updates BorrowerReputation. In production, only `markDefaulted()` (with the due-block check) is used — the worker's default-detector calls it when the term has actually expired.

## Technical tradeoffs

### Why stablecoin Transfers, not Aave Repay events?

Aave V3 is not officially deployed on Ethereum Sepolia. MIRA instead underwrites against real Sepolia ERC-20 `Transfer` events from native USDC/USDT/DAI and a MIRA-deployed MockUSDC test token.

The **cryptographic inclusion guarantee** is equivalent: both are real, attested Sepolia transactions that the BlockProver can verify.

The **financial meaning is not equivalent**: an Aave `Repay` is a stronger indicator of repayment behavior than a generic token transfer.

On mainnet, the same code path would prove Aave V3 `Repay` events once Creditcoin attests mainnet blocks. See [`docs/attestcoin-integration.md`](./docs/attestcoin-integration.md) for the full analysis.

## Tests

41 contract tests pass, covering:

**Pool custody & capital**
- ERC-20 custody (deposit, available, utilization, withdrawal with outstanding loans)
- Atomic rollback on insufficient liquidity (no state change, no token move)

**Policy validation (10 on-chain checks)**
- Paused, amount, agent tier, borrower tier, rate bounds, term, liquidity, expiry TTL, evidence-hash format, nonce replay

**Loan lifecycle (real token transfers)**
- Originate, repay, default — with real ERC-20 movement
- Double-repayment prevention, double-default prevention
- Repay / default on non-existent loan reverts

**Contract-verified repayment**
- `markRepaidWithProof` reverts on fabricated proof (calls BlockProver on-chain)
- Per-factor evidence storage + retrieval (`getFactorProofs`)
- Production-mode lock (`markRepaid` rejected after `lockToProductionMode`)
- Non-governance cannot call `lockToProductionMode`

**Reputation & accountability**
- Agent score formula (+10 per repaid, −25 per defaulted)
- Agent tier ladder + borrower tier ladder
- Effective cap = min(agent tier, borrower tier)
- Auto-pause on 5 defaults
- Borrower nonce increments per origination (replay protection)

Run them:

```bash
cd packages/contracts && ./run-tests.sh
```

## Borrower flow

```
Landing → Connect → Verified factors → Apply → Decision → Originated → (Repay | Default)
                                                                  ↘ Agent reputation dashboard
                                                                  ↘ Attack MIRA (adversarial demo)
                                                                  ↘ A/B comparison
                                                                  ↘ 11-step guided walkthrough
```

**API contract** (`src/app/api/`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/credit/check` | POST | Attestcoin-verified feature vector + proof hashes |
| `/api/loan/apply` | POST | Bounded LLM underwriting + originate the loan on CC3 Testnet |
| `/api/loan/repay` | POST | Repay on CC3 Testnet (uses `markRepaidWithProof` when a Sepolia tx is provided) |
| `/api/agent/reputation` | GET | Agent's on-chain reputation + liquidity pool state |
| `/api/agent/activity` | GET | Loan-activity series for the dashboard chart |
| `/api/loan/history` | GET | Borrower's loan history |
| `/api/attack` | POST | Run an adversarial attack, return the on-chain revert reason |
| `/api/experiment` | GET | 3-strategy underwriting comparison experiment |
| `/api/ab-comparison` | GET | A/B borrower comparison from live agent reputation + tier ladder |
| `/api/status` | GET | Latest Attestcoin verification status (queried from CC3 Testnet) |
| `/api/demo/trigger-default` | POST | Force a loan into Defaulted state (demo convenience for the writability path) |

## Design principles

1. **Evidence before intelligence** — the AI receives verified facts, not arbitrary claims.
2. **Policy before capital** — the AI cannot define its own risk envelope.
3. **Outcomes before reputation** — the agent's track record is derived from on-chain outcomes.
4. **Cryptography before trust** — cross-chain claims are proven rather than asserted.
5. **Failure should reduce authority** — bad outcomes reduce the AI's ability to control capital.

## 30-second technical summary

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (React 19, Tailwind, shadcn/ui) |
| Agent | Node.js + TypeScript worker |
| AI | LLM with structured decision output (`decide()`) |
| Execution | Creditcoin CC3 Testnet |
| Cross-chain evidence | Attestcoin / BlockProver precompile |
| Source chain | Ethereum Sepolia |
| Contracts | Solidity 0.8.24 |
| Capital | ERC-20 LiquidityPool (MockUSDC, 6 decimals) |
| Accountability | AgentReputation + BorrowerReputation |
| State | Prisma (SQLite) for off-chain cache |

---

## Run locally

### Quick mode (no setup)

Open the [live app](https://mira-credit-agent.vercel.app) — connect the "Verified Sepolia wallet" to see real Attestcoin-verified data.

### Developer mode

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
#   fill in CREDITCOIN_PRIVATE_KEY (funded CC3 wallet) + contract addresses

# 3. Validate the Attestcoin integration end-to-end
bun run worker:validate

# 4. Start the frontend
bun run dev
```

### Repository layout

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

### Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start the Next.js frontend (port 3000) |
| `bun run lint` | Lint the whole monorepo |
| `bun run worker:validate` | Attestcoin end-to-end feasibility check |
| `bun run contracts:compile` | Compile the Solidity contracts (solc) |
| `bun run contracts:redeploy-loan` | Redeploy only the Loan contract (preserves reputation + pool state) |
| `bun run contracts:repay-with-proof` | Run a real proof-verified repayment on CC3 Testnet |
| `bun run contracts:deploy` | Deploy all contracts to CC3 Testnet |

### Environment variables

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

---

## The feedback loop

```
      VERIFIED EVIDENCE
             ↓
          AI DECISION
             ↓
       ON-CHAIN POLICY
             ↓
       CAPITAL DEPLOYED
             ↓
      VERIFIED OUTCOME
             ↓
       AGENT REPUTATION
             ↓
     CAPITAL AUTHORITY
             │
             └──────────→ next AI decision
```

**That loop is MIRA.**

Attestcoin provides the **truth about external events**. Creditcoin provides the **execution and enforcement layer**. The LLM provides the **intelligence**. AgentReputation provides the **accountability**. And the feedback loop turns all four into something much bigger: an AI that controls capital must earn the right to control more of it.

---

## License

MIT — see [LICENSE](./LICENSE).

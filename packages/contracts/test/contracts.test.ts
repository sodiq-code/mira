import { expect } from 'chai';
import { ethers, type Wallet } from 'ethers';
import { setupTestEnv, deployContract, expectRevert, sendTx, syncNonce } from './helpers.js';

/**
 * MIRA smart contract test suite.
 *
 * Validates:
 *   - Policy validation: in-bounds accepted, out-of-bounds rejected
 *     + agent-authority tier ladder (score → capital limit)
 *     + liquidity check
 *   - Loan origination: real ERC-20 tokens move from pool to borrower
 *   - Loan repayment: real ERC-20 tokens move from borrower back to pool
 *   - Loan default: status = Defaulted, writability hash stored
 *   - Agent reputation: score formula + auto-pause on serious failure
 *   - LiquidityPool: real token custody, available(), utilization()
 */

const MAX_LOAN = 250_000n;  // $2,500
const MIN_RATE = 500n;
const MAX_RATE = 2500n;
const TERMS = [7n, 30n, 90n];

let deployer: Wallet, other: Wallet;
let policy: any, loan: any, agentRep: any, borrowerRep: any, pool: any, token: any;

before(async () => {
  const env = await setupTestEnv();
  deployer = env.deployer;
  other = env.other;

  // Deploy the ERC-20 lending token first.
  token = await deployContract('MockUSDC', deployer);

  // Deploy contracts. The agent starts at BASE_SCORE=500, which maps to
  // tier cap $25 (2,500 cents). We set maxLoanAmount high ($2,500) so
  // the tier ladder is the binding constraint, not the global cap.
  policy = await deployContract('Policy', deployer, deployer.address, deployer.address, MAX_LOAN, MIN_RATE, MAX_RATE, TERMS);
  agentRep = await deployContract('AgentReputation', deployer, deployer.address);
  borrowerRep = await deployContract('BorrowerReputation', deployer, deployer.address);
  pool = await deployContract('LiquidityPool', deployer, deployer.address, deployer.address, await token.getAddress());
  loan = await deployContract('Loan', deployer, deployer.address, deployer.address, await policy.getAddress(), await agentRep.getAddress(), await borrowerRep.getAddress(), await pool.getAddress());

  // Wire cross-contract dependencies.
  await sendTx(agentRep, 'setLoanContract', await loan.getAddress());
  await sendTx(agentRep, 'setPolicyContract', await policy.getAddress());
  await sendTx(borrowerRep, 'setLoanContract', await loan.getAddress());
  await sendTx(pool, 'setLoanContract', await loan.getAddress());
  await sendTx(policy, 'setDependencies', await agentRep.getAddress(), await borrowerRep.getAddress(), await pool.getAddress());

  // Mint real tokens and deposit into the pool.
  // $10,000 = 1,000,000 cents = 10,000,000,000 token units (6 decimals)
  const depositAmount = 1_000_000n; // cents
  const tokenAmount = depositAmount * 10_000n; // 6 decimals
  await sendTx(token, 'mint', deployer.address, tokenAmount);
  await sendTx(token, 'approve', await pool.getAddress(), tokenAmount);
  await sendTx(pool, 'deposit', depositAmount);
});

// ─── LiquidityPool ERC-20 custody ──────────────────────────────────────

describe('LiquidityPool (ERC-20 custody)', () => {
  it('holds real tokens after deposit', async () => {
    const bal = await pool.poolTokenBalance();
    expect(bal).to.equal(10_000_000_000n); // $10,000 in 6-decimal units
  });

  it('reports available capital in cents', async () => {
    expect(await pool.available()).to.equal(1_000_000n); // $10,000 in cents
  });

  it('reports utilization at 0% with no outstanding loans', async () => {
    expect(await pool.utilization()).to.equal(0n);
  });
});

// ─── Policy validation + agent-authority tier ladder ───────────────────

describe('Policy.validateDecision + agent-authority', () => {
  it('accepts an in-bounds decision within the agent tier cap ($25)', async () => {
    // Agent score is 500 (BASE_SCORE, no loans yet) → tier cap $25 = 2,500 cents
    expect(await agentRep.currentScore()).to.equal(500n);
    expect(await policy.agentTierCap(500n)).to.equal(2_500n);

    const ok = await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 2_500n, rate: 1200n, term: 30n, nonce: 0, expiresAtBlock: 0, evidenceHash: ethers.id('ev'),
    });
    expect(ok).to.be.true;
  });

  it('rejects a decision above the agent tier cap ($500 > $25 cap)', async () => {
    // $500 = 50,000 cents, but the agent tier cap at score 500 is $25 = 2,500 cents
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 50_000n, rate: 1200n, term: 30n, nonce: 0, expiresAtBlock: 0, evidenceHash: ethers.id('ev'),
    })).to.be.false;
  });

  it('rejects amount above the global cap', async () => {
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: MAX_LOAN + 1n, rate: 1200n, term: 30n, nonce: 0, expiresAtBlock: 0, evidenceHash: ethers.id('ev'),
    })).to.be.false;
  });

  it('rejects rate below the floor', async () => {
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 2_500n, rate: MIN_RATE - 1n, term: 30n, nonce: 0, expiresAtBlock: 0, evidenceHash: ethers.id('ev'),
    })).to.be.false;
  });

  it('rejects a disallowed term', async () => {
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 2_500n, rate: 1200n, term: 14n, nonce: 0, expiresAtBlock: 0, evidenceHash: ethers.id('ev'),
    })).to.be.false;
  });

  it('rejects all decisions when paused', async () => {
    await sendTx(policy, 'setPaused', true);
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 2_500n, rate: 1200n, term: 30n, nonce: 0, expiresAtBlock: 0, evidenceHash: ethers.id('ev'),
    })).to.be.false;
    await sendTx(policy, 'setPaused', false);
  });
});

// ─── Loan lifecycle with real token transfers ─────────────────────────

describe('Loan lifecycle (real capital)', () => {
  it('originates a loan and moves real tokens to the borrower', async () => {
    const borrower = other.address;
    const loanAmount = 2_500n; // $25 (within tier cap)

    const borrowerBalBefore = await token.balanceOf(borrower);
    const poolBalBefore = await pool.poolTokenBalance();

    const receipt = await sendTx(loan, 'originate', borrower, loanAmount, 1200n, 30n, ethers.id('r1'), ethers.id('p1'), [ethers.id('f1'), ethers.id('f2'), ethers.id('f3')]);

    const event = receipt!.logs.find((l: any) => {
      try { return loan.interface.parseLog(l)?.name === 'LoanOriginated'; } catch { return false; }
    });
    expect(event).to.not.be.undefined;
    expect(await loan.status(1n)).to.equal(1n); // Originated

    // Real tokens moved: borrower received, pool sent
    const borrowerBalAfter = await token.balanceOf(borrower);
    const poolBalAfter = await pool.poolTokenBalance();
    expect(borrowerBalAfter - borrowerBalBefore).to.equal(loanAmount * 10_000n); // 6 decimals
    expect(poolBalBefore - poolBalAfter).to.equal(loanAmount * 10_000n);

    expect(await agentRep.cumulativeLoans()).to.equal(1n);
  });

  it('reverts on a decision above the agent tier cap', async () => {
    await expectRevert(
      loan.originate.staticCall(other.address, 50_000n, 1200n, 30n, ethers.id('r'), ethers.id('p'), [ethers.id('f1')]),
      'Loan: decision violates policy',
    );
  });

  it('reverts when a non-worker calls originate', async () => {
    await expectRevert(
      loan.connect(other).originate.staticCall(other.address, 2_500n, 1200n, 30n, ethers.id('r'), ethers.id('p'), [ethers.id('f1')]),
      'Loan: caller is not worker',
    );
  });

  it('marks a loan repaid and moves real tokens back to the pool', async () => {
    const borrower = other.address;
    const loanAmount = 2_500n;

    // Borrower must approve the pool to pull repayment tokens.
    await sendTx(token.connect(other), 'approve', await pool.getAddress(), loanAmount * 10_000n);

    const borrowerBalBefore = await token.balanceOf(borrower);
    const poolBalBefore = await pool.poolTokenBalance();

    const receipt = await sendTx(loan, 'markRepaid', 1n, ethers.id('rp1'));
    const event = receipt!.logs.find((l: any) => {
      try { return loan.interface.parseLog(l)?.name === 'LoanRepaid'; } catch { return false; }
    });
    expect(event).to.not.be.undefined;
    expect(await loan.status(1n)).to.equal(2n); // Repaid

    // Real tokens moved back: borrower sent, pool received
    const borrowerBalAfter = await token.balanceOf(borrower);
    const poolBalAfter = await pool.poolTokenBalance();
    expect(borrowerBalBefore - borrowerBalAfter).to.equal(loanAmount * 10_000n);
    expect(poolBalAfter - poolBalBefore).to.equal(loanAmount * 10_000n);

    expect(await agentRep.cumulativeRepaid()).to.equal(1n);
    const [repaid, defaulted] = await borrowerRep.getReputation(borrower);
    expect(repaid).to.equal(1n);
    expect(defaulted).to.equal(0n);

    // Originate a third loan that stays Originated for the
    // markRepaidWithProof test below. The score is now 510 (500 + 10),
    // so the $25 tier cap still permits a $25 origination.
    await sendTx(loan, 'originate', other.address, 2_500n, 1200n, 30n, ethers.id('r3'), ethers.id('p3'), [ethers.id('f1'), ethers.id('f2'), ethers.id('f3')]);
  });

  it('marks a loan defaulted after the due block', async () => {
    // loanId 3 (loan 2 was originated above and kept Originated).
    await sendTx(loan, 'originate', other.address, 2_500n, 1500n, 7n, ethers.id('r2'), ethers.id('p2'), [ethers.id('f1'), ethers.id('f2')]);
    await advancePastDueBlock(loan, 3n);
    const receipt = await sendTx(loan, 'markDefaulted', 3n, ethers.id('w2'));
    const event = receipt!.logs.find((l: any) => {
      try { return loan.interface.parseLog(l)?.name === 'LoanDefaulted'; } catch { return false; }
    });
    expect(event).to.not.be.undefined;
    expect(await loan.status(3n)).to.equal(3n); // Defaulted
    expect(await agentRep.cumulativeDefaulted()).to.equal(1n);
  });
});

// ─── Agent reputation score + tier progression ─────────────────────────

describe('AgentReputation score + tier ladder', () => {
  it('reports score=485 after 1 repaid + 1 defaulted (500+10-25=485)', async () => {
    // After the lifecycle tests: 3 loans (1 repaid, 1 still Originated, 1 defaulted)
    // score = 500 + 1*10 - 1*25 = 485 (origination does not change the score)
    expect(await agentRep.cumulativeLoans()).to.equal(3n);
    expect(await agentRep.cumulativeRepaid()).to.equal(1n);
    expect(await agentRep.cumulativeDefaulted()).to.equal(1n);
    expect(await agentRep.currentScore()).to.equal(485n);
  });

  it('tier ladder maps score → capital limit correctly', async () => {
    // 485 < 500 → cannot lend (the agent has dropped below the base score
    // after one default — it must earn back trust through repayments)
    expect(await policy.agentTierCap(485n)).to.equal(0n);       // cannot lend
    expect(await policy.agentTierCap(499n)).to.equal(0n);       // cannot lend
    expect(await policy.agentTierCap(500n)).to.equal(2_500n);   // $25
    expect(await policy.agentTierCap(649n)).to.equal(2_500n);   // $25
    expect(await policy.agentTierCap(650n)).to.equal(10_000n);  // $100
    expect(await policy.agentTierCap(749n)).to.equal(10_000n);  // $100
    expect(await policy.agentTierCap(750n)).to.equal(50_000n);  // $500
    expect(await policy.agentTierCap(849n)).to.equal(50_000n);  // $500
    expect(await policy.agentTierCap(850n)).to.equal(250_000n); // $2,500
    expect(await policy.agentTierCap(1000n)).to.equal(250_000n); // $2,500
  });

  it('borrower tier ladder maps repaid count → capital limit', async () => {
    // A first-time borrower (0 repaid) is capped at $25.
    expect(await policy.borrowerTierCap(0n)).to.equal(2_500n);   // $25 — first-time
    expect(await policy.borrowerTierCap(1n)).to.equal(5_000n);   // $50 — one good loan
    expect(await policy.borrowerTierCap(2n)).to.equal(10_000n);  // $100 — building trust
    expect(await policy.borrowerTierCap(3n)).to.equal(10_000n);  // $100
    expect(await policy.borrowerTierCap(4n)).to.equal(20_000n);  // $200 — established
    expect(await policy.borrowerTierCap(6n)).to.equal(20_000n);  // $200
    expect(await policy.borrowerTierCap(7n)).to.equal(50_000n);  // $500 — trusted borrower
    expect(await policy.borrowerTierCap(100n)).to.equal(50_000n); // $500
  });

  it('effective borrower cap is the min of agent and borrower tier', async () => {
    // Agent score is 485 (< 500) → agent cap $0. Borrower has 1 repaid
    // → borrower cap $50. Effective = min($0, $50) = $0 (agent blocks).
    expect(await policy.effectiveBorrowerCap(deployer.address)).to.equal(0n);

    // The "other" wallet has no MIRA history (0 repaid) → borrower cap $25.
    // Agent cap is $0 (score 485) → effective $0.
    expect(await policy.effectiveBorrowerCap(other.address)).to.equal(0n);
  });

  it('rejects a decision with a zero evidence hash', async () => {
    // evidenceHash == bytes32(0) → rejected (no evidence)
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 2_500n, rate: 1200n, term: 30n,
      nonce: 0, expiresAtBlock: 0, evidenceHash: ethers.ZeroHash,
    })).to.be.false;
  });

  it('rejects a decision past its expiry block', async () => {
    // expiresAtBlock = 1 (long past) → rejected (stale)
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 2_500n, rate: 1200n, term: 30n,
      nonce: 0, expiresAtBlock: 1, evidenceHash: ethers.id('ev'),
    })).to.be.false;
  });
});

// ─── On-chain proof verification (markRepaidWithProof) ────────────────

describe('Loan.markRepaidWithProof (on-chain verification)', () => {
  it('reverts when the on-chain proof verification fails', async () => {
    // loanId 2 was originated in the lifecycle test above and is still
    // Originated (it was neither repaid nor defaulted).
    //
    // The BlockProver precompile (0x…0FD2) does not exist on the local
    // Hardhat node. The contract's verifySingle CALL to that address
    // therefore reverts, which propagates up and fails the whole
    // markRepaidWithProof transaction. This proves the contract DOES
    // invoke the precompile and DOES NOT skip verification — on CC3
    // Testnet the precompile exists and returns false for a fabricated
    // proof, triggering the explicit "Loan: Attestcoin proof
    // verification failed" require; on Hardhat the absent precompile
    // makes the CALL itself revert. Either way, a fabricated proof can
    // never mark a loan repaid.
    const merkleProof = {
      root: ethers.id('fake-root'),
      siblings: [{ hash: ethers.id('fake-sibling'), isLeft: true }],
    };
    const continuityProof = {
      lowerEndpointDigest: ethers.id('fake-endpoint'),
      roots: [ethers.id('fake-root-1')],
    };

    let reverted = false;
    try {
      await loan.markRepaidWithProof.staticCall(
        2n,
        ethers.id('fake-proof-hash'),
        1n,
        '0xdeadbeef',
        merkleProof,
        continuityProof,
      );
    } catch {
      reverted = true;
    }
    expect(reverted).to.be.true;
  });

  it('reverts when the loan does not exist', async () => {
    const merkleProof = {
      root: ethers.id('fake-root'),
      siblings: [],
    };
    const continuityProof = {
      lowerEndpointDigest: ethers.id('fake-endpoint'),
      roots: [],
    };

    // A non-existent loan is rejected before the precompile is even called.
    await expectRevert(
      loan.markRepaidWithProof.staticCall(
        9_999n,
        ethers.id('fake-proof-hash'),
        1n,
        '0xdeadbeef',
        merkleProof,
        continuityProof,
      ),
      'Loan: loan does not exist',
    );
  });

  it('stores per-factor proof hashes at origination', async () => {
    // Loan #1 was originated with 3 factor proof hashes: f1, f2, f3.
    const proofs = await loan.getFactorProofs(1n);
    expect(proofs.length).to.equal(3);
    expect(proofs[0]).to.equal(ethers.id('f1'));
    expect(proofs[1]).to.equal(ethers.id('f2'));
    expect(proofs[2]).to.equal(ethers.id('f3'));
  });

  it('rejects worker-trusted markRepaid after lockToProductionMode', async () => {
    // Use loan #2 (originated at line 197, kept Originated for this test).
    // demoMode starts true. After governance calls lockToProductionMode,
    // markRepaid must revert — only markRepaidWithProof is accepted.
    expect(await loan.demoMode()).to.be.true;
    expect(await loan.status(2n)).to.equal(1n); // Originated

    // Lock to production mode (governance = deployer).
    await sendTx(loan, 'lockToProductionMode');
    expect(await loan.demoMode()).to.be.false;

    // markRepaid must now revert — the escape hatch is closed.
    await expectRevert(
      loan.markRepaid.staticCall(2n, ethers.id('fake-proof')),
      'Loan: worker-trusted repayment rejected in production mode',
    );
  });
});

// ─── Auto-pause on serious failure ────────────────────────────────────

describe('AgentReputation auto-pause', () => {
  it('auto-pauses Policy when defaults reach the threshold', async () => {
    // Current defaults: 1 (from the lifecycle test). The agent's score is
    // 485 (< 500), so it cannot originate new loans. We simulate 4 more
    // defaults by calling recordDefaulted directly — the worker is
    // authorized to do this, and in production the default-detector would
    // call it when due blocks pass on existing loans.
    expect(await agentRep.cumulativeDefaulted()).to.equal(1n);

    for (let i = 0; i < 4; i++) {
      await sendTx(agentRep, 'recordDefaulted', 100n + BigInt(i));
    }

    expect(await agentRep.cumulativeDefaulted()).to.equal(5n);
    expect(await agentRep.autoPaused()).to.be.true;
    expect(await policy.paused()).to.be.true;
  });

  it('rejects all decisions while auto-paused', async () => {
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 2_500n, rate: 1200n, term: 30n, nonce: 0, expiresAtBlock: 0, evidenceHash: ethers.id('ev'),
    })).to.be.false;
  });
});

// ─── Helper ────────────────────────────────────────────────────────────

async function advancePastDueBlock(loan: ethers.Contract, loanId: bigint) {
  const loanData = await loan.getLoan(loanId);
  const dueBlock = loanData.dueBlock;
  const wallet = loan.runner as Wallet;
  const currentBlock = await wallet.provider!.getBlockNumber();
  const blocksToMine = Number(dueBlock) - currentBlock + 1;
  if (blocksToMine > 0) {
    await wallet.provider!.send('hardhat_mine', [ethers.toQuantity(blocksToMine)]);
  }
}

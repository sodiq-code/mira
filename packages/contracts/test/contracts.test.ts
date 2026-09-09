import { expect } from 'chai';
import { ethers, type Wallet } from 'ethers';
import { setupTestEnv, deployContract, expectRevert, sendTx, syncNonce } from './helpers.js';

/**
 * MIRA smart contract test suite.
 *
 * Validates the blueprint's validation plan components for this task:
 *   - Policy validation: in-bounds accepted, out-of-bounds rejected
 *   - Loan origination: LoanOriginated event emitted, status = Originated
 *   - Loan repayment: status = Repaid, AgentReputation.repaid incremented
 *   - Loan default: status = Defaulted, writability hash stored
 *   - Agent reputation: after 5 loans (3 repaid, 2 defaulted): score=480
 *
 * All state-changing txs use sendTx() with explicit nonce + legacy tx type
 * to work around an ethers v6 + Hardhat v3 EIP-1559 nonce-tracking issue.
 * Revert tests use .staticCall (no nonce consumed). Block advancement uses
 * hardhat_mine (no nonce consumed).
 */

const MAX_LOAN = 100000n;
const MIN_RATE = 500n;
const MAX_RATE = 2500n;
const TERMS = [7n, 30n, 90n];

let deployer: Wallet, other: Wallet;
let policy: any, loan: any, agentRep: any, borrowerRep: any, pool: any;

before(async () => {
  const env = await setupTestEnv();
  deployer = env.deployer;
  other = env.other;

  policy = await deployContract('Policy', deployer, deployer.address, deployer.address, MAX_LOAN, MIN_RATE, MAX_RATE, TERMS);
  agentRep = await deployContract('AgentReputation', deployer, deployer.address);
  borrowerRep = await deployContract('BorrowerReputation', deployer, deployer.address);
  pool = await deployContract('LiquidityPool', deployer, deployer.address, deployer.address);
  loan = await deployContract('Loan', deployer, deployer.address, await policy.getAddress(), await agentRep.getAddress(), await borrowerRep.getAddress());

  await sendTx(agentRep, 'setLoanContract', await loan.getAddress());
  await sendTx(borrowerRep, 'setLoanContract', await loan.getAddress());
  await sendTx(pool, 'deposit', 1_000_000n);
});

// ─── Policy validation ─────────────────────────────────────────────────────

describe('Policy.validateDecision', () => {
  it('accepts an in-bounds decision', async () => {
    const ok = await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 50000n, rate: 1200n, term: 30n,
    });
    expect(ok).to.be.true;
  });

  it('rejects amount above the cap', async () => {
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: MAX_LOAN + 1n, rate: 1200n, term: 30n,
    })).to.be.false;
  });

  it('rejects amount of zero', async () => {
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 0n, rate: 1200n, term: 30n,
    })).to.be.false;
  });

  it('rejects rate below the floor', async () => {
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 50000n, rate: MIN_RATE - 1n, term: 30n,
    })).to.be.false;
  });

  it('rejects rate above the ceiling', async () => {
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 50000n, rate: MAX_RATE + 1n, term: 30n,
    })).to.be.false;
  });

  it('accepts the boundary rates (min and max)', async () => {
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 50000n, rate: MIN_RATE, term: 30n,
    })).to.be.true;
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 50000n, rate: MAX_RATE, term: 30n,
    })).to.be.true;
  });

  it('rejects a disallowed term', async () => {
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 50000n, rate: 1200n, term: 14n,
    })).to.be.false;
  });

  it('accepts each allowed term', async () => {
    for (const term of TERMS) {
      expect(await policy.validateDecision.staticCall({
        borrower: deployer.address, amount: 50000n, rate: 1200n, term,
      }), `term ${term}`).to.be.true;
    }
  });

  it('rejects all decisions when paused', async () => {
    await sendTx(policy, 'setPaused', true);
    expect(await policy.validateDecision.staticCall({
      borrower: deployer.address, amount: 50000n, rate: 1200n, term: 30n,
    })).to.be.false;
    await sendTx(policy, 'setPaused', false);
  });

  it('allows governance to update bounds and emits PolicyUpdated', async () => {
    const receipt = await sendTx(policy, 'updateBounds', 200000n, 600n, 2000n, [7n, 14n, 30n]);
    const event = receipt!.logs.find((l: any) => {
      try { return policy.interface.parseLog(l)?.name === 'PolicyUpdated'; } catch { return false; }
    });
    expect(event).to.not.be.undefined;
    expect(await policy.maxLoanAmount()).to.equal(200000n);
  });

  it('reverts when a non-governance caller updates bounds', async () => {
    await expectRevert(
      policy.connect(other).updateBounds.staticCall(200000n, 600n, 2000n, [7n]),
      'Policy: caller is not governance',
    );
  });
});

// ─── Loan lifecycle ────────────────────────────────────────────────────────

describe('Loan lifecycle', () => {
  it('originates a valid loan and emits LoanOriginated', async () => {
    const receipt = await sendTx(loan, 'originate', other.address, 50000n, 1200n, 30n, ethers.id('r1'), ethers.id('p1'));
    const event = receipt!.logs.find((l: any) => {
      try { return loan.interface.parseLog(l)?.name === 'LoanOriginated'; } catch { return false; }
    });
    expect(event).to.not.be.undefined;
    expect(await loan.status(1n)).to.equal(1n);
    expect(await agentRep.cumulativeLoans()).to.equal(1n);
  });

  it('reverts on an out-of-bounds rate', async () => {
    await expectRevert(
      loan.originate.staticCall(other.address, 50000n, 3000n, 30n, ethers.id('r'), ethers.id('p')),
      'Loan: decision violates policy',
    );
  });

  it('reverts on an out-of-bounds amount', async () => {
    await expectRevert(
      loan.originate.staticCall(other.address, 200000n, 1200n, 30n, ethers.id('r'), ethers.id('p')),
      'Loan: decision violates policy',
    );
  });

  it('reverts on a disallowed term', async () => {
    await expectRevert(
      loan.originate.staticCall(other.address, 50000n, 1200n, 14n, ethers.id('r'), ethers.id('p')),
      'Loan: decision violates policy',
    );
  });

  it('reverts when a non-worker calls originate', async () => {
    await expectRevert(
      loan.connect(other).originate.staticCall(other.address, 50000n, 1200n, 30n, ethers.id('r'), ethers.id('p')),
      'Loan: caller is not worker',
    );
  });

  it('marks a loan repaid and increments reputation', async () => {
    const receipt = await sendTx(loan, 'markRepaid', 1n, ethers.id('rp1'));
    const event = receipt!.logs.find((l: any) => {
      try { return loan.interface.parseLog(l)?.name === 'LoanRepaid'; } catch { return false; }
    });
    expect(event).to.not.be.undefined;
    expect(await loan.status(1n)).to.equal(2n);
    const [repaid, defaulted] = await borrowerRep.getReputation(other.address);
    expect(repaid).to.equal(1n);
    expect(defaulted).to.equal(0n);
    expect(await agentRep.cumulativeRepaid()).to.equal(1n);
  });

  it('reverts when marking an already-repaid loan', async () => {
    await expectRevert(
      loan.markRepaid.staticCall(1n, ethers.id('p')),
      'Loan: not originated',
    );
  });

  it('reverts before the due block is reached', async () => {
    await sendTx(loan, 'originate', other.address, 30000n, 1500n, 7n, ethers.id('r2'), ethers.id('p2'));
    await expectRevert(
      loan.markDefaulted.staticCall(2n, ethers.id('w')),
      'Loan: due block not reached',
    );
  });

  it('marks a loan defaulted after the due block and stores the writability hash', async () => {
    await advancePastDueBlock(loan, 2n);
    const receipt = await sendTx(loan, 'markDefaulted', 2n, ethers.id('w2'));
    const event = receipt!.logs.find((l: any) => {
      try { return loan.interface.parseLog(l)?.name === 'LoanDefaulted'; } catch { return false; }
    });
    expect(event).to.not.be.undefined;
    expect(await loan.status(2n)).to.equal(3n);
    expect(await agentRep.cumulativeDefaulted()).to.equal(1n);
  });
});

// ─── Agent reputation score (validation plan target) ───────────────────────

describe('AgentReputation score', () => {
  it('reports cumulativeLoans=5, repaid=3, defaulted=2, score=480 after 5 loans', async () => {
    const borrower = other.address;

    await sendTx(loan, 'originate', borrower, 20000n, 1000n, 7n, ethers.id('r3'), ethers.id('p3'));
    await sendTx(loan, 'markRepaid', 3n, ethers.id('rp3'));
    await sendTx(loan, 'originate', borrower, 20000n, 1000n, 7n, ethers.id('r4'), ethers.id('p4'));
    await sendTx(loan, 'markRepaid', 4n, ethers.id('rp4'));
    await sendTx(loan, 'originate', borrower, 20000n, 1000n, 7n, ethers.id('r5'), ethers.id('p5'));
    await advancePastDueBlock(loan, 5n);
    await sendTx(loan, 'markDefaulted', 5n, ethers.id('w5'));

    expect(await agentRep.cumulativeLoans()).to.equal(5n);
    expect(await agentRep.cumulativeRepaid()).to.equal(3n);
    expect(await agentRep.cumulativeDefaulted()).to.equal(2n);
    // score = 500 + 3*10 - 2*25 = 480
    expect(await agentRep.currentScore()).to.equal(480n);
  });
});

// ─── Helper ────────────────────────────────────────────────────────────────

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

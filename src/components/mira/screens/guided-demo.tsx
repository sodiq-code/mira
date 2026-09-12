'use client';

/**
 * Guided Demo — the 11-step real borrower flow with a visible step indicator.
 *
 * This screen presents the complete MIRA flow as a guided walkthrough:
 * each step has a number, a title, a description, and a "what to look for"
 * callout. The step indicator at the top shows progress.
 *
 * Steps:
 *  1. Connect wallet
 *  2. MIRA discovers verified Sepolia activity
 *  3. Attestcoin verifies the activity on-chain
 *  4. MIRA builds a verified credit profile
 *  5. AI proposes loan terms
 *  6. On-chain Policy independently validates
 *  7. Real ERC-20 tokens move from pool to borrower
 *  8. Borrower repays
 *  9. Attestcoin verifies the repayment
 * 10. MIRA's reputation changes
 * 11. MIRA's future lending authority changes
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet,
  Search,
  ShieldCheck,
  FileText,
  Brain,
  ShieldX,
  Coins,
  ArrowRight,
  RotateCcw,
  TrendingUp,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMiraStore } from '@/lib/mira/store-client';
import { cn } from '@/lib/utils';

interface EvidenceLink {
  label: string;
  href: string;
}

interface DemoStep {
  num: number;
  title: string;
  description: string;
  lookFor: string;
  icon: typeof Wallet;
  tone: 'amber' | 'emerald' | 'blue';
  evidence?: EvidenceLink[];
}

const CC3_TX = (h: string) => `https://creditcoin-testnet.blockscout.com/tx/${h}`;
const CC3_ADDR = (a: string) => `https://creditcoin-testnet.blockscout.com/address/${a}`;
const SEPOLIA_TX = (h: string) => `https://sepolia.etherscan.io/tx/${h}`;

const STEPS: DemoStep[] = [
  {
    num: 1,
    title: 'Connect wallet',
    description: 'A borrower connects an Ethereum Sepolia wallet. No paperwork, no off-chain identity — just a signed address.',
    lookFor: 'The wallet address appears in the header. No personal data is collected.',
    icon: Wallet,
    tone: 'amber',
    evidence: [
      { label: 'Verified borrower wallet', href: 'https://sepolia.etherscan.io/address/0xB47Ba223B73980E69AEF53B0d202F9785698DAEa' },
    ],
  },
  {
    num: 2,
    title: 'MIRA discovers verified activity',
    description: 'The worker fetches the wallet\'s recent Sepolia transactions — stablecoin transfers, DeFi interactions, wallet age.',
    lookFor: 'The verified-factors screen shows real transaction counts and stablecoin volume.',
    icon: Search,
    tone: 'blue',
  },
  {
    num: 3,
    title: 'Attestcoin verifies on-chain',
    description: 'Each transaction is proven via the Attestcoin ProofBuilder and verified by the BlockProver precompile on CC3 Testnet. A borrower cannot claim activity they did not produce.',
    lookFor: 'Each factor has an "Attestcoin-verified" badge with a clickable proof tx hash.',
    icon: ShieldCheck,
    tone: 'emerald',
    evidence: [
      { label: 'TransactionVerified event (CC3)', href: CC3_TX('0xa685eb0eb5fdcbeaae86655acaf8339d3662ecaa31933e31918d3b5fb88bde31') },
    ],
  },
  {
    num: 4,
    title: 'MIRA builds a verified credit profile',
    description: 'The verified transactions are aggregated into a feature vector: wallet age, 90-day tx count, stablecoin volume, DeFi positions, prior MIRA history.',
    lookFor: 'The feature vector is all numbers — no free-text the LLM could be manipulated with.',
    icon: FileText,
    tone: 'blue',
  },
  {
    num: 5,
    title: 'AI proposes loan terms',
    description: 'The bounded LLM receives the verified feature vector and proposes a decision: approve, approve-reduced, or decline. The LLM has no tools, no internet, no actions — it can only output JSON.',
    lookFor: 'The decision screen shows the agent\'s reasoning in its own voice (amber box).',
    icon: Brain,
    tone: 'amber',
  },
  {
    num: 6,
    title: 'On-chain Policy independently validates',
    description: 'The Policy contract checks the decision against: tier cap, rate bounds, allowed terms, liquidity, paused state. The AI proposes — the Policy disposes.',
    lookFor: 'The audit trail shows each Policy check marked ✓. A malicious LLM output is rejected.',
    icon: ShieldX,
    tone: 'emerald',
    evidence: [
      { label: 'Policy contract (CC3)', href: CC3_ADDR('0x684b9a5bB7aC7923B15E7D490078db5c21317986') },
    ],
  },
  {
    num: 7,
    title: 'Real ERC-20 tokens move',
    description: 'Loan.originate() calls LiquidityPool.fundLoan() — real USDC tokens transfer from the pool to the borrower. Not a counter increment — a real on-chain transfer.',
    lookFor: 'The CC3 Testnet explorer shows the token transfer transaction.',
    icon: Coins,
    tone: 'emerald',
    evidence: [
      { label: 'Proof-verified loan origination (CC3)', href: CC3_TX('0x9583b1421250f982af640b9c7307ebfbe312e384ad864edb3549b549bc172bd2') },
      { label: 'LiquidityPool contract (CC3)', href: CC3_ADDR('0xf0F43bc997eC44e26492C0c3E8B2e05e22f205EB') },
    ],
  },
  {
    num: 8,
    title: 'Borrower repays',
    description: 'The borrower sends the repayment amount back. The worker detects the repayment transaction on Sepolia.',
    lookFor: 'The "Mark loan repaid" button triggers the repayment flow.',
    icon: RotateCcw,
    tone: 'amber',
  },
  {
    num: 9,
    title: 'Attestcoin verifies the repayment',
    description: 'The worker generates an Attestcoin proof for the repayment transaction and the Loan contract ITSELF calls the BlockProver precompile to verify it on-chain. A compromised worker key cannot fabricate a repayment.',
    lookFor: 'The Loan contract\'s markRepaidWithProof calls the BlockProver precompile directly — the contract verifies, not the worker.',
    icon: ShieldCheck,
    tone: 'emerald',
    evidence: [
      { label: 'Proof-verified repayment tx (CC3)', href: CC3_TX('0x428e450e24b987be33266443fa4109c53898fa9a0d1f0749c6f9c53d173a5daf') },
      { label: 'Sepolia tx proven (Etherscan)', href: SEPOLIA_TX('0xedd21116c18c96bff741f6545442b92ccb4f9fff42cb37df3e1aa22c1b10733c') },
    ],
  },
  {
    num: 10,
    title: 'MIRA\'s reputation changes',
    description: 'AgentReputation.recordRepaid() increments cumulativeRepaid and adds +10 to the score. The update is atomic — same transaction as the repayment verification.',
    lookFor: 'The reputation dashboard shows the new score and the +10 delta.',
    icon: TrendingUp,
    tone: 'emerald',
    evidence: [
      { label: 'AgentReputation contract (CC3)', href: CC3_ADDR('0x09328398FC0D4a78b22fC6470412Ca13ac5A21f0') },
    ],
  },
  {
    num: 11,
    title: 'MIRA\'s future lending authority changes',
    description: 'The score determines the agent\'s capital authority via the tier ladder. Score 650+ unlocks $100; score 750+ unlocks $500. A default lowers the score and shrinks the authority. The agent earns and loses the right to manage capital.',
    lookFor: 'The capital authority card on the dashboard shows the current tier and the next threshold.',
    icon: TrendingUp,
    tone: 'emerald',
    evidence: [
      { label: 'Loan contract (CC3)', href: CC3_ADDR('0x239E3f87192fC63E8e58688C07f2b6406B9A83a8') },
    ],
  },
];

export function GuidedDemo() {
  const { setView } = useMiraStore();
  const [currentStep, setCurrentStep] = useState(0);

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  const isFirst = currentStep === 0;
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const toneClass = {
    amber: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    blue: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Badge variant="outline" className="mb-4 border-emerald-500/40 bg-emerald-500/[0.04] text-emerald-600">
          Guided walkthrough
        </Badge>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          The complete MIRA flow, step by step
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Eleven steps from wallet connection to capital authority change. Every step involves a
          real on-chain transaction or cryptographic verification.
        </p>
      </motion.div>

      {/* Progress bar */}
      <div className="mt-8">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Step {currentStep + 1} of {STEPS.length}</span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
            initial={{ width: '0%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="mt-6"
        >
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <span className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border',
                  toneClass[step.tone],
                )}>
                  <step.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-muted-foreground">
                      {String(step.num).padStart(2, '0')}
                    </span>
                    <h2 className="text-lg font-semibold">{step.title}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>

                  {/* What to look for */}
                  <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                      What to look for
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{step.lookFor}</p>
                  </div>

                  {/* Real on-chain evidence */}
                  {step.evidence && step.evidence.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Verified on-chain
                      </p>
                      {step.evidence.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/[0.04]"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{link.label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => isFirst ? setView('landing') : setCurrentStep(s => s - 1)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isFirst ? 'Back to home' : 'Previous'}
        </Button>

        {/* Step dots */}
        <div className="hidden items-center gap-1.5 sm:flex">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === currentStep ? 'w-6 bg-emerald-500' : i < currentStep ? 'w-1.5 bg-emerald-400' : 'w-1.5 bg-muted',
              )}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {isLast ? (
          <Button onClick={() => setView('landing')}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Done
          </Button>
        ) : (
          <Button onClick={() => setCurrentStep(s => s + 1)}>
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Try it live */}
      {isLast && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="mt-8"
        >
          <Card className="border-emerald-500/30 bg-emerald-500/[0.02]">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-semibold text-emerald-600">Ready to see it live?</p>
                <p className="text-xs text-muted-foreground">Launch the actual borrower flow with real on-chain transactions.</p>
              </div>
              <Button onClick={() => setView('connect')}>
                Launch the live demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

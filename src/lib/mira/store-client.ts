/**
 * Client-side state for the MIRA borrower flow.
 *
 * The flow is a single linear state machine:
 *   landing → connect → factors → apply → decision → originated → (repay | default)
 * with the agent-reputation dashboard reachable from the nav at any time.
 *
 * Zustand keeps the whole flow in one store so any screen can read the
 * wallet, factors, decision, and current loan without prop drilling or a
 * server round-trip between steps. API responses are written straight into
 * the store; the UI is otherwise deterministic.
 */

import { create } from 'zustand';
import type {
  CreditCheckResponse,
  LoanApplyResponse,
  LoanRepayResponse,
  AgentReputationResponse,
  DemoTriggerDefaultResponse,
} from '@mira/shared';
import type { DemoProof } from '@/lib/mira/proofs';

export type FlowView =
  | 'landing'
  | 'connect'
  | 'factors'
  | 'apply'
  | 'decision'
  | 'originated'
  | 'reputation'
  | 'history'
  | 'attack'
  | 'experiment'
  | 'comparison'
  | 'guided';

export interface WalletState {
  address: string;
  mode: 'metamask' | 'demo';
  label?: string;
}

interface MiraState {
  view: FlowView;
  wallet: WalletState | null;

  // Credit check
  creditLoading: boolean;
  creditError: string | null;
  credit: CreditCheckResponse | null;
  proofs: DemoProof[];

  // Apply / decision
  applyLoading: boolean;
  applyPhase: 'idle' | 'proof' | 'verify' | 'decide' | 'done';
  applyError: string | null;
  decision: LoanApplyResponse | null;

  // Originated loan + lifecycle
  loan: {
    loanId: string;
    originTxHash: string;
    amount: number;
    rate: number;
    term: number;
    borrower: string;
    dueBlock: number;
    originatedBlock: number;
  } | null;
  repayLoading: boolean;
  repayResult: LoanRepayResponse | null;
  defaultLoading: boolean;
  defaultResult: DemoTriggerDefaultResponse | null;

  // Agent reputation (dashboard)
  reputation: AgentReputationResponse | null;
  reputationLoading: boolean;

  // ── Actions ───────────────────────────────────────────────────────────
  setView: (view: FlowView) => void;
  setWallet: (wallet: WalletState | null) => void;

  runCreditCheck: () => Promise<void>;
  runApply: (requestedAmount: number, requestedTermDays: number) => Promise<void>;
  setApplyPhase: (phase: MiraState['applyPhase']) => void;
  resetDecision: () => void;

  runRepay: () => Promise<void>;
  runTriggerDefault: () => Promise<void>;

  loadReputation: () => Promise<void>;

  resetFlow: () => void;
}

export const useMiraStore = create<MiraState>((set, get) => ({
  view: 'landing',
  wallet: null,

  creditLoading: false,
  creditError: null,
  credit: null,
  proofs: [],

  applyLoading: false,
  applyPhase: 'idle',
  applyError: null,
  decision: null,

  loan: null,
  repayLoading: false,
  repayResult: null,
  defaultLoading: false,
  defaultResult: null,

  reputation: null,
  reputationLoading: false,

  setView: (view) => set({ view }),
  setWallet: (wallet) => set({ wallet }),

  runCreditCheck: async () => {
    const wallet = get().wallet;
    if (!wallet) return;
    set({ creditLoading: true, creditError: null, credit: null, proofs: [] });
    try {
      const res = await fetch('/api/credit/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet.address }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Credit check failed (HTTP ${res.status})`);
      }
      const data: CreditCheckResponse = await res.json();

      // Fetch the demo proof artifacts so the UI can render the per-factor
      // proof details. The proofs endpoint is folded into the credit check
      // response shape on the client (proofTxHashes); we reconstruct the
      // rich proof objects by asking a small client helper.
      const { buildDemoProofs } = await import('@/lib/mira/proofs');
      const proofs = buildDemoProofs(data.factors, []);

      set({
        credit: data,
        proofs,
        creditLoading: false,
        view: 'factors',
      });
    } catch (err) {
      set({
        creditLoading: false,
        creditError: err instanceof Error ? err.message : 'Credit check failed',
      });
    }
  },

  runApply: async (requestedAmount, requestedTermDays) => {
    const wallet = get().wallet;
    if (!wallet) return;
    set({
      applyLoading: true,
      applyError: null,
      applyPhase: 'proof',
      decision: null,
      loan: null,
    });
    try {
      // Animate the three-phase "wow" wait. The phases mirror the real
      // pipeline: proof generation (~2-5s), on-chain verification (~15s),
      // LLM decision (~2-4s). We pace them so the UI tells the story even
      // though the single API call returns once the whole pipeline finishes.
      const phaseTimers: Array<ReturnType<typeof setTimeout>> = [];
      phaseTimers.push(
        setTimeout(() => set({ applyPhase: 'verify' }), 1800),
      );
      phaseTimers.push(
        setTimeout(() => set({ applyPhase: 'decide' }), 5000),
      );

      const res = await fetch('/api/loan/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet.address,
          requestedAmount,
          requestedTermDays,
        }),
      });

      phaseTimers.forEach(clearTimeout);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Loan application failed (HTTP ${res.status})`);
      }
      const data: LoanApplyResponse = await res.json();

      set({
        decision: data,
        applyLoading: false,
        applyPhase: 'done',
        view: 'decision',
      });

      // If approved, capture the originated loan details for the next screen.
      if (data.decision !== 'decline' && data.loanId) {
        set({
          loan: {
            loanId: data.loanId,
            originTxHash: data.originTxHash,
            amount: data.approvedAmount,
            rate: data.interestRateApr,
            term: requestedTermDays,
            borrower: wallet.address,
            dueBlock: 0, // filled by the originated screen from the loan record
            originatedBlock: 0,
          },
        });
      }
    } catch (err) {
      set({
        applyLoading: false,
        applyPhase: 'idle',
        applyError: err instanceof Error ? err.message : 'Loan application failed',
      });
    }
  },

  setApplyPhase: (phase) => set({ applyPhase: phase }),
  resetDecision: () =>
    set({
      decision: null,
      applyPhase: 'idle',
      applyError: null,
      loan: null,
      repayResult: null,
      defaultResult: null,
    }),

  runRepay: async () => {
    const loan = get().loan;
    if (!loan) return;
    set({ repayLoading: true });
    try {
      const res = await fetch('/api/loan/repay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId: loan.loanId,
          repaymentTxHash: '',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Repayment failed (HTTP ${res.status})`);
      }
      const data: LoanRepayResponse = await res.json();
      set({ repayLoading: false, repayResult: data });
    } catch (err) {
      set({ repayLoading: false });
      throw err;
    }
  },

  runTriggerDefault: async () => {
    const loan = get().loan;
    if (!loan) return;
    set({ defaultLoading: true });
    try {
      const res = await fetch('/api/demo/trigger-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId: loan.loanId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Default trigger failed (HTTP ${res.status})`);
      }
      const data: DemoTriggerDefaultResponse = await res.json();
      set({ defaultLoading: false, defaultResult: data });
    } catch (err) {
      set({ defaultLoading: false });
      throw err;
    }
  },

  loadReputation: async () => {
    set({ reputationLoading: true });
    try {
      const res = await fetch('/api/agent/reputation', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AgentReputationResponse = await res.json();
      set({ reputation: data, reputationLoading: false });
    } catch {
      set({ reputationLoading: false });
    }
  },

  resetFlow: () =>
    set({
      view: 'landing',
      wallet: null,
      credit: null,
      proofs: [],
      creditLoading: false,
      creditError: null,
      decision: null,
      applyLoading: false,
      applyPhase: 'idle',
      applyError: null,
      loan: null,
      repayResult: null,
      defaultResult: null,
    }),
}));

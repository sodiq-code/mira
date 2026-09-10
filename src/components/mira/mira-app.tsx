'use client';

/**
 * MIRA application shell.
 *
 * Orchestrates the borrower flow as a single linear state machine (see
 * store-client.ts). The landing is the default view; the borrower flow
 * (connect → factors → apply → decision → originated) and the agent
 * reputation dashboard are reachable from the nav and CTAs.
 *
 * The shell renders a sticky header and a footer pinned to the bottom of
 * the viewport (mt-auto on the footer inside a min-h-screen flex column) so
 * short pages never leave a floating gap and long pages push the footer
 * down naturally.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Home, Award, Github, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MiraWordmark } from '@/components/mira/ui/mira-mark';
import { ThemeToggle } from '@/components/mira/ui/theme-toggle';
import { WalletSwitcher } from '@/components/mira/ui/wallet-switcher';
import { useMiraStore } from '@/lib/mira/store-client';
import { Landing } from '@/components/mira/screens/landing';
import { ConnectWallet } from '@/components/mira/screens/connect-wallet';
import { VerifiedFactors } from '@/components/mira/screens/verified-factors';
import { ApplyLoan } from '@/components/mira/screens/apply-loan';
import { Decision } from '@/components/mira/screens/decision';
import { LoanOriginated } from '@/components/mira/screens/loan-originated';
import { AgentReputationDashboard } from '@/components/mira/screens/agent-reputation-dashboard';
import { LoanHistory } from '@/components/mira/screens/loan-history';

const EXT_REL = 'noopener noreferrer';

export function MiraApp() {
  const { view, wallet, setView } = useMiraStore();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setView('landing')}
            className="flex items-center gap-2.5"
            aria-label="MIRA home"
          >
            <MiraWordmark />
            <Badge variant="secondary" className="ml-1.5 hidden sm:inline-flex">
              CC3 Testnet
            </Badge>
          </button>

          <nav className="flex items-center gap-1" aria-label="Primary">
            {view !== 'landing' && (
              <Button variant="ghost" size="sm" onClick={() => setView('landing')}>
                <Home className="mr-1.5 h-4 w-4" />
                <span className="hidden sm:inline">Home</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setView('reputation')}>
              <Award className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Reputation</span>
            </Button>
            {wallet && (
              <Button variant="ghost" size="sm" onClick={() => setView('history')}>
                <History className="mr-1.5 h-4 w-4" />
                <span className="hidden sm:inline">My loans</span>
              </Button>
            )}
            <WalletSwitcher />
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <a
                href="https://github.com/sodiq-code/mira"
                target="_blank"
                rel={EXT_REL}
                aria-label="GitHub repository"
              >
                <Github className="h-4 w-4" />
              </a>
            </Button>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'landing' && (
              <Landing
                onLaunch={() => setView('connect')}
                onOpenReputation={() => setView('reputation')}
              />
            )}
            {view === 'connect' && <ConnectWallet />}
            {view === 'factors' && <VerifiedFactors />}
            {view === 'apply' && <ApplyLoan />}
            {view === 'decision' && <Decision />}
            {view === 'originated' && <LoanOriginated />}
            {view === 'reputation' && <AgentReputationDashboard />}
            {view === 'history' && <LoanHistory />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer (sticky to bottom) */}
      <footer className="mt-auto border-t border-border/60 bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-xs font-bold text-emerald-950">
              M
            </span>
            <span>MIRA — Autonomous Verifiable Credit Agent</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a
              href="https://docs.attestcoin.org"
              target="_blank"
              rel={EXT_REL}
              className="transition-colors hover:text-foreground"
            >
              Attestcoin
            </a>
            <a
              href="https://creditcoin.org"
              target="_blank"
              rel={EXT_REL}
              className="transition-colors hover:text-foreground"
            >
              Creditcoin
            </a>
            <span className="text-muted-foreground/60">MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

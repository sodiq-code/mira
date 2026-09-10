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
import { useState } from 'react';
import { Home, Award, Github, History, ShieldX, FlaskConical, Users, Map, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import { MiraWordmark } from '@/components/mira/ui/mira-mark';
import { ThemeToggle } from '@/components/mira/ui/theme-toggle';
import { WalletSwitcher } from '@/components/mira/ui/wallet-switcher';
import { useMiraStore, type FlowView } from '@/lib/mira/store-client';
import { Landing } from '@/components/mira/screens/landing';
import { ConnectWallet } from '@/components/mira/screens/connect-wallet';
import { VerifiedFactors } from '@/components/mira/screens/verified-factors';
import { ApplyLoan } from '@/components/mira/screens/apply-loan';
import { Decision } from '@/components/mira/screens/decision';
import { LoanOriginated } from '@/components/mira/screens/loan-originated';
import { AgentReputationDashboard } from '@/components/mira/screens/agent-reputation-dashboard';
import { LoanHistory } from '@/components/mira/screens/loan-history';
import { AttackMIRA } from '@/components/mira/screens/attack-mira';
import { ExperimentResults } from '@/components/mira/screens/experiment-results';
import { ABComparison } from '@/components/mira/screens/ab-comparison';
import { GuidedDemo } from '@/components/mira/screens/guided-demo';

const EXT_REL = 'noopener noreferrer';

export function MiraApp() {
  const { view, wallet, setView } = useMiraStore();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Navigate and close the mobile sheet in one call.
  const navigate = (target: FlowView) => {
    setView(target);
    setMobileNavOpen(false);
  };

  // The nav item definitions, shared between desktop and mobile.
  const navItems: { view: FlowView; label: string; icon: typeof Home }[] = [
    { view: 'reputation', label: 'Reputation', icon: Award },
    { view: 'attack', label: 'Attack', icon: ShieldX },
    { view: 'experiment', label: 'Experiment', icon: FlaskConical },
    { view: 'comparison', label: 'A/B', icon: Users },
    { view: 'guided', label: 'Guided', icon: Map },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setView('landing')}
            className="flex shrink-0 items-center gap-2.5"
            aria-label="MIRA home"
          >
            <MiraWordmark />
            <Badge variant="secondary" className="ml-1.5 hidden sm:inline-flex">
              CC3 Testnet
            </Badge>
          </button>

          {/* Desktop nav (sm and up) */}
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
            {view !== 'landing' && (
              <Button variant="ghost" size="sm" onClick={() => setView('landing')}>
                <Home className="mr-1.5 h-4 w-4" />
                <span className="hidden md:inline">Home</span>
              </Button>
            )}
            {navItems.map((item) => (
              <Button
                key={item.view}
                variant={view === item.view ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setView(item.view)}
              >
                <item.icon className="mr-1.5 h-4 w-4" />
                <span className="hidden md:inline">{item.label}</span>
              </Button>
            ))}
            {wallet && (
              <Button variant="ghost" size="sm" onClick={() => setView('history')}>
                <History className="mr-1.5 h-4 w-4" />
                <span className="hidden md:inline">My loans</span>
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

          {/* Mobile compact controls (icons only, visible below sm) */}
          <div className="flex items-center gap-1 sm:hidden">
            <WalletSwitcher />
            <ThemeToggle />
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Open navigation menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <SheetHeader className="border-b border-border/60 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <SheetTitle className="flex items-center gap-2 text-base">
                      <MiraWordmark />
                      <Badge variant="secondary" className="text-[10px]">CC3</Badge>
                    </SheetTitle>
                    <SheetClose asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Close menu">
                        <X className="h-4 w-4" />
                      </Button>
                    </SheetClose>
                  </div>
                </SheetHeader>
                <nav className="flex flex-col gap-1 p-3" aria-label="Mobile">
                  {view !== 'landing' && (
                    <button
                      type="button"
                      onClick={() => navigate('landing')}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Home className="h-4 w-4 text-muted-foreground" />
                      Home
                    </button>
                  )}
                  {navItems.map((item) => (
                    <button
                      key={item.view}
                      type="button"
                      onClick={() => navigate(item.view)}
                      className={
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted ' +
                        (view === item.view ? 'bg-muted text-foreground' : 'text-muted-foreground')
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  ))}
                  {wallet && (
                    <button
                      type="button"
                      onClick={() => navigate('history')}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                      <History className="h-4 w-4" />
                      My loans
                    </button>
                  )}
                  <div className="my-2 border-t border-border/60" />
                  <a
                    href="https://github.com/sodiq-code/mira"
                    target="_blank"
                    rel={EXT_REL}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <Github className="h-4 w-4" />
                    GitHub
                  </a>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
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
                onOpenAttack={() => setView('attack')}
                onOpenExperiment={() => setView('experiment')}
                onOpenGuided={() => setView('guided')}
              />
            )}
            {view === 'connect' && <ConnectWallet />}
            {view === 'factors' && <VerifiedFactors />}
            {view === 'apply' && <ApplyLoan />}
            {view === 'decision' && <Decision />}
            {view === 'originated' && <LoanOriginated />}
            {view === 'reputation' && <AgentReputationDashboard />}
            {view === 'history' && <LoanHistory />}
            {view === 'attack' && <AttackMIRA />}
            {view === 'experiment' && <ExperimentResults />}
            {view === 'comparison' && <ABComparison />}
            {view === 'guided' && <GuidedDemo />}
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

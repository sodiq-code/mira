import { MiraApp } from '@/components/mira/mira-app';

/**
 * MIRA — Autonomous Verifiable Credit Agent.
 *
 * The root route renders the application shell, which orchestrates the
 * borrower flow (connect → verify → apply → decide → originate) and the
 * agent reputation dashboard. See src/components/mira/mira-app.tsx.
 */
export default function Home() {
  return <MiraApp />;
}

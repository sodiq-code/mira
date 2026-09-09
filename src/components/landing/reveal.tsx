"use client";

import { motion, useReducedMotion, useInView } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Stagger index — increases the delay so siblings animate in sequence. */
  delay?: number;
  className?: string;
}

/**
 * Scroll-triggered fade-and-rise wrapper with a hard visibility guarantee.
 *
 * The animation is purely decorative, so it must never leave content stuck
 * invisible. Three layers of defense:
 *   1. Honors `prefers-reduced-motion` — renders children immediately, no
 *      transform or transition.
 *   2. Uses `useInView` so the reveal fires the moment any part of the element
 *      enters the viewport (with `once` so it stays revealed).
 *   3. A 1.5s safety timeout forces `shown=true` regardless of observer state,
 *      so content is visible even if IntersectionObserver never fires (e.g. in
 *      headless screenshot tools, crawlers, or older browsers).
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0 });
  const [forceShown, setForceShown] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setForceShown(true), 1500);
    return () => clearTimeout(id);
  }, []);

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  const shown = inView || forceShown;

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

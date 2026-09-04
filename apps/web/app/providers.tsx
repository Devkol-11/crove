"use client";

import { LazyMotion, domAnimation } from "motion/react";
import VerificationBanner from "@/components/auth/VerificationBanner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <VerificationBanner />
      {children}
    </LazyMotion>
  );
}

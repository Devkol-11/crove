"use client";

import { m, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { WavyBackground } from "@/components/ui/wavy-background";
import { FlipWords } from "@/components/ui/flip-words";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const FLIP_WORDS = ["Held.", "Secured.", "Protected.", "Safeguarded."];

export default function Hero() {
  const reduced = useReducedMotion();

  const fadeUp = {
    hidden: { opacity: 0 },
    visible: (i: number) => ({
      opacity: 1,
      transition: { delay: i * 0.14, duration: 0.65, ease: EASE },
    }),
  };

  return (
    <WavyBackground
      containerClassName="w-full min-h-screen flex items-center justify-center"
      backgroundFill="#060e08"
      speed="slow"
      waveOpacity={0.35}
      blur={9}
    >
      <div
        className="w-full max-w-4xl mx-auto px-6 sm:px-8 flex flex-col items-center text-center"
        style={{
          paddingTop: "clamp(80px, 12vw, 140px)",
          paddingBottom: "clamp(80px, 12vw, 140px)",
        }}
      >
        <m.div
          className="flex flex-col items-center w-full"
          initial="hidden"
          animate="visible"
        >
          {/* Headline with FlipWords */}
          <m.h1
            variants={fadeUp}
            custom={0}
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(3.25rem, 7.5vw, 6rem)",
              lineHeight: 1.0,
              letterSpacing: "-0.03em",
              color: "#e8f5ec",
              fontWeight: 800,
              marginBottom: "32px",
            }}
          >
            Your money.
            <br />
            <span style={{ color: "#4ade80" }}>
              <FlipWords words={FLIP_WORDS} />
            </span>
            <br />
            until the deal is done.
          </m.h1>

          <m.p
            variants={fadeUp}
            custom={1}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "clamp(1rem, 2.2vw, 1.125rem)",
              lineHeight: 1.7,
              color: "rgba(232, 245, 236, 0.7)",
              maxWidth: "480px",
              marginBottom: "40px",
            }}
          >
            Create a secure escrow, share one link, and release funds only
            when both sides agree the deal is done.
          </m.p>

          <m.div
            variants={fadeUp}
            custom={2}
            className="flex items-center justify-center"
          >
            <div className="relative inline-flex">
              {([0, 0.9, 1.8] as const).map((delay) => (
                <m.span
                  key={delay}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{ border: "1.5px solid var(--color-accent)" }}
                  animate={{ scale: [1, 1.28], opacity: [0.22, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay }}
                />
              ))}

              <m.a
                href="/sign-up"
                className="relative inline-flex items-center justify-center gap-2.5 rounded-full font-semibold"
                style={{
                  fontFamily: "var(--font-body)",
                  backgroundColor: "var(--color-accent)",
                  color: "#060e08",
                  paddingLeft: "26px",
                  paddingRight: "26px",
                  paddingTop: "16px",
                  paddingBottom: "16px",
                  minWidth: "220px",
                  fontSize: "0.9375rem",
                }}
                animate={
                  reduced
                    ? {}
                    : {
                        x: [0, -3, 3, -2, 2, -1, 1, 0],
                        boxShadow: [
                          "0 8px 28px rgba(74,222,128,0.22)",
                          "0 8px 28px rgba(74,222,128,0.22)",
                          "0 8px 28px rgba(74,222,128,0.22)",
                          "0 8px 28px rgba(74,222,128,0.22)",
                          "0 8px 28px rgba(74,222,128,0.22)",
                          "0 8px 28px rgba(74,222,128,0.22)",
                          "0 8px 28px rgba(74,222,128,0.22)",
                          "0 14px 40px rgba(74,222,128,0.55)",
                        ],
                      }
                }
                transition={
                  reduced
                    ? {}
                    : {
                        x: { duration: 0.45, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" },
                        boxShadow: { duration: 0.45, repeat: Infinity, repeatDelay: 5 },
                      }
                }
                whileHover={reduced ? {} : { scale: 1.04, filter: "brightness(1.08)" }}
                whileTap={reduced ? {} : { scale: 0.96 }}
              >
                Create Quick Escrow Link
                <ArrowRight size={16} aria-hidden="true" />
              </m.a>
            </div>
          </m.div>
        </m.div>
      </div>
    </WavyBackground>
  );
}

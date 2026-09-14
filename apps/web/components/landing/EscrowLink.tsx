"use client";

import Link from "next/link";
import { m, useReducedMotion } from "motion/react";
import { ArrowRight, Zap, Layers, ShieldCheck, Banknote } from "lucide-react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const QUICK_FEATURES = [
  "No account — just an email to verify",
  "Live escrow in under 60 seconds",
  "Share via any channel or platform",
  "Funds held until both sides confirm",
];

const GATED_TYPES = [
  {
    Icon: Layers,
    name: "Milestone",
    tagline: "Pay as each phase completes.",
    description:
      "Break any project into milestones and release funds as each phase is delivered and approved — not all at once, not upfront.",
  },
  {
    Icon: ShieldCheck,
    name: "Conditional",
    tagline: "Funds release only when the condition is met.",
    description:
      "Define the exact trigger condition before anyone moves money. Both sides agree upfront — the escrow enforces it automatically.",
  },
  {
    Icon: Banknote,
    name: "Deposit",
    tagline: "Reserve funds to hold a deal in place.",
    description:
      "Lock a deposit while the rest of the deal is arranged. The seller knows the buyer is serious — the buyer knows their money is safe.",
  },
];

export default function EscrowLink() {
  const reduced = useReducedMotion();

  return (
    <section
      style={{
        borderTop: "1px solid var(--color-surface-line)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-24 sm:py-32">

        {/* Section intro */}
        <m.div
          className="mb-14"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.65, ease: EASE }}
        >
          <div className="flex items-center gap-3 mb-5">
            <span
              className="h-px"
              style={{ width: "28px", backgroundColor: "var(--color-accent)", opacity: 0.7 }}
            />
            <p
              className="font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-accent)", fontSize: "0.72rem" }}
            >
              Escrow types
            </p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2
              className="font-bold"
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(2rem, 4.5vw, 3rem)",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                color: "var(--color-text)",
                maxWidth: "480px",
              }}
            >
              Pick the right structure<br />for your deal.
            </h2>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.9375rem",
                lineHeight: 1.65,
                color: "var(--color-text-muted)",
                maxWidth: "340px",
                opacity: 0.8,
              }}
            >
              Every deal is different. Quick Link works for most. The others
              exist for when you need more control.
            </p>
          </div>
        </m.div>

        {/* Quick Link — hero card */}
        <m.div
          className="rounded-2xl p-8 sm:p-10 mb-5 relative overflow-hidden"
          style={{
            background:
              "radial-gradient(ellipse at 15% 0%, rgba(74,222,128,0.07) 0%, transparent 55%), var(--color-bg)",
            border: "1px solid var(--color-accent-border)",
          }}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.65, ease: EASE, delay: 0.05 }}
          whileHover={
            reduced
              ? {}
              : {
                  y: -6,
                  boxShadow: "0 24px 72px rgba(74,222,128,0.1)",
                }
          }
        >
          {/* Top row */}
          <div className="flex flex-wrap items-start justify-between gap-5 mb-8">
            <div className="flex items-center gap-3.5">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: "var(--color-accent)",
                  boxShadow: "0 8px 24px rgba(74,222,128,0.22)",
                }}
              >
                <Zap size={17} style={{ color: "#060e08" }} strokeWidth={2.5} />
              </div>
              <div>
                <h3
                  className="font-bold"
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "clamp(1.2rem, 2.5vw, 1.5rem)",
                    lineHeight: 1.2,
                    letterSpacing: "-0.015em",
                    color: "var(--color-text)",
                  }}
                >
                  Quick Link
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.8125rem",
                    color: "var(--color-accent)",
                    marginTop: "2px",
                  }}
                >
                  The fastest way to a secured deal.
                </p>
              </div>
            </div>
            <span
              className="text-xs font-semibold px-3.5 py-1.5 rounded-full"
              style={{
                backgroundColor: "var(--color-accent-badge-bg)",
                color: "var(--color-accent)",
                border: "1px solid var(--color-accent-border)",
                letterSpacing: "0.02em",
              }}
            >
              No account needed
            </span>
          </div>

          {/* Description + features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-start">
            <div>
              <p
                className="mb-4"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "1rem",
                  lineHeight: 1.75,
                  color: "var(--color-text)",
                  maxWidth: "480px",
                }}
              >
                Share a link in 60 seconds. The other side joins by verifying their
                email. Funds are held until both parties confirm the deal is done.
              </p>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.875rem",
                  lineHeight: 1.65,
                  color: "var(--color-text-muted)",
                  opacity: 0.75,
                }}
              >
                Works for freelance work, item sales, domain transfers, peer-to-peer
                payments, and any one-time deal.
              </p>
            </div>

            <ul className="flex flex-col gap-3">
              {QUICK_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      backgroundColor: "var(--color-accent-soft)",
                      border: "1px solid var(--color-accent-border)",
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path d="M2 5L4 7L8 3" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: "0.9rem",
                      lineHeight: 1.55,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {f}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="mt-8 pt-8 flex items-center"
            style={{ borderTop: "1px solid var(--color-accent-border)" }}
          >
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-full font-semibold text-sm px-7 py-3.5 transition-all hover:brightness-110"
              style={{ backgroundColor: "var(--color-accent)", color: "#060e08" }}
            >
              Create a quick escrow
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </m.div>

        {/* Gated type cards */}
        <m.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: 0.1, delayChildren: 0.05 },
            },
          }}
        >
          {GATED_TYPES.map(({ Icon, name, tagline, description }) => (
            <m.div
              key={name}
              className="rounded-2xl flex flex-col"
              style={{
                background: "var(--color-bg)",
                border: "1px solid var(--color-surface-line)",
                padding: "24px",
              }}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
              }}
              whileHover={
                reduced
                  ? {}
                  : { y: -3, borderColor: "var(--color-accent-border)" }
              }
              transition={{ duration: 0.22, ease: EASE }}
            >
              {/* Header: icon + name + account badge */}
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      backgroundColor: "var(--color-accent-soft)",
                      border: "1px solid var(--color-accent-border)",
                    }}
                  >
                    <Icon size={13} style={{ color: "var(--color-accent)" }} strokeWidth={1.8} />
                  </div>
                  <div>
                    <h3
                      className="font-semibold"
                      style={{
                        fontFamily: "var(--font-heading)",
                        fontSize: "0.9375rem",
                        letterSpacing: "-0.01em",
                        color: "var(--color-text)",
                      }}
                    >
                      {name}
                    </h3>
                    <p
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: "0.75rem",
                        color: "var(--color-text-muted)",
                        marginTop: "2px",
                      }}
                    >
                      {tagline}
                    </p>
                  </div>
                </div>
                <span
                  className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border"
                  style={{
                    color: "var(--color-text-muted)",
                    borderColor: "var(--color-surface-line)",
                    fontFamily: "var(--font-body)",
                    opacity: 0.75,
                    whiteSpace: "nowrap",
                  }}
                >
                  Account required
                </span>
              </div>

              {/* Description */}
              <p
                className="flex-1 mb-6"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.875rem",
                  lineHeight: 1.72,
                  color: "var(--color-text-muted)",
                }}
              >
                {description}
              </p>

              {/* CTA */}
              <div style={{ borderTop: "1px solid var(--color-surface-line)", paddingTop: "16px" }}>
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                  style={{
                    color: "var(--color-accent)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  Get started
                  <ArrowRight size={11} aria-hidden="true" />
                </Link>
              </div>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}

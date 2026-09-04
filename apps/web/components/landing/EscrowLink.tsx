"use client";

import Link from "next/link";
import { m, useReducedMotion } from "motion/react";
import { ArrowRight, Zap, Layers, ShieldCheck, Banknote, Check, Lock } from "lucide-react";

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
    goodFor: "Software builds, design sprints, consulting, content production.",
    features: [
      "Split project into named phases",
      "Release funds per milestone",
      "Built-in approval workflow",
      "Dispute protection at each stage",
    ],
  },
  {
    Icon: ShieldCheck,
    name: "Conditional",
    tagline: "Funds release only when the condition is met.",
    description:
      "Define the exact trigger condition before anyone moves money. Both sides agree upfront — the escrow enforces it automatically.",
    goodFor: "Performance contracts, SLA-backed services, outcome-based deals.",
    features: [
      "Define custom release conditions",
      "Both parties agree upfront",
      "Automatic condition verification",
      "Dispute resolution built in",
    ],
  },
  {
    Icon: Banknote,
    name: "Deposit",
    tagline: "Reserve funds to hold a deal in place.",
    description:
      "Lock a deposit while the rest of the deal is arranged. The seller knows the buyer is serious — the buyer knows their money is safe.",
    goodFor: "Property, large equipment, event bookings, high-value sales.",
    features: [
      "Lock partial deposit instantly",
      "Rest of deal arranged separately",
      "Refundable on mutual agreement",
      "Proves buyer commitment to seller",
    ],
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

        {/* Quick Link — the hero card */}
        <m.div
          className="rounded-2xl p-8 sm:p-10 mb-5 relative overflow-hidden"
          style={{
            background:
              "radial-gradient(ellipse at 15% 0%, rgba(255,200,37,0.18) 0%, transparent 55%), var(--color-bg)",
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
                  boxShadow: "0 24px 72px rgba(201, 162, 75, 0.18)",
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
                  boxShadow: "0 8px 24px rgba(255,200,37,0.3)",
                }}
              >
                <Zap size={17} style={{ color: "#0b0d10" }} strokeWidth={2.5} />
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
                    <Check size={10} style={{ color: "var(--color-accent)" }} strokeWidth={3} />
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
              style={{ backgroundColor: "var(--color-accent)", color: "#0b0d10" }}
            >
              Create a quick escrow
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </m.div>

        {/* Gated type cards */}
        <m.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-5"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: 0.13, delayChildren: 0.05 },
            },
          }}
        >
          {GATED_TYPES.map(({ Icon, name, tagline, description, goodFor, features }, idx) => (
            <m.div
              key={name}
              className="rounded-2xl flex flex-col relative overflow-hidden"
              style={{
                background:
                  "radial-gradient(ellipse at 110% -10%, rgba(255,200,37,0.09) 0%, transparent 52%), var(--color-bg)",
                border: "1px solid var(--color-surface-line)",
                padding: "28px",
              }}
              variants={{
                hidden: { opacity: 0, y: 24 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.55, ease: EASE },
                },
              }}
              whileHover={
                reduced
                  ? {}
                  : {
                      y: -9,
                      borderColor: "var(--color-accent-border)",
                      boxShadow:
                        "0 28px 80px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,200,37,0.2), 0 0 56px rgba(255,200,37,0.07)",
                    }
              }
              transition={{ duration: 0.3, ease: EASE }}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <m.div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: "var(--color-accent-soft)",
                    border: "1px solid var(--color-accent-border)",
                  }}
                  whileHover={reduced ? {} : { scale: 1.1, rotate: -6 }}
                  transition={{ duration: 0.2, ease: EASE }}
                >
                  <Icon size={17} style={{ color: "var(--color-accent)" }} strokeWidth={1.8} />
                </m.div>

                <m.span
                  className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full"
                  style={{
                    padding: "4px 10px",
                    backgroundColor: "rgba(255,200,37,0.08)",
                    border: "1px solid rgba(255,200,37,0.22)",
                    color: "var(--color-text-muted)",
                    fontFamily: "var(--font-body)",
                  }}
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{
                    duration: 2.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: idx * 0.95,
                  }}
                >
                  <Lock size={9} strokeWidth={2.5} style={{ color: "var(--color-accent)", opacity: 0.75 }} />
                  Requires account
                </m.span>
              </div>

              {/* Name + tagline */}
              <h3
                className="font-bold mb-1"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.15rem",
                  lineHeight: 1.25,
                  letterSpacing: "-0.015em",
                  color: "var(--color-text)",
                }}
              >
                {name}
              </h3>
              <p
                className="font-medium mb-4"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.8rem",
                  color: "var(--color-accent)",
                  letterSpacing: "0.01em",
                }}
              >
                {tagline}
              </p>

              {/* Description */}
              <p
                className="mb-5 flex-1"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.9rem",
                  lineHeight: 1.72,
                  color: "var(--color-text-muted)",
                }}
              >
                {description}
              </p>

              {/* Feature bullets — stagger in from left */}
              <ul className="flex flex-col gap-2.5 mb-5">
                {features.map((f, i) => (
                  <m.li
                    key={f}
                    className="flex items-center gap-2.5"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.07, duration: 0.38, ease: EASE }}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: "var(--color-accent-soft)",
                        border: "1px solid var(--color-accent-border)",
                      }}
                    >
                      <Check size={8} style={{ color: "var(--color-accent)" }} strokeWidth={3.5} />
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: "0.825rem",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      {f}
                    </span>
                  </m.li>
                ))}
              </ul>

              {/* Good for */}
              <div
                className="mb-5 rounded-lg px-3.5 py-2.5"
                style={{
                  backgroundColor: "rgba(255,200,37,0.05)",
                  border: "1px solid rgba(255,200,37,0.12)",
                }}
              >
                <p
                  className="font-semibold uppercase tracking-widest mb-1"
                  style={{ fontSize: "0.64rem", color: "var(--color-accent)", opacity: 0.8 }}
                >
                  Good for
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.775rem",
                    lineHeight: 1.6,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {goodFor}
                </p>
              </div>

              {/* CTA — prominent accent button */}
              <m.div
                className="mt-auto"
                whileHover={reduced ? {} : { scale: 1.025 }}
                whileTap={reduced ? {} : { scale: 0.975 }}
                transition={{ duration: 0.15 }}
              >
                <Link
                  href="/sign-up"
                  className="flex items-center justify-center gap-2 rounded-xl text-sm font-semibold w-full"
                  style={{
                    padding: "12px 20px",
                    backgroundColor: "var(--color-accent-soft)",
                    border: "1px solid var(--color-accent-border)",
                    color: "var(--color-accent)",
                    fontFamily: "var(--font-body)",
                    transition: "background-color 200ms, box-shadow 200ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "rgba(255,200,37,0.22)";
                    (e.currentTarget as HTMLElement).style.boxShadow =
                      "0 0 20px rgba(255,200,37,0.18)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "var(--color-accent-soft)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  }}
                >
                  Sign up to access
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </m.div>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}

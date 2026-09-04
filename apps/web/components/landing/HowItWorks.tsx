"use client";

import { m, useReducedMotion } from "motion/react";
import { Link2, Send, CheckCircle2 } from "lucide-react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const STEPS = [
  {
    n: "01",
    Icon: Link2,
    title: "Create",
    body: "Set the deal title, amount, and your role in under 60 seconds. No account required for Quick Link escrow — just your email.",
    note: "You define the terms. Both parties see and agree before a single dollar moves.",
  },
  {
    n: "02",
    Icon: Send,
    title: "Share",
    body: "Send the unique deal link to the other party. They join by verifying their email — no Crove account needed on their end.",
    note: "Share via any channel. The link is deal-specific and tied to this transaction only.",
  },
  {
    n: "03",
    Icon: CheckCircle2,
    title: "Release",
    body: "Work delivered, payer confirms, funds clear to the payee. Either party can open a dispute before release if something is off.",
    note: "Settlement reaches your bank within 1–2 business days after confirmation.",
  },
];

export default function HowItWorks() {
  const reduced = useReducedMotion();

  return (
    <section
      id="how-it-works"
      style={{ borderTop: "1px solid var(--color-surface-line)" }}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-24 sm:py-32">

        {/* Section header */}
        <m.div
          className="mb-16 sm:mb-20"
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
              How it works
            </p>
          </div>
          <h2
            className="font-bold"
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(2rem, 4.5vw, 3rem)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "var(--color-text)",
              maxWidth: "460px",
            }}
          >
            Three steps.<br />One secured deal.
          </h2>
        </m.div>

        {/* Step cards */}
        <m.div
          className="grid grid-cols-1 lg:grid-cols-3 gap-5"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.14, delayChildren: 0.05 } },
          }}
        >
          {STEPS.map(({ n, Icon, title, body, note }) => (
            <m.div
              key={n}
              className="relative rounded-2xl p-8 flex flex-col overflow-hidden"
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-surface-line)",
              }}
              variants={{
                hidden: { opacity: 0, y: 28 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
              }}
              whileHover={
                reduced
                  ? {}
                  : {
                      y: -7,
                      borderColor: "var(--color-accent-border)",
                      boxShadow:
                        "0 24px 64px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,200,37,0.14)",
                    }
              }
              transition={{ duration: 0.28, ease: EASE }}
            >
              {/* Ghost step number — oversized decorative element */}
              <span
                aria-hidden="true"
                className="absolute -top-2 right-4 font-bold select-none pointer-events-none"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "8rem",
                  lineHeight: 1,
                  color: "var(--color-text)",
                  opacity: 0.032,
                  letterSpacing: "-0.04em",
                }}
              >
                {n}
              </span>

              {/* Icon container */}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-8"
                style={{
                  backgroundColor: "var(--color-accent-soft)",
                  border: "1px solid var(--color-accent-border)",
                }}
              >
                <Icon size={18} style={{ color: "var(--color-accent)" }} strokeWidth={1.8} />
              </div>

              {/* Step label */}
              <span
                className="block font-semibold uppercase mb-3"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.68rem",
                  letterSpacing: "0.14em",
                  color: "var(--color-accent)",
                  opacity: 0.85,
                }}
              >
                Step {n}
              </span>

              <h3
                className="font-bold mb-4"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "clamp(1.35rem, 2.5vw, 1.65rem)",
                  lineHeight: 1.15,
                  letterSpacing: "-0.015em",
                  color: "var(--color-text)",
                }}
              >
                {title}
              </h3>

              <p
                className="mb-6 flex-1"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.9375rem",
                  lineHeight: 1.75,
                  color: "var(--color-text-muted)",
                }}
              >
                {body}
              </p>

              {/* Footnote */}
              <div
                className="pt-5"
                style={{ borderTop: "1px solid var(--color-surface-line)" }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.8125rem",
                    lineHeight: 1.6,
                    color: "var(--color-text-muted)",
                    opacity: 0.55,
                  }}
                >
                  {note}
                </p>
              </div>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}

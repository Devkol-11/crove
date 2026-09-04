"use client";

import { m, useReducedMotion } from "motion/react";
import { Laptop, Globe, Package, Briefcase } from "lucide-react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const USE_CASES = [
  {
    Icon: Laptop,
    label: "Freelance work",
    description:
      "Designers, developers, copywriters — get paid when the work lands, not when the client gets around to it. Both sides commit before work begins.",
  },
  {
    Icon: Globe,
    label: "Domain & asset sales",
    description:
      "Transfer and payment happen at the same time. No more wiring money and hoping the domain follows. The escrow bridges the gap.",
  },
  {
    Icon: Package,
    label: "Marketplace deals",
    description:
      "High-value peer-to-peer transactions — electronics, vehicles, collectibles — where bank transfers feel like a gamble. Now they don't have to.",
  },
  {
    Icon: Briefcase,
    label: "Service contracts",
    description:
      "Consulting retainers, event bookings, production deals. Everyone commits with something real at stake — not just a handshake.",
  },
];

export default function BuiltForDeals() {
  const reduced = useReducedMotion();

  return (
    <section
      id="security"
      style={{ borderTop: "1px solid var(--color-surface-line)" }}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-24 sm:py-32">

        {/* Problem statement */}
        <m.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 mb-20 lg:mb-28 items-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.65, ease: EASE }}
        >
          {/* Left: label + headline */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <span
                className="h-px"
                style={{ width: "28px", backgroundColor: "var(--color-accent)", opacity: 0.7 }}
              />
              <p
                className="font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-accent)", fontSize: "0.72rem" }}
              >
                The problem
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
              }}
            >
              Deals fall apart when nobody wants to go first.
            </h2>
          </div>

          {/* Right: explanation */}
          <div className="flex flex-col gap-4">
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "1rem",
                lineHeight: 1.8,
                color: "var(--color-text-muted)",
              }}
            >
              You've agreed on a price. Now someone has to commit. And that's
              where it breaks — buyers who pay and never receive, sellers who
              deliver and never get paid.
            </p>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "1rem",
                lineHeight: 1.8,
                color: "var(--color-text-muted)",
              }}
            >
              Crove sits in the middle. The payer sends funds to Crove, not to
              the payee. The payee delivers. The payer confirms. Crove releases.
              Neither side has to trust the other blindly — they both trust the
              escrow.
            </p>

            {/* Pull quote */}
            <div
              className="rounded-xl px-6 py-5 mt-2"
              style={{
                backgroundColor: "var(--color-accent-soft)",
                border: "1px solid var(--color-accent-border)",
              }}
            >
              <p
                className="font-semibold"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1rem",
                  lineHeight: 1.5,
                  color: "var(--color-text)",
                  letterSpacing: "-0.01em",
                }}
              >
                &ldquo;Neither side has to trust the other blindly — they both
                trust the escrow.&rdquo;
              </p>
            </div>
          </div>
        </m.div>

        {/* Use-case cards */}
        <m.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mb-5"
        >
          <p
            className="font-semibold uppercase tracking-widest mb-8"
            style={{
              color: "var(--color-text-muted)",
              fontSize: "0.72rem",
              opacity: 0.6,
            }}
          >
            Built for
          </p>
        </m.div>

        <m.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-5"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
          }}
        >
          {USE_CASES.map(({ Icon, label, description }) => (
            <m.div
              key={label}
              className="rounded-xl p-7 flex gap-6 items-start"
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-surface-line)",
              }}
              variants={{
                hidden: { opacity: 0, y: 24 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
              }}
              whileHover={
                reduced
                  ? {}
                  : {
                      y: -4,
                      borderColor: "var(--color-accent-border)",
                      boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
                    }
              }
              transition={{ duration: 0.25, ease: EASE }}
            >
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  backgroundColor: "var(--color-accent-soft)",
                  border: "1px solid var(--color-accent-border)",
                }}
              >
                <Icon size={16} style={{ color: "var(--color-accent)" }} strokeWidth={1.8} />
              </div>

              {/* Text */}
              <div>
                <h4
                  className="font-bold mb-2"
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "clamp(1.05rem, 2vw, 1.2rem)",
                    lineHeight: 1.25,
                    letterSpacing: "-0.01em",
                    color: "var(--color-text)",
                  }}
                >
                  {label}
                </h4>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.9rem",
                    lineHeight: 1.7,
                    color: "var(--color-text-muted)",
                    opacity: 0.85,
                  }}
                >
                  {description}
                </p>
              </div>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}

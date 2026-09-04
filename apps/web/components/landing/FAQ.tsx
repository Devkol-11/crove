"use client";

import { useState } from "react";
import { m, AnimatePresence, useReducedMotion } from "motion/react";
import { Plus } from "lucide-react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FAQS = [
  {
    q: "Do I need an account to use Crove?",
    a: "Not for Quick Link escrow. You can create an escrow, share the link, and receive funds without registering — the other party only needs to verify their email. Milestone, Conditional, and Deposit escrow types require an account for both parties.",
  },
  {
    q: "How are funds held — and are they safe?",
    a: "Funds are held in segregated escrow accounts, completely separate from Crove's operating capital. Your money is never accessible to us between deposit and release. We use bank-grade encryption for all payment flows and work with licensed financial institution partners.",
  },
  {
    q: "What happens if there's a dispute?",
    a: "Either party can flag a dispute before funds are released. Crove's dispute team reviews the terms both parties agreed to at the start of the deal and makes a release decision based on the evidence provided. Most disputes are resolved within 3–5 business days.",
  },
  {
    q: "How quickly are funds released after confirmation?",
    a: "Once the payer confirms the deal is complete, release is immediate on Crove's side. Settlement to your bank typically takes 1–2 business days depending on your withdrawal method.",
  },
  {
    q: "What payment methods does Crove accept?",
    a: "Crove accepts major debit and credit cards, bank transfers (ACH/SEPA), and select digital wallets. Available methods vary slightly by region. Cryptocurrency is not currently supported.",
  },
  {
    q: "How much does Crove charge?",
    a: "Crove charges a small percentage fee on the escrow amount — typically 1–3% depending on transaction size and type. The exact fee is always shown before any funds are committed. No hidden charges, no surprises.",
  },
  {
    q: "Can I cancel an escrow after funding it?",
    a: "Yes — if both parties agree to cancel, funds are returned to the payer. If only one party wants to cancel, the dispute process applies. Crove never unilaterally releases or withholds funds; both parties' agreement is always required.",
  },
  {
    q: "Is Crove a bank or financial institution?",
    a: "No. Crove is an escrow service, not a bank. We don't offer lending, interest accounts, or financial advice. Escrow funds are held with licensed banking partners and are FDIC-insured up to applicable limits.",
  },
];

function FAQItem({
  faq,
  index,
  isOpen,
  toggle,
  reduced,
}: {
  faq: { q: string; a: string };
  index: number;
  isOpen: boolean;
  toggle: () => void;
  reduced: boolean | null;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.5, delay: index * 0.04, ease: EASE }}
      style={{ borderBottom: "1px solid var(--color-surface-line)" }}
    >
      <button
        onClick={toggle}
        className="w-full flex items-start justify-between gap-6 py-6 text-left"
        aria-expanded={isOpen}
      >
        <span
          className="font-semibold"
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "clamp(0.9rem, 2vw, 1.0625rem)",
            lineHeight: 1.4,
            color: isOpen ? "var(--color-text)" : "var(--color-text-muted)",
            transition: "color 200ms ease",
          }}
        >
          {faq.q}
        </span>
        <m.span
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
          style={{
            backgroundColor: isOpen ? "var(--color-accent)" : "var(--color-accent-soft)",
            border: "1px solid var(--color-accent-border)",
            transition: "background-color 200ms ease",
          }}
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.25, ease: EASE }}
        >
          <Plus
            size={12}
            strokeWidth={2.8}
            style={{ color: isOpen ? "#0b0d10" : "var(--color-accent)" }}
          />
        </m.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <p
              className="pb-7"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.9375rem",
                lineHeight: 1.75,
                color: "var(--color-text-muted)",
                maxWidth: "640px",
              }}
            >
              {faq.a}
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}

export default function FAQ() {
  const reduced = useReducedMotion();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      id="faq"
      style={{
        borderTop: "1px solid var(--color-surface-line)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-24 sm:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-16 lg:gap-28">
          {/* Left: sticky heading */}
          <m.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.65, ease: EASE }}
            className="lg:sticky lg:top-28 self-start"
          >
            <div className="flex items-center gap-3 mb-5">
              <span
                className="h-px"
                style={{ width: "24px", backgroundColor: "var(--color-accent)", opacity: 0.7 }}
              />
              <p
                className="font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-accent)", fontSize: "0.72rem" }}
              >
                FAQ
              </p>
            </div>
            <h2
              className="font-bold mb-5"
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(2rem, 4vw, 2.75rem)",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                color: "var(--color-text)",
              }}
            >
              The answers<br />you're looking<br />for.
            </h2>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.9rem",
                lineHeight: 1.65,
                color: "var(--color-text-muted)",
                maxWidth: "200px",
                opacity: 0.8,
              }}
            >
              Still have questions?{" "}
              <a
                href="mailto:hello@crove.co"
                className="underline underline-offset-4"
                style={{ color: "var(--color-accent)" }}
              >
                Reach out.
              </a>
            </p>
          </m.div>

          {/* Right: accordion */}
          <div style={{ borderTop: "1px solid var(--color-surface-line)" }}>
            {FAQS.map((faq, i) => (
              <FAQItem
                key={i}
                faq={faq}
                index={i}
                isOpen={openIndex === i}
                toggle={() => setOpenIndex(openIndex === i ? null : i)}
                reduced={reduced}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

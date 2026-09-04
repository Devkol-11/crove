"use client";

import Link from "next/link";

const FOOTER_NAV = {
  Product: [
    { label: "Quick Escrow", href: "/quick" },
    { label: "Milestone Escrow", href: "/sign-up" },
    { label: "Conditional Escrow", href: "/sign-up" },
    { label: "Deposit Escrow", href: "/sign-up" },
    { label: "Pricing", href: "#pricing" },
    { label: "Docs", href: "#docs" },
  ],
  Company: [
    { label: "About", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Careers", href: "#" },
    { label: "Contact", href: "#" },
  ],
  Legal: [
    { label: "Terms of Service", href: "#" },
    { label: "Privacy Policy", href: "#" },
    { label: "Cookie Policy", href: "#" },
  ],
};

function CroveMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M3 7 L13 3 L13 14 L3 18 Z" fill="var(--color-accent)" />
      <path d="M13 14 L23 10 L25 21 L15 25 Z" fill="var(--color-accent)" opacity="0.55" />
      <rect x="9" y="12" width="10" height="4" rx="0.5" fill="var(--color-accent)" opacity="0.9" />
    </svg>
  );
}

export default function FinalCTA() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--color-surface-line)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-8 pt-16 pb-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-10 mb-14">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-4">
              <CroveMark />
              <span
                className="text-sm font-semibold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-text)" }}
              >
                Crove
              </span>
            </Link>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.875rem",
                lineHeight: 1.65,
                color: "var(--color-text-muted)",
                maxWidth: "180px",
                opacity: 0.8,
              }}
            >
              Escrow infrastructure for modern deals.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_NAV).map(([category, links]) => (
            <div key={category}>
              <p
                className="font-semibold mb-4 uppercase"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.08em",
                  color: "var(--color-text-muted)",
                }}
              >
                {category}
              </p>
              <ul className="flex flex-col gap-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="transition-colors hover:text-text"
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: "0.875rem",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-wrap items-center justify-between gap-4 pt-6"
          style={{ borderTop: "1px solid var(--color-surface-line)" }}
        >
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "var(--color-text-muted)",
              opacity: 0.8,
            }}
          >
            © 2026 Crove. All rights reserved.
          </p>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "var(--color-text-muted)",
              opacity: 0.5,
            }}
          >
            Not a bank. Not financial advice. Just escrow.
          </p>
        </div>
      </div>
    </footer>
  );
}

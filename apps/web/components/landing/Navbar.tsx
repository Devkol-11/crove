"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { m, AnimatePresence } from "motion/react";
import { Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
  { href: "#pricing", label: "Pricing" },
];

function CroveMark() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 7 L13 3 L13 14 L3 18 Z" fill="var(--color-accent)" />
      <path
        d="M13 14 L23 10 L25 21 L15 25 Z"
        fill="var(--color-accent)"
        opacity="0.55"
      />
      <rect x="9" y="12" width="10" height="4" rx="0.5" fill="var(--color-accent)" opacity="0.9" />
    </svg>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll(); // initialise on mount
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/*
       * backdrop-filter is always on; keeping it at blur(12px) regardless
       * of scrolled state avoids the "none → blur" transition issue across
       * browsers. The blur only becomes visible once the background gains opacity.
       */}
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          backgroundColor: scrolled ? "var(--color-nav-glass)" : "transparent",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: scrolled
            ? "1px solid var(--color-surface-line)"
            : "1px solid transparent",
          boxShadow: scrolled
            ? "0 4px 24px rgba(0,0,0,0.12), 0 1px 0 var(--color-surface-line)"
            : "none",
          transition:
            "background-color 350ms ease, border-color 350ms ease, box-shadow 350ms ease",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 flex items-center justify-between py-4 sm:py-5">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <CroveMark />
            <span
              className="text-base font-semibold tracking-tight"
              style={{
                fontFamily: "var(--font-heading)",
                color: "var(--color-text)",
              }}
            >
              Crove
            </span>
          </Link>

          {/* Desktop nav — wider gap so links breathe */}
          <nav
            className="hidden md:flex items-center gap-9"
            aria-label="Main navigation"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm transition-colors hover:text-text"
                style={{ color: "var(--color-text-muted)" }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTAs — all items share the same vertical center via items-center */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="text-sm px-4 py-2 rounded-full border transition-colors hover:border-accent-deep"
              style={{
                color: "var(--color-text-muted)",
                borderColor: "var(--color-surface-line)",
              }}
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm px-5 py-2 rounded-full font-semibold transition-all hover:brightness-110"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "#0b0d10",
              }}
            >
              Create escrow
            </Link>
          </div>

          {/* Mobile trigger */}
          <button
            className="md:hidden p-2 -mr-1 rounded"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <Menu
              size={22}
              style={{ color: "var(--color-text-muted)" }}
            />
          </button>
        </div>
      </header>

      {/* Mobile slide-in sheet */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <m.div
              className="fixed inset-0 z-50"
              style={{ backgroundColor: "var(--color-overlay)", backdropFilter: "blur(4px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />

            <m.div
              role="dialog"
              aria-label="Navigation menu"
              className="fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col px-6 py-6"
              style={{ backgroundColor: "var(--color-surface)" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.45 }}
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-2.5">
                  <CroveMark />
                  <span
                    className="text-base font-semibold"
                    style={{
                      fontFamily: "var(--font-heading)",
                      color: "var(--color-text)",
                    }}
                  >
                    Crove
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <ThemeToggle />
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="p-1 rounded"
                    aria-label="Close navigation"
                  >
                    <X size={20} style={{ color: "var(--color-text-muted)" }} />
                  </button>
                </div>
              </div>

              <nav className="flex flex-col">
                {NAV_LINKS.map((link, i) => (
                  <m.div
                    key={link.href}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.06 + i * 0.07,
                      ease: [0.22, 1, 0.36, 1],
                      duration: 0.38,
                    }}
                  >
                    <Link
                      href={link.href}
                      className="block py-3.5 text-base border-b"
                      style={{
                        color: "var(--color-text-muted)",
                        borderColor: "var(--color-surface-line)",
                      }}
                      onClick={() => setMobileOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </m.div>
                ))}
              </nav>

              <div className="mt-auto flex flex-col gap-3">
                <Link
                  href="/sign-in"
                  className="text-center py-3 rounded-full border text-sm font-medium"
                  style={{
                    color: "var(--color-text)",
                    borderColor: "var(--color-surface-line)",
                  }}
                  onClick={() => setMobileOpen(false)}
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="text-center py-3 rounded-full text-sm font-semibold"
                  style={{
                    backgroundColor: "var(--color-accent)",
                    color: "#0b0d10",
                  }}
                  onClick={() => setMobileOpen(false)}
                >
                  Create escrow
                </Link>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

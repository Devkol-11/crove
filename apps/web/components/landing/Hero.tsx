"use client";

import { useState, useEffect } from "react";
import { m, AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowRight, Zap, Lock, Check, Shield } from "lucide-react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ─── Live activity items cycling inside the card ─────────── */
const ACTIVITIES = [
  { label: "Payment secured", detail: "$3,200 held by Crove", time: "14m ago" },
  { label: "Work submitted", detail: "Files uploaded by Alex D.", time: "5m ago" },
  { label: "Review requested", detail: "Awaiting Sarah's confirmation", time: "just now" },
];

/* ─── Status step inside the escrow preview card ──────────── */
function Step({
  done,
  pulse,
  label,
}: {
  done: boolean;
  pulse?: boolean;
  label: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
      <span
        style={{
          width: "17px",
          height: "17px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          backgroundColor: done
            ? "rgba(34,197,94,0.14)"
            : pulse
            ? "var(--color-accent-soft)"
            : "transparent",
          border: `1px solid ${
            done
              ? "rgba(34,197,94,0.3)"
              : pulse
              ? "var(--color-accent-border)"
              : "var(--color-surface-line)"
          }`,
        }}
      >
        {done ? (
          <Check size={8} style={{ color: "#22c55e" }} strokeWidth={3.5} />
        ) : pulse ? (
          <m.span
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              backgroundColor: "var(--color-accent)",
              display: "block",
            }}
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : null}
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.78rem",
          color: done ? "var(--color-text-muted)" : pulse ? "var(--color-accent)" : "var(--color-text-muted)",
          opacity: done ? 0.7 : 1,
          fontWeight: pulse ? 500 : 400,
        }}
      >
        {label}
      </span>
    </div>
  );
}

/* ─── Cycling live-activity feed ───────────────────────────── */
function ActivityFeed() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % ACTIVITIES.length), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      style={{
        borderTop: "1px solid var(--color-surface-line)",
        paddingTop: "11px",
        marginTop: "11px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.58rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: "var(--color-text-muted)",
          opacity: 0.45,
          textTransform: "uppercase",
          marginBottom: "8px",
        }}
      >
        Live Activity
      </p>
      <AnimatePresence mode="wait">
        <m.div
          key={idx}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.28, ease: EASE }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.72rem",
                fontWeight: 600,
                color: "var(--color-text)",
                lineHeight: 1.3,
              }}
            >
              {ACTIVITIES[idx].label}
            </p>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.64rem",
                color: "var(--color-text-muted)",
                opacity: 0.6,
                lineHeight: 1.3,
              }}
            >
              {ACTIVITIES[idx].detail}
            </p>
          </div>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.6rem",
              color: "var(--color-text-muted)",
              opacity: 0.45,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {ACTIVITIES[idx].time}
          </span>
        </m.div>
      </AnimatePresence>
    </div>
  );
}

/* ─── The animated escrow deal preview ───────────────────── */
function EscrowPreview({ reduced }: { reduced: boolean | null }) {
  return (
    <m.div
      className="hidden xl:flex xl:flex-col ml-auto shrink-0 gap-3"
      style={{ width: "clamp(340px, 36vw, 430px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.85, delay: 0.3, ease: EASE }}
    >
      {/* Floating oscillation wrapper */}
      <m.div
        animate={reduced ? {} : { y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
      >
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-surface-line)",
            borderRadius: "18px",
            overflow: "hidden",
            boxShadow: "var(--shadow-hero-card)",
          }}
        >
          {/* ── Card header ─────────────────────────── */}
          <div
            style={{
              padding: "15px 20px",
              borderBottom: "1px solid var(--color-surface-line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Zap size={11} style={{ color: "var(--color-accent)" }} strokeWidth={2.5} />
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.02em",
                }}
              >
                Quick Link Escrow
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <m.span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#22c55e",
                  display: "block",
                }}
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  color: "#22c55e",
                  letterSpacing: "0.1em",
                }}
              >
                ACTIVE
              </span>
            </div>
          </div>

          {/* ── Card body ────────────────────────────── */}
          <div style={{ padding: "18px 20px" }}>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.75rem",
                color: "var(--color-text-muted)",
                marginBottom: "4px",
                opacity: 0.7,
              }}
            >
              Website Redesign — Phase 1
            </p>
            <p
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "1.85rem",
                fontWeight: 700,
                color: "var(--color-text)",
                letterSpacing: "-0.03em",
                marginBottom: "14px",
                lineHeight: 1,
              }}
            >
              $3,200
              <span style={{ fontSize: "1rem", opacity: 0.35 }}>.00</span>
            </p>

            {/* Progress bar */}
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "5px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.6rem",
                    color: "var(--color-text-muted)",
                    opacity: 0.55,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Escrow progress
                </span>
                <m.span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.62rem",
                    fontWeight: 700,
                    color: "var(--color-accent)",
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.8, duration: 0.4 }}
                >
                  67%
                </m.span>
              </div>
              <div
                style={{
                  height: "3px",
                  backgroundColor: "var(--color-surface-line)",
                  borderRadius: "9999px",
                  overflow: "hidden",
                }}
              >
                <m.div
                  style={{
                    height: "100%",
                    backgroundColor: "var(--color-accent)",
                    borderRadius: "9999px",
                  }}
                  initial={{ width: "0%" }}
                  animate={{ width: "67%" }}
                  transition={{ duration: 1.4, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>

            {/* ── Three-party flow ─────────────────── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                backgroundColor: "var(--color-bg)",
                borderRadius: "11px",
                border: "1px solid var(--color-surface-line)",
                marginBottom: "12px",
              }}
            >
              {/* Payer */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    backgroundColor: "var(--color-accent-soft)",
                    border: "1px solid var(--color-accent-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 4px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--color-accent)",
                    fontFamily: "var(--font-heading)",
                  }}
                >
                  S
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "0.6rem", fontWeight: 600, color: "var(--color-text)", lineHeight: 1.2 }}>Sarah M.</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "0.57rem", color: "var(--color-text-muted)", opacity: 0.6 }}>Payer</div>
              </div>

              {/* Animated payment flow line → Crove */}
              <div
                style={{
                  flex: 1,
                  position: "relative",
                  height: "20px",
                  margin: "0 6px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {/* Base line */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    height: "1px",
                    backgroundColor: "var(--color-accent)",
                    opacity: 0.4,
                  }}
                />
                {/* Traveling payment dot */}
                <m.div
                  style={{
                    position: "absolute",
                    top: "50%",
                    marginTop: "-4px",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: "var(--color-accent)",
                    boxShadow: "0 0 6px rgba(255,200,37,0.7)",
                  }}
                  animate={{ left: ["-4px", "calc(100% - 4px)"] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatDelay: 0.8,
                  }}
                />
                {/* Arrow head */}
                <ArrowRight
                  size={9}
                  style={{ position: "absolute", right: -2, color: "var(--color-accent)", opacity: 0.7 }}
                />
              </div>

              {/* Crove lock — central element with ripple */}
              <div style={{ textAlign: "center", position: "relative" }}>
                <div style={{ position: "relative", display: "inline-block" }}>
                  {/* Ripple ring */}
                  <m.div
                    style={{
                      position: "absolute",
                      inset: "-5px",
                      borderRadius: "13px",
                      border: "1.5px solid var(--color-accent)",
                      pointerEvents: "none",
                    }}
                    animate={{ scale: [1, 1.55], opacity: [0.55, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", repeatDelay: 0.4 }}
                  />
                  {/* Second ripple ring, offset */}
                  <m.div
                    style={{
                      position: "absolute",
                      inset: "-5px",
                      borderRadius: "13px",
                      border: "1.5px solid var(--color-accent)",
                      pointerEvents: "none",
                    }}
                    animate={{ scale: [1, 1.55], opacity: [0.4, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: 1.1, repeatDelay: 0.4 }}
                  />
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      backgroundColor: "var(--color-accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 4px 14px rgba(255,200,37,0.4)",
                    }}
                  >
                    <Lock size={13} style={{ color: "#0b0d10" }} strokeWidth={2.5} />
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "0.6rem", fontWeight: 600, color: "var(--color-text)", lineHeight: 1.2, marginTop: "5px" }}>Crove</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "0.57rem", color: "var(--color-accent)", opacity: 0.85 }}>Holding</div>
              </div>

              {/* Dashed line → Payee (pending) */}
              <div
                style={{
                  flex: 1,
                  position: "relative",
                  height: "20px",
                  margin: "0 6px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    height: "1px",
                    borderTop: "1px dashed var(--color-surface-line)",
                  }}
                />
                <ArrowRight
                  size={9}
                  style={{ position: "absolute", right: -2, color: "var(--color-text-muted)", opacity: 0.25 }}
                />
              </div>

              {/* Payee — dimmed, pending release */}
              <div style={{ textAlign: "center", opacity: 0.4 }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    backgroundColor: "var(--color-surface-line)",
                    border: "1px solid var(--color-surface-line)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 4px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--color-text-muted)",
                    fontFamily: "var(--font-heading)",
                  }}
                >
                  A
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "0.6rem", fontWeight: 600, color: "var(--color-text-muted)", lineHeight: 1.2 }}>Alex D.</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "0.57rem", color: "var(--color-text-muted)", opacity: 0.6 }}>Payee</div>
              </div>
            </div>

            {/* Status steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "2px" }}>
              <Step done label="Funds secured by Crove" />
              <Step done label="Work submitted by payee" />
              <Step done={false} pulse label="Awaiting payer confirmation" />
            </div>

            {/* Live activity feed */}
            <ActivityFeed />
          </div>

          {/* ── CTA button row ─────────────────────── */}
          <div style={{ padding: "0 20px 18px" }}>
            <m.div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "12px 16px",
                borderRadius: "10px",
                backgroundColor: "var(--color-accent)",
                cursor: "default",
                userSelect: "none",
              }}
              animate={{
                boxShadow: [
                  "0 4px 16px rgba(255,200,37,0.2)",
                  "0 8px 28px rgba(255,200,37,0.5)",
                  "0 4px 16px rgba(255,200,37,0.2)",
                ],
              }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            >
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "#0b0d10",
                }}
              >
                Confirm delivery
              </span>
              <ArrowRight size={12} style={{ color: "#0b0d10" }} />
            </m.div>
          </div>
        </div>
      </m.div>

      {/* Security trust chip */}
      <m.div
        animate={reduced ? {} : { y: [0, -5, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1.9 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "11px 16px",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-surface-line)",
          borderRadius: "12px",
          boxShadow: "var(--shadow-hero-card)",
          alignSelf: "flex-start",
        }}
      >
        <span
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            backgroundColor: "var(--color-accent-soft)",
            border: "1px solid var(--color-accent-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Shield size={12} style={{ color: "var(--color-accent)" }} strokeWidth={2} />
        </span>
        <div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text)", lineHeight: 1.2 }}>
            Funds are protected
          </p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.65rem", color: "var(--color-text-muted)", opacity: 0.65, lineHeight: 1.3 }}>
            Held with licensed banking partners
          </p>
        </div>
      </m.div>
    </m.div>
  );
}

/* ─── Hero section ─────────────────────────────────────────── */
export default function Hero() {
  const reduced = useReducedMotion();

  const fadeUp = {
    hidden: { opacity: 0 },
    visible: (i: number) => ({
      opacity: 1,
      transition: {
        delay: i * 0.14,
        duration: 0.65,
        ease: EASE,
      },
    }),
  };

  return (
    <section
      className="relative w-full min-h-screen flex items-center"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <div
        className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 flex items-center gap-16 xl:gap-24"
        style={{
          paddingTop: "clamp(80px, 12vw, 140px)",
          paddingBottom: "clamp(80px, 12vw, 140px)",
        }}
      >
        {/* Left: text column */}
        <m.div
          className="flex-1"
          style={{ maxWidth: "560px" }}
          initial="hidden"
          animate="visible"
        >
          {/* Eyebrow */}
          <m.div
            variants={fadeUp}
            custom={0}
            className="inline-flex items-center gap-2 mb-7"
            style={{
              padding: "6px 14px",
              borderRadius: "9999px",
              backgroundColor: "var(--color-accent-soft)",
              border: "1px solid var(--color-accent-border)",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: "var(--color-accent)",
                display: "block",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--color-accent)",
                letterSpacing: "0.02em",
              }}
            >
              Escrow infrastructure for modern deals
            </span>
          </m.div>

          <m.h1
            variants={fadeUp}
            custom={1}
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(2.25rem, 5.5vw, 3.75rem)",
              lineHeight: 1.04,
              letterSpacing: "-0.025em",
              color: "var(--color-text)",
              fontWeight: 700,
              marginBottom: "24px",
            }}
          >
            Your money.
            <br />
            Held until the
            <br />
            deal is done.
          </m.h1>

          <m.p
            variants={fadeUp}
            custom={2}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "clamp(1rem, 2.2vw, 1.125rem)",
              lineHeight: 1.7,
              color: "var(--color-text-muted)",
              maxWidth: "460px",
              marginBottom: "36px",
            }}
          >
            Create a secure escrow, share one link, and release funds only
            when both sides agree the deal is done.
          </m.p>

          <m.div
            variants={fadeUp}
            custom={3}
            className="flex flex-wrap items-center gap-4"
          >
            {/* CTA — pulsing rings + periodic shake to demand attention */}
            <div className="relative inline-flex">
              {/* Rings emit outward continuously */}
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
                color: "#0b0d10",
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
                        "0 8px 28px rgba(255,200,37,0.25)",
                        "0 8px 28px rgba(255,200,37,0.25)",
                        "0 8px 28px rgba(255,200,37,0.25)",
                        "0 8px 28px rgba(255,200,37,0.25)",
                        "0 8px 28px rgba(255,200,37,0.25)",
                        "0 8px 28px rgba(255,200,37,0.25)",
                        "0 8px 28px rgba(255,200,37,0.25)",
                        "0 14px 40px rgba(255,200,37,0.55)",
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

            <a
              href="#how-it-works"
              className="text-sm font-medium underline-offset-4 hover:underline"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-text-muted)" }}
            >
              See how it works
            </a>
          </m.div>
        </m.div>

        {/* Right: animated escrow deal card */}
        <EscrowPreview reduced={reduced} />
      </div>
    </section>
  );
}

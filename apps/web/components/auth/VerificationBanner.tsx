"use client";

import { useState } from "react";
import { MailCheck, RefreshCw } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function VerificationBanner() {
  const { data: session, isPending } = authClient.useSession();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // Don't render while session is loading, when there's no session, or when verified
  if (isPending || !session || session.user.emailVerified) return null;

  async function handleResend() {
    if (resending || resent) return;
    setResending(true);
    await authClient.$fetch("/send-verification-email", {
      method: "POST",
      body: { email: session!.user.email },
    });
    setResending(false);
    setResent(true);
  }

  return (
    <div
      role="alert"
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-medium"
      style={{
        backgroundColor: "var(--color-accent)",
        color: "#0b0d10",
        position: "sticky",
        top: 0,
        zIndex: 60,
      }}
    >
      <MailCheck size={15} strokeWidth={2.2} aria-hidden="true" />

      <span>
        Check your email to verify your account — financial actions require a verified email.
      </span>

      <button
        onClick={handleResend}
        disabled={resending || resent}
        className="flex items-center gap-1 underline underline-offset-2 disabled:no-underline disabled:opacity-60 hover:opacity-80 transition-opacity"
        aria-label="Resend verification email"
      >
        {resending ? (
          <>
            <RefreshCw size={12} className="animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : resent ? (
          "Sent ✓"
        ) : (
          "Resend email"
        )}
      </button>
    </div>
  );
}

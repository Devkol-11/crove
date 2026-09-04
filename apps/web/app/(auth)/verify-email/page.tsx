"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import AuthCard from "@/components/auth/AuthCard";

type Status = "verifying" | "success" | "error";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token found. Please use the link sent to your email.");
      return;
    }

    authClient.$fetch<{ status: boolean }>("/verify-email", {
      method: "POST",
      body: { token },
    }).then(({ error }) => {
      if (error) {
        setStatus("error");
        setErrorMsg(
          (error as { message?: string }).message ??
            "This verification link is invalid or has expired."
        );
      } else {
        setStatus("success");
        setTimeout(() => router.push("/dashboard"), 2500);
      }
    });
  }, [token, router]);

  if (status === "verifying") {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <Loader2
            size={32}
            className="animate-spin"
            style={{ color: "var(--color-accent)" }}
          />
          <div>
            <h2
              className="text-lg font-semibold mb-1"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-text)" }}
            >
              Verifying your email…
            </h2>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Just a moment.
            </p>
          </div>
        </div>
      </AuthCard>
    );
  }

  if (status === "success") {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center gap-4 py-2">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full"
            style={{ backgroundColor: "var(--color-accent-soft)" }}
          >
            <CheckCircle size={22} style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <h2
              className="text-lg font-semibold mb-2"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-text)" }}
            >
              Email verified
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              Your account is now fully active. Redirecting you to your dashboard…
            </p>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="flex flex-col items-center text-center gap-4 py-2">
        <div
          className="flex items-center justify-center w-12 h-12 rounded-full"
          style={{ backgroundColor: "rgba(248,113,113,0.12)" }}
        >
          <AlertTriangle size={22} style={{ color: "#f87171" }} />
        </div>
        <div>
          <h2
            className="text-lg font-semibold mb-2"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-text)" }}
          >
            Verification failed
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            {errorMsg}
          </p>
        </div>
        <Link
          href="/sign-in"
          className="text-sm font-medium rounded-full px-5 py-2.5 mt-1 transition-all hover:brightness-110"
          style={{ backgroundColor: "var(--color-accent)", color: "#0b0d10" }}
        >
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}

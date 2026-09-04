"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import AuthCard from "@/components/auth/AuthCard";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    const { error } = await authClient.$fetch("/forget-password", {
      method: "POST",
      body: {
        email: values.email,
        redirectTo: `${window.location.origin}/reset-password`,
      },
    });

    if (error) {
      setError("root", {
        message: error.message ?? "Could not send reset link. Please try again.",
      });
      return;
    }

    setSentTo(values.email);
    setSent(true);
  }

  if (sent) {
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
              Check your inbox
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              We sent a password reset link to{" "}
              <span style={{ color: "var(--color-text)" }}>{sentTo}</span>. It
              expires in 1 hour.
            </p>
          </div>
          <Link
            href="/sign-in"
            className="text-sm font-medium hover:underline underline-offset-4 mt-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1
        className="text-xl font-semibold mb-1"
        style={{ fontFamily: "var(--font-heading)", color: "var(--color-text)" }}
      >
        Reset your password
      </h1>
      <p className="text-sm mb-7" style={{ color: "var(--color-text-muted)" }}>
        Enter your email and we&apos;ll send a reset link.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="reset-email"
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            Email
          </label>
          <input
            {...register("email")}
            id="reset-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            disabled={isSubmitting}
            className="auth-input"
          />
          {errors.email && (
            <p className="mt-1.5 text-xs" style={{ color: "#f87171" }}>
              {errors.email.message}
            </p>
          )}
        </div>

        {errors.root && (
          <div
            className="rounded-lg px-3.5 py-2.5 text-sm"
            style={{ backgroundColor: "rgba(248,113,113,0.1)", color: "#f87171" }}
            role="alert"
          >
            {errors.root.message}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full font-semibold text-sm py-[13px] mt-1 transition-all disabled:opacity-50 hover:brightness-110"
          style={{ backgroundColor: "var(--color-accent)", color: "#0b0d10" }}
        >
          {isSubmitting ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link
          href="/sign-in"
          className="hover:underline underline-offset-4"
          style={{ color: "var(--color-text-muted)" }}
        >
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}

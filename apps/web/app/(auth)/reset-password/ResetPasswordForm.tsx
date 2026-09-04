"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, CheckCircle, AlertTriangle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import AuthCard from "@/components/auth/AuthCard";

const schema = z
  .object({
    password: z.string().min(8, "Must be at least 8 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordForm({ token }: { token: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Token missing means the user landed here without a valid reset link
  if (!token) {
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
              Invalid reset link
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              This link is missing a reset token. Request a new one from the
              forgot password page.
            </p>
          </div>
          <Link
            href="/forgot-password"
            className="text-sm font-medium rounded-full px-5 py-2.5 mt-1 transition-all hover:brightness-110"
            style={{ backgroundColor: "var(--color-accent)", color: "#0b0d10" }}
          >
            Request a new link
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (done) {
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
              Password updated
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              Your password has been reset. You can now sign in with your new
              password.
            </p>
          </div>
          <Link
            href="/sign-in"
            className="text-sm font-medium rounded-full px-5 py-2.5 mt-1 transition-all hover:brightness-110"
            style={{ backgroundColor: "var(--color-accent)", color: "#0b0d10" }}
          >
            Sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  async function onSubmit(values: FormValues) {
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    });

    if (error) {
      if (error.message?.toLowerCase().includes("expired") || error.message?.toLowerCase().includes("invalid")) {
        setError("root", {
          message: "This reset link has expired or is invalid. Request a new one.",
        });
      } else {
        setError("root", { message: error.message ?? "Something went wrong. Please try again." });
      }
      return;
    }

    setDone(true);
  }

  return (
    <AuthCard>
      <h1
        className="text-xl font-semibold mb-1"
        style={{ fontFamily: "var(--font-heading)", color: "var(--color-text)" }}
      >
        Choose a new password
      </h1>
      <p className="text-sm mb-7" style={{ color: "var(--color-text-muted)" }}>
        Must be at least 8 characters.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="new-password"
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            New password
          </label>
          <div className="relative">
            <input
              {...register("password")}
              id="new-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              aria-invalid={!!errors.password}
              disabled={isSubmitting}
              className="auth-input"
              style={{ paddingRight: "40px" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff size={15} style={{ color: "var(--color-text-muted)" }} />
              ) : (
                <Eye size={15} style={{ color: "var(--color-text-muted)" }} />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1.5 text-xs" style={{ color: "#f87171" }}>
              {errors.password.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirm-password"
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            Confirm password
          </label>
          <div className="relative">
            <input
              {...register("confirmPassword")}
              id="confirm-password"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Repeat your password"
              aria-invalid={!!errors.confirmPassword}
              disabled={isSubmitting}
              className="auth-input"
              style={{ paddingRight: "40px" }}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              aria-label={showConfirm ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showConfirm ? (
                <EyeOff size={15} style={{ color: "var(--color-text-muted)" }} />
              ) : (
                <Eye size={15} style={{ color: "var(--color-text-muted)" }} />
              )}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="mt-1.5 text-xs" style={{ color: "#f87171" }}>
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {errors.root && (
          <div
            className="rounded-lg px-3.5 py-2.5 text-sm"
            style={{ backgroundColor: "rgba(248,113,113,0.1)", color: "#f87171" }}
            role="alert"
          >
            {errors.root.message}{" "}
            {errors.root.message?.includes("expired") && (
              <Link
                href="/forgot-password"
                className="underline underline-offset-2"
              >
                Request a new link
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full font-semibold text-sm py-[13px] mt-1 transition-all disabled:opacity-50 hover:brightness-110"
          style={{ backgroundColor: "var(--color-accent)", color: "#0b0d10" }}
        >
          {isSubmitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthCard>
  );
}

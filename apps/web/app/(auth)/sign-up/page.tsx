"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import AuthCard from "@/components/auth/AuthCard";

const schema = z.object({
  firstName: z.string().min(1, "Required").max(50),
  lastName: z.string().min(1, "Required").max(50),
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Must be at least 8 characters")
    .max(128),
});

type FormValues = z.infer<typeof schema>;

function GoogleIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function SignUpPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const isBusy = isSubmitting || isGoogleLoading;

  async function onSubmit(values: FormValues) {
    // additionalFields (firstName, lastName) are configured in the Better Auth server.
    // The client type doesn't include them by default; we cast to pass them through.
    const { error } = await (authClient.signUp.email as (
      data: FormValues & { name: string }
    ) => Promise<{ error: { message?: string } | null }>)({
      ...values,
      name: `${values.firstName} ${values.lastName}`,
    });

    if (error) {
      if (error.message?.toLowerCase().includes("email")) {
        setError("email", { message: error.message });
      } else {
        setError("root", { message: error.message ?? "Something went wrong. Please try again." });
      }
      return;
    }

    router.push("/dashboard");
  }

  async function handleGoogle() {
    setIsGoogleLoading(true);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
    setIsGoogleLoading(false);
  }

  return (
    <AuthCard>
      <h1
        className="text-xl font-semibold mb-1"
        style={{ fontFamily: "var(--font-heading)", color: "var(--color-text)" }}
      >
        Create your account
      </h1>
      <p className="text-sm mb-7" style={{ color: "var(--color-text-muted)" }}>
        Set up a free Crove account to start creating escrows.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" error={errors.firstName?.message}>
            <input
              {...register("firstName")}
              id="first-name"
              type="text"
              autoComplete="given-name"
              placeholder="Ada"
              aria-invalid={!!errors.firstName}
              disabled={isBusy}
              className="auth-input"
            />
          </Field>
          <Field label="Last name" error={errors.lastName?.message}>
            <input
              {...register("lastName")}
              id="last-name"
              type="text"
              autoComplete="family-name"
              placeholder="Lovelace"
              aria-invalid={!!errors.lastName}
              disabled={isBusy}
              className="auth-input"
            />
          </Field>
        </div>

        <Field label="Email" error={errors.email?.message}>
          <input
            {...register("email")}
            id="sign-up-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            disabled={isBusy}
            className="auth-input"
          />
        </Field>

        <Field label="Password" error={errors.password?.message}>
          <div className="relative">
            <input
              {...register("password")}
              id="sign-up-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              aria-invalid={!!errors.password}
              disabled={isBusy}
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
        </Field>

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
          disabled={isBusy}
          className="w-full rounded-full font-semibold text-sm py-[13px] mt-1 transition-all disabled:opacity-50 hover:brightness-110"
          style={{ backgroundColor: "var(--color-accent)", color: "#0b0d10" }}
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-surface-line)" }} />
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          or
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-surface-line)" }} />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={isBusy}
        className="w-full flex items-center justify-center gap-2.5 rounded-full text-sm font-medium py-[11px] border transition-colors disabled:opacity-50"
        style={{
          borderColor: "var(--color-surface-line)",
          color: "var(--color-text)",
        }}
      >
        {isGoogleLoading ? (
          <span style={{ color: "var(--color-text-muted)" }}>Redirecting…</span>
        ) : (
          <>
            <GoogleIcon />
            Continue with Google
          </>
        )}
      </button>

      <p className="mt-6 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-medium hover:underline underline-offset-4"
          style={{ color: "var(--color-text)" }}
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

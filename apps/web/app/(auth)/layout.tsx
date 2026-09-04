import Link from "next/link";

function CroveMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M3 7 L13 3 L13 14 L3 18 Z" fill="var(--color-accent)" />
      <path d="M13 14 L23 10 L25 21 L15 25 Z" fill="var(--color-accent)" opacity="0.55" />
      <rect x="9" y="12" width="10" height="4" rx="0.5" fill="var(--color-accent)" opacity="0.9" />
    </svg>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <CroveMark />
        <span
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--color-text)",
            fontWeight: 600,
            fontSize: "1rem",
          }}
        >
          Crove
        </span>
      </Link>
      {children}
    </div>
  );
}

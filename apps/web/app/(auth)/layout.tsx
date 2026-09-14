import Link from "next/link";
import { CroveLogo } from "@/components/landing/Navbar";
import { WavyBackground } from "@/components/ui/wavy-background";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* ── Left: Form panel ─────────────────────────────── */}
      <div
        className="flex-1 flex flex-col min-h-screen px-8 lg:px-14 py-10"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 mb-12 shrink-0">
          <CroveLogo size={22} />
          <span
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--color-text)",
              fontWeight: 600,
              fontSize: "1rem",
              letterSpacing: "-0.01em",
            }}
          >
            Crove
          </span>
        </Link>

        {/* Centered form */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-100">{children}</div>
        </div>
      </div>

      {/* ── Right: Hero background panel ──────────────────── */}
      <div className="hidden lg:block lg:w-[48%] xl:w-[44%] relative overflow-hidden">
        <div className="absolute inset-0">
          <WavyBackground
            containerClassName="h-full w-full"
            backgroundFill="#060e08"
            speed="slow"
            waveOpacity={0.4}
            blur={8}
          />
        </div>
      </div>
    </div>
  );
}

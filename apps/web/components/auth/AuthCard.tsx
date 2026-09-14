export default function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full rounded-2xl p-8 sm:p-9"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-surface-line)",
      }}
    >
      {children}
    </div>
  );
}

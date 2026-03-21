export function AuthCard({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-panel relative z-10 w-full max-w-xl overflow-hidden border border-[var(--line)] bg-white p-8 md:p-10">
      <div className="mb-8 space-y-3">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="section-title text-4xl font-semibold tracking-[-0.06em] md:text-5xl">{title}</h1>
        <p className="max-w-lg text-sm text-[var(--muted)] md:text-base">{description}</p>
      </div>
      {children}
    </div>
  );
}
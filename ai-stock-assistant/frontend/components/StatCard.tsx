export default function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-5 shadow-sm">
      <p className="text-xs font-medium text-(--color-text-secondary)">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color || "text-(--color-text-primary)"}`}>{value}</p>
    </div>
  );
}

type TransferProgressProps = {
  label: string;
  current: number;
  total: number;
  indices?: number[];
};

export function TransferProgress({
  label,
  current,
  total,
  indices,
}: TransferProgressProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">{label}</h2>
      <p className="mt-2 text-2xl font-bold text-slate-900">
        {current} / {total}
      </p>
      {indices && indices.length > 0 ? (
        <p className="mt-2 break-words text-sm text-slate-600">
          {indices.join(", ")}
        </p>
      ) : null}
    </section>
  );
}

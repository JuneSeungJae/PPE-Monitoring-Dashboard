export default function KpiCard({ title, value, sub, tone = 'default' }) {
  const accentColor =
    tone === 'warn'
      ? 'border-l-amber-500'
      : tone === 'good'
        ? 'border-l-emerald-500'
        : 'border-l-slate-600'

  const valueColor =
    tone === 'warn'
      ? 'text-amber-300'
      : tone === 'good'
        ? 'text-emerald-300'
        : 'text-slate-100'

  return (
    <article className={`rounded-lg border border-slate-700/50 border-l-2 ${accentColor} bg-slate-900/40 px-3 py-2.5`}>
      <p className="text-[10px] text-slate-500 leading-tight mb-1.5 font-medium uppercase tracking-wide">{title}</p>
      <p className={`text-xl font-bold leading-none tracking-tight tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-[10px] text-slate-600 mt-1 leading-tight">{sub}</p>
    </article>
  )
}

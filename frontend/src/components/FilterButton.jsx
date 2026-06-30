export default function FilterButton({ label, value, current, onChange }) {
  const active = current === value

  return (
    <button
      onClick={() => onChange(value)}
      className={`text-[11px] px-2.5 py-1 rounded border transition-colors font-medium ${
        active
          ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-300'
          : 'border-slate-700/60 bg-slate-900/60 text-slate-500 hover:text-slate-300 hover:border-slate-600'
      }`}
    >
      {label}
    </button>
  )
}

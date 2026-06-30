function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function StatsChart({ alerts }) {
  const violations = alerts.filter((a) => a.type !== 'ok')

  // 위반 유형별
  const helmetCount = violations.filter((a) => a.type === 'helmet').length
  const vestCount   = violations.filter((a) => a.type === 'vest').length
  const bothCount   = violations.filter((a) => a.type === 'both').length
  const maxType = Math.max(helmetCount, vestCount, bothCount, 1)

  // 카메라별
  const camMap = {}
  violations.forEach((a) => {
    const cam = a.camera || 'Unknown'
    camMap[cam] = (camMap[cam] || 0) + 1
  })
  const camEntries = Object.entries(camMap).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const maxCam = Math.max(...camEntries.map(([, v]) => v), 1)

  // 처리 현황
  const statusCounts = {
    new:         alerts.filter((a) => a.status === 'new').length,
    acked:       alerts.filter((a) => a.status === 'acked').length,
    in_progress: alerts.filter((a) => a.status === 'in_progress').length,
    resolved:    alerts.filter((a) => a.status === 'resolved').length,
  }

  return (
    <div className="space-y-5 overflow-y-auto flex-1 min-h-0 pr-0.5">

      {/* ── 위반 유형 ── */}
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2.5">위반 유형</p>
        <div className="space-y-2.5">
          {[
            { label: '안전모 미착용', value: helmetCount, color: 'bg-rose-500' },
            { label: '조끼 미착용',   value: vestCount,   color: 'bg-amber-500' },
            { label: '모두 미착용',   value: bothCount,   color: 'bg-orange-500' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-slate-500">{label}</span>
                <span className="text-slate-200 font-bold tabular-nums">{value}</span>
              </div>
              <Bar value={value} max={maxType} color={color} />
            </div>
          ))}
        </div>
      </div>

      {/* ── 카메라별 위반 ── */}
      {camEntries.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2.5">카메라별 위반</p>
          <div className="space-y-2.5">
            {camEntries.map(([cam, count]) => (
              <div key={cam}>
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-slate-500 truncate max-w-[140px]">{cam}</span>
                  <span className="text-slate-200 font-bold tabular-nums ml-1">{count}</span>
                </div>
                <Bar value={count} max={maxCam} color="bg-indigo-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 처리 현황 ── */}
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2.5">처리 현황</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: '미확인',  value: statusCounts.new,         textColor: 'text-rose-300',    border: 'border-rose-500/20',    bg: 'bg-rose-500/8' },
            { label: '확인 중', value: statusCounts.acked,       textColor: 'text-emerald-300', border: 'border-emerald-500/20', bg: 'bg-emerald-500/8' },
            { label: '처리 중', value: statusCounts.in_progress, textColor: 'text-amber-300',   border: 'border-amber-500/20',   bg: 'bg-amber-500/8' },
            { label: '완료',    value: statusCounts.resolved,    textColor: 'text-slate-400',   border: 'border-slate-700/40',   bg: 'bg-slate-800/40' },
          ].map(({ label, value, textColor, border, bg }) => (
            <div key={label} className={`rounded-xl border ${border} ${bg} px-3 py-2.5 text-center`}>
              <p className={`text-xl font-bold tabular-nums leading-none ${textColor}`}>{value}</p>
              <p className="text-[10px] text-slate-600 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

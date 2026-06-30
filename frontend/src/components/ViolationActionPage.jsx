import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client/dist/sockjs.js'

const API_BASE = 'http://localhost:8080'
const PAGE_SIZE = 20

const DETECT_CODE_LABEL = {
  1: '안전모 미착용',
  2: '안전조끼 미착용',
  3: '안전모/조끼 미착용',
}

const DETECT_CODE_STYLE = {
  1: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
  2: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  3: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
}

// 4단계 처리 상태
const STATUS_LABEL = {
  new:         '신규',
  acked:       '확인됨',
  in_progress: '처리중',
  resolved:    '완료',
}
const STATUS_STYLE = {
  new:         'bg-slate-500/20 text-slate-300 border-slate-500/30',
  acked:       'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  in_progress: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  resolved:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
}
const STATUS_ORDER = ['new', 'acked', 'in_progress', 'resolved']

const DEMO_ACCOUNT = { id: 'safety-admin', password: 'admin1234', name: '안전관리자' }

const shell = 'min-h-screen bg-[radial-gradient(ellipse_at_top,#0d1f3c_0%,#020617_55%)] text-slate-100 p-3'
const panel = 'mx-auto w-full max-w-[1600px] rounded-2xl border border-slate-700/50 bg-slate-950/80 p-4 shadow-2xl shadow-black/60 backdrop-blur-md'

function formatDt(isoStr) {
  if (!isoStr) return '-'
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  return d.toLocaleString('ko-KR', { hour12: false })
}

function normalizeCctv(raw) {
  if (!raw) return '-'
  const s = String(raw)
  if (/^cam\s*\d/i.test(s)) return s.toUpperCase()
  const n = parseInt(s, 10)
  return isNaN(n) ? s : `CAM ${String(n).padStart(2, '0')}`
}

const ShieldIcon = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
)

export default function ViolationActionPage({ onBack }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // ── 인증 ──────────────────────────────────────────────────
  const [jwtToken, setJwtToken] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [loggedInName, setLoggedInName] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // ── 페이지네이션 ───────────────────────────────────────────
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)

  // ── 메모 모달 ──────────────────────────────────────────────
  const [notesModal, setNotesModal] = useState(null)
  const [notesInput, setNotesInput] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)

  // ── 이미지 모달 ────────────────────────────────────────────
  const [imageModal, setImageModal] = useState(null)

  // ── 필터 / 선택 ────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [processedFilter, setProcessedFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [cctvFilter, setCctvFilter] = useState('all')
  const [wsConnected, setWsConnected] = useState(false)
  const stompClientRef = useRef(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  // JWT 헤더 헬퍼
  const authHeader = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
  }), [jwtToken])

  const loadEvents = useCallback(async (targetPage = 0) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `${API_BASE}/api/event/paged?page=${targetPage}&size=${PAGE_SIZE}`,
        { headers: authHeader() },
      )
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()
      setRows(data.content || [])
      setPage(data.page ?? targetPage)
      setTotalPages(data.totalPages ?? 1)
      setTotalElements(data.totalElements ?? 0)
    } catch (e) {
      setError(`이벤트 로드 실패: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [authHeader])

  useEffect(() => {
    if (isLoggedIn) loadEvents(0)
  }, [isLoggedIn, loadEvents])

  // WebSocket 실시간 연동 — STOMP connectHeaders에 JWT 전달
  useEffect(() => {
    if (!isLoggedIn) return
    let client = null
    try {
      client = new Client({
        webSocketFactory: () => new SockJS('/ws/events'),
        reconnectDelay: 3000,
        // JWT가 있으면 STOMP CONNECT 헤더에 포함
        connectHeaders: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
        onConnect: () => {
          setWsConnected(true)
          client.subscribe('/topic/events', (message) => {
            try {
              const incoming = JSON.parse(message.body)
              if (!incoming?.id) return
              setRows((prev) => {
                const exists = prev.some((r) => r.id === incoming.id)
                if (exists) {
                  return prev.map((r) => (r.id === incoming.id ? { ...r, ...incoming } : r))
                }
                return [incoming, ...prev]
              })
            } catch { /* ignore */ }
          })
        },
        onDisconnect: () => setWsConnected(false),
        onStompError: () => setWsConnected(false),
      })
      client.activate()
      stompClientRef.current = client
    } catch { /* WebSocket 미지원 환경 */ }
    return () => {
      if (client) client.deactivate()
      stompClientRef.current = null
      setWsConnected(false)
    }
  }, [isLoggedIn, jwtToken])

  const handleLogin = async () => {
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch(`${API_BASE}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: userId, password }),
      })
      if (res.ok) {
        const user = await res.json()
        setJwtToken(user.token || '')
        setIsLoggedIn(true)
        setLoggedInName(user.employeeName || user.employeeId || userId)
        setNotice('로그인 성공')
        setTimeout(() => setNotice(''), 1500)
        setLoginLoading(false)
        return
      }
    } catch {
      /* Spring Boot 꺼져 있으면 demo 계정 사용 */
    }

    if (userId === DEMO_ACCOUNT.id && password === DEMO_ACCOUNT.password) {
      setJwtToken('')
      setIsLoggedIn(true)
      setLoggedInName(DEMO_ACCOUNT.name)
      setNotice('로그인 성공 (Demo)')
      setTimeout(() => setNotice(''), 1500)
    } else {
      setLoginError('아이디 또는 비밀번호가 올바르지 않습니다.')
    }
    setLoginLoading(false)
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setJwtToken('')
    setPassword('')
    setLoginError('')
    setRows([])
    setPage(0)
    setTotalPages(1)
    setTotalElements(0)
  }

  // 상태 변경 (4단계)
  const updateStatus = async (eventId, newStatus) => {
    const prevRow = rows.find((r) => r.id === eventId)
    // 낙관적 업데이트
    setRows((prev) =>
      prev.map((r) =>
        r.id === eventId
          ? {
              ...r,
              status: newStatus,
              completedFlag: newStatus === 'resolved',
              completedAt: newStatus === 'resolved' ? new Date().toISOString() : null,
            }
          : r,
      ),
    )
    try {
      const res = await fetch(`${API_BASE}/api/event/${eventId}/status`, {
        method: 'PATCH',
        headers: authHeader(),
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error(`PATCH ${res.status}`)
      setNotice(`이벤트 #${eventId} → ${STATUS_LABEL[newStatus] ?? newStatus}`)
    } catch (e) {
      // 실패 시 롤백
      setRows((prev) => prev.map((r) => (r.id === eventId ? { ...r, ...prevRow } : r)))
      setError(`저장 실패: ${e.message}`)
    } finally {
      setTimeout(() => setNotice(''), 1800)
    }
  }

  // 조치 메모
  const openNotesModal = (row) => {
    setNotesModal({ id: row.id })
    setNotesInput(row.actionNotes || '')
  }

  const saveNotes = async () => {
    if (!notesModal) return
    setNotesLoading(true)
    const targetRow = rows.find((r) => r.id === notesModal.id)
    const currentStatus = targetRow?.status || 'in_progress'
    try {
      const res = await fetch(`${API_BASE}/api/event/${notesModal.id}/status`, {
        method: 'PATCH',
        headers: authHeader(),
        body: JSON.stringify({ status: currentStatus, notes: notesInput }),
      })
      if (!res.ok) throw new Error(`PATCH ${res.status}`)
      setRows((prev) =>
        prev.map((r) => (r.id === notesModal.id ? { ...r, actionNotes: notesInput } : r)),
      )
      setNotice(`이벤트 #${notesModal.id} 메모 저장 완료`)
      setNotesModal(null)
    } catch (e) {
      setError(`메모 저장 실패: ${e.message}`)
    } finally {
      setNotesLoading(false)
      setTimeout(() => setNotice(''), 1800)
    }
  }

  const cctvOptions = useMemo(() => {
    const set = new Set(rows.map((r) => normalizeCctv(r.cctvNo)))
    return ['all', ...Array.from(set).sort()]
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const q = searchQuery.trim().toLowerCase()
      const matchSearch = q
        ? String(r.id).includes(q) ||
          normalizeCctv(r.cctvNo).toLowerCase().includes(q) ||
          (DETECT_CODE_LABEL[r.detectedCode] || '').toLowerCase().includes(q)
        : true
      const matchProcessed =
        processedFilter === 'all' ? true : processedFilter === 'yes' ? r.completedFlag : !r.completedFlag
      const matchStatus = statusFilter === 'all' ? true : r.status === statusFilter
      const matchCctv = cctvFilter === 'all' ? true : normalizeCctv(r.cctvNo) === cctvFilter
      return matchSearch && matchProcessed && matchStatus && matchCctv
    })
  }, [rows, searchQuery, processedFilter, statusFilter, cctvFilter])

  const totalCount = rows.length
  const resolvedCount = rows.filter((r) => r.completedFlag).length
  const pendingCount = totalCount - resolvedCount
  const completionRate = Math.round((resolvedCount / Math.max(totalCount, 1)) * 100)

  const selectableIds = filteredRows.filter((r) => r.status !== 'resolved').map((r) => r.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))
  const someSelected = selectedIds.size > 0

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(selectableIds))
  }

  const toggleSelectOne = (id, resolved) => {
    if (resolved) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkProcess = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    const ids = [...selectedIds]
    let successCount = 0
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`${API_BASE}/api/event/${id}/status`, {
            method: 'PATCH',
            headers: authHeader(),
            body: JSON.stringify({ status: 'resolved' }),
          })
          if (res.ok) {
            successCount++
            setRows((prev) =>
              prev.map((r) =>
                r.id === id
                  ? { ...r, status: 'resolved', completedFlag: true, completedAt: new Date().toISOString() }
                  : r,
              ),
            )
          }
        } catch { /* ignore */ }
      }),
    )
    setSelectedIds(new Set())
    setBulkLoading(false)
    setNotice(`${successCount}건 처리 완료`)
    setTimeout(() => setNotice(''), 2000)
  }

  // ── 로그인 화면 ────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className={shell}>
        <div className={panel}>
          <button
            onClick={onBack}
            className="mb-6 flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            대시보드로 돌아가기
          </button>

          <div className="mx-auto w-full max-w-[380px]">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm p-8 shadow-xl shadow-black/30">
              <div className="flex flex-col items-center mb-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/15 border border-indigo-500/25 text-indigo-400 mb-3">
                  <ShieldIcon />
                </div>
                <h2 className="text-base font-bold text-slate-100">안전관리자 로그인</h2>
                <p className="text-[11px] text-slate-500 mt-1">CCTV 안전 위반 조치 페이지</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1.5">아이디</label>
                  <input
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="아이디 입력"
                    className="h-10 w-full rounded-xl border border-slate-700/60 bg-slate-800/60 px-3.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1.5">비밀번호</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    className="h-10 w-full rounded-xl border border-slate-700/60 bg-slate-800/60 px-3.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                </div>
                {loginError && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1">
                    <span>⚠</span> {loginError}
                  </p>
                )}
                <button
                  onClick={handleLogin}
                  disabled={loginLoading}
                  className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 transition-colors text-sm font-semibold text-white mt-1"
                >
                  {loginLoading ? '로그인 중...' : '로그인'}
                </button>
              </div>

              <div className="mt-5 rounded-xl border border-slate-700/40 bg-slate-800/40 p-3">
                <p className="text-[10px] text-slate-600 mb-1.5 font-medium uppercase tracking-wider">데모 계정</p>
                <div className="flex items-center gap-2 text-[11px]">
                  <code className="text-cyan-400 font-mono">{DEMO_ACCOUNT.id}</code>
                  <span className="text-slate-700">/</span>
                  <code className="text-cyan-400 font-mono">{DEMO_ACCOUNT.password}</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── 메인 조치 화면 ─────────────────────────────────────────
  return (
    <div className={shell}>
      <div className={panel}>
        {/* 헤더 */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600/15 border border-indigo-500/25 text-indigo-400">
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight text-slate-100">CCTV 안전 위반 조치</h2>
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 font-medium">
                  {loggedInName}
                </span>
                <span className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                  wsConnected
                    ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-700/40 bg-slate-900/40 text-slate-600'
                }`}>
                  <span className={`w-1 h-1 rounded-full ${wsConnected ? 'bg-indigo-400 animate-pulse' : 'bg-slate-700'}`} />
                  {wsConnected ? 'LIVE' : '연결 중...'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">이벤트 조회 · 처리 상태 관리</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => loadEvents(page)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-[11px] hover:bg-slate-800 text-slate-400 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {loading ? '새로고침 중...' : '새로고침'}
            </button>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-[11px] hover:bg-slate-800 text-slate-400 transition-colors"
            >
              로그아웃
            </button>
            <button
              onClick={onBack}
              className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-[11px] hover:bg-indigo-500/20 text-indigo-300 transition-colors font-medium"
            >
              ← 대시보드
            </button>
          </div>
        </div>

        {/* KPI 카드 */}
        <div className="mb-5 grid grid-cols-4 gap-3">
          {[
            { label: '전체 이벤트', value: totalElements || totalCount, color: 'border-l-slate-500', text: 'text-slate-200' },
            { label: '미처리',      value: pendingCount,                 color: 'border-l-rose-500',  text: 'text-rose-300'  },
            { label: '처리 완료',   value: resolvedCount,                color: 'border-l-emerald-500', text: 'text-emerald-300' },
            { label: '페이지',      value: `${page + 1} / ${totalPages}`,color: 'border-l-indigo-500', text: 'text-indigo-300' },
          ].map(({ label, value, color, text }) => (
            <div key={label} className={`rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3 border-l-2 ${color}`}>
              <p className="text-[11px] text-slate-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold tabular-nums ${text}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* 완료율 바 */}
        <div className="mb-5 rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3">
          <div className="flex items-center justify-between text-[11px] mb-2">
            <span className="text-slate-500 font-medium">전체 조치 완료율</span>
            <span className="text-emerald-400 font-bold tabular-nums">{completionRate}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-700 to-emerald-400 rounded-full transition-all duration-700"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* 필터 바 */}
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ID · CCTV · 감지유형 검색"
              className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-900/60 pl-9 pr-3 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/40 transition-colors"
            />
          </div>
          <select
            value={cctvFilter}
            onChange={(e) => setCctvFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-700/60 bg-slate-900/60 px-2.5 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500/40"
          >
            {cctvOptions.map((v) => (
              <option key={v} value={v}>{v === 'all' ? 'CCTV: 전체' : v}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-700/60 bg-slate-900/60 px-2.5 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500/40"
          >
            <option value="all">상태: 전체</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <select
            value={processedFilter}
            onChange={(e) => setProcessedFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-700/60 bg-slate-900/60 px-2.5 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500/40"
          >
            <option value="all">처리: 전체</option>
            <option value="no">미처리만</option>
            <option value="yes">처리완료만</option>
          </select>
          <span className="text-[10px] text-slate-600 ml-auto tabular-nums">
            {filteredRows.length}건 표시 (전체 {totalElements}건)
          </span>
        </div>

        {/* 일괄처리 바 */}
        {someSelected && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/8 px-4 py-2.5">
            <span className="text-[11px] text-indigo-300 font-medium flex-1">{selectedIds.size}건 선택됨</span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800 transition-colors"
            >
              선택 해제
            </button>
            <button
              onClick={handleBulkProcess}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 transition-colors font-medium disabled:opacity-50"
            >
              {bulkLoading ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
              일괄 완료 처리
            </button>
          </div>
        )}

        {error && (
          <p className="mb-3 text-[11px] text-rose-400 flex items-center gap-1"><span>⚠</span> {error}</p>
        )}
        {notice && (
          <p className="mb-3 text-[11px] text-emerald-400 flex items-center gap-1 justify-end"><span>✓</span> {notice}</p>
        )}

        {/* 테이블 */}
        <div className="overflow-auto rounded-xl border border-slate-700/50">
          <table className="w-full min-w-[1200px] text-[11px]">
            <thead>
              <tr className="bg-slate-800/80 text-slate-400">
                <th className="px-3 py-2.5 border-b border-slate-700/60 text-center w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-600 bg-slate-800 accent-indigo-500 cursor-pointer"
                    title="전체 선택 (미완료 항목)"
                  />
                </th>
                {['ID', 'CCTV', '감지 유형', '신뢰도', '이미지', '발생 일시', '처리 상태', '조치 메모', '완료 일시', '생성 일시'].map((col, i) => (
                  <th
                    key={col}
                    className={`px-3 py-2.5 font-semibold border-b border-slate-700/60 whitespace-nowrap ${
                      [0, 3, 4].includes(i) ? 'text-center' : 'text-left'
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-600">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-6 h-6 animate-spin text-slate-700" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      불러오는 중...
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-600">이벤트가 없습니다.</td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isResolved = row.status === 'resolved'
                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${
                        selectedIds.has(row.id)
                          ? 'bg-indigo-500/8 border-l-2 border-l-indigo-500/50'
                          : isResolved
                          ? 'opacity-60 bg-transparent'
                          : 'bg-slate-950/20 hover:bg-slate-800/20'
                      }`}
                    >
                      {/* 체크박스 */}
                      <td className="px-3 py-2.5 text-center">
                        {!isResolved && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelectOne(row.id, isResolved)}
                            className="rounded border-slate-600 bg-slate-800 accent-indigo-500 cursor-pointer"
                          />
                        )}
                      </td>
                      {/* ID */}
                      <td className="px-3 py-2.5 text-center font-mono text-slate-500">#{row.id}</td>
                      {/* CCTV */}
                      <td className="px-3 py-2.5 text-slate-300 font-medium whitespace-nowrap">
                        {normalizeCctv(row.cctvNo)}
                      </td>
                      {/* 감지 유형 */}
                      <td className="px-3 py-2.5">
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border whitespace-nowrap ${DETECT_CODE_STYLE[row.detectedCode] || 'bg-slate-500/15 text-slate-400 border-slate-500/25'}`}>
                          {DETECT_CODE_LABEL[row.detectedCode] || `코드 ${row.detectedCode}`}
                        </span>
                      </td>
                      {/* 신뢰도 */}
                      <td className="px-3 py-2.5 text-center tabular-nums text-slate-400">
                        {row.confidence != null ? `${(row.confidence * 100).toFixed(1)}%` : '-'}
                      </td>
                      {/* 이미지 썸네일 */}
                      <td className="px-3 py-2.5 text-center">
                        {row.hasImage ? (
                          <button
                            onClick={() => setImageModal(row.id)}
                            className="inline-block rounded-lg overflow-hidden border border-slate-600/60 hover:border-indigo-500/60 transition-colors"
                            title="이미지 크게 보기"
                          >
                            <img
                              src={`${API_BASE}/api/event/${row.id}/image`}
                              alt={`위반 #${row.id}`}
                              className="h-10 w-14 object-cover"
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          </button>
                        ) : (
                          <span className="text-slate-700">-</span>
                        )}
                      </td>
                      {/* 발생 일시 */}
                      <td className="px-3 py-2.5 tabular-nums text-slate-400 whitespace-nowrap">
                        {formatDt(row.detectedAt)}
                      </td>
                      {/* 처리 상태 드롭다운 */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {/* 현재 상태 배지 */}
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border whitespace-nowrap ${STATUS_STYLE[row.status] || STATUS_STYLE.new}`}>
                            {STATUS_LABEL[row.status] || row.status || '신규'}
                          </span>
                          {/* 다음 상태로 변경 버튼 */}
                          {!isResolved && (
                            <select
                              value={row.status || 'new'}
                              onChange={(e) => updateStatus(row.id, e.target.value)}
                              className="h-6 rounded border border-slate-700/60 bg-slate-900/80 px-1 text-[10px] text-slate-400 focus:outline-none focus:border-indigo-500/40 cursor-pointer"
                              title="상태 변경"
                            >
                              {STATUS_ORDER.map((s) => (
                                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      {/* 조치 메모 */}
                      <td className="px-3 py-2.5 max-w-[180px]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-slate-400 flex-1 text-[10px]" title={row.actionNotes || ''}>
                            {row.actionNotes || <span className="text-slate-700">-</span>}
                          </span>
                          <button
                            onClick={() => openNotesModal(row)}
                            className="shrink-0 text-slate-600 hover:text-indigo-400 transition-colors"
                            title="메모 편집"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      {/* 완료 일시 */}
                      <td className="px-3 py-2.5 tabular-nums text-slate-500 whitespace-nowrap">
                        {row.completedAt ? formatDt(row.completedAt) : <span className="text-slate-700">-</span>}
                      </td>
                      {/* 생성 일시 */}
                      <td className="px-3 py-2.5 tabular-nums text-slate-500 whitespace-nowrap">
                        {formatDt(row.createdAt)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => loadEvents(page - 1)}
              disabled={page <= 0 || loading}
              className="flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              이전
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const pageNum =
                  totalPages <= 7 ? i
                  : page < 4 ? i
                  : page > totalPages - 4 ? totalPages - 7 + i
                  : page - 3 + i
                return (
                  <button
                    key={pageNum}
                    onClick={() => loadEvents(pageNum)}
                    className={`w-7 h-7 rounded-lg text-[11px] font-medium transition-colors ${
                      pageNum === page
                        ? 'bg-indigo-600 text-white border border-indigo-500/60'
                        : 'border border-slate-700/60 bg-slate-900/60 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {pageNum + 1}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => loadEvents(page + 1)}
              disabled={page >= totalPages - 1 || loading}
              className="flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              다음
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ── 이미지 모달 ─────────────────────────────────────── */}
      {imageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setImageModal(null)}
        >
          <div
            className="relative max-w-2xl w-full rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
              <span className="text-[11px] font-semibold text-slate-300">위반 이벤트 #{imageModal} 스냅샷</span>
              <button onClick={() => setImageModal(null)} className="text-slate-500 hover:text-slate-200 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <img
              src={`${API_BASE}/api/event/${imageModal}/image`}
              alt={`위반 #${imageModal}`}
              className="w-full object-contain max-h-[70vh]"
            />
          </div>
        </div>
      )}

      {/* ── 메모 모달 ────────────────────────────────────────── */}
      {notesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setNotesModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-slate-200">이벤트 #{notesModal.id} 조치 메모</span>
              <button onClick={() => setNotesModal(null)} className="text-slate-500 hover:text-slate-200 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <textarea
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="조치 내용을 입력하세요..."
              rows={4}
              autoFocus
              className="w-full rounded-xl border border-slate-700/60 bg-slate-800/60 px-3.5 py-2.5 text-[12px] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors resize-none"
            />
            <div className="flex items-center justify-end gap-2 mt-3">
              <button
                onClick={() => setNotesModal(null)}
                className="rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-2 text-[11px] text-slate-400 hover:bg-slate-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={saveNotes}
                disabled={notesLoading}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 px-4 py-2 text-[11px] text-white font-semibold transition-colors"
              >
                {notesLoading ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

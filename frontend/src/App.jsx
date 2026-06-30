import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client/dist/sockjs.js'
import FilterButton from './components/FilterButton'
import KpiCard from './components/KpiCard'
import StatsChart from './components/StatsChart'
import ViolationActionPage from './components/ViolationActionPage'
import {
  cameras,
  eventHistory as initialEventHistory,
  initialAlertLogs,
  statusChip,
} from './data/mockData'
import { levelStyles } from './constants/statusStyles'
import { fetchLatestAlerts, patchAlertStatus } from './services/alertsApi'

const statusLabel = {
  new: '미확인',
  acked: '확인 중',
  in_progress: '처리 중',
  resolved: '처리 완료',
  unknown: '알 수 없음',
}

const statusBadgeStyle = {
  new: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
  acked: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  in_progress: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  resolved: 'bg-slate-500/20 text-slate-400 border border-slate-600/40',
  unknown: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
}

const actionToStatus = {
  ack: 'acked',
  resolve: 'resolved',
}

const validStatus = new Set(['new', 'acked', 'in_progress', 'resolved'])

const detectedTypeMap = {
  1: 'helmet',
  2: 'vest',
  3: 'both',
}

const typeLabelMap = {
  helmet: '안전모 미착용',
  vest: '안전조끼 미착용',
  both: '안전모/조끼 미착용',
  ok: '이상 없음',
}

const parseBBox = (raw) => {
  if (!raw) return null
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }
}

const cameraNoFromName = (cameraName) => {
  const text = String(cameraName || '')
  const m = text.match(/CAM\s*(\d{1,2})/i)
  return m ? String(parseInt(m[1], 10)) : null
}

const boxCenter = (b) => {
  if (!Array.isArray(b) || b.length < 4) return { x: 0, y: 0 }
  return { x: (Number(b[0]) + Number(b[2])) / 2, y: (Number(b[1]) + Number(b[3])) / 2 }
}

const blendBBox = (prevBox, newBox, alpha = 0.65) => {
  if (!Array.isArray(prevBox) || prevBox.length < 4) return newBox
  if (!Array.isArray(newBox) || newBox.length < 4) return prevBox
  return [0, 1, 2, 3].map((i) => Number(prevBox[i]) * (1 - alpha) + Number(newBox[i]) * alpha)
}

const smoothDetections = (prevDetections = [], nextDetections = []) => {
  if (!Array.isArray(nextDetections) || nextDetections.length === 0) return prevDetections

  const prevByTrack = new Map()
  prevDetections.forEach((p) => {
    if (p?.trackId !== null && p?.trackId !== undefined) {
      prevByTrack.set(String(p.trackId), p)
    }
  })

  return nextDetections.map((det) => {
    const trackKey = det?.trackId !== null && det?.trackId !== undefined ? String(det.trackId) : null

    if (trackKey && prevByTrack.has(trackKey)) {
      const prev = prevByTrack.get(trackKey)
      return { ...det, bboxNorm: blendBBox(prev?.bboxNorm, det?.bboxNorm) }
    }

    const center = boxCenter(det?.bboxNorm)
    const sameClass = prevDetections.filter((p) => String(p?.className) === String(det?.className))

    let best = null
    let bestDist = Infinity
    for (const p of sameClass) {
      const c = boxCenter(p?.bboxNorm)
      const d = Math.hypot(center.x - c.x, center.y - c.y)
      if (d < bestDist) { bestDist = d; best = p }
    }

    if (best && bestDist < 0.12) {
      return { ...det, bboxNorm: blendBBox(best.bboxNorm, det.bboxNorm) }
    }

    return det
  })
}

const normalizeAlert = (a) => {
  if (!a || typeof a !== 'object') return null
  if (a.id === undefined || a.id === null) return null

  const isBackendEvent = a.cctvNo !== undefined || a.detectedCode !== undefined

  if (isBackendEvent) {
    const type = detectedTypeMap[a.detectedCode] || 'ok'
    const status = (a.status && validStatus.has(a.status))
      ? a.status
      : (a.completedFlag ? 'resolved' : 'new')
    const date = a.detectedAt ? new Date(a.detectedAt) : new Date()
    const rawCamera = a.cctvNo
    const normalizedCamera =
      typeof rawCamera === 'string' && rawCamera.toUpperCase().includes('CAM')
        ? rawCamera
        : `CAM ${String(rawCamera ?? '-').padStart(2, '0')}`

    return {
      id: a.id,
      level: status === 'resolved' ? 'info' : 'warning',
      type,
      time: date.toLocaleTimeString('ko-KR', { hour12: false }),
      camera: normalizedCamera,
      message: typeLabelMap[type] || 'PPE 이벤트',
      confidence: Number.isFinite(a.confidence) ? a.confidence : 0.95,
      bbox: parseBBox(a.bboxJson),
      status,
      createdAt: date.getTime(),
    }
  }

  const status = validStatus.has(a.status) ? a.status : 'unknown'
  return {
    id: a.id,
    level: a.level || 'info',
    type: a.type || 'ok',
    time: a.time || '--:--:--',
    camera: a.camera || 'Unknown camera',
    message: a.message || 'No message',
    confidence: Number.isFinite(a.confidence) ? a.confidence : 0,
    bbox: a.bbox || null,
    status,
    createdAt: a.createdAt || Date.now(),
  }
}

// ── 아이콘 컴포넌트 ──────────────────────────────────────────
const ShieldIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
)

const severityAccent = {
  critical: 'bg-rose-500',
  warning: 'bg-amber-500',
  info: 'bg-slate-600',
}

export default function App() {
  const [selected, setSelected] = useState(null)
  const [pageMode, setPageMode] = useState('dashboard')
  const [activeTab, setActiveTab] = useState('alerts')
  const [alertFilter, setAlertFilter] = useState('all')
  const [alerts, setAlerts] = useState(initialAlertLogs.map(normalizeAlert).filter(Boolean))
  const [selectedAlertId, setSelectedAlertId] = useState(initialAlertLogs[0].id)
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState('')
  const [opsHistory, setOpsHistory] = useState(initialEventHistory)
  const [showActionModal, setShowActionModal] = useState(false)
  const [actionType, setActionType] = useState('ack')
  const [actionNote, setActionNote] = useState('')
  const [actionSaving, setActionSaving] = useState(false)
  const [hideResolved, setHideResolved] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [timeRange, setTimeRange] = useState('all')
  const [lastSuccessAt, setLastSuccessAt] = useState('')
  const [toast, setToast] = useState('')
  const [cameraStreams, setCameraStreams] = useState(() =>
    Object.fromEntries(
      cameras.map((cam) => [cam.id, { url: cam.url, online: cam.online, source: 'demo' }]),
    ),
  )

  const previousNewCountRef = useRef(0)
  const uploadedUrlRef = useRef({})
  const liveBoxTimersRef = useRef({})
  const uploadBlockRef = useRef({})
  const [liveBBoxes, setLiveBBoxes] = useState({})
  const [detectorLiveByCamNo, setDetectorLiveByCamNo] = useState({})
  const [videoDims, setVideoDims] = useState({})
  const [playingCams, setPlayingCams] = useState({})
  const [bboxBlocked, setBboxBlocked] = useState({})
  const [connectionStatus, setConnectionStatus] = useState('checking') // 'online'|'offline'|'checking'
  const videoContainerRefs = useRef({})

  const getVideoOverlayStyle = useCallback((camId) => {
    const dims = videoDims[camId]
    const container = videoContainerRefs.current[camId]
    if (!dims || !container) return { position: 'absolute', inset: 0 }
    const cw = container.clientWidth
    const ch = container.clientHeight
    if (cw === 0 || ch === 0) return { position: 'absolute', inset: 0 }
    const scale = Math.min(cw / dims.nw, ch / dims.nh)
    const rw = dims.nw * scale
    const rh = dims.nh * scale
    const left = (cw - rw) / 2
    const top = (ch - rh) / 2
    return { position: 'absolute', left, top, width: rw, height: rh }
  }, [videoDims])

  const onlineCount = useMemo(
    () => cameras.filter((c) => cameraStreams[c.id]?.online).length,
    [cameraStreams],
  )

  const filteredAlerts = useMemo(() => {
    const now = Date.now()
    const oneHour = 60 * 60 * 1000
    const twentyFourHour = 24 * oneHour

    return alerts
      .filter((log) => (alertFilter === 'all' ? true : log.type === alertFilter))
      .filter((log) => (hideResolved ? log.status !== 'resolved' : true))
      .filter((log) => {
        if (timeRange === 'all') return true
        const age = now - (log.createdAt || now)
        if (timeRange === '1h') return age <= oneHour
        if (timeRange === '24h') return age <= twentyFourHour
        return true
      })
      .filter((log) => {
        if (!searchKeyword.trim()) return true
        const q = searchKeyword.toLowerCase()
        return `${log.camera} ${log.message}`.toLowerCase().includes(q)
      })
  }, [alertFilter, alerts, hideResolved, timeRange, searchKeyword])

  const selectedAlert = alerts.find((a) => a.id === selectedAlertId) ?? alerts[0]
  const newAlertsCount = alerts.filter((a) => a.status === 'new').length
  const violationCount = alerts.filter((a) => ['helmet', 'vest', 'both'].includes(a.type)).length
  const resolvedCount = alerts.filter((a) => a.status === 'resolved').length
  const pendingCount = alerts.filter((a) => a.status !== 'resolved').length
  const completionRate = Math.round((resolvedCount / Math.max(alerts.length, 1)) * 100)

  const notifyNewAlert = useCallback((countDiff) => {
    if (countDiff <= 0) return
    setToast(`새 알람 ${countDiff}건 발생`)
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('PPE 새 알람', { body: `새 알람 ${countDiff}건이 감지되었습니다.` })
      } else if (Notification.permission === 'default') {
        Notification.requestPermission()
      }
    }
  }, [])

  const handleCameraUpload = async (camId, file) => {
    if (!file) return
    const prevUrl = uploadedUrlRef.current[camId]
    if (prevUrl) URL.revokeObjectURL(prevUrl)
    const objectUrl = URL.createObjectURL(file)
    uploadedUrlRef.current[camId] = objectUrl
    const cameraName = cameras.find((c) => c.id === camId)?.name || `CAM ${String(camId).padStart(2, '0')}`
    const camNo = cameraNoFromName(cameraName)

    setBboxBlocked((prev) => ({ ...prev, [camId]: true }))
    setPlayingCams((prev) => ({ ...prev, [camId]: false }))
    if (camNo) {
      uploadBlockRef.current[camNo] = Date.now() + 6000
      setDetectorLiveByCamNo((prev) => { const next = { ...prev }; delete next[camNo]; return next })
    }
    Object.values(liveBoxTimersRef.current).forEach((timerId) => clearTimeout(timerId))
    liveBoxTimersRef.current = {}
    setLiveBBoxes({})
    setCameraStreams((prev) => ({ ...prev, [camId]: { url: objectUrl, online: true, source: 'uploaded' } }))
    setToast(`${cameraName} 영상 업로드 완료`)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('cameraName', cameraName)
      const res = await fetch('http://127.0.0.1:8000/analyze-upload', { method: 'POST', body: form })
      if (!res.ok) throw new Error(`detector ${res.status}`)
      setToast(`${cameraName} 실시간 추론 실행됨`)
    } catch {
      setAlertsError('디텍터 연결 실패 · http://127.0.0.1:8000 실행 확인 필요')
    } finally {
      setTimeout(() => {
        setBboxBlocked((prev) => ({ ...prev, [camId]: false }))
      }, 3000)
    }
  }

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true)
    setAlertsError('')
    let retries = 2
    let waitMs = 400
    while (retries >= 0) {
      try {
        const latest = await fetchLatestAlerts()
        const normalized = latest.map(normalizeAlert).filter(Boolean)
        if (normalized.length > 0) {
          setAlerts(normalized)
          setSelectedAlertId((prev) => prev ?? normalized[0].id)
        }
        const nowNewCount = normalized.filter((a) => a.status === 'new').length
        const diff = nowNewCount - previousNewCountRef.current
        previousNewCountRef.current = nowNewCount
        notifyNewAlert(diff)
        setLastSuccessAt(new Date().toLocaleTimeString('ko-KR', { hour12: false }))
        setConnectionStatus('online')
        setAlertsLoading(false)
        return
      } catch {
        if (retries === 0) {
          setAlertsError('API 연결 실패 · Mock 데이터로 동작 중')
          setConnectionStatus('offline')
          setAlertsLoading(false)
          return
        }
        await new Promise((r) => setTimeout(r, waitMs))
        waitMs *= 2
        retries -= 1
      }
    }
  }, [notifyNewAlert])

  const openActionModal = (type) => {
    setActionType(type)
    setActionNote('')
    setShowActionModal(true)
  }

  const handleBulkAck = async () => {
    const targets = alerts.filter((a) => a.status === 'new')
    if (targets.length === 0) return
    await Promise.all(
      targets.map(async (a) => {
        try { await patchAlertStatus(a.id, { status: 'acked' }) } catch { /* ignore */ }
      }),
    )
    setAlerts((prev) => prev.map((a) => a.status === 'new' ? { ...a, status: 'acked' } : a))
  }

  const handleBulkResolve = async () => {
    const targets = alerts.filter((a) => a.status !== 'resolved')
    if (targets.length === 0) return
    await Promise.all(
      targets.map(async (a) => {
        try { await patchAlertStatus(a.id, { status: 'resolved' }) } catch { /* ignore */ }
      }),
    )
    setAlerts((prev) => prev.map((a) => a.status !== 'resolved' ? { ...a, status: 'resolved' } : a))
  }

  const applyAlertAction = async () => {
    if (!selectedAlert) return
    const nextStatus = actionToStatus[actionType] ?? 'acked'
    const actionName = actionType === 'ack' ? '알람 확인 처리' : '해결 처리'
    setActionSaving(true)

    try {
      await patchAlertStatus(selectedAlert.id, { status: nextStatus })
    } catch {
      setAlertsError('상태 변경 API 실패 · 로컬 상태로 반영됨')
    } finally {
      const time = new Date().toTimeString().slice(0, 5)
      setAlerts((prev) =>
        prev.map((a) => a.id === selectedAlert.id ? { ...a, status: nextStatus } : a),
      )
      setOpsHistory((prev) => [
        { id: Date.now(), time, action: `${actionName}${actionNote ? ` · ${actionNote}` : ''}`, actor: 'admin01' },
        ...prev,
      ])
      setActionSaving(false)
      setShowActionModal(false)
    }
  }

  useEffect(() => {
    const videoDir = (import.meta.env.VITE_VIDEO_DIR || '').replace(/[/\\]$/, '')
    const camVideoPaths = [
      { id: 1, name: 'CAM 01 - Entrance',  path: videoDir ? `${videoDir}\\cam1_12fps_0.33.mp4` : '' },
      { id: 2, name: 'CAM 02 - Lobby',     path: videoDir ? `${videoDir}\\cam2_12fps_0.33.mp4` : '' },
      { id: 3, name: 'CAM 03 - Parking',   path: videoDir ? `${videoDir}\\cam3_12fps_0.33.mp4` : '' },
      { id: 4, name: 'CAM 04 - Warehouse', path: videoDir ? `${videoDir}\\cam4_12fps_0.33.mp4` : '' },
    ].filter(c => c.path)
    camVideoPaths.forEach(({ name, path }) => {
      fetch('http://127.0.0.1:8000/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: path, cameraName: name }),
      }).catch(() => {})
    })
  }, [])

  useEffect(() => {
    loadAlerts()
    const timer = setInterval(loadAlerts, 10000)
    return () => clearInterval(timer)
  }, [loadAlerts])

  useEffect(() => {
    let client = null
    try {
      client = new Client({
        webSocketFactory: () => new SockJS('/ws/events'),
        reconnectDelay: 2000,
        onConnect: () => {
          client.subscribe('/topic/events', (message) => {
            try {
              const incoming = JSON.parse(message.body)
              const normalized = normalizeAlert(incoming)
              if (!normalized) return
              setAlerts((prev) => {
                const exists = prev.some((item) => item.id === normalized.id)
                if (exists) return prev.map((item) => (item.id === normalized.id ? { ...item, ...normalized } : item))
                return [normalized, ...prev]
              })
              const camNo = cameraNoFromName(normalized.camera)
              if (camNo && normalized.bbox) {
                setLiveBBoxes((prev) => ({ ...prev, [camNo]: normalized }))
                if (liveBoxTimersRef.current[camNo]) clearTimeout(liveBoxTimersRef.current[camNo])
                liveBoxTimersRef.current[camNo] = setTimeout(() => {
                  setLiveBBoxes((prev) => { const next = { ...prev }; delete next[camNo]; return next })
                }, 3500)
              }
            } catch { /* ignore malformed */ }
          })
        },
      })
      client.activate()
    } catch { /* websocket init failed */ }

    return () => {
      Object.values(liveBoxTimersRef.current).forEach((timerId) => clearTimeout(timerId))
      liveBoxTimersRef.current = {}
      if (client) client.deactivate()
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/live-detections')
        if (!res.ok) return
        const data = await res.json()
        const byCamera = data?.detectionsByCamera
        if (!byCamera || typeof byCamera !== 'object') return
        const nowSec = Date.now() / 1000
        setDetectorLiveByCamNo((prev) => {
          const next = { ...prev }
          Object.entries(byCamera).forEach(([cameraName, value]) => {
            const camNo = cameraNoFromName(cameraName)
            if (!camNo) return
            const blockUntil = uploadBlockRef.current[camNo]
            if (blockUntil && Date.now() < blockUntil) return
            const incoming = Array.isArray(value?.detections) ? value.detections : []
            const incomingUpdatedAt = Number(value?.updatedAt || nowSec)
            const prevCam = prev[camNo]
            const smoothed = smoothDetections(prevCam?.detections || [], incoming)
            next[camNo] = { detections: smoothed, updatedAt: incomingUpdatedAt }
          })
          Object.entries(next).forEach(([camNo, value]) => {
            if (nowSec - Number(value?.updatedAt || 0) > 6.0) delete next[camNo]
          })
          return next
        })
      } catch { /* ignore */ }
    }, 250)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2400)
    return () => clearTimeout(t)
  }, [toast])

  // 브라우저 탭 타이틀에 미확인 건수 표시
  useEffect(() => {
    const newCount = alerts.filter((a) => a.status === 'new').length
    document.title = newCount > 0 ? `(${newCount}) PPE Monitoring` : 'PPE Monitoring Dashboard'
  }, [alerts])

  useEffect(() => {
    const uploadedUrls = uploadedUrlRef.current
    return () => { Object.values(uploadedUrls).forEach((url) => { if (url) URL.revokeObjectURL(url) }) }
  }, [])

  if (pageMode === 'action') {
    return <ViolationActionPage onBack={() => setPageMode('dashboard')} />
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#0d1f3c_0%,#020617_55%)] text-slate-100 p-3">
      <div className="flex flex-col rounded-2xl border border-slate-700/50 bg-slate-950/80 backdrop-blur-md shadow-2xl shadow-black/60 p-3 gap-3">

        {/* ── 헤더 ── */}
        <header className="flex items-center justify-between gap-3 px-1">
          {/* 로고 + 제목 */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
              <ShieldIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-slate-100">PPE Monitoring</h1>
                <span className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300 font-semibold">
                  <span className="w-1 h-1 rounded-full bg-rose-400 animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="text-[10px] text-slate-600 mt-0.5">CCTV 기반 안전 보호구 실시간 모니터링</p>
            </div>
          </div>

          {/* 상태 칩 + 버튼 */}
          <div className="flex items-center gap-2">
            {/* 오프라인 배너 */}
            {connectionStatus === 'offline' && (
              <span className="hidden sm:flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] text-amber-300 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                백엔드 오프라인 · Mock 동작 중
              </span>
            )}
            {connectionStatus === 'online' && lastSuccessAt && (
              <span className="text-[10px] text-slate-600 tabular-nums hidden sm:inline">↻ {lastSuccessAt}</span>
            )}
            <div className="hidden sm:flex items-center gap-1">
              {statusChip.map((chip) => (
                <span key={chip.name} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] ${
                  connectionStatus === 'offline'
                    ? 'border-slate-800 bg-slate-900/40 text-slate-700'
                    : 'border-slate-700/60 bg-slate-900/60 text-slate-500'
                }`}>
                  <span className={`w-1 h-1 rounded-full ${connectionStatus === 'offline' ? 'bg-slate-700' : 'bg-emerald-400'}`} />
                  {chip.name}
                </span>
              ))}
            </div>
            <button
              onClick={() => setPageMode('action')}
              className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-[11px] text-indigo-300 hover:bg-indigo-500/20 transition-colors font-medium"
            >
              조치 페이지 →
            </button>
          </div>
        </header>

        {/* ── 메인 영역 ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_370px] gap-3 xl:h-[790px]">

          {/* CCTV 그리드 */}
          <main className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-2 gap-0.5 min-h-[420px] xl:min-h-[700px] overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60">
            {cameras.map((cam) => {
              const stream = cameraStreams[cam.id] || { url: cam.url, online: cam.online, source: 'demo' }
              const camNo = cameraNoFromName(cam.name)
              const liveViolation = camNo ? liveBBoxes[camNo] : null
              const detectorLive = camNo ? detectorLiveByCamNo[camNo] : null
              const overlayDetections = detectorLive?.detections || []
              const hasViolation = overlayDetections.some((det) => {
                const cls = String(det.className || '').toLowerCase()
                return cls.includes('no-helmet') || cls.includes('no_helmet') ||
                       cls.includes('no-vest')   || cls.includes('no_vest')
              }) || Boolean(liveViolation)

              return (
                <section
                  key={cam.id}
                  className={`relative bg-black overflow-hidden transition-all duration-300 ${
                    hasViolation ? 'ring-2 ring-rose-500/70 ring-inset' : ''
                  }`}
                >
                  {/* 상단 그라데이션 오버레이 */}
                  <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 h-14 bg-gradient-to-b from-black/75 via-black/30 to-transparent" />

                  {/* 카메라 레이블 바 */}
                  <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-2.5 pt-2">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        stream.online
                          ? hasViolation
                            ? 'bg-rose-400 shadow-[0_0_6px_#f87171]'
                            : 'bg-emerald-400 shadow-[0_0_4px_#34d399]'
                          : 'bg-slate-500'
                      }`} />
                      <span className="text-[11px] font-semibold text-white drop-shadow-sm">{cam.name}</span>
                      {stream.source === 'uploaded' && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-medium">LOCAL</span>
                      )}
                      {hasViolation && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-rose-500/25 text-rose-300 border border-rose-500/40 font-semibold animate-pulse">위반</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] px-1.5 py-0.5 rounded bg-black/50 hover:bg-black/70 cursor-pointer transition-colors text-slate-300 border border-white/10 backdrop-blur-sm">
                        업로드
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            handleCameraUpload(cam.id, file)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      <button
                        onClick={() => setSelected({ ...cam, url: stream.url })}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-black/50 hover:bg-black/70 transition-colors text-slate-300 border border-white/10 backdrop-blur-sm"
                      >
                        ⛶
                      </button>
                    </div>
                  </div>

                  {/* 영상 */}
                  <div
                    className="h-full bg-black relative"
                    ref={(el) => { videoContainerRefs.current[cam.id] = el }}
                  >
                    {stream.online ? (
                      <>
                        {/* 로딩 스켈레톤 - 메타데이터 로드 전 */}
                        {!videoDims[cam.id] && (
                          <div className="absolute inset-0 z-[5] bg-slate-950 flex flex-col items-center justify-center gap-3 pointer-events-none">
                            <div className="relative w-10 h-10">
                              <div className="absolute inset-0 rounded-full bg-slate-800 animate-pulse" />
                              <div className="absolute inset-2 rounded-full bg-slate-700 animate-pulse" style={{ animationDelay: '150ms' }} />
                            </div>
                            <div className="space-y-1.5 flex flex-col items-center">
                              <div className="h-1.5 w-20 bg-slate-800 rounded-full animate-pulse" />
                              <div className="h-1.5 w-14 bg-slate-800 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                            </div>
                            <p className="text-[10px] text-slate-700">영상 로딩 중...</p>
                          </div>
                        )}
                        <video
                          className="w-full h-full object-contain bg-black"
                          src={stream.url}
                          controls
                          autoPlay
                          muted
                          playsInline
                          loop
                          onLoadedMetadata={(e) => {
                            const v = e.currentTarget
                            setVideoDims(prev => ({
                              ...prev,
                              [cam.id]: { nw: v.videoWidth, nh: v.videoHeight }
                            }))
                            v.play().catch(() => {})
                          }}
                          onCanPlay={(e) => { if (e.currentTarget.paused) e.currentTarget.play().catch(() => {}) }}
                          onPlay={() => setPlayingCams(prev => ({ ...prev, [cam.id]: true }))}
                          onPause={() => setPlayingCams(prev => ({ ...prev, [cam.id]: false }))}
                          onEnded={() => setPlayingCams(prev => ({ ...prev, [cam.id]: false }))}
                        />
                        {overlayDetections.length > 0 && playingCams[cam.id] && !bboxBlocked[cam.id] && (
                          <div className="pointer-events-none z-10" style={getVideoOverlayStyle(cam.id)}>
                            {overlayDetections.map((det, idx) => {
                              const box = Array.isArray(det?.bboxNorm) ? det.bboxNorm : null
                              if (!box || box.length < 4) return null
                              const [x1, y1, x2, y2] = box.map((v) => Number(v))
                              if (![x1, y1, x2, y2].every(Number.isFinite)) return null
                              const clsName = String(det.className || '').toLowerCase()
                              const isViolation = clsName.includes('no-helmet') || clsName.includes('no_helmet') || clsName.includes('no-vest') || clsName.includes('no_vest')
                              const borderCls = isViolation ? 'border-rose-500' : 'border-cyan-400'
                              const labelCls = isViolation ? 'bg-rose-600/95' : 'bg-cyan-600/95'
                              const style = {
                                left: `${Math.max(0, x1 * 100)}%`,
                                top: `${Math.max(0, y1 * 100)}%`,
                                width: `${Math.max(1, (x2 - x1) * 100)}%`,
                                height: `${Math.max(1, (y2 - y1) * 100)}%`,
                              }
                              return (
                                <div
                                  key={`${det.className || 'det'}-${idx}`}
                                  className={`absolute border-2 ${borderCls} shadow-[0_0_0_1px_rgba(0,0,0,0.4)]`}
                                  style={style}
                                >
                                  <span className={`absolute -top-5 left-0 whitespace-nowrap rounded-sm ${labelCls} px-1.5 py-0.5 text-[10px] text-white font-semibold tracking-wide`}>
                                    {String(det.className || 'ppe').toUpperCase()} {Math.round((Number(det.confidence) || 0) * 100)}%
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-700">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                        <span className="text-[11px]">신호 없음</span>
                      </div>
                    )}
                  </div>
                </section>
              )
            })}
          </main>

          {/* 우측 사이드바 */}
          <aside className="grid grid-rows-[auto_minmax(0,1fr)] gap-3 min-h-[420px] xl:h-[790px] overflow-hidden">

            {/* 시스템 현황 */}
            <section className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">시스템 현황</h2>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-500">
                    CCTV {onlineCount}/{cameras.length}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                    onlineCount === cameras.length
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}>
                    {onlineCount === cameras.length ? '전체 정상' : '일부 오프라인'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <KpiCard title="탐지 건수" value={violationCount} sub="안전모 / 조끼" tone="warn" />
                <KpiCard title="처리 완료" value={resolvedCount} sub={`미처리 ${pendingCount}건`} tone="good" />
                <KpiCard title="조치 완료율" value={`${completionRate}%`} sub="전체 기준" tone="good" />
                <KpiCard title="미처리" value={pendingCount} sub="즉시 조치 필요" tone="warn" />
              </div>

              {/* 완료율 프로그레스 바 */}
              <div className="mt-3 pt-3 border-t border-slate-800/60">
                <div className="flex items-center justify-between text-[10px] mb-1.5">
                  <span className="text-slate-600">전체 조치 완료율</span>
                  <span className="text-emerald-400 font-semibold tabular-nums">{completionRate}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-700 to-emerald-400 rounded-full transition-all duration-700"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              </div>
            </section>

            {/* 알람 로그 / 운영 히스토리 */}
            <section className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-3 min-h-0 flex flex-col">
              {/* 탭 + 새로고침 */}
              <div className="flex gap-2 mb-3 items-center">
                <div className="flex gap-1 flex-1 bg-slate-800/60 rounded-lg p-0.5">
                  {[
                    { key: 'alerts', label: '알람 로그' },
                    { key: 'stats', label: '통계' },
                    { key: 'history', label: '히스토리' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`relative flex-1 text-[11px] px-2 py-1.5 rounded-md transition-all font-medium ${
                        activeTab === key
                          ? 'bg-slate-700 text-slate-100 shadow-sm'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {label}
                      {key === 'alerts' && newAlertsCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center px-1">
                          {newAlertsCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {activeTab === 'alerts' && (
                  <>
                    <button
                      onClick={handleBulkAck}
                      title="미확인 전체 ACK"
                      className="h-8 px-2.5 rounded-lg border border-slate-700/60 bg-slate-900 hover:bg-slate-800 text-slate-400 text-[10px] transition-colors whitespace-nowrap"
                    >
                      전체 확인
                    </button>
                    <button
                      onClick={handleBulkResolve}
                      title="미처리 전체 완료 처리"
                      className="h-8 px-2.5 rounded-lg border border-emerald-700/40 bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 text-[10px] transition-colors whitespace-nowrap"
                    >
                      전체 완료
                    </button>
                  </>
                )}
                <button
                  onClick={loadAlerts}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900 hover:bg-slate-800 text-slate-400 transition-colors text-sm"
                  title="새로고침"
                >
                  {alertsLoading ? (
                    <span className="text-[10px]">…</span>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  )}
                </button>
              </div>

              {activeTab === 'alerts' ? (
                <>
                  {/* 선택된 알람 상세 */}
                  {selectedAlert && (
                    <div className="mb-3 rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${levelStyles[selectedAlert.level] || levelStyles.warning}`}>
                            {selectedAlert.level?.toUpperCase()}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadgeStyle[selectedAlert.status] || statusBadgeStyle.unknown}`}>
                            {statusLabel[selectedAlert.status] || statusLabel.unknown}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 tabular-nums flex-shrink-0">{selectedAlert.time}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-100 mb-0.5 leading-snug">{selectedAlert.message}</p>
                      <p className="text-[10px] text-slate-500 mb-2.5">{selectedAlert.camera} · 신뢰도 {(selectedAlert.confidence * 100).toFixed(1)}%</p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => openActionModal('ack')}
                          className="text-[11px] px-3 py-1.5 rounded-lg bg-emerald-600/70 hover:bg-emerald-600 transition-colors flex-1 font-medium border border-emerald-500/30 text-white"
                        >
                          ✓ 확인 (ACK)
                        </button>
                        <button
                          onClick={() => openActionModal('resolve')}
                          className="text-[11px] px-3 py-1.5 rounded-lg bg-sky-700/70 hover:bg-sky-700 transition-colors flex-1 font-medium border border-sky-500/30 text-white"
                        >
                          ✓ 해결 완료
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 검색 + 필터 */}
                  <div className="flex flex-col gap-1.5 mb-2">
                    <div className="relative">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                      <input
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="카메라 · 감지유형 검색"
                        className="w-full text-[11px] bg-slate-800/60 border border-slate-700/50 rounded-lg pl-7 pr-3 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </div>
                    <div className="flex gap-1 flex-wrap items-center">
                      <FilterButton label="전체" value="all" current={alertFilter} onChange={setAlertFilter} />
                      <FilterButton label="안전모" value="helmet" current={alertFilter} onChange={setAlertFilter} />
                      <FilterButton label="조끼" value="vest" current={alertFilter} onChange={setAlertFilter} />
                      <FilterButton label="둘 다" value="both" current={alertFilter} onChange={setAlertFilter} />
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          onClick={() => setHideResolved((v) => !v)}
                          className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                            hideResolved
                              ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                              : 'border-slate-700/50 bg-slate-900 text-slate-600 hover:text-slate-400'
                          }`}
                        >
                          {hideResolved ? '완료 표시' : '완료 숨김'}
                        </button>
                        <select
                          value={timeRange}
                          onChange={(e) => setTimeRange(e.target.value)}
                          className="text-[10px] bg-slate-800/60 border border-slate-700/50 rounded-md px-1.5 py-1 text-slate-400 focus:outline-none"
                        >
                          <option value="1h">1시간</option>
                          <option value="24h">24시간</option>
                          <option value="all">전체</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {alertsError && (
                    <p className="text-[10px] text-amber-400/80 mb-1.5 px-1 flex items-center gap-1">
                      <span>⚠</span> {alertsError}
                    </p>
                  )}

                  {/* 알람 목록 */}
                  <ul className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-0.5">
                    {filteredAlerts.map((log) => (
                      <li
                        key={log.id}
                        onClick={() => setSelectedAlertId(log.id)}
                        className={`relative rounded-lg border cursor-pointer transition-all overflow-hidden ${
                          selectedAlertId === log.id
                            ? 'border-indigo-500/50 bg-indigo-950/30'
                            : 'border-slate-700/30 bg-slate-900/30 hover:bg-slate-800/30 hover:border-slate-600/40'
                        } ${log.status === 'resolved' ? 'opacity-40' : ''}`}
                      >
                        {/* 심각도 액센트 바 */}
                        <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${severityAccent[log.level] || 'bg-slate-700'}`} />
                        <div className="pl-3 pr-2.5 py-2">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <div className="flex items-center gap-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${levelStyles[log.level] || levelStyles.warning}`}>
                                {log.level?.toUpperCase()}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadgeStyle[log.status] || statusBadgeStyle.unknown}`}>
                                {statusLabel[log.status] || ''}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 tabular-nums">{log.time}</span>
                          </div>
                          <p className="text-[11px] text-slate-200 font-medium leading-tight">{log.message}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{log.camera}</p>
                        </div>
                      </li>
                    ))}
                    {filteredAlerts.length === 0 && (
                      <li className="text-center py-10 text-slate-600 text-xs flex flex-col items-center gap-2">
                        <svg className="w-8 h-8 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                        </svg>
                        알람 없음
                      </li>
                    )}
                  </ul>
                </>
              ) : activeTab === 'stats' ? (
                <StatsChart alerts={alerts} />
              ) : (
                <ul className="space-y-1 overflow-auto min-h-0 pr-0.5">
                  {opsHistory.map((event) => (
                    <li key={event.id} className="rounded-lg bg-slate-900/40 border border-slate-700/30 px-3 py-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-slate-500 tabular-nums">{event.time}</span>
                        <span className="text-[10px] text-slate-600">by {event.actor}</span>
                      </div>
                      <div className="text-[11px] text-slate-300 font-medium">{event.action}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>

      </div>

      {/* ── 토스트 ── */}
      {toast && (
        <div className="fixed right-4 top-4 z-[60] flex items-center gap-2.5 rounded-xl border border-indigo-400/25 bg-slate-900/95 backdrop-blur-md px-4 py-2.5 text-[12px] text-slate-100 shadow-xl shadow-black/40">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      {/* ── 액션 모달 ── */}
      {showActionModal && selectedAlert && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowActionModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700/70 bg-slate-900 shadow-2xl shadow-black/60 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  {actionType === 'ack' ? '알람 확인 처리' : '해결 완료 처리'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {selectedAlert.camera} · {selectedAlert.message}
                </p>
              </div>
              <button
                onClick={() => setShowActionModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            {/* 모달 바디 */}
            <div className="px-5 py-4">
              <label className="block text-[11px] text-slate-400 mb-1.5 font-medium">메모 (선택)</label>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                rows={3}
                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors"
                placeholder="조치 내용을 입력하세요"
              />
            </div>

            {/* 모달 푸터 */}
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button
                onClick={() => setShowActionModal(false)}
                className="text-xs px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-slate-300 border border-slate-700/60"
              >
                취소
              </button>
              <button
                onClick={applyAlertAction}
                disabled={actionSaving}
                className="text-xs px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 transition-colors text-white font-medium"
              >
                {actionSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 전체화면 모달 ── */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-5xl rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-900 shadow-2xl shadow-black/80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-800/80 flex justify-between items-center bg-slate-900/80">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_#34d399]" />
                <span className="text-sm font-semibold text-slate-200">{selected.name}</span>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-slate-300 border border-slate-700/60"
              >
                닫기
              </button>
            </div>
            <div className="aspect-video bg-black">
              <video className="w-full h-full object-contain" src={selected.url} controls autoPlay muted playsInline loop />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

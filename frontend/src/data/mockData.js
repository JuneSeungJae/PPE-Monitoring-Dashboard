export const cameras = [
  { id: 1, name: 'CAM 01 - Entrance',  url: '/cam1_12fps_0.33.mp4', online: true },
  { id: 2, name: 'CAM 02 - Lobby',     url: '/cam2_12fps_0.33.mp4', online: true },
  { id: 3, name: 'CAM 03 - Parking',   url: '/cam3_12fps_0.33.mp4', online: true },
  { id: 4, name: 'CAM 04 - Warehouse', url: '/cam4_12fps_0.33.mp4', online: true },
]

// 현재 시간 기준으로 상대적 시간 생성
const t = (minAgo) => {
  const d = new Date(Date.now() - minAgo * 60 * 1000)
  return d.toLocaleTimeString('ko-KR', { hour12: false })
}

export const initialAlertLogs = [
  { id: 1, level: 'critical', type: 'helmet', time: t(2),  camera: 'CAM 03 - Parking',   message: '안전모 미착용 인원 감지',      confidence: 0.91, status: 'new',    createdAt: Date.now() - 2 * 60000 },
  { id: 2, level: 'warning',  type: 'vest',   time: t(5),  camera: 'CAM 02 - Lobby',     message: '안전조끼 미착용 인원 감지',    confidence: 0.84, status: 'new',    createdAt: Date.now() - 5 * 60000 },
  { id: 3, level: 'critical', type: 'both',   time: t(9),  camera: 'CAM 04 - Warehouse', message: '안전모/안전조끼 미착용 인원 감지', confidence: 0.93, status: 'acked', createdAt: Date.now() - 9 * 60000 },
  { id: 4, level: 'info',     type: 'ok',     time: t(15), camera: 'CAM 01 - Entrance',  message: 'PPE 준수 상태 정상',          confidence: 0.98, status: 'acked', createdAt: Date.now() - 15 * 60000 },
]

export const eventHistory = [
  { id: 1, time: t(5),  action: '관리자 로그인',   actor: 'admin01' },
  { id: 2, time: t(10), action: 'CAM 04 확대 보기', actor: 'admin01' },
  { id: 3, time: t(14), action: '알람 확인 처리',   actor: 'manager02' },
  { id: 4, time: t(20), action: '분석 작업 시작',   actor: 'system' },
]

export const systemEvents = [
  '[SYS] Gateway 연결 상태 정상',
  '[MODEL] PPE detector warm-up 완료',
  '[QUEUE] 분석 작업 2건 대기',
  '[STORAGE] 결과 저장 경로 정상',
]

export const statusChip = [
  { name: 'Gateway', value: 'Connected', tone: 'ok' },
  { name: 'Model', value: 'Running', tone: 'ok' },
  { name: 'DB', value: 'Healthy', tone: 'ok' },
]

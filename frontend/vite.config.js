import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// .env에서 VITE_VIDEO_DIR 읽기 (없으면 fallback)
const env = loadEnv('development', process.cwd(), '')
const VIDEO_DIR = env.VITE_VIDEO_DIR || 'C:\\Users\\ASUS\\Desktop\\영상모음\\새 폴더'

// 영상 파일을 Range 요청(동영상 탐색)까지 지원하며 서빙하는 Vite 플러그인
function serveVideosPlugin() {
  return {
    name: 'serve-local-videos',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        // /cam1_12fps_0.33.mp4 같은 cam으로 시작하는 mp4 요청만 처리
        if (!url.match(/^\/cam\d+.*\.mp4$/i)) return next()

        const fileName = url.slice(1) // 맨 앞 '/' 제거
        const filePath = path.join(VIDEO_DIR, fileName)

        if (!fs.existsSync(filePath)) return next()

        const stat = fs.statSync(filePath)
        const fileSize = stat.size
        const range = req.headers['range']

        if (range) {
          // 브라우저 동영상 탐색(seek)을 위한 206 Partial Content 처리
          const [rawStart, rawEnd] = range.replace(/bytes=/, '').split('-')
          const start = parseInt(rawStart, 10)
          const end = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1
          const chunkSize = end - start + 1

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4',
          })
          fs.createReadStream(filePath, { start, end }).pipe(res)
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Accept-Ranges': 'bytes',
            'Content-Type': 'video/mp4',
          })
          fs.createReadStream(filePath).pipe(res)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serveVideosPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})

const { chromium } = require('playwright')

async function run() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'docs/screenshots/01-dashboard-overview.png', fullPage: true })

  const camUpload = page.locator('label:has-text("영상 올리기")').first()
  await camUpload.scrollIntoViewIfNeeded()
  await camUpload.screenshot({ path: 'docs/screenshots/02-cam-upload-button.png' })

  const controlBar = page.locator('button:has-text("분석 시작")').locator('xpath=ancestor::div[1]')
  await controlBar.screenshot({ path: 'docs/screenshots/03-analysis-start.png' })

  const alertActions = page.locator('button:has-text("확인(ACK)")').locator('xpath=ancestor::div[contains(@class,"flex")][1]')
  await alertActions.screenshot({ path: 'docs/screenshots/04-alert-action-buttons.png' })

  await page.getByRole('button', { name: '조치 작성 페이지' }).click()
  await page.waitForLoadState('networkidle')

  const loginCard = page.locator('h3:has-text("안전관리자 로그인")').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await loginCard.screenshot({ path: 'docs/screenshots/05-action-page-login.png' })

  await page.getByPlaceholder('아이디 입력').fill('safety-admin')
  await page.getByPlaceholder('비밀번호 입력').fill('admin1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForLoadState('networkidle')

  const tableWrap = page.locator('table').first()
  await tableWrap.screenshot({ path: 'docs/screenshots/06-action-page-table.png' })

  await browser.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

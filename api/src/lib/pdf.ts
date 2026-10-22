import { launchBrowser } from './render-page'

/**
 * HTML → PDF with the Chromium the capture engine already ships (no PDF library).
 * Used for invoices: rare, small, one page. One at a time, so a burst of downloads
 * can't start a Chromium each on a small host.
 */
let queue: Promise<unknown> = Promise.resolve()

export function htmlToPdf(html: string): Promise<Buffer> {
  const run = queue.then(() => render(html))
  queue = run.catch(() => undefined)
  return run
}

async function render(html: string): Promise<Buffer> {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(20_000)
    // Self-contained HTML: no network, so nothing outside can slip into a document.
    await page.route('**/*', (route) => route.abort())
    await page.setContent(html, { waitUntil: 'load' })
    return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } })
  } finally {
    await browser.close().catch(() => undefined)
  }
}

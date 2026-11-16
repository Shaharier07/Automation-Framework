/**
 * Screenshot annotator — the framework's ONLY image utility (no extra image libraries).
 * Composes a PNG with Playwright's bundled Chromium:
 *   - solid black "masked" boxes over sensitive regions
 *   - numbered boxes around issue regions (red #E53935 = FAIL, amber = BLOCKED)
 *   - an evidence banner BELOW the image (canvas is extended, nothing is covered)
 * Coordinates are in screenshot pixels.
 */
import { chromium, type Browser } from 'playwright';

export type EvidenceStatus = 'FAIL' | 'BLOCKED';

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BannerLines {
  header: string; // "TC ID | Step n: name | FAIL"
  expected: string;
  actual: string;
  reason: string;
  env: string;
}

export interface AnnotateOptions {
  image: Buffer;
  masks?: Region[];
  boxes?: Region[];
  status?: EvidenceStatus;
  /** Omit for a masked-only copy (the "raw" evidence). */
  banner?: BannerLines;
  /** Shown when no element region could be resolved, e.g. "Element not found: LoginPage.submit". */
  note?: string;
}

export const STATUS_COLORS: Record<EvidenceStatus, string> = { FAIL: '#E53935', BLOCKED: '#FFB300' };

let browser: Browser | undefined;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) browser = await chromium.launch({ headless: true });
  return browser;
}

export async function closeAnnotator(): Promise<void> {
  await browser?.close().catch(() => undefined);
  browser = undefined;
}

/** PNG width/height from the IHDR header. */
export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Not a PNG image');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const px = (n: number) => `${Math.round(n)}px`;

export async function annotate(opts: AnnotateOptions): Promise<Buffer> {
  const { width: W, height: H } = pngSize(opts.image);
  const status = opts.status ?? 'FAIL';
  const color = STATUS_COLORS[status];
  // readable at any resolution, never below 14px; portrait (phone) screenshots need relatively larger text
  const font = Math.max(14, Math.round(W / (H > W ? 36 : 70)));
  const stroke = Math.max(3, Math.round(font / 5));

  const masks = (opts.masks ?? [])
    .map((m) => `<div class="mask" style="left:${px(m.x)};top:${px(m.y)};width:${px(m.width)};height:${px(m.height)}">masked</div>`)
    .join('');

  const boxes = (opts.boxes ?? [])
    .map(
      (b, i) => `<div class="box" style="left:${px(b.x - stroke)};top:${px(b.y - stroke)};width:${px(b.width + stroke * 2)};height:${px(b.height + stroke * 2)}">
        <span class="num">${i + 1}</span></div>`,
    )
    .join('');

  const line = (label: string, text: string) =>
    `<div class="line"><b>${esc(label)}</b> ${esc(text)}</div>`;

  const banner = opts.banner
    ? `<div class="banner">
        <div class="head">${esc(opts.banner.header)}</div>
        ${opts.note ? line('Note:', opts.note) : ''}
        ${line('Expected:', opts.banner.expected)}
        ${line('Actual:', opts.banner.actual)}
        ${line('Reason:', opts.banner.reason)}
        ${line('Env:', opts.banner.env)}
      </div>`
    : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; width: ${W}px; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
    .shot { position: relative; width: ${W}px; height: ${H}px; }
    .shot img { display: block; width: ${W}px; height: ${H}px; }
    .mask { position: absolute; background: #000; color: #fff; font: 600 ${Math.max(14, Math.round(font * 0.8))}px sans-serif;
            display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .box { position: absolute; border: ${stroke}px solid ${color}; }
    .num { position: absolute; left: -${stroke}px; top: -${font * 1.6 + stroke}px; min-width: ${font * 1.6}px; height: ${font * 1.6}px;
           padding: 0 ${Math.round(font / 3)}px; background: ${color}; color: #fff; font: 700 ${font}px sans-serif;
           display: flex; align-items: center; justify-content: center; border-radius: 3px; }
    .banner { width: ${W}px; background: #fafafa; border-top: ${stroke * 2}px solid ${color}; padding: ${font * 0.6}px ${font}px; }
    .head { font-size: ${Math.round(font * 1.1)}px; font-weight: 700; color: #fff; background: ${color};
            padding: ${font * 0.3}px ${font * 0.6}px; margin-bottom: ${font * 0.4}px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .line { font-size: ${font}px; line-height: 1.45; color: #212121; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .line b { color: #000; }
  </style></head><body>
    <div class="shot"><img src="data:image/png;base64,${opts.image.toString('base64')}">${masks}${boxes}</div>
    ${banner}
  </body></html>`;

  const page = await (await getBrowser()).newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return await page.screenshot({ fullPage: true, type: 'png' });
  } finally {
    await page.close();
  }
}

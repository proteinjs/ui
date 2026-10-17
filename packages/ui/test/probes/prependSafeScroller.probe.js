#!/usr/bin/env node
/**
 * prependSafeScroller.probe — the live proof of PrependSafeScroller's law on real engines: a landing of older
 * rows above the reader writes no scroll position and moves the reader's row by nothing, with a finger held
 * through the landing, under a fling, and at the end of the history; and its contrast, the shape the primitive
 * replaces (a compensating scrollTop write), showing the write and the drift under the same finger.
 *
 * The page (prependSafeScroller.page.tsx) judges itself per animation frame and posts an episode's summary at the
 * engine's quiet; this script bundles it, serves it, and either drives Chromium or waits for a WebKit device:
 *
 *   node test/probes/prependSafeScroller.probe.js run --esbuild <bin> --playwright <pkg> [--port 8460] [--shots <dir>]
 *       Chromium at phone geometry (390×844, touch). Chromium's touch scrolling is delta-based and honours a
 *       write mid-pan, so the page is given WebKit's pan law in-page: while the probe's finger is down, every
 *       programmatic scrollTop write to the scroller is re-asserted to the pan's own position on the next frame
 *       (the measured iOS behaviour: the pan re-derives the offset from the touch's origin). Scenarios, per mode:
 *         the HELD DRAG  — six slow finger-down drags into the lead; pages land under the finger;
 *         the FLICK      — a touch fling (Chromium's own momentum) into the lead;
 *         the END        — drags until nothing remains above; the leftover reservoir collapses at the rest;
 *         the LOW COUNT  — the consumer under-counts: the reservoir runs short, the debt is paid at the rest.
 *       Exit 0 when the reservoir passes every law AND the write shape shows its red; 1 otherwise.
 *
 *   node test/probes/prependSafeScroller.probe.js serve --esbuild <bin> [--port 8460] [--log-dir <dir>]
 *       The page for a real WebKit — a simulator's Safari or a phone on the LAN: open
 *       http://<host>:<port>/?mode=reservoir (and ?mode=write), drive real pans, then:
 *   node test/probes/prependSafeScroller.probe.js judge [--log-dir <dir>]
 *       Every episode the page posted, by mode, and the verdict per mode.
 *
 * --esbuild is the esbuild binary (or its package directory); --playwright a playwright package directory.
 * Neither is a dependency of this package: a probe is not a test the suite runs.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const command = args[0];
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(arg('port', '8460'));
const LOG_DIR = arg('log-dir', path.join(__dirname, '.prepend-safe-scroller-probe'));
const SHOTS = arg('shots', '');
const TOLERANCE_PX = 2;
const PAGE_ENTRY = path.join(__dirname, 'prependSafeScroller.page.tsx');

const INDEX_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>PrependSafeScroller probe</title>
<style>html,body{margin:0;height:100%;overscroll-behavior:none}#root{position:fixed;inset:0}</style>
</head><body><div id="root"></div><script src="/page.js"></script></body></html>`;

class PrependSafeScrollerProbe {
  constructor({ port, logDir }) {
    this.port = port;
    this.logDir = logDir;
    fs.mkdirSync(logDir, { recursive: true });
    this.bundle = path.join(logDir, 'page.js');
    this.episodesFile = path.join(logDir, 'episodes.jsonl');
    this.server = null;
  }

  /** The page bundled with esbuild (the binary from --esbuild, or the package's). */
  build(esbuildArg) {
    let bin = esbuildArg;
    if (!bin) {
      try {
        bin = path.join(path.dirname(require.resolve('esbuild/package.json')), 'bin', 'esbuild');
      } catch {
        throw new Error('esbuild not found: pass --esbuild <path to the esbuild binary or package>');
      }
    }
    if (fs.existsSync(bin) && fs.statSync(bin).isDirectory()) {
      bin = path.join(bin, 'bin', 'esbuild');
    }
    const result = spawnSync(
      bin,
      [
        PAGE_ENTRY,
        '--bundle',
        '--format=iife',
        '--jsx=automatic',
        '--loader:.tsx=tsx',
        '--define:process.env.NODE_ENV="development"',
        '--log-level=warning',
        `--outfile=${this.bundle}`,
      ],
      { stdio: 'inherit' }
    );
    if (result.status !== 0) {
      throw new Error(`esbuild exited ${result.status}`);
    }
  }

  /** The page, the bundle, and the episode log's door. */
  serve() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.listen(this.port, () => {
        console.log(
          `probe page: http://localhost:${this.port}/?mode=reservoir  (and ?mode=write); episodes: ${this.episodesFile}`
        );
        resolve();
      });
    });
  }

  close() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  handle(req, res) {
    const url = req.url || '/';
    if (url.startsWith('/page.js')) {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
      fs.createReadStream(this.bundle).pipe(res);
      return;
    }
    if (url === '/__log' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        fs.appendFileSync(this.episodesFile, Buffer.concat(chunks).toString('utf8').trim() + '\n');
        res.writeHead(204);
        res.end();
      });
      return;
    }
    if (url === '/__episodes') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(fs.existsSync(this.episodesFile) ? fs.readFileSync(this.episodesFile, 'utf8') : '');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(INDEX_HTML);
  }

  /** The episodes posted so far, parsed. */
  episodes() {
    if (!fs.existsSync(this.episodesFile)) {
      return [];
    }
    return fs
      .readFileSync(this.episodesFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  /** The verdict over a set of episodes of one mode. */
  static verdict(mode, list) {
    const s = PrependSafeScrollerProbe.merge(list);
    const lawful =
      s.landings > 0 &&
      s.writesAtLandings === 0 &&
      s.writesUnderFinger === 0 &&
      s.maxLandingDrift <= TOLERANCE_PX &&
      s.maxShChangeAtLanding <= 1 &&
      s.maxWriteDrift <= TOLERANCE_PX &&
      s.jumps === 0;
    // The shape replaced: it writes at the landing and the landing shifts the content by the page's height.
    const red = s.landings > 0 && s.writesAtLandings > 0 && s.maxLandingDrift > TOLERANCE_PX && s.jumps > 0;
    return { mode, summary: s, lawful, red };
  }

  static merge(list) {
    const out = {
      episodes: list.length,
      frames: 0,
      landings: 0,
      landingsUnderFinger: 0,
      writes: 0,
      writesUnderFinger: 0,
      writesAtLandings: 0,
      maxLandingDrift: 0,
      maxWriteDrift: 0,
      maxShChangeAtLanding: 0,
      jumps: 0,
      jumpRows: [],
      landingTrace: [],
    };
    for (const s of list) {
      out.frames += s.frames;
      out.landings += s.landings;
      out.landingsUnderFinger += s.landingsUnderFinger;
      out.writes += s.writes;
      out.writesUnderFinger += s.writesUnderFinger;
      out.writesAtLandings += s.writesAtLandings;
      out.maxLandingDrift = Math.max(out.maxLandingDrift, s.maxLandingDrift);
      out.maxWriteDrift = Math.max(out.maxWriteDrift, s.maxWriteDrift);
      out.maxShChangeAtLanding = Math.max(out.maxShChangeAtLanding, s.maxShChangeAtLanding);
      out.jumps += s.jumps;
      out.jumpRows.push(...(s.jumpRows || []));
      out.landingTrace.push(...(s.landingTrace || []));
    }
    return out;
  }

  static describe(s) {
    return (
      `landings ${s.landings} (under a finger ${s.landingsUnderFinger}); writes ${s.writes} (under a finger ` +
      `${s.writesUnderFinger}, at landings ${s.writesAtLandings}); max drift at a landing ${s.maxLandingDrift.toFixed(1)} px, ` +
      `at a write ${s.maxWriteDrift.toFixed(1)} px; max scrollHeight change at a landing ${s.maxShChangeAtLanding} px; ` +
      `jumps ${s.jumps}; frames ${s.frames}`
    );
  }
}

/** WebKit's pan law, given to Chromium in-page: a write under the probe's finger is re-asserted next frame. */
const PAN_LAW = () => {
  const SCROLLER = 'list';
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  const pan = { down: false, pos: null };
  window.__pan = pan;
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get() {
      return desc.get.call(this);
    },
    set(v) {
      if (this.id === SCROLLER) {
        this.__programmatic = true;
        desc.set.call(this, v);
        if (pan.down && pan.pos !== null) {
          const pos = pan.pos;
          requestAnimationFrame(() => {
            if (pan.down) {
              this.__programmatic = true;
              desc.set.call(this, pos);
            }
          });
        }
        return;
      }
      desc.set.call(this, v);
    },
  });
  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target;
      if (!el || el.id !== SCROLLER) {
        return;
      }
      const programmatic = !!el.__programmatic;
      el.__programmatic = false;
      if (pan.down && !programmatic) {
        pan.pos = desc.get.call(el); // the pan's own position: what its next update re-asserts
      }
    },
    true
  );
};

const failures = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) {
    failures.push(label);
  }
};

const runChromium = async (probe, playwrightPath) => {
  const { chromium, devices } = require(playwrightPath || 'playwright');
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  });
  const shot = async (page, name) => {
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
    }
  };
  const open = async (query) => {
    const page = await context.newPage();
    await page.addInitScript(PAN_LAW);
    await page.goto(`http://localhost:${probe.port}/?${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__app && window.__app.rows() >= 10, null, { timeout: 20000 });
    await page.waitForTimeout(2500); // the opening chain fills the lead; the probe arms
    const cdp = await context.newCDPSession(page);
    const box = await page.locator('#list').boundingBox();
    return { page, cdp, box };
  };
  /** One slow finger-down drag: `moves` × `stepPx` down the glass (the content scrolls up into history), then a rest. */
  const drag = async ({ page, cdp, box }, moves, stepPx, restMs) => {
    await page.evaluate(() => {
      window.__pan.down = true;
      window.__pan.pos = document.getElementById('list').scrollTop;
    });
    const x = box.x + box.width / 2;
    let y = box.y + 90;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 0; i < moves; i++) {
      y += stepPx;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      await page.waitForTimeout(30);
    }
    await page.evaluate(() => {
      window.__pan.down = false;
      window.__pan.pos = null;
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(restMs);
  };
  const settle = async (page, ms = 2200) => page.waitForTimeout(ms);
  const since = (page) => page.evaluate(() => window.__probe.since());
  const mark = (page) => page.evaluate(() => window.__probe.mark());
  const app = (page) =>
    page.evaluate(() => ({
      rows: window.__app.rows(),
      remaining: window.__app.remaining(),
      reserve: window.__app.reserve(),
      ...window.__probe.state(),
    }));

  try {
    for (const mode of ['reservoir', 'write']) {
      const label = mode === 'reservoir' ? 'the reservoir' : 'the compensating write (the shape replaced)';
      const t = await open(`mode=${mode}`);
      const opened = await app(t.page);
      console.log(
        `\n── ${label} ── opened: rows ${opened.rows}, above ${opened.remaining}, reserve ${Math.round(opened.reserve)} px, st ${Math.round(opened.st)} / sh ${opened.sh}`
      );

      // THE HELD DRAG: six slow drags, the finger down ≈ 2.4 s each — pages land under it (latency 350 ms).
      await mark(t.page);
      for (let k = 0; k < 6; k++) {
        await drag(t, 80, 8, 600);
      }
      await settle(t.page);
      await shot(t.page, `${mode}-held`);
      const held = await since(t.page);
      const heldVerdict = PrependSafeScrollerProbe.verdict(mode, [held]);
      if (mode === 'reservoir') {
        check(
          'held drag: pages landed under the finger',
          held.landings >= 2 && held.landingsUnderFinger >= 1,
          PrependSafeScrollerProbe.describe(held)
        );
        check(
          'held drag: no write at any landing, none under the finger',
          held.writesAtLandings === 0 && held.writesUnderFinger === 0
        );
        check(
          `held drag: the reader’s row moved ≤ ${TOLERANCE_PX} px at every landing; scrollHeight unchanged`,
          held.maxLandingDrift <= TOLERANCE_PX && held.maxShChangeAtLanding <= 1
        );
        check('held drag: no jump on any frame', held.jumps === 0, held.jumpRows.slice(0, 4).join(' | '));
      } else {
        check(
          'held drag (the shape replaced): RED as expected — a write at the landing and the drift under the finger',
          heldVerdict.red,
          PrependSafeScrollerProbe.describe(held) +
            (held.jumpRows.length ? ` | ${held.jumpRows.slice(0, 3).join(' | ')}` : '')
        );
      }

      // THE FLICK: a touch fling into the lead.
      await mark(t.page);
      await t.cdp.send('Input.synthesizeScrollGesture', {
        x: t.box.x + t.box.width / 2,
        y: t.box.y + t.box.height / 2,
        yDistance: 1500,
        gestureSourceType: 'touch',
        speed: 2500,
        preventFling: false,
      });
      await settle(t.page, 3000);
      await shot(t.page, `${mode}-flick`);
      const flick = await since(t.page);
      if (mode === 'reservoir') {
        check(
          'flick: pages landed under momentum with no write at any landing and the row holding',
          flick.landings >= 1 &&
            flick.writesAtLandings === 0 &&
            flick.maxLandingDrift <= TOLERANCE_PX &&
            flick.jumps === 0,
          PrependSafeScrollerProbe.describe(flick)
        );
      } else {
        console.log(`info  flick (the shape replaced): ${PrependSafeScrollerProbe.describe(flick)}`);
      }

      if (mode === 'reservoir') {
        // THE END: drags until nothing remains above; the leftover collapses at the rest with neutral writes only.
        await mark(t.page);
        let drags = 0;
        while (drags < 14 && (await app(t.page)).remaining > 0) {
          await drag(t, 60, 10, 500);
          drags++;
        }
        await settle(t.page, 3500);
        await shot(t.page, `${mode}-end`);
        const end = await since(t.page);
        const atEnd = await app(t.page);
        check(
          'end: nothing remains above and the reservoir collapsed to 0 at the rest',
          atEnd.remaining === 0 && Math.abs(atEnd.reserve) <= 0.5,
          `after ${drags} drags: above ${atEnd.remaining}, reserve ${atEnd.reserve.toFixed(1)} px, st ${Math.round(atEnd.st)} / sh ${atEnd.sh}`
        );
        check(
          `end: every write landed at the rest (none under a finger, none at a landing) and moved the row ≤ ${TOLERANCE_PX} px`,
          end.writesUnderFinger === 0 &&
            end.writesAtLandings === 0 &&
            end.maxWriteDrift <= TOLERANCE_PX &&
            end.jumps === 0,
          PrependSafeScrollerProbe.describe(end)
        );
      }
      await t.page.close();
    }

    // THE LOW COUNT: the consumer under-counts the rows above; landings exceed the room; the debt is paid at the rest.
    const low = await open('mode=reservoir&count=low');
    await mark(low.page);
    for (let k = 0; k < 6; k++) {
      await drag(low, 80, 8, 600);
    }
    await settle(low.page, 3000);
    await shot(low.page, 'reservoir-low-count');
    const debt = await since(low.page);
    const lowState = await app(low.page);
    check(
      'low count: landings taller than the reservoir are still neutral — no write at a landing, no jump',
      debt.landings >= 1 &&
        debt.writesAtLandings === 0 &&
        debt.maxLandingDrift <= TOLERANCE_PX &&
        debt.maxShChangeAtLanding <= 1 &&
        debt.jumps === 0,
      PrependSafeScrollerProbe.describe(debt)
    );
    check(
      `low count: the debt is paid at the rest — any write with no finger down, moving the row ≤ ${TOLERANCE_PX} px, the reservoir back at or above 0`,
      debt.writesUnderFinger === 0 && debt.maxWriteDrift <= TOLERANCE_PX && lowState.reserve >= -0.5,
      `reserve ${lowState.reserve.toFixed(1)} px after the rest; ${debt.writes} writes (an engine whose own anchoring compensates the step reads a drift of 0 and gets none)`
    );
    await low.page.close();
  } finally {
    await context.close();
    await browser.close();
  }
};

if (require.main === module) {
  (async () => {
    const probe = new PrependSafeScrollerProbe({ port: PORT, logDir: LOG_DIR });
    if (command === 'serve') {
      probe.build(arg('esbuild', ''));
      await probe.serve();
      return;
    }
    if (command === 'run') {
      probe.build(arg('esbuild', ''));
      await probe.serve();
      try {
        await runChromium(probe, arg('playwright', ''));
      } finally {
        probe.close();
      }
      if (failures.length) {
        console.log(`\n${failures.length} FAIL`);
        process.exit(1);
      }
      console.log('\nall PASS');
      return;
    }
    if (command === 'judge') {
      const list = probe.episodes();
      if (!list.length) {
        console.log(`no episodes in ${probe.episodesFile}`);
        process.exit(1);
      }
      const byMode = {};
      list.forEach((s, i) => {
        (byMode[s.mode] = byMode[s.mode] || []).push(s);
        console.log(
          `#${i + 1} ${s.mode}: ${PrependSafeScrollerProbe.describe(s)}${s.jumpRows.length ? `\n     ${s.jumpRows.slice(0, 6).join('\n     ')}` : ''}${(s.landingTrace || []).length ? `\n     trace: ${s.landingTrace.join('\n     ')}` : ''}`
        );
      });
      let ok = true;
      for (const mode of Object.keys(byMode)) {
        const v = PrependSafeScrollerProbe.verdict(mode, byMode[mode]);
        if (mode === 'write') {
          console.log(
            `${v.red ? 'RED (expected)' : 'NOT RED'}  ${mode}: ${PrependSafeScrollerProbe.describe(v.summary)}`
          );
        } else {
          console.log(`${v.lawful ? 'PASS' : 'FAIL'}  ${mode}: ${PrependSafeScrollerProbe.describe(v.summary)}`);
          ok = ok && v.lawful;
        }
      }
      process.exit(ok ? 0 : 1);
    }
    console.error(
      'usage: prependSafeScroller.probe.js run|serve|judge [--esbuild <bin>] [--playwright <pkg>] [--port <n>] [--log-dir <dir>] [--shots <dir>]'
    );
    process.exit(2);
  })().catch((e) => {
    console.error('PROBE RED —', e.stack || e.message);
    process.exit(1);
  });
}

module.exports = { PrependSafeScrollerProbe };

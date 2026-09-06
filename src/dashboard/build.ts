import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import type { RunResult } from "../types.js";
import { listRules } from "../memory/store.js";

/**
 * Builds a single self-contained HTML page from results/ and memory/.
 * No framework, no CDN, inline SVG. Opens anywhere, screenshots cleanly for the demo.
 */
const source = process.env.SOURCE ?? "gmail";
const privateData = process.env.PRIVATE === "1";
const base = path.resolve("results", ...(privateData ? ["private"] : []), source);
const outDir = path.resolve("dashboard");

async function loadRuns(split: string): Promise<RunResult[]> {
  const dir = path.join(base, split);
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => /^run-\d+\.json$/.test(f)).sort((a, b) => num(a) - num(b));
  const out: RunResult[] = [];
  for (const f of files) out.push(JSON.parse(await readFile(path.join(dir, f), "utf8")));
  return out;
}
const runs = await loadRuns("train");
const testRuns = await loadRuns("test");
// optional: the earlier ungated loop, kept as a cautionary comparison
const ungatedDir = path.resolve("results", "overfit-v1", source, "test");
const ungated: RunResult[] = existsSync(ungatedDir)
  ? await Promise.all((await readdir(ungatedDir)).filter((f) => /^run-\d+\.json$/.test(f)).sort((a, b) => num(a) - num(b)).map(async (f) => JSON.parse(await readFile(path.join(ungatedDir, f), "utf8"))))
  : [];
if (runs.length === 0) throw new Error(`no runs under ${base}/train`);

const memDir = path.resolve(process.env.MEMORY_DIR ?? "memory");
const judgmentPath = path.join(memDir, `judgment.${source}.md`);
const toolsPath = path.join(memDir, `tools.${source}.md`);
const judgment = existsSync(judgmentPath) ? await readFile(judgmentPath, "utf8") : "";
const tools = existsSync(toolsPath) ? await readFile(toolsPath, "utf8") : "";

const first = runs[0];
const last = runs.at(-1)!;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Understudy · ${source}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { --bg:#0b0d10; --panel:#14171c; --line:#252a33; --text:#e8ecf1; --muted:#8b95a5; --up:#4ade80; --down:#f87171; --acc:#7dd3fc; --cost:#fbbf24; --lat:#c084fc; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  main { max-width:1100px; margin:0 auto; padding:32px 24px 64px; }
  h1 { font-size:22px; margin:0 0 4px; letter-spacing:-.01em }
  .sub { color:var(--muted); margin:0 0 28px }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-bottom:24px }
  .tile { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px }
  .tile .k { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.06em }
  .tile .v { font-size:26px; font-weight:600; margin-top:2px; font-variant-numeric:tabular-nums }
  .tile .d { font-size:12px; margin-top:2px }
  .up { color:var(--up) } .down { color:var(--down) }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:16px }
  .panel h2 { font-size:14px; margin:0 0 10px; color:var(--muted); font-weight:500; text-transform:uppercase; letter-spacing:.06em }
  svg text { fill:var(--muted); font-size:11px }
  table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums }
  th,td { text-align:right; padding:6px 8px; border-bottom:1px solid var(--line) } th:first-child,td:first-child { text-align:left }
  th { color:var(--muted); font-weight:500; font-size:12px }
  .mem { white-space:pre-wrap; font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; color:#cfd6e0 }
  .mem .new { background:rgba(74,222,128,.12); border-left:3px solid var(--up); padding-left:8px; margin-left:-11px }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px } @media (max-width:800px){ .cols{grid-template-columns:1fr} }
</style></head><body><main>
<h1>Understudy <span style="color:var(--muted);font-weight:400">· ${source}${privateData ? " · real inbox" : " · sample"}</span></h1>
<p class="sub">${last.items} train items${testRuns.length ? ` + ${testRuns[0].items} held-out items the reflector never sees` : ""}, ground truth derived from the app itself. ${runs.length} runs. Each run: predict → score → reflect → write rules → next run reads them. The agent never sees read/starred/label state, only what exists when the mail arrives.</p>

<div class="tiles">
  ${tile("Train accuracy", pct(last.accuracy), delta(first.accuracy, last.accuracy, true, pct))}
  ${testRuns.length ? tile("Held-out accuracy", pct(testRuns.at(-1)!.accuracy), delta(testRuns[0].accuracy, testRuns.at(-1)!.accuracy, true, pct)) : ""}
  ${testRuns.length ? tile("Held-out macro-F1", pct(testRuns.at(-1)!.macroF1 ?? 0), delta(testRuns[0].macroF1 ?? 0, testRuns.at(-1)!.macroF1 ?? 0, true, pct)) : ""}
  ${testRuns.length ? tile("Held-out attend / skip", pct(testRuns.at(-1)!.attendAccuracy ?? 0), delta(testRuns[0].attendAccuracy ?? 0, testRuns.at(-1)!.attendAccuracy ?? 0, true, pct)) : ""}
  ${tile("Cost / run", `$${last.costUsd.toFixed(3)}`, delta(first.costUsd, last.costUsd, false, (n) => `$${n.toFixed(3)}`))}
  ${tile("Avg latency", `${(last.avgLatencyMs / 1000).toFixed(1)}s`, delta(first.avgLatencyMs, last.avgLatencyMs, false, (n) => `${(n / 1000).toFixed(1)}s`))}
  ${tile("Rules in memory", String(last.memoryRules), `<span class="up">from ${first.memoryRules}</span>`)}
</div>

<div class="panel"><h2>Accuracy per run</h2>${chart(runs, testRuns, ungated)}</div>
<div class="panel"><h2>Cost and latency per run (148 items)</h2>${costChart(runs)}</div>

<div class="panel"><h2>Per-action accuracy</h2>
<table><thead><tr><th>run</th>${Object.keys(last.perAction).map((a) => `<th>${a}</th>`).join("")}<th>total</th><th>cost</th><th>rules</th></tr></thead>
<tbody>${[...runs, ...testRuns]
  .sort((a, b) => a.run - b.run || (a.split === "train" ? -1 : 1))
  .map(
    (r) =>
      `<tr><td>run ${r.run} ${r.split === "test" ? "<span style=\"color:var(--up)\">held-out</span>" : ""}</td>${Object.values(r.perAction)
        .map((v) => `<td>${v.correct}/${v.total}</td>`)
        .join("")}<td><b>${pct(r.accuracy)}</b></td><td>$${r.costUsd.toFixed(3)}</td><td>${r.memoryRules}</td></tr>`,
  )
  .join("")}</tbody></table></div>

<div class="cols">
  <div class="panel"><h2>Judgment memory · what it learned about you</h2><div class="mem">${memoryHtml(judgment, first.memoryRules)}</div></div>
  <div class="panel"><h2>Tool memory · what it learned about the source</h2><div class="mem">${memoryHtml(tools, 0)}</div></div>
</div>
</main></body></html>`;

await mkdir(outDir, { recursive: true });
const out = path.join(outDir, privateData ? `${source}.private.html` : `${source}.html`);
await writeFile(out, html);
console.log(`wrote ${path.relative(process.cwd(), out)} (${runs.length} runs)`);

function num(f: string) {
  return Number(f.match(/\d+/)?.[0] ?? 0);
}
function tile(k: string, v: string, d: string) {
  return `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
}
function delta(a: number, b: number, upGood: boolean, fmt: (n: number) => string) {
  if (runs.length < 2) return `<span style="color:var(--muted)">baseline</span>`;
  const good = upGood ? b >= a : b <= a;
  const arrow = b >= a ? "▲" : "▼";
  return `<span class="${good ? "up" : "down"}">${arrow} from ${fmt(a)}</span>`;
}
function memoryHtml(md: string, baselineCount: number) {
  const rules = listRules(md);
  if (rules.length === 0) return `<span style="color:var(--muted)">empty</span>`;
  return rules.map((r, i) => `<div class="${i >= baselineCount ? "new" : ""}">- ${esc(r)}</div>`).join("");
}
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function chart(rs: RunResult[], ts: RunResult[], ug: RunResult[]) {
  const W = 1000, H = 280, L = 48, R = 24, T = 28, B = 32;
  const n = Math.max(rs.length, ts.length, ug.length);
  const x = (i: number) => (n === 1 ? W / 2 : L + (i * (W - L - R)) / (n - 1));
  const yA = (v: number) => T + (1 - v) * (H - T - B);
  const series = (data: RunResult[], f: (r: RunResult) => number, color: string, dash = "", labelBelow = false) => {
    if (!data.length) return "";
    const pts = data.map((r, i) => `${x(i)},${yA(f(r))}`).join(" ");
    return (
      `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ""} points="${pts}"/>` +
      data.map((r, i) => `<circle cx="${x(i)}" cy="${yA(f(r))}" r="4" fill="${color}"/><text x="${x(i)}" y="${yA(f(r)) + (labelBelow ? 16 : -9)}" text-anchor="middle" style="fill:${color};font-weight:600">${(f(r) * 100).toFixed(0)}%</text>`).join("")
    );
  };
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((g) => `<line x1="${L}" x2="${W - R}" y1="${yA(g)}" y2="${yA(g)}" stroke="var(--line)"/><text x="${L - 8}" y="${yA(g) + 4}" text-anchor="end">${g * 100}%</text>`)
    .join("");
  const xs = Array.from({ length: n }, (_, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">run ${i + 1}</text>`).join("");
  const leg = [
    ["var(--up)", "held-out attend / skip", ""],
    ["var(--acc)", "held-out 4-class", ""],
    ["var(--muted)", "train 4-class", "4 3"],
    ["var(--down)", "held-out, ungated reflector (v1)", "2 4"],
  ]
    .filter((_, i) => i !== 3 || ug.length)
    .map(([c, t, d], i) => `<g transform="translate(${L + i * 220},4)"><line x1="0" x2="18" y1="6" y2="6" stroke="${c}" stroke-width="3" ${d ? `stroke-dasharray="${d}"` : ""}/><text x="24" y="10">${t}</text></g>`)
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${grid}${series(rs, (r) => r.accuracy, "var(--muted)", "4 3", true)}${series(ug, (r) => r.accuracy, "var(--down)", "2 4", true)}${series(ts, (r) => r.accuracy, "var(--acc)")}${series(ts, (r) => r.attendAccuracy ?? 0, "var(--up)")}${xs}${leg}</svg>`;
}

function costChart(rs: RunResult[]) {
  const W = 1000, H = 160, L = 48, R = 48, T = 20, B = 28;
  const n = rs.length;
  const slot = (W - L - R) / Math.max(1, n);
  const maxCost = Math.max(...rs.map((r) => r.costUsd)) * 1.2 || 1;
  const maxLat = Math.max(...rs.map((r) => r.avgLatencyMs)) * 1.2 || 1;
  const bars = rs
    .map((r, i) => {
      const x0 = L + i * slot + slot * 0.15;
      const w = slot * 0.3;
      const hc = (r.costUsd / maxCost) * (H - T - B);
      const hl = (r.avgLatencyMs / maxLat) * (H - T - B);
      return `<rect x="${x0}" y="${H - B - hc}" width="${w}" height="${hc}" fill="var(--cost)" rx="2"/><text x="${x0 + w / 2}" y="${H - B - hc - 4}" text-anchor="middle" style="fill:var(--cost)">$${r.costUsd.toFixed(3)}</text>` +
        `<rect x="${x0 + w + 4}" y="${H - B - hl}" width="${w}" height="${hl}" fill="var(--lat)" rx="2"/><text x="${x0 + w + 4 + w / 2}" y="${H - B - hl - 4}" text-anchor="middle" style="fill:var(--lat)">${(r.avgLatencyMs / 1000).toFixed(1)}s</text>` +
        `<text x="${L + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle">run ${r.run}</text>`;
    })
    .join("");
  const leg = `<g transform="translate(${L},2)"><rect width="10" height="10" fill="var(--cost)" rx="2"/><text x="14" y="9">cost per run</text><rect x="110" width="10" height="10" fill="var(--lat)" rx="2"/><text x="124" y="9">avg latency per item</text></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${bars}${leg}</svg>`;
}

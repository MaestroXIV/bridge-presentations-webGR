/**
 * BBO session collector — runs as a bookmarklet on YOUR open BBO "Myhands"
 * hands list page (https://www.bridgebase.com/myhands/hands.php?...).
 *
 * - Lists the tournaments on the page; you pick one.
 * - For each board it reads the deal (LIN) embedded in the page or fetches it
 *   from the board's "Lin" link, and fetches the board's traveller page.
 *   GET requests only, one at a time with a short pause, only to
 *   www.bridgebase.com, using the login you already have in that tab.
 * - Builds a presenter session (docs/SESSION_FORMAT.md) and downloads it as
 *   <date>_<tournament>.session.json. Nothing is sent anywhere else.
 *
 * Built into public/bbo-collect.js and docs/bbo-collect.bookmarklet.txt by
 * `npm run build:collector`.
 */
import { BboTournament, CollectedBoard, buildBboSession, parseHandsList, sessionFileName } from "./myhands";
import { sessionToJson } from "../model/session";

const HOST = "www.bridgebase.com";
const PAUSE_MS = 700;
const ID = "bp-collector-overlay";

function sameHost(href: string): URL | undefined {
  try {
    const u = new URL(href, location.href);
    return u.protocol === "https:" && u.host === HOST ? u : undefined;
  } catch {
    return undefined;
  }
}

async function get(href: string): Promise<string> {
  const u = sameHost(href);
  if (!u) throw new Error(`refusing to fetch outside ${HOST}`);
  const r = await fetch(u.href, { method: "GET", credentials: "same-origin", cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.setAttribute("style", style);
  if (text !== undefined) e.textContent = text;
  return e;
}

const BTN = "font:13px sans-serif;padding:4px 10px;margin:2px 4px 2px 0;border:1px solid #888;border-radius:4px;background:#f4f4f4;cursor:pointer;color:#111";

function download(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

function main() {
  document.getElementById(ID)?.remove();
  const box = el(
    "div",
    "position:fixed;top:16px;right:16px;z-index:2147483647;width:440px;max-height:80vh;overflow:auto;background:#fff;color:#111;border:2px solid #22303f;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.35);padding:12px 14px;font:13px/1.4 sans-serif",
  );
  box.id = ID;
  const head = el("div", "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px");
  head.append(el("b", "font-size:15px", "Bridge presenter: collect a session"));
  const close = el("button", BTN, "Close");
  close.onclick = () => box.remove();
  head.append(close);
  box.append(head);
  const body = el("div", "");
  box.append(body);
  document.body.append(box);

  if (location.host !== HOST || !/\/myhands\//.test(location.pathname)) {
    body.textContent = `Open your BBO hand records (${HOST}/myhands/…, "Get Hands") and click the bookmark again.`;
    return;
  }
  const parsed = parseHandsList(document.documentElement.outerHTML);
  const username = new URLSearchParams(location.search).get("username") ?? parsed.username;
  if (!parsed.tournaments.length) {
    body.textContent = "No boards found on this page.";
    return;
  }
  body.append(el("div", "color:#555;margin-bottom:6px", `Pick one. Everything stays on this computer; the file is downloaded here.`));
  for (const t of parsed.tournaments) {
    const row = el("div", "border-top:1px solid #ddd;padding:6px 0");
    row.append(el("div", "font-weight:600", t.title));
    row.append(el("div", "color:#555", [t.date, `${t.boards.length} boards`, t.place && `place ${t.place}`, t.score].filter(Boolean).join(" · ")));
    const go = el("button", BTN, "Collect this session");
    go.onclick = () => collect(t, username ?? undefined, body);
    row.append(go);
    body.append(row);
  }
}

async function collect(t: BboTournament, username: string | undefined, body: HTMLElement) {
  body.textContent = "";
  body.append(el("div", "font-weight:600;margin-bottom:4px", t.title));
  const status = el("div", "margin:4px 0");
  const bar = el("div", "height:8px;background:#eee;border-radius:4px;overflow:hidden");
  const fill = el("div", "height:100%;width:0;background:#3a7d44");
  bar.append(fill);
  const log = el("div", "color:#a33;margin-top:6px;white-space:pre-wrap");
  body.append(status, bar, log);

  const items: CollectedBoard[] = [];
  const steps = t.boards.reduce((n, b) => n + (b.lin ? 0 : 1) + (b.travellerUrl ? 1 : 0), 0) || 1;
  let done = 0;
  const tick = (what: string) => {
    done++;
    fill.style.width = `${Math.round((100 * done) / steps)}%`;
    status.textContent = `${what} (${done}/${steps})`;
  };
  for (const [i, row] of t.boards.entries()) {
    const it: CollectedBoard = { row, lin: row.lin };
    const label = `row ${row.listNo ?? i + 1}`;
    if (!it.lin && row.linUrl) {
      try {
        it.lin = await get(row.linUrl);
      } catch (e) {
        log.textContent += `${label}: deal not fetched (${(e as Error).message})\n`;
      }
      tick(`deal ${i + 1}/${t.boards.length}`);
      await sleep(PAUSE_MS);
    }
    if (row.travellerUrl) {
      try {
        it.travellerHtml = await get(row.travellerUrl);
      } catch (e) {
        log.textContent += `${label}: traveller not fetched (${(e as Error).message})\n`;
      }
      tick(`traveller ${i + 1}/${t.boards.length}`);
      await sleep(PAUSE_MS);
    }
    items.push(it);
  }
  const { session, missing } = buildBboSession(t, username, items);
  const name = sessionFileName(t);
  status.textContent = `${session.boards.length} of ${t.boards.length} boards collected. Downloading ${name}.`;
  fill.style.width = "100%";
  if (missing.length) log.textContent = `Missing:\n${missing.join("\n")}`;
  if (session.boards.length) download(sessionToJson(session), name);
  const again = el("button", BTN, "Back to the list");
  again.onclick = main;
  body.append(again);
}

main();

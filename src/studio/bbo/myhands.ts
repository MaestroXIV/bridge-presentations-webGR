/**
 * BBO "Myhands" pages: the hands list (tournaments and their boards with
 * Movie / Lin / Traveller links) and a board's traveller (one row per table).
 * Pure string parsing; see docs/BBO_COLLECT.md for the page structure.
 */
import { parseLin } from "@/presentations/class/lin";
import { boardFromLin } from "../model/session";
import { Scoring, Seat, SEATS, Side, StudioBoard, StudioSession, Traveller } from "../model/types";
import { Row, cellBy, scanRows, textOf } from "./html";

export interface ParsedResult {
  /** "4SX", "3N", "PASS" — the session `contract` format */
  contract: string;
  declarer?: Seat;
  tricks?: number;
}

const STRAIN: Record<string, string> = { "♠": "S", "♥": "H", "♦": "D", "♣": "C", S: "S", H: "H", D: "D", C: "C", N: "N", NT: "N" };

/** "3♦S=", "4♥W+3", "2♠xN=", "5♣xE-3", "3NN+1", "2NTW-3", "PASS" → contract, declarer, tricks. */
export function parseBboResult(s: string): ParsedResult | undefined {
  const t = s.replace(/\s+/g, "").trim();
  if (!t) return undefined;
  if (/^(pass(ed)?(out)?|ap|allpass|p)$/i.test(t)) return { contract: "PASS" };
  const m = t.match(/^([1-7])(NT|[♠♥♦♣SHDCN])(xx|x|\*\*|\*)?([NESW])(=|[+-]\d+)$/i);
  if (!m) return undefined;
  const level = parseInt(m[1]);
  const strain = STRAIN[m[2].toUpperCase()] ?? STRAIN[m[2]];
  const dbl = (m[3] ?? "").length === 2 ? "XX" : m[3] ? "X" : "";
  const diff = m[5] === "=" ? 0 : parseInt(m[5]);
  return { contract: `${level}${strain}${dbl}`, declarer: m[4].toUpperCase() as Seat, tricks: level + 6 + diff };
}

function num(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const t = s.replace(/[^\d.+-]/g, "");
  if (t === "" || t === "-" || t === "+") return undefined;
  const n = Number(t);
  return isNaN(n) ? undefined : n;
}

/** "57.69%" → MP 57.69; "-4.50" → IMP -4.5 */
export function parseValue(s: string | undefined): { mp?: number; imps?: number } {
  if (!s) return {};
  const n = num(s);
  if (n === undefined) return {};
  return s.includes("%") ? { mp: n } : { imps: n };
}

function seatsOf(row: Row): Record<Seat, string> {
  const get = (c: string) => cellBy(row, c)?.text ?? "";
  return { N: get("north"), E: get("east"), S: get("south"), W: get("west") };
}

/** LIN embedded in a saved page (hv_popuplin in the Movie link, or lin=/bbo= with an md| in it). */
function embeddedLin(row: Row): string | undefined {
  for (const c of row.cells)
    for (const l of c.links) {
      const m = l.onclick?.match(/hv_popuplin\('((?:[^'\\]|\\.)*)'\)/);
      if (m) return m[1].replace(/\\'/g, "'");
      const q = l.href.match(/[?&](?:lin|bbo)=([^&#]+)/i);
      if (q) {
        try {
          const v = decodeURIComponent(q[1].replace(/\+/g, " "));
          if (/md\|/i.test(v)) return v;
        } catch {
          /* not a LIN */
        }
      }
    }
  const m = row.cells.map((c) => c.html).join("").match(/hv_popuplin\('((?:[^'\\]|\\.)*)'\)/);
  return m ? m[1].replace(/\\'/g, "'") : undefined;
}

export interface BboBoardRow {
  kind: "tourney" | "mbc" | "team";
  /** running number in the list (not the board number) */
  listNo?: number;
  time: string;
  seats: Record<Seat, string>;
  result: string;
  parsed?: ParsedResult;
  /** points from the account's own side */
  points?: number;
  /** "57.69%" or IMPs, from the account's own side */
  value?: string;
  lin?: string;
  linUrl?: string;
  movieUrl?: string;
  travellerUrl?: string;
  travellerId?: string;
}

export interface BboTournament {
  id?: string;
  title: string;
  url?: string;
  unix?: number;
  /** YYYY-MM-DD */
  date?: string;
  place?: string;
  points?: string;
  score?: string;
  scoring?: Scoring;
  boards: BboBoardRow[];
}

export interface BboHandsList {
  username?: string;
  tournaments: BboTournament[];
}

function isoDate(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

function scoringOf(title: string, rows: BboBoardRow[]): Scoring | undefined {
  if (/\((MP|MPS|matchpoints?)\)|\bMP\b|matchpoint/i.test(title)) return "MP";
  if (/\((IMP|IMPS)\)|\bIMPs?\b|butler/i.test(title)) return "IMP";
  if (/\bBAM\b/i.test(title)) return "BAM";
  if (rows.some((r) => r.value?.includes("%"))) return "MP";
  if (rows.some((r) => r.value && /^[+-]?\d/.test(r.value))) return "IMP";
  return undefined;
}

function boardRow(row: Row, kind: BboBoardRow["kind"]): BboBoardRow {
  const scoreCells = row.cells.filter((c) => c.cls.includes("score") || c.cls.includes("negscore"));
  const timeCell = row.cells.find((c) => c.tag === "td" && c.cls.length === 0 && /\d:\d\d/.test(c.text));
  const result = cellBy(row, "result")?.text ?? "";
  const movieCell = cellBy(row, "movie");
  const movie = movieCell?.links.find((l) => /movie/i.test(l.text) || /handviewer/i.test(l.href));
  const lin = movieCell?.links.find((l) => /fetchlin/i.test(l.href) || /^lin$/i.test(l.text));
  const trav = cellBy(row, "traveller")?.links[0];
  const travId = trav?.href.match(/[?&]traveller=([^&#]+)/)?.[1];
  return {
    kind,
    listNo: num(cellBy(row, "handnum")?.text),
    time: timeCell?.text ?? "",
    seats: seatsOf(row),
    result,
    parsed: parseBboResult(result),
    points: num(scoreCells[0]?.text),
    value: scoreCells[1]?.text || undefined,
    lin: embeddedLin(row),
    linUrl: lin?.href,
    movieUrl: movie?.href,
    travellerUrl: trav?.href,
    travellerId: travId,
  };
}

/** Parses the hands list page (live or saved). */
export function parseHandsList(html: string): BboHandsList {
  const rows = scanRows(html);
  const tournaments: BboTournament[] = [];
  let cur: BboTournament | undefined;
  let date: string | undefined;
  const mbcByDate = new Map<string, BboTournament>();
  for (const r of rows) {
    if (r.cls.length === 0 && r.cells.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(r.cells[0].text)) {
      date = r.cells[0].text;
      cur = undefined;
      continue;
    }
    if (r.cls.includes("tourneysummary")) {
      const name = cellBy(r, "tourneyname");
      const link = name?.links[0];
      const t = link?.href.match(/[?&]t=([^&#]+?)-(\d{9,11})(?:&|#|$)/);
      const unix = t ? parseInt(t[2]) : undefined;
      cur = {
        id: t?.[1],
        title: name?.text ?? "Tournament",
        url: link?.href,
        unix,
        date: unix ? isoDate(unix) : date,
        place: cellBy(r, "tourneyplace")?.text || undefined,
        points: cellBy(r, "tourneypoints")?.text || undefined,
        score: cellBy(r, "tourneyscore")?.text || undefined,
        boards: [],
      };
      tournaments.push(cur);
      continue;
    }
    const kind = r.cls.includes("tourney") ? "tourney" : r.cls.includes("mbc") ? "mbc" : r.cls.includes("team") ? "team" : undefined;
    if (!kind) continue;
    const b = boardRow(r, kind);
    if (kind === "tourney" && cur) {
      cur.boards.push(b);
    } else {
      // Main Bridge Club / team rows without a summary row: one group per date and kind
      const key = `${kind}|${date ?? ""}`;
      let g = mbcByDate.get(key);
      if (!g) {
        g = { title: `${kind === "mbc" ? "Main Bridge Club" : kind === "team" ? "Team match" : "Hands"}${date ? " " + date : ""}`, date, boards: [] };
        mbcByDate.set(key, g);
        tournaments.push(g);
      }
      g.boards.push(b);
    }
  }
  for (const t of tournaments) t.scoring = scoringOf(t.title, t.boards);
  const user = html.match(/class=['"]username['"][^>]*>([^<]+)</i)?.[1]?.trim();
  return { username: user, tournaments: tournaments.filter((t) => t.boards.length) };
}

export interface BboTravellerRow {
  seats: Record<Seat, string>;
  result: string;
  parsed?: ParsedResult;
  scoreNS?: number;
  value?: string;
}

/** Parses a traveller page: one row per table, N-S points then % or IMPs. */
export function parseTravellerHtml(html: string): BboTravellerRow[] {
  return scanRows(html)
    .filter((r) => r.cls.includes("tourney") || r.cls.includes("mbc") || r.cls.includes("team"))
    .map((r) => {
      const scoreCells = r.cells.filter((c) => c.cls.includes("score") || c.cls.includes("negscore"));
      const result = cellBy(r, "result")?.text ?? "";
      return { seats: seatsOf(r), result, parsed: parseBboResult(result), scoreNS: num(scoreCells[0]?.text), value: scoreCells[1]?.text || undefined };
    });
}

/** Side the user sat at a table, from the seat names (case-insensitive). */
export function sideOfUser(seats: Record<Seat, string>, username: string | undefined): Side | undefined {
  if (!username) return undefined;
  const u = username.toLowerCase();
  const seat = SEATS.find((s) => seats[s]?.toLowerCase() === u);
  return seat ? (seat === "N" || seat === "S" ? "NS" : "EW") : undefined;
}

/**
 * Traveller rows → session travellers. Names are used only to mark the
 * user's own row and are not kept.
 */
export function travellersFromRows(rows: BboTravellerRow[], username: string | undefined): Traveller[] {
  const out: Traveller[] = [];
  for (const r of rows) {
    if (!r.parsed) continue;
    const v = parseValue(r.value);
    const t: Traveller = { contract: r.parsed.contract };
    if (r.parsed.declarer) t.declarer = r.parsed.declarer;
    if (r.parsed.tricks !== undefined) t.tricks = r.parsed.tricks;
    if (r.scoreNS !== undefined) t.scoreNS = r.scoreNS;
    if (v.mp !== undefined) t.mpNS = v.mp;
    if (v.imps !== undefined) t.impsNS = v.imps;
    if (sideOfUser(r.seats, username)) t.mine = true;
    out.push(t);
  }
  return out;
}

/** "4SX" N 9 → "4♠× N -1" for the board note */
export function resultText(p: ParsedResult | undefined): string | undefined {
  if (!p) return undefined;
  if (p.contract === "PASS") return "passed out";
  const m = p.contract.match(/^(\d)([CDHSN])(X{0,2})$/);
  if (!m || !p.declarer || p.tricks === undefined) return undefined;
  const sym: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣", N: "NT" };
  const diff = p.tricks - (parseInt(m[1]) + 6);
  return `${m[1]}${sym[m[2]]}${m[3] === "XX" ? "××" : m[3] ? "×" : ""} ${p.declarer} ${diff === 0 ? "=" : diff > 0 ? "+" + diff : diff}`;
}

export interface CollectedBoard {
  row: BboBoardRow;
  /** LIN text (embedded in the page or fetched) */
  lin?: string;
  /** traveller page HTML, if fetched */
  travellerHtml?: string;
}

/**
 * Builds a presenter session from one tournament. Boards whose LIN is
 * missing are skipped; boards whose traveller is missing keep no
 * travellers. Both are listed in `missing`.
 */
export function buildBboSession(t: BboTournament, username: string | undefined, items: CollectedBoard[]): { session: StudioSession; missing: string[] } {
  const missing: string[] = [];
  const boards: StudioBoard[] = [];
  items.forEach((it, i) => {
    const label = `row ${it.row.listNo ?? i + 1}`;
    const lb = it.lin ? parseLin(it.lin)[0] : undefined;
    if (!lb) {
      missing.push(`${label}: deal (LIN) missing, board skipped`);
      return;
    }
    const b = boardFromLin(lb, i);
    b.source = "BBO";
    b.note = undefined;
    if (t.scoring) b.scoring = t.scoring;
    if (it.row.travellerUrl) b.travellerUrl = it.row.travellerUrl;
    const side = sideOfUser(it.row.seats, username);
    if (side) b.mySide = side;
    if (it.travellerHtml) {
      const tr = travellersFromRows(parseTravellerHtml(it.travellerHtml), username);
      if (tr.length) b.travellers = tr;
      else missing.push(`board ${b.number ?? label}: traveller page had no results`);
    } else {
      missing.push(`board ${b.number ?? label}: other tables' results missing`);
    }
    if (!b.travellers && it.row.parsed) {
      const v = parseValue(it.row.value);
      b.note = `At our table: ${resultText(it.row.parsed) ?? it.row.result}${it.row.points !== undefined ? `, ${it.row.points > 0 ? "+" : ""}${it.row.points}` : ""}${v.mp !== undefined ? `, ${v.mp}%` : v.imps !== undefined ? `, ${v.imps} IMPs` : ""}`;
    }
    boards.push(b);
  });
  const seen = new Set<string>();
  for (const b of boards) {
    while (seen.has(b.id)) b.id += "x";
    seen.add(b.id);
  }
  return {
    session: { title: t.title.replace(/^#\d+\s+/, "").trim() || t.title, date: t.date, scoring: t.scoring, me: username, boards },
    missing,
  };
}

/** File name for a collected session: 2026-10-15_ACBL_Thu_2PM_ET_MP_Speedball.session.json */
export function sessionFileName(t: BboTournament): string {
  const name = t.title.replace(/^#\d+\s+/, "").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "bbo";
  return `${t.date ?? "session"}_${name}.session.json`;
}

export { textOf };

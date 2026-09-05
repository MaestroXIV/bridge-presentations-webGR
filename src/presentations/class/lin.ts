/**
 * Parser for BBO LIN hand records ("movies").
 *
 * Accepts:
 *  - a raw LIN string  (pn|...|md|...|sv|...|mb|...|pc|...|)
 *  - a BBO handviewer URL (…handviewer.html?lin=… or …?bbo=…), URL-encoded
 *  - a multi-board tournament LIN (boards separated by qx| tokens, or by a
 *    second md| token)
 *
 * Tokens used: pn (player names S,W,N,E), md (dealer digit + hands S,W,N,E),
 * sv (vulnerability o/n/e/b), ah / qx (board name), mb (bid), pc (played
 * card), mc (claim). Everything else (an, nt, pg, st, rh, vg, rs, …) is skipped.
 */
import { Position } from "@/bridge/model/Position";
import { Vulnerability } from "@/bridge/model/Vulnerability";
import { normalizeBidString, normalizeCardString, Script, ScriptAction } from "./script";

export interface LinBoardResult {
  /** e.g. "2♥E+1" as shown on BBO */
  contract: string;
  /** score from the viewpoint of the account that exported the page */
  score: number | undefined;
  /** matchpoint % or IMPs as shown */
  percent: string;
}

export interface LinBoard {
  name: string;
  /** board number when known (Myhands table, qx|o12|) */
  number?: number;
  /** result columns from a Myhands table, if imported from one */
  result?: LinBoardResult;
  players: { north: string; east: string; south: string; west: string };
  dealer: Position;
  vulnerability: Vulnerability;
  /** hand strings in the app's own format: "AKQ2 T98 J7 Q543" (S H D C, "-" for a void) */
  cards: { north: string; east: string; south: string; west: string };
  script: Script;
  warnings: string[];
}

const SUITS = ["S", "H", "D", "C"] as const;
const RANKS = "AKQJT98765432";

const DEALER_BY_DIGIT: Record<string, Position> = {
  "1": Position.South,
  "2": Position.West,
  "3": Position.North,
  "4": Position.East,
};

const VUL_BY_LETTER: Record<string, Vulnerability> = {
  o: Vulnerability.None,
  n: Vulnerability.NS,
  e: Vulnerability.EW,
  b: Vulnerability.Both,
};

/** Extracts the LIN text from a handviewer URL, or returns the input unchanged. */
export function extractLinText(input: string): string {
  const s = input.trim();
  const m = s.match(/[?&](?:lin|bbo)=([^&#]+)/i);
  if (m) {
    try {
      return decodeURIComponent(m[1].replace(/\+/g, " "));
    } catch {
      return m[1];
    }
  }
  // Some exports URL-encode the LIN (or the part after pn|, as Myhands does)
  if (/%7C/i.test(s)) {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }
  return s;
}

/** "SAKQHT9D8765C432" → { S: "AKQ", H: "T9", D: "8765", C: "432" } */
function parseLinHand(hand: string): Record<(typeof SUITS)[number], string> {
  const out = { S: "", H: "", D: "", C: "" };
  let current: (typeof SUITS)[number] | undefined;
  for (const ch of hand.toUpperCase()) {
    if (ch === "S" || ch === "H" || ch === "D" || ch === "C") current = ch;
    else if (current && RANKS.includes(ch === "1" ? "T" : ch)) out[current] += ch === "1" ? "T" : ch;
    else if (ch === "0") continue; // second character of "10"
  }
  return out;
}

function sortRanks(ranks: string): string {
  return ranks
    .split("")
    .sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b))
    .join("");
}

function toAppHandString(h: Record<(typeof SUITS)[number], string>): string {
  return SUITS.map((s) => (h[s] === "" ? "-" : sortRanks(h[s]))).join(" ");
}

/**
 * Parses the md| value: dealer digit followed by up to four hands in the
 * order South, West, North, East. A missing fourth hand is completed from the
 * remaining cards.
 */
function parseMd(value: string, warnings: string[]) {
  const dealer = DEALER_BY_DIGIT[value[0]] ?? Position.North;
  if (!DEALER_BY_DIGIT[value[0]]) warnings.push(`unknown dealer digit "${value[0]}", assuming North`);
  const parts = value
    .slice(1)
    .split(",")
    .map((p) => p.trim());
  const order: Position[] = [Position.South, Position.West, Position.North, Position.East];
  const hands: Partial<Record<Position, Record<(typeof SUITS)[number], string>>> = {};
  order.forEach((pos, i) => {
    if (parts[i] && parts[i] !== "") hands[pos] = parseLinHand(parts[i]);
  });

  const missing = order.filter((p) => !hands[p]);
  if (missing.length === 1) {
    const rest = { S: "", H: "", D: "", C: "" };
    for (const s of SUITS) {
      const used = order
        .filter((p) => hands[p])
        .map((p) => hands[p]![s])
        .join("");
      rest[s] = RANKS.split("")
        .filter((r) => !used.includes(r))
        .join("");
    }
    hands[missing[0]] = rest;
  } else if (missing.length > 1) {
    warnings.push(`${missing.length} hands missing in md|`);
    for (const p of missing) hands[p] = { S: "", H: "", D: "", C: "" };
  }

  const count = (p: Position) => SUITS.reduce((n, s) => n + hands[p]![s].length, 0);
  for (const p of order) if (count(p) !== 13) warnings.push(`${p} has ${count(p)} cards`);

  return {
    dealer,
    cards: {
      north: toAppHandString(hands[Position.North]!),
      east: toAppHandString(hands[Position.East]!),
      south: toAppHandString(hands[Position.South]!),
      west: toAppHandString(hands[Position.West]!),
    },
  };
}

interface RawBoard {
  name?: string;
  pn?: string;
  md?: string;
  sv?: string;
  actions: ScriptAction[];
  warnings: string[];
}

export interface LinImport {
  /** tourney title when imported from a Myhands page */
  title?: string;
  boards: LinBoard[];
}

/** Strips tags and decodes entities from a table cell. */
function cellText(htmlFragment: string): string {
  const noTags = htmlFragment.replace(/<[^>]+>/g, "");
  const entities: Record<string, string> = {
    "&spades;": "♠", "&hearts;": "♥", "&diams;": "♦", "&clubs;": "♣",
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  };
  return noTags.replace(/&[a-z]+;/g, (m) => entities[m] ?? m).trim();
}

/**
 * Parses a saved BBO "Myhands" page: every row's Movie link carries the
 * board's LIN in hv_popuplin('…'), and the row carries result, score and %.
 */
export function parseMyhandsHtml(htmlText: string): LinImport {
  const boards: LinBoard[] = [];
  const titleMatch = htmlText.match(/<td class="tourneyName"[^>]*>(.*?)<\/td>/s);
  const dateMatch = htmlText.match(/<th colspan="11">(\d{4}-\d{2}-\d{2})<\/th>/);
  const title = [titleMatch ? cellText(titleMatch[1]) : undefined, dateMatch?.[1]]
    .filter(Boolean)
    .join(" · ") || undefined;

  const rowRe = /<tr class="tourney">(.*?)<\/tr>/gs;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(htmlText))) {
    const r = row[1];
    const lin = r.match(/hv_popuplin\('((?:[^'\\]|\\.)*)'\)/);
    if (!lin) continue;
    const linText = lin[1].replace(/\\'/g, "'");
    const parsed = parseLin(linText);
    if (parsed.length === 0) continue;
    const b = parsed[0];
    const cell = (cls: string) => {
      const m = r.match(new RegExp(`<td class="${cls}"[^>]*>(.*?)<\\/td>`, "s"));
      return m ? cellText(m[1]) : "";
    };
    const num = parseInt(cell("handnum"));
    if (!isNaN(num)) {
      b.number = num;
      if (!/\d/.test(b.name)) b.name = `Board ${num}`;
    }
    const scoreCells = [...r.matchAll(/<td class="(?:score|negscore)"[^>]*>(.*?)<\/td>/gs)].map((m) => cellText(m[1]));
    const score = scoreCells.length ? parseInt(scoreCells[0].replace(/[^-\d]/g, "")) : NaN;
    b.result = {
      contract: cell("result"),
      score: isNaN(score) ? undefined : score,
      percent: scoreCells[1] ?? "",
    };
    b.script.label = `BBO — ${b.name}${b.result.contract ? " · " + b.result.contract : ""}`;
    boards.push(b);
  }
  return { title, boards };
}

/**
 * Entry point for the Import UI: accepts raw LIN, a handviewer URL, a
 * multi-board LIN file, or a saved Myhands HTML page.
 */
export function importLin(input: string): LinImport {
  if (/hv_popuplin\(/.test(input)) return parseMyhandsHtml(input);
  return { boards: parseLin(input) };
}

/** Parses one LIN text (raw, URL, or multi-board) into boards. */
export function parseLin(input: string): LinBoard[] {
  const text = extractLinText(input).replace(/\r?\n/g, "");
  const tokens = text.split("|");
  const boards: RawBoard[] = [];
  let cur: RawBoard | undefined;
  let sharedPn: string | undefined;

  const fresh = (): RawBoard => ({ actions: [], warnings: [] });

  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const tag = tokens[i].trim().toLowerCase();
    const value = tokens[i + 1];
    if (tag === "") continue;

    switch (tag) {
      case "qx":
        cur = fresh();
        cur.name = value.replace(/^[oc]/i, "Board ");
        boards.push(cur);
        break;
      case "pn":
        if (!cur) sharedPn = value;
        else cur.pn = value;
        break;
      case "md":
        if (!cur || cur.md) {
          cur = fresh();
          boards.push(cur);
        }
        cur.md = value;
        break;
      case "sv":
        if (cur) cur.sv = value.toLowerCase();
        break;
      case "ah":
        if (cur) cur.name = value;
        break;
      case "mb": {
        if (!cur) break;
        const bid = normalizeBidString(value);
        if (bid) cur.actions.push({ t: "bid", bid });
        else cur.warnings.push(`unknown bid "${value}"`);
        break;
      }
      case "pc": {
        if (!cur) break;
        const card = normalizeCardString(value);
        if (card) cur.actions.push({ t: "play", card });
        else cur.warnings.push(`unknown card "${value}"`);
        break;
      }
      case "mc": {
        if (!cur) break;
        const n = parseInt(value);
        if (!isNaN(n)) cur.actions.push({ t: "claim", tricks: n });
        break;
      }
      default:
        break; // an, nt, pg, st, rh, vg, rs, mn, sk, …
    }
  }

  return boards
    .filter((b) => b.md)
    .map((b, idx) => {
      const warnings = [...b.warnings];
      const { dealer, cards } = parseMd(b.md!, warnings);
      const pn = (b.pn ?? sharedPn ?? "").split(",");
      const players = {
        south: pn[0] ?? "",
        west: pn[1] ?? "",
        north: pn[2] ?? "",
        east: pn[3] ?? "",
      };
      const vulnerability = VUL_BY_LETTER[b.sv?.[0] ?? "o"] ?? Vulnerability.None;
      const name = b.name ?? (boards.length > 1 ? `Board ${idx + 1}` : "Board");
      const numMatch = name.match(/(\d+)/);
      const number = numMatch ? parseInt(numMatch[1]) : undefined;
      if (!b.actions.some((a) => a.t === "bid")) warnings.push("no auction in file");
      const script: Script = {
        label: `BBO LIN — ${name}`,
        players,
        actions: b.actions,
      };
      return { name, number, players, dealer, vulnerability, cards, script, warnings };
    });
}

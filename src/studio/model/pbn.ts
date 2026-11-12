/**
 * PBN (Portable Bridge Notation) import for lesson boards.
 *
 * Reads, per game: Board, Dealer, Vulnerable, Deal, North/East/South/West
 * (player names), Scoring, Auction (with =n= note references, "!" alerts,
 * AP, $n NAGs), Note, Contract, Declarer, Play (columns by seat from the
 * Play tag's seat, rows by trick), Result, and {comments} as the board note.
 * "#" as a tag value repeats the previous game's value.
 */
import { contractFromAuction, normalizeCall, parseContractString } from "./auction";
import { replayPlay } from "./play";
import { Call, Seat, SEATS, StudioBoard, Scoring, Strain, Vul, nextSeat } from "./types";

export interface PbnImport {
  title?: string;
  boards: StudioBoard[];
  warnings: string[];
}

interface Game {
  tags: Record<string, string>;
  sections: Record<string, string[]>;
  comments: string[];
  notes: string[];
}

function splitGames(text: string): Game[] {
  const games: Game[] = [];
  let cur: Game | undefined;
  let section: string | undefined;
  let sawDealish = false;

  // pull out {comments}, keeping a placeholder so they stay with their game
  const comments: string[] = [];
  const src = text.replace(/\r\n?/g, "\n").replace(/\{([^}]*)\}/g, (_m, c: string) => {
    comments.push(c.trim());
    return ` \u0001${comments.length - 1}\u0001 `;
  });

  const startGame = () => {
    cur = { tags: {}, sections: {}, comments: [], notes: [] };
    games.push(cur);
    section = undefined;
    sawDealish = false;
  };

  for (const rawLine of src.split("\n")) {
    if (/^\s*[;%]/.test(rawLine)) continue;
    const hadComment = rawLine.includes("\u0001");
    const line = rawLine.replace(/\u0001(\d+)\u0001/g, (_m, i) => {
      if (!cur) startGame();
      cur!.comments.push(comments[parseInt(i)]);
      return " ";
    });
    if (line.trim() === "" && !hadComment) {
      // an empty line ends a game (only once it has tags)
      if (cur && Object.keys(cur.tags).length) {
        cur = undefined;
        section = undefined;
      }
      continue;
    }
    const tagRe = /\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/g;
    let m: RegExpExecArray | null;
    let rest = line;
    while ((m = tagRe.exec(line))) {
      const name = m[1];
      // a second Board/Deal tag without a blank line also starts a new game
      if (!cur || ((name === "Board" || name === "Deal") && name in cur.tags) || (name === "Event" && sawDealish)) startGame();
      if (name === "Deal" || name === "Board") sawDealish = true;
      if (name === "Note") cur!.notes.push(m[2]);
      cur!.tags[name] = m[2].replace(/\\"/g, '"');
      section = name;
      cur!.sections[name] = [];
      rest = rest.replace(m[0], " ");
    }
    if (line.trim() === "") continue;
    if (cur && section && rest.trim()) cur.sections[section].push(rest.trim());
  }
  return games.filter((g) => g.tags.Deal);
}

function parseDealTag(deal: string): Record<Seat, string> {
  const m = deal.trim().match(/^([NESW]):\s*(.*)$/i);
  const first = (m ? m[1].toUpperCase() : "N") as Seat;
  const parts = (m ? m[2] : deal).trim().split(/\s+/);
  const hands: Record<Seat, string> = { N: "", E: "", S: "", W: "" };
  let seat = first;
  for (let i = 0; i < 4; i++) {
    const p = parts[i] ?? "-";
    hands[seat] = p === "-" ? "" : p.toUpperCase();
    seat = nextSeat(seat);
  }
  return hands;
}

const VUL: Record<string, Vul> = { NONE: "None", LOVE: "None", "-": "None", NS: "NS", EW: "EW", ALL: "All", BOTH: "All" };

function parseScoring(s: string | undefined): Scoring | undefined {
  if (!s) return undefined;
  const u = s.toUpperCase();
  if (u.includes("IMP") || u.includes("BUTLER")) return "IMP";
  if (u.includes("MP") || u.includes("MATCHPOINT") || u.includes("PAIRS")) return "MP";
  if (u.includes("BAM")) return "BAM";
  if (u.includes("RUBBER") || u.includes("TOTAL") || u.includes("CHICAGO")) return "Total";
  return undefined;
}

function parseAuction(lines: string[], notes: Record<string, string>, warnings: string[]): Call[] {
  const calls: Call[] = [];
  const tokens = lines.join(" ").split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (tok === "*" || tok === "+" || tok === "-") continue;
    const note = tok.match(/^=(\d+)=$/);
    if (note) {
      if (calls.length) calls[calls.length - 1].alert = notes[note[1]] ?? "";
      continue;
    }
    if (/^\$\d+$/.test(tok)) continue;
    const alerted = /!$/.test(tok);
    const c = normalizeCall(tok.replace(/[!?]+$/, ""));
    if (!c) {
      warnings.push(`unknown call "${tok}"`);
      continue;
    }
    if (c === "AP") {
      const hasBid = calls.some((x) => x.call !== "P");
      const need = hasBid ? 3 : 4;
      let trailing = 0;
      for (let i = calls.length - 1; i >= 0 && calls[i].call === "P"; i--) trailing++;
      for (let i = trailing; i < need; i++) calls.push({ call: "P" });
      continue;
    }
    calls.push(alerted ? { call: c, alert: "" } : { call: c });
  }
  return calls;
}

function normCard(tok: string): string | undefined {
  const t = tok.toUpperCase().replace("10", "T").replace(/[!?]+$/, "");
  return /^[SHDC][AKQJT98765432]$/.test(t) ? t : undefined;
}

/** PBN play section: one row per trick, columns are seats starting at the Play tag's seat. */
function parsePlay(lines: string[], playSeat: Seat, hands: Record<Seat, string>, declarer: Seat, strain: Strain): string[] {
  const out: string[] = [];
  const tokens = lines
    .join(" ")
    .split(/\s+/)
    .filter((t) => t && !/^=\d+=$/.test(t) && !/^\$\d+$/.test(t) && t !== "+");
  const rows: (string | undefined)[][] = [];
  let row: (string | undefined)[] = [];
  for (const tok of tokens) {
    if (tok === "*") break;
    row.push(tok === "-" ? undefined : normCard(tok));
    if (row.length === 4) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  let leader = nextSeat(declarer);
  for (const r of rows) {
    const bySeat: Partial<Record<Seat, string>> = {};
    r.forEach((c, i) => {
      if (c) bySeat[nextSeat(playSeat, i)] = c;
    });
    const trick: string[] = [];
    let s = leader;
    for (let i = 0; i < 4; i++) {
      const c = bySeat[s];
      if (!c) break;
      trick.push(c);
      s = nextSeat(s);
    }
    out.push(...trick);
    if (trick.length < 4) break;
    const st = replayPlay(hands, declarer, strain, out);
    if (st.error) {
      out.length = st.applied;
      break;
    }
    leader = st.tricks[st.tricks.length - 1].winner!;
  }
  return out;
}

export function parsePbn(text: string): PbnImport {
  const games = splitGames(text);
  const warnings: string[] = [];
  const boards: StudioBoard[] = [];
  let prev: Record<string, string> = {};
  let title: string | undefined;
  const ids = new Set<string>();

  games.forEach((g, idx) => {
    const w: string[] = [];
    const tag = (k: string) => {
      const v = g.tags[k];
      return v === "#" ? prev[k] : v;
    };
    const tags: Record<string, string> = {};
    for (const k of Object.keys(g.tags)) tags[k] = tag(k) ?? "";
    prev = tags;
    if (!title && tags.Event && tags.Event !== "?") title = tags.Event;

    const hands = parseDealTag(tags.Deal);
    // complete a single missing hand
    const missing = SEATS.filter((s) => !hands[s]);
    if (missing.length === 1) {
      const used = new Set(SEATS.filter((s) => hands[s]).flatMap((s) => hands[s].split(".").map((r, i) => [...r].map((c) => "SHDC"[i] + c)).flat()));
      hands[missing[0]] = [0, 1, 2, 3].map((i) => [..."AKQJT98765432"].filter((r) => !used.has("SHDC"[i] + r)).join("")).join(".");
    }

    const dealer = (tags.Dealer?.toUpperCase()[0] as Seat) || "N";
    const vul = VUL[(tags.Vulnerable ?? "None").toUpperCase()] ?? "None";
    const notes: Record<string, string> = {};
    for (const n of g.notes) {
      const m = n.match(/^(\d+):(.*)$/s);
      if (m) notes[m[1]] = m[2].trim();
    }

    const auction = g.sections.Auction ? parseAuction(g.sections.Auction, notes, w) : [];
    const contract = contractFromAuction(dealer, auction);
    let declarer: Seat | undefined = contract && contract !== "passed" ? contract.declarer : undefined;
    let strain: Strain | undefined = contract && contract !== "passed" ? contract.strain : undefined;
    if (!contract && tags.Contract) {
      const c = parseContractString(tags.Contract);
      if (c && c !== "passed") {
        strain = c.strain;
        declarer = (tags.Declarer?.toUpperCase()[0] as Seat) || undefined;
      }
    }

    let play: string[] = [];
    if (g.sections.Play && declarer && strain) {
      const ps = (tags.Play?.toUpperCase()[0] as Seat) || nextSeat(declarer);
      play = parsePlay(g.sections.Play, ps, hands, declarer, strain);
    }
    let claim: number | undefined;
    const res = parseInt(tags.Result ?? "");
    if (!isNaN(res) && play.length < 52) claim = res;

    const number = parseInt(tags.Board ?? "");
    let id = `b${isNaN(number) ? idx + 1 : number}`;
    while (ids.has(id)) id += "x";
    ids.add(id);

    const players: Partial<Record<Seat, string>> = {};
    for (const s of SEATS) {
      const name = tags[{ N: "North", E: "East", S: "South", W: "West" }[s]];
      if (name && name !== "?") players[s] = name;
    }
    const note = g.comments.filter(Boolean).join("\n\n") || undefined;
    w.forEach((x) => warnings.push(`board ${isNaN(number) ? idx + 1 : number}: ${x}`));
    boards.push({
      id,
      number: isNaN(number) ? undefined : number,
      dealer,
      vul,
      hands,
      players: Object.keys(players).length ? players : undefined,
      auction,
      play,
      claim,
      note,
      scoring: parseScoring(tags.Scoring),
      ...(contract === undefined && tags.Contract && declarer ? { contract: tags.Contract, declarer } : {}),
      source: "PBN",
    });
  });
  return { title, boards, warnings };
}

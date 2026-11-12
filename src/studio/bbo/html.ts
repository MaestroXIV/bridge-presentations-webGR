/**
 * Tiny tolerant scanner for the table rows of BBO "Myhands" pages. Works on
 * an HTML string (no DOM), so the same code runs in unit tests, in the app's
 * import of a saved page, and in the collector bookmarklet.
 */

export interface Link {
  href: string;
  text: string;
  onclick?: string;
}

export interface Cell {
  tag: "td" | "th";
  cls: string[];
  html: string;
  text: string;
  links: Link[];
}

export interface Row {
  cls: string[];
  cells: Cell[];
}

const ENTITIES: Record<string, string> = {
  "&spades;": "♠", "&hearts;": "♥", "&diams;": "♦", "&clubs;": "♣",
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&ordm;": "º",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

export function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function attr(tagSrc: string, name: string): string | undefined {
  const m = tagSrc.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? m[1] ?? m[2] ?? m[3] : undefined;
}

function classes(tagSrc: string): string[] {
  return (attr(tagSrc, "class") ?? "").split(/\s+/).filter(Boolean).map((c) => c.toLowerCase());
}

function links(html: string): Link[] {
  const out: Link[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = attr(m[1], "href");
    if (href === undefined) continue;
    const onclick = attr(m[1], "onclick");
    out.push({ href: decodeEntities(href), text: textOf(m[2]), ...(onclick ? { onclick } : {}) });
  }
  return out;
}

/** All <tr> rows of the document, with their cells. Nested tables are not expected. */
export function scanRows(html: string): Row[] {
  const rows: Row[] = [];
  const trRe = /<tr\b([^>]*)>([\s\S]*?)(?=<tr\b|<\/table>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html))) {
    const body = m[2].replace(/<\/tr>[\s\S]*$/i, "");
    const cells: Cell[] = [];
    const cRe = /<(td|th)\b([^>]*)>([\s\S]*?)(?=<\/t[dh]>|<t[dh]\b|$)/gi;
    let c: RegExpExecArray | null;
    while ((c = cRe.exec(body))) {
      const inner = c[3];
      cells.push({ tag: c[1].toLowerCase() as "td" | "th", cls: classes(c[2]), html: inner, text: textOf(inner), links: links(inner) });
    }
    rows.push({ cls: classes(m[1]), cells });
  }
  return rows;
}

export function cellBy(row: Row, cls: string): Cell | undefined {
  return row.cells.find((c) => c.cls.includes(cls));
}

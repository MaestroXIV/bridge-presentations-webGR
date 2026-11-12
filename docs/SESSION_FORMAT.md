# Presenter session format (`bridge-presenter-session`, version 1)

A session is one JSON file with the boards to present and, for session
analyses, the results from the other tables ("travellers"). The presenter
opens it with **Open…** (`?mode=presenter`). Files stay on your computer; the
app reads them in the browser and never uploads them.

A complete example: [`examples/sample-session.json`](examples/sample-session.json).

```json
{
  "format": "bridge-presenter-session",
  "version": 1,
  "title": "Tuesday pairs",
  "date": "2026-11-10",
  "scoring": "MP",
  "me": "yourname",
  "boards": [
    {
      "id": "b7",
      "number": 7,
      "dealer": "N",
      "vul": "NS",
      "hands": { "N": "KQ97.Q9.AK54.J75", "E": "JT85.A742.863.Q6", "S": "A643.KJT8.92.AK3", "W": "2.653.QJT7.T9842" },
      "players": { "N": "yourname", "E": "Ed", "S": "Sue", "W": "Wes" },
      "auction": [{ "call": "1S" }, { "call": "P" }, { "call": "4S", "alert": "to play" }, { "call": "P" }, { "call": "P" }, { "call": "P" }],
      "play": ["D8", "D9", "DQ", "DK"],
      "claim": 10,
      "note": "Optional text shown when there are no travellers.",
      "travellers": [
        { "ns": "yourname - Sue", "ew": "Wes - Ed", "contract": "4S", "declarer": "N", "tricks": 10, "lead": "D8", "scoreNS": 620, "mpNS": 46 },
        { "ns": "Ana - Bor", "ew": "Cene - Dan", "contract": "4S", "declarer": "N", "result": "+1" }
      ]
    }
  ]
}
```

## Session fields

| field | required | meaning |
|---|---|---|
| `format` | no | `"bridge-presenter-session"`; anything else is rejected |
| `version` | no | `1`; a higher number is rejected |
| `title` | no | shown at the top of the stage |
| `date` | no | free text, shown next to the title |
| `scoring` | no | `"MP"`, `"IMP"`, `"BAM"` or `"Total"`; default for every board |
| `me` | no | your name. Used to find your row in the travellers (match in `ns` / `ew`) and the side you sat (match in `players`) |
| `boards` | **yes** | non-empty array |

## Board fields

| field | required | meaning |
|---|---|---|
| `id` | no | unique key; recorded takes are stored under it. Default `"b" + number` |
| `number` | no | board number |
| `title` | no | used when there is no number |
| `dealer` | **yes** | `N` `E` `S` `W` (also `north`, …) |
| `vul` | no | `None`, `NS`, `EW`, `All` (also `Both`, `Love`, `-`). Default `None` |
| `hands` | **yes** | `N` `E` `S` `W` (or `north` …). PBN dot notation, spades first: `"AKQ2.T98.J7.Q543"`, empty between dots for a void. Also accepted: `"AKQ2 T98 J7 Q543"` (with `-` for a void) and LIN style `"SAKQ2HT98DJ7CQ543"` |
| `players` | no | names per seat |
| `auction` | no | calls from the dealer on. Each is `{ "call": "1S" }` or a string. Calls: `1C`…`7N` (`1NT` also accepted), `P`/`Pass`, `X`/`Dbl`, `XX`/`Rdbl`. An alerted call has `"alert": "explanation"` (empty string when there is no text); a string call ending in `!` is alerted |
| `contract`, `declarer` | no | only for boards without an auction, e.g. `"4SX"` and `"N"` |
| `play` | no | cards in the order played: `"SA"`, `"HT"`, `"C2"` (`"S10"` also accepted) |
| `claim` | no | total tricks for declarer when the play ended with a claim |
| `note` | no | short text for the left zone when there are no travellers (blank line = new paragraph) |
| `scoring` | no | overrides the session's scoring |
| `mySide` | no | `"NS"` or `"EW"`: results are shown from this side. Default: from `me` and `players`, else N-S |
| `travellers` | no | other tables' results, see below |

## Traveller rows

One object per table, the way a traveller lists it.

| field | required | meaning |
|---|---|---|
| `contract` | **yes** | `"4S"`, `"4SX"`, `"3NXX"`, `"PASS"` (`N` or `NT` for notrump) |
| `declarer` | yes unless passed | `N` `E` `S` `W` |
| `tricks` | one of these two | tricks taken by declarer |
| `result` | | `"="`, `"+1"`, `"-2"` (or a number) relative to the contract |
| `scoreNS` | no | N-S score; computed from contract, result and vulnerability when missing |
| `mpNS` | no | N-S matchpoint % (0–100); computed from all scores when missing and scoring is `MP` |
| `impsNS` | no | N-S IMPs (cross-IMP / Butler); shown instead of % when present |
| `ns`, `ew` | no | pair names |
| `lead` | no | opening lead, e.g. `"D8"` (kept for later use, not shown yet) |
| `mine` | no | `true` marks your table; otherwise found via `me` |

The results panel groups identical results (contract, declarer, tricks, score)
into one row with a table count, sorts best-first for your side, highlights
your row, and writes one summary line above it, for example
"10 of 12 tables played 4♠, 8 made it" (contracts grouped by level and strain,
doubled or not, either declarer).

## Generating it from BBO later

A BBO traveller row maps directly onto a traveller object: the four player
names give `ns` / `ew`, the contract column gives `contract` and `declarer`,
then `lead`, `result` or `tricks`, the score (`scoreNS`) and the % or IMPs
(`mpNS` / `impsNS`). The board itself (hands, auction with alerts, play) can come
from the board's LIN (`boardFromLin` in `src/studio/model/session.ts` already
converts it). The exact BBO traveller page layout has not been inspected yet.

## Other inputs

- **PBN** (`.pbn`, lessons): `Board`, `Dealer`, `Vulnerable`, `Deal`, player
  name tags, `Scoring`, `Auction` with `=n=` note references, `[Note "n:text"]`,
  `!` alerts and `AP`; `Contract`/`Declarer` when there is no auction; `Play`
  (one row per trick, columns by seat from the Play tag's seat); `Result` (kept
  as a claim when the play is incomplete); `{comments}` become the board note.
- **LIN / BBO Myhands** (`.lin`, saved Myhands `.html`): the existing importer;
  `an|` alert explanations are kept. Myhands rows carry only your own result,
  which becomes the board note.
- **From the editor**: the **Presenter mode** button hands over the loaded
  Myhands playlist (all boards) or the current board.

Use **Save session** in the presenter to write any of these out as a session
file, then add `travellers` to it.

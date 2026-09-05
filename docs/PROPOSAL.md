# Bridge Presentations — feature proposal

Recording, a teacher/audience window pair, session analysis with branching lines, and a ranked list of further ideas, all grounded in the current code (v0.2.3, 74 commits, last change March 2026).

## 1. What the app is today

A Vue 3 + Vite + TypeScript single page app in three layers:

| Layer | Where | What it does |
|---|---|---|
| `bridge` | `src/bridge/model/*` | Pure game model. `PresentationGame` extends `UndoableGame` extends `Game`. Dispatches typed events: `gameStarted`, `biddingStarted`, `bidMade`, `biddingEnded`, `cardplayStarted`, `leadMade`, `cardPlayed`, `trickStarted`, `trickEnded`, `trickCountChanged`, `claimMade`, `undoMade`, `stateChanged`, `gameEnded`. |
| `presenter` | `src/presenter/components/*` | Renders the model: `GameView` (four hands, centre frame, trick, bidding box), `StatusPanel` (tricks + contract), `BiddingHistoryView`, `ControlPanel` (card buttons with hotkeys `0-9 / * -`, claim input). |
| `presentations` | `src/presentations/*` | `Configurator.vue` (deal entry, generator, save/load `.deal` JSON, localStorage autosave), `Presenter.vue` (owns the `game` ref and the `handsVisible` map, keyboard shortcuts), `App.vue` (switches between the two on Ctrl+Q). |

Two observations that shape everything below:

1. **The model is already an event stream.** Every state change goes through a `SimpleEventDispatcher`, and `UndoableGame` proves the model can be driven backwards as well as forwards. That is exactly what a recorder and a second window need.
2. **Presentation state lives outside the model.** Hand visibility (`handsVisible` in `Presenter.vue`), the end message and layout are UI-only. A recorder that only listens to game events would miss the arrow-key hand toggles, which are the most "teaching" part of a presentation.

Also worth noting: the `Makefile` already builds Bo Haglund's DDS double-dummy solver to WASM (`lib/dds.js`, exporting `SolveBoardPBN`, `CalcDDtablePBN`, `AnalysePlayPBN`, `DealerPar`), but nothing in `src/` uses it yet. That is a half-open door for the teacher window.

## 2. Idea A — Recording button

The README says the app is "intended for making videos", but today that means running OBS next to it. Three levels, in the order I would build them.

### A1. Action log (semantic recording) — build first

Record *what happened*, not pixels. A `Recorder` subscribes to the game events and to `handsVisible`, and appends timestamped actions:

```ts
type Action =
  | { t: "start"; options: ConfiguratorOptions }
  | { t: "bid";   pos: Position; bid: string }      // "1S", "P", "X", "XX"
  | { t: "play";  pos: Position; card: string }     // "SA", "HT"
  | { t: "undo" }
  | { t: "claim"; ns: number }
  | { t: "visible"; pos: Position; audience: boolean }
  | { t: "end" };

interface Stamped { seq: number; ms: number; action: Action }
```

Saved as `<deal>.dealrec` (JSON, same `downloadObjectAsJson` helper the configurator already uses). Replay = feed the actions back into a fresh `PresentationGame` on the same timings (or at 1x/2x/step), so all existing animations play exactly as they did live.

Why first: it is tiny (one class, ~150 lines), resolution-independent, editable (a misclick becomes a one-line fix in the file instead of a re-take), and it is the *same message format* the audience window in Idea B needs. One protocol, three consumers: file, second window, remote students.

### A2. In-app screen recording — the REC button

A button in the side panel (and hotkey `R`) that starts a `MediaRecorder` on a `getDisplayMedia` stream:

```ts
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: { displaySurface: "browser" },
  audio: true,
  preferCurrentTab: true,        // Chromium: pre-selects this tab
  selfBrowserSurface: "include",
});
// Chromium 104+: crop to the board only, so the control panel and
// bidding box never appear in the video.
if ("CropTarget" in window) {
  const target = await CropTarget.fromElement(gameViewEl);
  await stream.getVideoTracks()[0].cropTo(target);
}
const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
```

Microphone commentary is one `getUserMedia({audio:true})` mixed in through an `AudioContext`. Recording auto-stops a few seconds after `gameEnded` so the end message is captured, then downloads `<deal>.webm`.

Honest limitations: Region Capture is Chromium-only (Firefox/Safari record the whole tab, which is why the audience window from Idea B is the better recording target); the output is WebM, not MP4, unless recorded in Safari or transcoded with ffmpeg afterwards; browsers show a "sharing this tab" banner that the teacher dismisses once.

### A3. Offline renderer

Given an A1 log, a Node script (`npm run render lesson.dealrec -o lesson.mp4`) drives the built app in headless Chromium via Playwright, screenshots each step at any resolution (4K is free), and stitches with ffmpeg. No screen recorder, no banner, deterministic output, re-renderable after every layout change. This is what turns "intended for making videos" into a pipeline.

## 3. Idea B — Teacher window and audience window

Two windows of the same app, same browser, one origin:

- **Teacher window** — the current UI plus a teacher panel: all four hands always face-up (dimmed where the audience cannot see them), notes for the deal, the planned line, DD trick counts, the action log, a REC button.
- **Audience window** — opened with `?role=audience`; renders only `GameView` centred and full-screen (no bidding box, no control panel, no keyboard handlers). Dragged to the projector, or shared in Zoom/Teams as a window.

### Sync without a server

`BroadcastChannel("bridge-presentation")` delivers messages to every same-origin window in the browser profile, including ones opened with `window.open`. The teacher window is the authority and broadcasts the A1 actions as they happen; the audience window replays them into its own `PresentationGame`, so it animates exactly like the teacher's. When an audience window opens it sends `hello`; the teacher answers with a `snapshot` (options + full log so far) and it catches up. Latency is sub-millisecond, and nothing leaves the machine.

Implementation touch points:

- `Presenter.vue`: split `handsVisible` into `teacherVisible` (always true by default) and `audienceVisible` (what the arrows toggle today). `GameView` already takes `handsVisible` as a prop, so the audience window just passes the audience map.
- `App.vue`: read `role` from the URL; audience role skips the configurator and the keyboard shortcuts.
- A `Transport` interface (`send(msg)`, `onMessage(cb)`) with a `BroadcastChannelTransport` today and room for a `WebSocketTransport` / WebRTC later without touching the rest.
- Window placement: Chromium's Window Management API (`getScreenDetails()`) can open the audience window directly on the second screen; elsewhere the teacher drags it once and the browser remembers.

### What only the teacher sees

- **Notes** — a `notes` field in the `.deal` file (Markdown), shown beside the board. The lesson script lives with the deal.
- **Planned line** — the intended auction and play, with the next card highlighted on the control panel. Space/→ plays the planned card; any manual card deviates and the plan simply stops highlighting.
- **Double-dummy hints** — the DDS build the Makefile already produces: `SolveBoardPBN` gives tricks for every legal card, shown as small numbers on the teacher's card buttons. Students never see them; the teacher never has to count in front of the class.
- **Action log and timer** — how long the deal has taken, and the log that becomes the `.dealrec` file.

### Remote students (later)

Swap the transport for a small WebSocket relay or WebRTC (PeerJS), and the audience window works on students' own devices from a link. Same messages, same replay code; the only new piece is the relay. This also enables a poll mode ("what do you lead?") with answers coming back on the same channel.

## 4. Idea C — Session analysis: import a played deal, branch, compare

The use case: after a session with friends or clients, load the boards as they were actually played, replay to the critical moment, take over all four hands and play a different line, and see whether it does better — recorded, so the analysis can be sent to the people who played it.

### Import: the played deal becomes an action log

BBO hand records (`.lin`, also embedded in the "My Hands" HTML) carry the whole board: `md|` deal, `sv|` vulnerability, `mb|` each bid, `pc|` each card in play order. PBN carries the same in `[Deal]`, `[Auction]` and `[Play]` sections. Both map one-to-one onto the A1 actions — one `start`, a run of `bid`, up to 52 `play` — so an imported board *is* a `.dealrec` before anyone touches it. The configurator gets "Import LIN/PBN" beside "Load scene"; a file with many boards becomes a playlist.

### Branch: replay, then take over

Replay the actual play with step control: → next card, ← back one card (`UndoableGame` already does the backward direction, including across trick boundaries). At any card press `B`: the remaining imported actions are set aside and the app is in its normal manual mode — the control panel plays whichever hand is on turn, so "play all four hands" is what the app already does, not a new feature.

Each alternative line is a log with a parent and a fork point:

```ts
interface Line { id: string; label: string; parent?: string; fromSeq?: number; actions: Stamped[] }
// "actual"  — imported, 9 tricks
// "B"       — parent "actual", fromSeq 17: duck the first spade — 10 tricks
// "B2"      — parent "B", fromSeq 31: …
```

A lines list in the teacher panel switches between them; switching replays the parent prefix and then the branch, so the audience window and any recording show the comparison as an animated replay, not a jump cut. Branching off a branch works the same way.

### Compare: tricks, score, and double-dummy truth

The trick count is already on `StatusPanel`, and `Scoring.ts` turns a result into a score, so a result strip per line (tricks, score, difference from the actual) costs little. The DDS build the Makefile prepares adds the part that matters for analysis: `AnalysePlayPBN` returns the double-dummy trick count after every card of a play, which marks exactly where the actual line lost a trick — those cards are the natural branch points, and the app can list them before anyone starts guessing. `SolveBoardPBN` at each turn shows which cards still hold the contract on the teacher's card buttons, hidden from the audience.

Recording is unchanged: one REC session captures the replay, the branches and the comparison; the A1 log captures the whole tree, which is a better artefact to send to a client than a video alone.

Sizes: LIN/PBN import about a day (LIN is a flat token stream; the PBN parser only needs `[Deal]`, `[Auction]`, `[Play]`); branching about a day on top of A1; the DD comparison depends on getting the DDS WASM built with Emscripten, one to two days.

## 5. More ideas, ranked by value for effort

1. **PBN import/export.** Paste `N:AKQ2.T98.J7.Q543 ...` or drop a `.pbn` file and the four hand fields fill in; export back to PBN. Deals from dealer scripts, BBO hand records and existing lesson files then drop straight in. Half a day; the parser is a few lines on top of `Parser.ts`.
2. **Scripted lines in the `.deal` file** (from Idea B's planned line) so a whole lesson is Space-Space-Space with a live fallback whenever a student asks "what if…".
3. **Fake auction.** The checkbox exists but is disabled. A text field `1N-P-3N-AP` parsed with the existing `Bid` classes fills `BiddingHistoryView` without clicking through the bidding box.
4. **Annotations.** Glow a card, arrow between two cards, text callout, HCP and suit-length badges per hand. Each annotation is an action (`{t:"mark", ...}`), so it records and broadcasts for free, with a teacher-only flag.
5. **Lesson playlist.** Several deals in one file with a title card between them; PageUp/PageDown moves between deals so a 90-minute class is one file.
6. **Still export.** PNG/SVG of the current position for worksheets and handouts.
7. **Localisation.** Position labels, buttons and the end message through a small dictionary (Slovenian, Czech, English); card faces stay as they are.
8. **Tablet layout.** The README says PC only; the presenter grid `1fr 100vh minmax(400px, 2fr)` assumes a wide screen. The audience view alone would fit a tablet held by a student.

## 6. Housekeeping found while reading the code

- `Configurator.vue` logs every keystroke in the card inputs to the console (`debugInput`, `debugKeydown`) — leftover debugging.
- `normalizeConfiguratorOptions` in `options.ts` assigns `uiOptions` and then `Object.assign(result, obj)` a second time, which undoes the first assignment; harmless today, confusing tomorrow.
- `main.ts` hard-codes `useDebugApp = false` right after computing it from `VITE_UI_DEBUG`.
- `vite.config.ts` has `minify: false`, so production ships a 472 kB unminified bundle.
- The 52 card faces are PNGs totalling 13 MB, the court cards 250–420 kB each; every deal shows all 52, so a WebP or SVG set would cut first load by roughly 12 MB.
- CI pins Node 16, which is end-of-life; Vite 4 works on 20 without changes.

## 7. Suggested order

| Phase | Scope | Rough size |
|---|---|---|
| 1 | Action log + `.dealrec` save/replay (A1), housekeeping fixes | 1–2 days |
| 2 | Audience window + BroadcastChannel sync, split visibility maps, REC button (A2) recording the audience window | 2 days |
| 3 | LIN/PBN import, branching lines (Idea C), teacher panel: notes, planned line, fake auction | 3–4 days |
| 4 | DDS hints and DD comparison, offline renderer (A3), remote transport | open-ended |

Phase 1 is the keystone: once actions are first-class, recording, the second window, annotations and remote students are all consumers of the same stream.

## 8. Getting the copy onto GitHub

The copy in this repo has full history and this document on branch `proposal`. To make it your own fork: create an empty repository on GitHub, then

```sh
git remote rename origin upstream
git remote add origin git@github.com:<you>/bridge-presentations-web.git
git push -u origin main proposal
```

`upstream` stays pointed at zdenecek's repo so you can pull his fixes later. The MIT licence permits all of this; keep `LICENSE` and the author credit in the configurator footer.

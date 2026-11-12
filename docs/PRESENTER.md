# Presenter mode: recording session analyses and lessons

Open the app with `?mode=presenter` (or press **Presenter mode** in the
editor). The window has presenter controls around a 16:9 **stage**; only the
stage goes into the video.

## Stage

- Centre: the deal on a cream panel, four-colour suits, played cards greyed,
  the current trick in the middle (leader marked), contract badge, and a bar
  with PREV / TRICK n / 13 / NEXT ("OPENING LEAD" before the first card).
- Right: the auction (West North East South), vulnerability bars, numbered
  alerts with their explanations.
- Left: other tables' results (frequency table with a summary line, your row
  highlighted) or the board note. With neither, the deal stays centred.
- Your webcam in a circle: drag it, sizes S / M / L, snaps to the nearest
  corner (Snap), mirrored by default, Hide/Show (H).

## Playing

The toolbar switch **Whole auction / Call by call** sets how the auction
appears (remembered in this browser); the side panel can override it per board
(saved in the session as `auctionMode`). Call by call: a board opens with no
calls shown; next/back step through the calls (an alert's note appears with its
call), the bar reads AUCTION n / total and the contract badge appears once the
auction is complete; then stepping continues into the cards. Shift+→ during the
auction reveals the rest of it; Home goes back to the start of the auction.

| key | action |
|---|---|
| → or N | next call (call by call) or next recorded card |
| ← or Z or Backspace | back one card (undo) |
| Shift+→ / Shift+← | rest of the auction, or a whole trick |
| B | back to the actual play after a variation |
| A | auto-play the record |
| Home | back to the start (of the auction in call-by-call mode) |
| 1 2 3 4 | show / hide North, East, South, West |
| 0 | show all hands |
| PageDown / PageUp | next / previous board (not while recording) |

Click a card in the hand whose turn it is to play it (follow suit is
enforced). A card that differs from the record starts a **variation**, shown
on the stage; "back to actual play" (B) returns to the record.

## Hiding hands

Each hand can be hidden per board: its seat name stays, the cards are replaced
by a plain "hidden" plate of the same size. Use the **Hands** toolbar group
(N E S W toggles, Alt+click = only that hand; presets All, N-S, E-W,
Decl+dummy; "Only…"), keys 1–4 / 0, or click a seat name on the stage. All of
these work while recording; the toolbar is never in the video.
**Apply to all boards** copies the current board's setting to every board.
In the side panel, "show a hidden dummy after the opening lead" makes dummy
appear once the lead is on the table (and disappear again if you step back).

Cards played from a hidden hand still appear in the trick. A hidden hand's
cards cannot be clicked; when it is its turn, the presenter bar below the stage
says so: press → to play the recorded card, or show the hand.
The choice is saved with the board (`hidden` in the session file).

## Other tables' results from BBO

Use the bookmarklet collector on your BBO hand records to download a session
with every board's traveller: [BBO_COLLECT.md](BBO_COLLECT.md).

## Recording

1. Choose camera and microphone, switch the camera on (Cam), check the mic
   level.
2. **● REC** (or R). The first time, Chrome asks to share **this tab**; choose
   it. Then 3-2-1 and the take starts.
3. P pauses / resumes, Esc or R stops. The take is stored for the current
   board; recording that board again replaces only its take.
4. The board list shows each board's take and length. ▶ previews, ⬇
   downloads, ✕ deletes.
5. **Download all** writes every clip (`01_board-07.mp4`, …) plus
   `concat.txt` into a folder you pick (Chrome/Edge), or downloads them one by
   one elsewhere. To join them without re-encoding:

   ```
   ffmpeg -f concat -safe 0 -i concat.txt -c copy session.mp4
   ```

   (use `session.webm` if the clips are `.webm`). This needs all clips from the
   same browser at the same window size; otherwise re-encode
   (`-c:v libx264 -c:a aac`).

### How the stage is captured

The tab is captured with `getDisplayMedia` (`preferCurrentTab`) and the video
is limited to the stage element:

- **Element Capture** (Chrome 132+): only the stage's own pixels;
- **Region Capture** (Chrome 104+): the stage's rectangle;
- otherwise the whole tab, and while recording the controls are hidden and the
  stage fills the window (the label next to REC says which mode is active).

The microphone is added as the audio track. Clips are MP4 (H.264 + AAC) when
the browser can record it, otherwise WebM (VP9 + Opus). The video resolution
follows the size of the stage on screen: for 1080p, make the browser window
large or full screen before recording. Clips are kept for this browser profile in
IndexedDB until you delete them.

## Privacy

Everything runs in the browser. Sessions, camera, microphone and clips are
never uploaded; the session you open last and the presenter settings are kept
in this browser's local storage. Nothing leaves your computer until you publish
a downloaded video yourself. `.gitignore` keeps local session files and clips
out of the repository.

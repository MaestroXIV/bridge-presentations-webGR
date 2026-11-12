# Bridge presentations web

Web application for creating presentations for the game of contract bridge.

Currently only for pc screens - intended for making videos.

## Demo

Demo available [here](http://bp.zdenektomis.eu/)

![Preview](preview.png)

## How to use

Set up the presentation and click play.

### Replaying a BBO hand record (LIN)

Click **Import LIN**, paste a LIN string or a BBO handviewer link (or open a
`.lin` file), pick the board and click **Use this board**. The deal, dealer and
vulnerability are filled in and the recorded auction and play are attached.

To go through a whole session, save the BBO **Myhands** page of the tourney
(File → Save Page As… in the browser) and open that `.html` with **Open .lin /
Myhands .html**: every board appears with its result and score. **Load all
boards** keeps the session as a playlist; `PageUp` / `PageDown` (or the ◀ ▶
buttons in the replay panel) move between boards during the presentation.

In the presentation a replay panel appears: **Next** (`N`) plays the next
recorded bid or card, **Auction ▶** runs the auction and stops before the
opening lead, **Trick ▶** finishes the current trick, **All ▶▶** (`A`)
auto-plays to the end. Play any other card with the control panel to branch off
into an alternative line — the panel shows where you left the actual play and
compares the result. `Z` undoes one card, `B` undoes back onto the actual line.

### Audience window (projector / screen share)

Click **Audience window** (or press `W` in the presentation) to open a second
browser window at `?role=audience`. It shows only the table — cards, trick,
auction and trick count — with no controls, no replay panel and no results.
Drag it to the projector or pick it as the window to share in Zoom/Teams;
everything you do in the main window (cards, undo, hiding hands with the
arrow keys, switching boards) appears there at once. It also makes clean
recordings: record the audience window.

The two windows talk through the browser's `BroadcastChannel`, so they must be
open in the same browser profile on the same machine; nothing is sent to a
server.

### Presenter mode (recording analyses and lessons)

Click **Presenter mode** in the editor (or open the app with
`?mode=presenter`). It shows a 16:9 stage with the deal, the auction, other
tables' results and your webcam in a circle, and records one clip per board
(stage + microphone) that you download and publish yourself. It opens session
JSON files (with other tables' results), PBN lesson files, LIN files and saved
Myhands pages. Everything stays in the browser. See
[docs/PRESENTER.md](docs/PRESENTER.md) and the session format in
[docs/SESSION_FORMAT.md](docs/SESSION_FORMAT.md).

## Development docs

Development docs can be found [here](DEVELOPMENT.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

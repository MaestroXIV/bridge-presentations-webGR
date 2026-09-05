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

In the presentation a replay panel appears: **Next** (`N`) plays the next
recorded bid or card, **Auction ▶** runs the auction and stops before the
opening lead, **Trick ▶** finishes the current trick, **All ▶▶** (`A`)
auto-plays to the end. Play any other card with the control panel to branch off
into an alternative line — the panel shows where you left the actual play and
compares the result. `Z` undoes one card, `B` undoes back onto the actual line.

## Development docs

Development docs can be found [here](DEVELOPMENT.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

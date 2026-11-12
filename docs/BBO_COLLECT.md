# Collecting a session from BBO (other tables' results)

The presenter cannot read BBO itself: it runs on a different site, and your
BBO login stays in your BBO tab. The **collector** is a bookmarklet you click
on your own BBO hand-records page. It runs in that tab with your existing
login, reads what BBO shows you, and downloads a session file for the
presenter. Nothing is sent to any other site.

## Install

In the presenter's side panel, open **Collect a session from BBO** and drag
the **BBO → presenter** link to the bookmarks bar. (The same link text is in
[`bbo-collect.bookmarklet.txt`](bbo-collect.bookmarklet.txt): create a
bookmark and paste it as the URL.)

## Use

1. Open <https://www.bridgebase.com/myhands/index.php>, choose the dates and
   press **Get Hands** (you do this; the collector never submits forms).
2. On the hands list, click the bookmark. A box lists the tournaments on the
   page (title, date, number of boards, your place and score).
3. Click **Collect this session**. For each board it
   - takes the deal (LIN: hands, auction with alerts, play, board number)
     from the page, or fetches it from the board's **Lin** link;
   - fetches the board's **Traveller** page (all tables' results).
   Requests are GET only, one at a time with a 0.7 s pause, only to
   `www.bridgebase.com`. A progress bar shows where it is.
4. It downloads `<date>_<tournament>.session.json`. Open it in the presenter
   with **Open…**.

If a board's deal or traveller cannot be fetched, the collector carries on
and lists what is missing. A board without its deal is left out; a board
without its traveller is kept, with your own table's result as its note.

## What is kept

- Per board: hands, auction (alerts and explanations), play, board number,
  the four names of **your** table, the traveller link.
- Per other table: contract, declarer, tricks, N-S points, % or IMPs, and
  `mine: true` on your row. Other players' names are used only to find your
  row and are not saved.
- `me`: your BBO username (from the page address), so the presenter shows
  results from your side.

## Page structure it relies on (observed 2026-11)

- Hands list `…/myhands/hands.php?username=…&start_time=…&end_time=…`:
  `tr.tourneySummary` (name with a `tview.php?t=<id>-<unix>` link, place,
  points, score) followed by `tr.tourney` rows per board (Main Bridge Club:
  `tr.mbc`; team matches presumably `tr.team`) with `td.handnum`, a time
  cell, `td.north/south/east/west`, `td.result` ("4♠xN=", "3NN+1"), two
  `td.score`/`td.negscore` cells (your points, your % or IMPs), `td.movie`
  (Movie and Lin links) and `td.traveller`.
- Traveller `…/myhands/hands.php?traveller=<id>`: `tr.tourney` per table with
  the same seat and result cells, N-S points and the N-S % or IMPs, sorted
  best for N-S first.

If BBO changes this layout, the collector will report "No boards found" or
missing results; the parser is `src/studio/bbo/myhands.ts`, the bookmarklet
source `src/studio/bbo/collector.ts`, rebuilt with `npm run build:collector`.

## Not verified

The collector was tested only against a mocked copy of these pages in a
headless browser, not against the live BBO site.

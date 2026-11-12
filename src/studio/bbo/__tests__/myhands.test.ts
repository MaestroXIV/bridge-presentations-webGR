import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { buildBboSession, parseBboResult, parseHandsList, parseTravellerHtml, parseValue, sessionFileName, travellersFromRows } from "../myhands";
import { loadSession, sessionToJson } from "../../model/session";
import { buildFrequencyTable } from "../../model/travellers";

const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const list = read("bbo-hands-list.html");
const travMp = read("bbo-traveller-mp.html");
const travImp = read("bbo-traveller-imp.html");
const lin7 = read("board7.lin").trim();

describe("parseBboResult", () => {
  it.each([
    ["3♦S=", "3D", "S", 9],
    ["3♦E-1", "3D", "E", 8],
    ["4♥W+3", "4H", "W", 13],
    ["2♠xN=", "2SX", "N", 8],
    ["4♣xS-1", "4CX", "S", 9],
    ["5♣xE-3", "5CX", "E", 8],
    ["3NN+1", "3N", "N", 10],
    ["2NW-3", "2N", "W", 5],
    ["3NS=", "3N", "S", 9],
    ["6♠xxN=", "6SXX", "N", 12],
  ])("%s", (s, contract, declarer, tricks) => {
    expect(parseBboResult(s)).toEqual({ contract, declarer, tricks });
  });
  it("passed out and junk", () => {
    expect(parseBboResult("PASS")).toEqual({ contract: "PASS" });
    expect(parseBboResult("Passed out")).toEqual({ contract: "PASS" });
    expect(parseBboResult("")).toBeUndefined();
    expect(parseBboResult("A+")).toBeUndefined();
  });
  it("values", () => {
    expect(parseValue("57.69%")).toEqual({ mp: 57.69 });
    expect(parseValue("-4.50")).toEqual({ imps: -4.5 });
    expect(parseValue("")).toEqual({});
  });
});

describe("hands list", () => {
  const hl = parseHandsList(list);
  it("finds the user and groups boards by tournament", () => {
    expect(hl.username).toBe("me_user");
    expect(hl.tournaments.map((t) => t.title)).toEqual(["#12345 Test Thu 2PM (MP) Speedball", "Main Bridge Club 2026-10-16"]);
    const t = hl.tournaments[0];
    expect(t).toMatchObject({ id: "12345", unix: 1789000000, date: "2026-09-10", place: "12/40", score: "55.10%", scoring: "MP" });
    expect(t.boards).toHaveLength(2);
  });
  it("reads each board row with its links", () => {
    const [b1, b2] = hl.tournaments[0].boards;
    expect(b1.listNo).toBe(1);
    expect(b1.time).toBe("19:07");
    expect(b1.seats).toEqual({ N: "me_user", S: "pard_user", E: "opp_e", W: "opp_w" });
    expect(b1.parsed).toEqual({ contract: "4S", declarer: "N", tricks: 10 });
    expect(b1.points).toBe(620);
    expect(b1.value).toMatch(/%$/);
    expect(b1.lin).toMatch(/md(\||%7C)/i);
    expect(b1.linUrl).toBe("fetchlin.php?id=1&when_played=1789000000");
    expect(b1.travellerUrl).toBe("/myhands/hands.php?traveller=12345-1789000000-777&username=me_user");
    expect(b1.travellerId).toBe("12345-1789000000-777");
    expect(b2.lin).toBeUndefined(); // must be fetched
    const mbc = hl.tournaments[1].boards[0];
    expect(mbc.kind).toBe("mbc");
    expect(mbc.travellerId).toBe("M-1789100000-VD%3Ax%3A1%3A1");
  });
  it("works on the older saved-page fixture too", () => {
    const old = parseHandsList(readFileSync(new URL("../../../presentations/class/__tests__/myhands-fixture.html", import.meta.url), "utf8"));
    expect(old.tournaments).toHaveLength(1);
    expect(old.tournaments[0].boards.map((b) => b.parsed?.contract)).toEqual(["2H", "4SX"]);
    expect(old.tournaments[0].boards.every((b) => b.lin && b.travellerUrl)).toBe(true);
  });
});

describe("traveller", () => {
  it("reads 40 tables, N-S points and %", () => {
    const rows = parseTravellerHtml(travMp);
    expect(rows).toHaveLength(40);
    expect(rows[0]).toMatchObject({ result: "4♠xN=", scoreNS: 790 });
    expect(rows[0].value).toBe("100.00%");
    expect(rows[39].scoreNS).toBe(-100);
  });
  it("keeps no names, marks the user's own row", () => {
    const t = travellersFromRows(parseTravellerHtml(travMp), "ME_USER");
    expect(t).toHaveLength(40);
    expect(t.filter((x) => x.mine)).toHaveLength(1);
    expect(JSON.stringify(t)).not.toMatch(/n0|me_user|opp_/);
    expect(t[0]).toEqual({ contract: "4SX", declarer: "N", tricks: 10, scoreNS: 790, mpNS: 100 });
    const ft = buildFrequencyTable(t, "NS", "MP", "NS");
    expect(ft.summary).toBe("32 of 40 tables played 4♠, 28 made it");
    expect(ft.rows.find((r) => r.mine)).toMatchObject({ contract: "4♠", declarer: "N", result: "=", score: 620, count: 18 });
  });
  it("IMP travellers and passed-out rows", () => {
    const t = travellersFromRows(parseTravellerHtml(travImp), "me_user");
    expect(t).toEqual([
      { contract: "3N", declarer: "N", tricks: 10, scoreNS: 630, impsNS: 7.5, mine: true },
      { contract: "4HX", declarer: "S", tricks: 9, scoreNS: -200, impsNS: -4.5 },
      { contract: "PASS", scoreNS: 0, impsNS: 0 },
    ]);
    const ft = buildFrequencyTable(t, "None", "IMP", "EW");
    expect(ft.valueKind).toBe("IMP");
    expect(ft.rows[0]).toMatchObject({ score: 200, value: 4.5 }); // from E-W's side
  });
});

describe("buildBboSession", () => {
  const hl = parseHandsList(list);
  const t = hl.tournaments[0];
  it("builds a loadable session with real board numbers, travellers and missing parts listed", () => {
    const lin8 = lin7.replace("ah|Board 7|", "ah|Board 8|");
    const { session, missing } = buildBboSession(t, hl.username, [
      { row: t.boards[0], lin: t.boards[0].lin, travellerHtml: travMp },
      { row: t.boards[1], lin: lin8 }, // traveller fetch failed
    ]);
    expect(session.title).toBe("Test Thu 2PM (MP) Speedball");
    expect(session.me).toBe("me_user");
    expect(session.boards.map((b) => b.number)).toEqual([7, 8]);
    const [b7, b8] = session.boards;
    expect(b7.travellers).toHaveLength(40);
    expect(b7.mySide).toBe("NS");
    expect(b7.players).toEqual({ N: "me_user", E: "opp_e", S: "pard_user", W: "opp_w" });
    expect(b7.auction.map((c) => c.call)).toEqual(["1S", "P", "4S", "P", "P", "P"]);
    expect(b7.play).toHaveLength(52);
    expect(b8.travellers).toBeUndefined();
    expect(b8.note).toMatch(/^At our table: 3NT N \+1, \+630/);
    expect(missing).toEqual(["board 8: other tables' results missing"]);
    // round trip through the loader
    const again = loadSession(sessionToJson(session));
    expect(again.warnings).toEqual([]);
    expect(again.session.boards[0].travellers!.filter((x) => x.mine)).toHaveLength(1);
  });
  it("skips a board whose deal could not be fetched", () => {
    const { session, missing } = buildBboSession(t, "me_user", [{ row: t.boards[1] }]);
    expect(session.boards).toHaveLength(0);
    expect(missing[0]).toMatch(/LIN\) missing/);
  });
  it("names the file after date and tournament", () => {
    expect(sessionFileName(t)).toBe("2026-09-10_Test_Thu_2PM_MP_Speedball.session.json");
  });
});

describe("saved Myhands import in the presenter", () => {
  it("keeps tournament and traveller link per board", async () => {
    const { importLin } = await import("@/presentations/class/lin");
    const { sessionFromLin } = await import("../../model/session");
    const s = sessionFromLin(importLin(list));
    expect(s.title).toBe("Test Thu 2PM (MP) Speedball");
    expect(s.boards[0].tournament).toBe("#12345 Test Thu 2PM (MP) Speedball");
    expect(s.boards[0].travellerUrl).toBe("/myhands/hands.php?traveller=12345-1789000000-777&username=me_user");
  });
});

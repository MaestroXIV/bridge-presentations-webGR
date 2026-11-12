import { describe, expect, it } from "vitest";
import { dummyOf, effectiveHidden, normalizeHidden, onlySeat, presetHidden, toggleSeat } from "../visibility";
import { loadSession, sessionToJson } from "../session";
import { readFileSync } from "fs";

const fourSpadesByNorth = { level: 4, strain: "S" as const, doubled: 0 as const, declarer: "N" as const };
const threeNTbyWest = { level: 3, strain: "N" as const, doubled: 0 as const, declarer: "W" as const };

describe("hand visibility", () => {
  it("normalizes stored values", () => {
    expect(normalizeHidden(["w", "E", "x", "E", "north"])).toEqual(["N", "E", "W"]);
    expect(normalizeHidden(undefined)).toEqual([]);
    expect(normalizeHidden("E")).toEqual([]);
  });
  it("toggles one seat", () => {
    expect(toggleSeat([], "E")).toEqual(["E"]);
    expect(toggleSeat(["W", "E"], "E")).toEqual(["W"]);
    expect(toggleSeat(["W"], "N")).toEqual(["N", "W"]);
  });
  it("presets", () => {
    expect(presetHidden("all")).toEqual([]);
    expect(presetHidden("NS")).toEqual(["E", "W"]);
    expect(presetHidden("EW")).toEqual(["N", "S"]);
    expect(onlySeat("S")).toEqual(["N", "E", "W"]);
  });
  it("declarer + dummy is derived from the contract", () => {
    expect(presetHidden("declarerDummy", fourSpadesByNorth)).toEqual(["E", "W"]);
    expect(presetHidden("declarerDummy", threeNTbyWest)).toEqual(["N", "S"]);
    expect(presetHidden("declarerDummy", "passed")).toEqual([]);
    expect(presetHidden("declarerDummy", undefined)).toEqual([]);
    expect(dummyOf(threeNTbyWest)).toBe("E");
  });
  it("shows a hidden dummy once the opening lead is played, hides it again before", () => {
    const hidden = ["N", "E", "W"] as const; // only South shown; 3NT by West → dummy East
    expect(effectiveHidden([...hidden], true, threeNTbyWest, 0)).toEqual(["N", "E", "W"]);
    expect(effectiveHidden([...hidden], true, threeNTbyWest, 1)).toEqual(["N", "W"]);
    expect(effectiveHidden([...hidden], false, threeNTbyWest, 5)).toEqual(["N", "E", "W"]);
    expect(effectiveHidden(["E", "W"], true, fourSpadesByNorth, 3)).toEqual(["E", "W"]); // dummy S was shown anyway
  });
  it("round-trips through the session file; missing field means all shown", () => {
    const { session } = loadSession(readFileSync(new URL("../../../../docs/examples/sample-session.json", import.meta.url), "utf8"));
    expect(session.boards[0].hidden).toBeUndefined();
    session.boards[0].hidden = ["E", "W"];
    session.boards[1].showDummyAfterLead = true;
    const again = loadSession(sessionToJson(session)).session;
    expect(again.boards[0].hidden).toEqual(["E", "W"]);
    expect(again.boards[1].showDummyAfterLead).toBe(true);
    expect(again.boards[1].hidden).toBeUndefined();
  });
});

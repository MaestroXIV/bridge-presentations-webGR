import { describe, expect, it } from "vitest";
import { backToActual, canPlay, legalCards, nextActualCard, replayPlay, variationAt } from "../play";
import { Seat } from "../types";

const hands: Record<Seat, string> = {
  N: "KQ97.Q9.AK54.J75",
  E: "JT85.A74.863.Q6",
  S: "A643.KJT8.92.AK3",
  W: "2.9653.QJT7.T9842",
};

describe("follow-suit legality", () => {
  it("must follow the led suit when able", () => {
    expect(legalCards(["SA", "H2", "H3", "C4"], "H")).toEqual(["H2", "H3"]);
  });
  it("may play anything when void or on lead", () => {
    expect(legalCards(["SA", "C4"], "H")).toEqual(["SA", "C4"]);
    expect(legalCards(["SA", "C4"], undefined)).toEqual(["SA", "C4"]);
  });
  it("canPlay checks seat to play and suit", () => {
    // N declares spades: East leads
    const st = replayPlay(hands, "N", "S", ["D8"]);
    expect(st.toPlay).toBe("S");
    expect(canPlay(st, "S", "D9")).toBe(true);
    expect(canPlay(st, "S", "SA")).toBe(false); // has diamonds
    expect(canPlay(st, "W", "DQ")).toBe(false); // not West's turn
  });
  it("replay stops at a revoke and reports it", () => {
    const st = replayPlay(hands, "N", "S", ["D8", "SA"]);
    expect(st.applied).toBe(1);
    expect(st.error).toMatch(/revoke/);
  });
  it("trumps win, otherwise highest of the led suit; winner leads next", () => {
    const st = replayPlay(hands, "N", "S", ["D8", "D9", "DQ", "DK", "D5", "D3", "D2", "DT"]);
    expect(st.tricks[0].winner).toBe("N");
    expect(st.tricks[1].winner).toBe("W");
    expect(st.toPlay).toBe("W");
    expect(st.ns).toBe(1);
    expect(st.ew).toBe(1);
    const ruff = replayPlay(hands, "N", "S", ["H4", "H8", "H3", "HQ", "HA"]);
    expect(ruff.tricks[0].winner).toBe("N");
  });
});

describe("actual line vs variation", () => {
  const actual = ["D8", "D9", "DQ", "DK"];
  it("is on the record while the line is a prefix", () => {
    expect(variationAt(actual, ["D8", "D9"])).toBeUndefined();
    expect(nextActualCard(actual, ["D8", "D9"])).toBe("DQ");
  });
  it("marks the first departure and can go back to it", () => {
    const line = ["D8", "D2", "DT"];
    expect(variationAt(actual, line)).toBe(1);
    expect(nextActualCard(actual, line)).toBeUndefined();
    expect(backToActual(actual, line)).toEqual(["D8"]);
  });
  it("playing past the end of the record is a variation", () => {
    expect(variationAt(actual, [...actual, "D5"])).toBe(4);
  });
});

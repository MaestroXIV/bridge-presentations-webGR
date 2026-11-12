import { describe, expect, it } from "vitest";
import { auctionDone, effectiveMode, startPos, stepNext, stepNextBig, stepPrev, stepPrevBig, toActual, withCard } from "../steps";

const actual = ["D8", "D9", "DQ", "DK", "D5"];
const CALLS = 6;

function walk(mode: "whole" | "step", n: number) {
  let p = startPos(mode, CALLS);
  for (let i = 0; i < n; i++) p = stepNext(p, CALLS, actual, true) ?? p;
  return p;
}

describe("whole auction", () => {
  it("starts with every call shown and steps cards only", () => {
    const p = startPos("whole", CALLS);
    expect(p).toEqual({ calls: 6, cards: [] });
    expect(auctionDone(p, CALLS)).toBe(true);
    expect(walk("whole", 2)).toEqual({ calls: 6, cards: ["D8", "D9"] });
  });
  it("prev never hides calls", () => {
    expect(stepPrev({ calls: 6, cards: [] }, "whole")).toBeUndefined();
    expect(stepPrev({ calls: 6, cards: ["D8"] }, "whole")).toEqual({ calls: 6, cards: [] });
    expect(stepPrevBig({ calls: 6, cards: [] }, "whole")).toBeUndefined();
  });
});

describe("call by call", () => {
  it("starts empty, steps the calls first, then the cards", () => {
    expect(startPos("step", CALLS)).toEqual({ calls: 0, cards: [] });
    expect(walk("step", 3)).toEqual({ calls: 3, cards: [] });
    expect(walk("step", 6)).toEqual({ calls: 6, cards: [] });
    expect(walk("step", 8)).toEqual({ calls: 6, cards: ["D8", "D9"] });
    expect(walk("step", 100).cards).toEqual(actual);
  });
  it("prev takes back cards, then calls", () => {
    expect(stepPrev({ calls: 6, cards: ["D8"] }, "step")).toEqual({ calls: 6, cards: [] });
    expect(stepPrev({ calls: 6, cards: [] }, "step")).toEqual({ calls: 5, cards: [] });
    expect(stepPrev({ calls: 0, cards: [] }, "step")).toBeUndefined();
  });
  it("shift+next reveals the rest of the auction, then whole tricks", () => {
    expect(stepNextBig({ calls: 2, cards: [] }, CALLS, actual, true)).toEqual({ calls: 6, cards: [] });
    expect(stepNextBig({ calls: 6, cards: [] }, CALLS, actual, true)).toEqual({ calls: 6, cards: actual.slice(0, 4) });
    expect(stepPrevBig({ calls: 4, cards: [] }, "step")).toEqual({ calls: 0, cards: [] });
  });
  it("cards cannot be played before the auction is complete", () => {
    expect(withCard({ calls: 3, cards: [] }, CALLS, "D8")).toBeUndefined();
    expect(withCard({ calls: 6, cards: [] }, CALLS, "D8")).toEqual({ calls: 6, cards: ["D8"] });
  });
  it("a passed-out board has calls but no cards", () => {
    expect(stepNext({ calls: 4, cards: [] }, 4, [], false)).toBeUndefined();
  });
  it("back to actual keeps the auction", () => {
    expect(toActual({ calls: 6, cards: ["D8", "D2"] }, actual)).toEqual({ calls: 6, cards: ["D8"] });
  });
  it("board override wins over the default", () => {
    expect(effectiveMode(undefined, "step")).toBe("step");
    expect(effectiveMode("whole", "step")).toBe("whole");
  });
});

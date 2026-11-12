import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { parsePbn } from "../pbn";

const sample = readFileSync(new URL("../../../../docs/examples/sample-lesson.pbn", import.meta.url), "utf8");

describe("parsePbn", () => {
  const imp = parsePbn(sample);

  it("reads every board with deal, dealer and vulnerability", () => {
    expect(imp.warnings).toEqual([]);
    expect(imp.title).toBe("Lesson 3: drawing trumps");
    expect(imp.boards).toHaveLength(2);
    const [b1, b2] = imp.boards;
    expect(b1.number).toBe(1);
    expect(b1.dealer).toBe("N");
    expect(b1.vul).toBe("NS");
    expect(b1.hands.N).toBe("KQ97.Q9.AK54.J75");
    expect(b1.hands.W).toBe("2.9653.QJT7.T9842");
    // Deal tag starting with East is rotated correctly
    expect(b2.hands.E).toBe("3.976.T87.AQ9754");
    expect(b2.hands.S).toBe("KJ5.AQ3.KJ54.K82");
    expect(b2.hands.N).toBe("A742.KJ85.Q92.63");
  });

  it("reads player names, scoring and the {comment} as the board note", () => {
    const b1 = imp.boards[0];
    expect(b1.players).toEqual({ N: "Nora", E: "Ed", S: "Sue", W: "Wes" });
    expect(b1.scoring).toBe("MP");
    expect(b1.note).toMatch(/Count losers/);
  });

  it("reads the auction with note references, and expands AP", () => {
    const b1 = imp.boards[0];
    expect(b1.auction.map((c) => c.call)).toEqual(["1S", "P", "4S", "P", "P", "P"]);
    expect(b1.auction[2].alert).toBe("to play, 13+ HCP");
    const b2 = imp.boards[1];
    expect(b2.auction.map((c) => c.call)).toEqual(["P", "1N", "P", "2C", "P", "2H", "P", "4H", "P", "P", "P"]);
    expect(b2.auction[1].alert).toBe("15-17");
    expect(b2.auction[3].alert).toBe("Stayman");
    expect(b2.auction[5].alert).toBeUndefined();
  });

  it("orders play by trick leader, not by PBN column, and keeps Result as a claim", () => {
    const b1 = imp.boards[0];
    // trick 1 led by East; trick 2 led by North (won with DK)
    expect(b1.play).toEqual(["D8", "D2", "DT", "DK", "D5", "D3", "D9", "D7"]);
    expect(b1.claim).toBe(10);
    expect(imp.boards[1].play).toEqual([]);
  });

  it("handles '!' alerts, '#' repeats and a second board without a blank line", () => {
    const text = `[Event "E"]\n[Board "5"]\n[Dealer "S"]\n[Vulnerable "Both"]\n[Deal "S:AKQJ.AKQ.AKQ.AKQ - - -"]\n[Auction "S"]\n2C! Pass 2D Pass\n[Board "6"]\n[Event "#"]\n[Dealer "W"]\n[Vulnerable "Love"]\n[Deal "N:AKQJ.AKQ.AKQ.AKQ T987.JT9.JT9.JT9 6543.876.876.876 2.5432.5432.5432"]\n`;
    const r = parsePbn(text);
    expect(r.boards).toHaveLength(2);
    expect(r.boards[0].vul).toBe("All");
    expect(r.boards[0].auction[0]).toEqual({ call: "2C", alert: "" });
    expect(r.boards[0].hands.N).toBe(""); // unknown hands stay empty
    expect(r.boards[1].vul).toBe("None");
    expect(r.boards[1].dealer).toBe("W");
  });
});

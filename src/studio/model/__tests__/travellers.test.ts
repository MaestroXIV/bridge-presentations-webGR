import { describe, expect, it } from "vitest";
import { duplicateScore } from "../auction";
import { buildFrequencyTable, matchpointsNS, normalizeTraveller, summaryLine } from "../travellers";
import { Traveller } from "../types";

const t = (contract: string, declarer: "N" | "E" | "S" | "W", tricks: number, extra: Partial<Traveller> = {}): Traveller => ({ contract, declarer, tricks, ...extra });

describe("scores", () => {
  it("duplicate scores", () => {
    expect(duplicateScore(4, "S", 0, 10, true)).toBe(620);
    expect(duplicateScore(4, "S", 0, 11, false)).toBe(450);
    expect(duplicateScore(3, "N", 0, 9, false)).toBe(400);
    expect(duplicateScore(1, "N", 0, 7, false)).toBe(90);
    expect(duplicateScore(4, "S", 1, 10, true)).toBe(790);
    expect(duplicateScore(4, "H", 1, 7, false)).toBe(-500);
    expect(duplicateScore(4, "H", 0, 8, true)).toBe(-200);
    expect(duplicateScore(6, "N", 0, 12, true)).toBe(1440);
  });
  it("fills score from contract and result, from N-S's side", () => {
    expect(normalizeTraveller({ contract: "4S", declarer: "E", result: "-1" }, "None").scoreNS).toBe(50);
    expect(normalizeTraveller({ contract: "PASS" }, "All").scoreNS).toBe(0);
  });
  it("matchpoints", () => {
    expect(matchpointsNS([620, 620, 650, -100])).toEqual([50, 50, 100, 0]);
  });
});

describe("summary line", () => {
  it("names the most common contract and how many made it", () => {
    const list = [t("4S", "N", 10), t("4S", "N", 9), t("4SX", "S", 10), t("3N", "N", 9), t("4S", "N", 8)];
    expect(summaryLine(list)).toBe("4 of 5 tables played 4♠, 2 made it");
  });
  it("all / none / single wording", () => {
    expect(summaryLine([t("4S", "N", 10), t("4S", "N", 11)])).toBe("All 2 tables played 4♠, both made it");
    expect(summaryLine([t("4S", "N", 9), t("4S", "N", 9), t("4S", "N", 8)])).toBe("All 3 tables played 4♠, none made it");
    expect(summaryLine([t("3N", "N", 8), t("4S", "N", 10)])).toMatch(/^1 of 2 tables played (3NT|4♠) and (went down|made)$/);
    expect(summaryLine([{ contract: "PASS" }, { contract: "pass" }, t("1N", "S", 7)])).toBe("2 of 3 tables passed the board out");
    expect(summaryLine([])).toBe("");
  });
});

describe("frequency table", () => {
  const list = [
    t("4S", "N", 10, { mine: true }),
    t("4S", "N", 10),
    t("4S", "N", 11),
    t("4S", "S", 9),
  ];
  it("groups equal results, sorts by score and highlights the own row", () => {
    const ft = buildFrequencyTable(list, "NS", "MP");
    expect(ft.total).toBe(4);
    expect(ft.valueKind).toBe("MP");
    expect(ft.rows.map((r) => [r.contract, r.declarer, r.result, r.score, r.count])).toEqual([
      ["4♠", "N", "+1", 650, 1],
      ["4♠", "N", "=", 620, 2],
      ["4♠", "S", "-1", -100, 1],
    ]);
    expect(ft.rows[1].mine).toBe(true);
    expect(ft.rows[1].value).toBe(50);
    expect(ft.summary).toBe("All 4 tables played 4♠, 3 made it");
  });
  it("shows scores and percentages from E-W when the presenter sat E-W", () => {
    const ft = buildFrequencyTable(list, "NS", "MP", "EW");
    expect(ft.rows[0].score).toBe(100);
    expect(ft.rows[0].value).toBe(100);
  });
  it("uses given IMPs instead of computing matchpoints", () => {
    const ft = buildFrequencyTable([t("4S", "N", 10, { impsNS: 3.5 }), t("4S", "N", 9, { impsNS: -10 })], "None", "IMP");
    expect(ft.valueKind).toBe("IMP");
    expect(ft.rows[0].value).toBe(3.5);
  });
});

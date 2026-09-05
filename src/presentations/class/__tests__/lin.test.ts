import { describe, expect, it } from "vitest";
import fixture from "./fixture.json";
import { extractLinText, parseLin } from "../lin";
import { simulateScript } from "../script";
import { Position } from "@/bridge/model/Position";
import { Vulnerability } from "@/bridge/model/Vulnerability";
import { Parser } from "@/bridge/utils/Parser";
import { cardKey } from "../script";

function handKeys(appHand: string): string[] {
  return Parser.parseHandString(appHand).map(cardKey).sort();
}

describe("parseLin", () => {
  it("parses a single full-play board", () => {
    const boards = parseLin(fixture.full);
    expect(boards).toHaveLength(1);
    const b = boards[0];
    expect(b.name).toBe("Board 7");
    expect(b.dealer).toBe(Position.North);
    expect(b.vulnerability).toBe(Vulnerability.NS);
    expect(b.players).toEqual({ south: "Sue", west: "Wes", north: "Nora", east: "Ed" });
    expect(b.warnings).toEqual([]);
    // East was omitted in md| and must be reconstructed
    expect(handKeys(b.cards.east)).toEqual([...fixture.east].sort());
    expect(handKeys(b.cards.north)).toEqual([...fixture.north].sort());
    expect(b.script.actions.filter((a) => a.t === "bid")).toHaveLength(6);
    expect(b.script.actions.filter((a) => a.t === "play")).toHaveLength(52);
    expect(b.script.actions[6]).toEqual({ t: "play", card: fixture.firstCard });
  });

  it("simulates the actual line to the right trick counts", () => {
    const b = parseLin(fixture.full)[0];
    const sim = simulateScript(b.cards, b.dealer, b.script.actions);
    expect(sim.errors).toEqual([]);
    expect(sim.declarer).toBe(Position.North);
    expect(sim.tricksNS).toBe(fixture.ns);
    expect(sim.tricksEW).toBe(fixture.ew);
    expect(sim.tricksDeclarer).toBe(fixture.ns);
    expect(sim.cardsPlayed).toBe(52);
  });

  it("handles a claim (mc|) after a partial play", () => {
    const b = parseLin(fixture.partial)[0];
    const sim = simulateScript(b.cards, b.dealer, b.script.actions);
    expect(sim.errors).toEqual([]);
    expect(sim.cardsPlayed).toBe(32);
    expect(sim.tricksDeclarer).toBe(fixture.claimTotal);
    expect(sim.tricksNS).toBe(fixture.claimTotal);
    expect(sim.tricksNS + sim.tricksEW).toBe(13);
  });

  it("reads a handviewer URL and lowercase/alerted tokens", () => {
    const lin =
      "pn|a,b,c,d|md|1SAKQJT98765432,SHAKQJT98765432,SHDAKQJT98765432,|sv|b|mb|1N!|an|15-17|mb|p|mb|3n|mb|p|mb|p|mb|p|pc|ha|";
    const url = "https://www.bridgebase.com/tools/handviewer.html?lin=" + encodeURIComponent(lin);
    expect(extractLinText(url)).toBe(lin);
    const b = parseLin(url)[0];
    expect(b.dealer).toBe(Position.South);
    expect(b.vulnerability).toBe(Vulnerability.Both);
    expect(b.cards.south).toBe("AKQJT98765432 - - -");
    expect(b.cards.east).toBe("- - - AKQJT98765432");
    expect(b.script.actions.map((a) => (a.t === "bid" ? a.bid : a.t === "play" ? a.card : ""))).toEqual([
      "1N", "P", "3N", "P", "P", "P", "HA",
    ]);
  });

  it("splits a multi-board tournament file on qx|", () => {
    const one = fixture.full.replace("ah|Board 7|", "");
    const text = "vg|Club,1,I,1,2,NS,EW,,|rs|4SN=,3NS-1|pn|a,b,c,d|qx|o1|" + one.replace(/^pn\|[^|]*\|/, "") + "qx|o2|" + one.replace(/^pn\|[^|]*\|/, "");
    const boards = parseLin(text);
    expect(boards.map((b) => b.name)).toEqual(["Board 1", "Board 2"]);
    expect(boards[1].script.actions).toHaveLength(58);
  });
});

import myhands from "./myhands-fixture.html?raw";
import { importLin, parseMyhandsHtml } from "../lin";

describe("parseMyhandsHtml", () => {
  it("imports every Movie of a saved Myhands page with results", () => {
    const imp = parseMyhandsHtml(myhands);
    expect(imp.title).toBe("#85151  ACBL Fri 3PM ET (MP) Speedball · 2026-09-04");
    expect(imp.boards.map((b) => b.number)).toEqual([3, 11]);
    const b3 = imp.boards[0];
    expect(b3.name).toBe("Board 3");
    expect(b3.result).toEqual({ contract: "2♥E+1", score: 140, percent: "79.41%" });
    expect(b3.players).toEqual({ south: "south1", west: "west1", north: "north1", east: "east1" });
    expect(b3.dealer).toBe(Position.South);
    expect(b3.vulnerability).toBe(Vulnerability.EW);
    expect(b3.warnings).toEqual([]);
    const sim = simulateScript(b3.cards, b3.dealer, b3.script.actions);
    expect(sim.errors).toEqual([]);
    expect(sim.declarer).toBe(Position.East);
    expect(sim.tricksDeclarer).toBe(9); // 2♥E+1, claimed with mc|9|

    const b11 = imp.boards[1];
    expect(b11.result?.contract).toBe("4♠xW=");
    // alerted bid "2D!" with an an| explanation must parse as a plain 2D
    expect(b11.script.actions.slice(0, 5).map((a) => (a.t === "bid" ? a.bid : "?"))).toEqual(["1D", "1S", "P", "2D", "4D"]);
    const sim11 = simulateScript(b11.cards, b11.dealer, b11.script.actions);
    expect(sim11.errors).toEqual([]);
    expect(sim11.tricksDeclarer).toBe(10);
  });

  it("importLin picks the right parser", () => {
    expect(importLin(myhands).boards).toHaveLength(2);
    expect(importLin(fixture.full).boards).toHaveLength(1);
  });
});

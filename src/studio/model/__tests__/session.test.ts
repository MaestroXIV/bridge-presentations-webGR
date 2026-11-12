import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { loadSession, normalizeHand, SessionError, sessionFromLin, sessionToJson } from "../session";
import { parseLin } from "@/presentations/class/lin";
import fixture from "@/presentations/class/__tests__/fixture.json";
import { contractFromAuction } from "../auction";
import { replayPlay } from "../play";

const sample = readFileSync(new URL("../../../../docs/examples/sample-session.json", import.meta.url), "utf8");

describe("loadSession", () => {
  it("loads the documented sample", () => {
    const { session, warnings } = loadSession(sample);
    expect(warnings).toEqual([]);
    expect(session.title).toBe("Sample session");
    expect(session.boards.map((b) => b.id)).toEqual(["b7", "b2"]);
    const b7 = session.boards[0];
    expect(b7.travellers).toHaveLength(12);
    expect(b7.scoring).toBe("MP"); // inherited from the session
    expect(b7.mySide).toBe("NS"); // "me" is North
    expect(b7.travellers!.filter((t) => t.mine)).toHaveLength(1); // matched by pair name
    expect(b7.auction[2].alert).toMatch(/to play/);
    const c = contractFromAuction(b7.dealer, b7.auction);
    expect(c).toMatchObject({ level: 4, strain: "S", declarer: "N" });
    const st = replayPlay(b7.hands, "N", "S", b7.play);
    expect(st.error).toBeUndefined();
    expect(st.ns).toBe(10);
  });

  it("accepts alternative spellings", () => {
    const { session, warnings } = loadSession(
      JSON.stringify({
        boards: [
          {
            number: 3,
            dealer: "west",
            vulnerability: "Both",
            hands: { north: "AKQJ AKQ AKQ AKQ", east: "T987 JT9 JT9 JT9", south: "SAKQ", west: "2.5432.5432.5432" },
            auction: ["1C!", "Pass", "Dbl", { call: "XX", alert: "SOS" }],
            play: ["sa", "s10", "bogus"],
            travellers: [{ contract: "4S", declarer: "N", result: 1, scoreNS: "450" }, { nope: 1 }],
          },
        ],
      }),
    );
    const b = session.boards[0];
    expect(b.id).toBe("b3");
    expect(b.dealer).toBe("W");
    expect(b.vul).toBe("All");
    expect(b.hands.N).toBe("AKQJ.AKQ.AKQ.AKQ");
    expect(b.auction).toEqual([{ call: "1C", alert: "" }, { call: "P" }, { call: "X" }, { call: "XX", alert: "SOS" }]);
    expect(b.play).toEqual(["SA", "ST"]);
    expect(b.travellers).toEqual([expect.objectContaining({ contract: "4S", result: "+1", scoreNS: 450 })]);
    expect(warnings.some((w) => w.includes("S has 3 cards"))).toBe(true);
    expect(warnings.some((w) => w.includes("traveller 2"))).toBe(true);
  });

  it("rejects broken input with a readable error", () => {
    expect(() => loadSession("{")).toThrow(SessionError);
    expect(() => loadSession(JSON.stringify({ boards: [] }))).toThrow(/non-empty/);
    expect(() => loadSession(JSON.stringify({ format: "other", boards: [{}] }))).toThrow(/unknown format/);
    expect(() => loadSession(JSON.stringify({ boards: [{ dealer: "N" }] }))).toThrow(/hands/);
    expect(() => loadSession(JSON.stringify({ boards: [{ dealer: "Q", hands: { N: "", E: "", S: "", W: "" } }] }))).toThrow(/dealer/);
  });

  it("round-trips through sessionToJson", () => {
    const { session } = loadSession(sample);
    expect(loadSession(sessionToJson(session)).session).toEqual(session);
  });

  it("converts LIN imports, keeping alerts and the claim", () => {
    const s = sessionFromLin({ boards: parseLin(fixture.partial + "") });
    const b = s.boards[0];
    expect(b.id).toBe("b7");
    expect(b.dealer).toBe("N");
    expect(b.vul).toBe("NS");
    expect(b.hands.N).toBe("KQ97.Q9.AK54.J75");
    expect(b.claim).toBe(fixture.claimTotal);
    const alerted = sessionFromLin({ boards: parseLin("md|1SAKQJHAKQDAKQCAKQ,S2H2D2C2345678910,S3H3D3CJQK,|mb|2C!|an|strong|mb|p|") }).boards[0];
    expect(alerted.auction[0]).toEqual({ call: "2C", alert: "strong" });
  });

  it("normalizes LIN-style hands", () => {
    expect(normalizeHand("SAKQHT9D8765C432")).toBe("AKQ.T9.8765.432");
  });
});

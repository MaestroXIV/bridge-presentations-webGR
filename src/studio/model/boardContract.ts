import { Contract, contractFromAuction, parseContractString } from "./auction";
import { StudioBoard } from "./types";

/** Contract of a board: from its auction, else from its `contract`/`declarer` fields. */
export function boardContract(b: StudioBoard): Contract | "passed" | undefined {
  const fromAuction = contractFromAuction(b.dealer, b.auction);
  if (fromAuction) return fromAuction;
  if (b.contract && b.declarer) {
    const c = parseContractString(b.contract);
    if (c === "passed") return "passed";
    if (c) return { ...c, declarer: b.declarer };
  }
  return undefined;
}

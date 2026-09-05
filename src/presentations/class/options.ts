import { Contract } from "@/bridge/model/Contract";
import { Script } from "./script";
import { Position, PositionHelper } from "@/bridge/model/Position";
import { Suit } from "@/bridge/model/Suit";
import { Vulnerability } from "@/bridge/model/Vulnerability";
import { DummyOptions } from "@/bridge/model/PresentationGame";
export interface UIOptions {
  endMessage?: string;
  verticalLayout?: boolean;
}

export interface ConfiguratorOptions {
  cards: {
    north: string;
    east: string;
    south: string;
    west: string;
  };
  fake: { ns: number; ew: number };
  firstPlayer: Position;
  bidding: boolean;
  contract: Contract | undefined;
  trumps: Suit | undefined;
  dummy: DummyOptions | undefined;
  staticDummyPosition: Position | undefined;
  vulnerability: Vulnerability;
  activePositions: Array<Position>;
  uiOptions: UIOptions;
  /** recorded auction and play (e.g. imported from a BBO LIN file) to replay */
  script?: Script;
}

export function getDefaultConfiguratorOptions(): ConfiguratorOptions {
  return {
    cards: {
      north: "",
      south: "",
      east: "",
      west: "",
    },
    fake: { ns: 0, ew: 0 },
    firstPlayer: "west" as Position,
    bidding: true,
    contract: undefined as Contract | undefined,
    trumps: Suit.Notrump as Suit | undefined,
    dummy: "auto" as DummyOptions | undefined,
    staticDummyPosition: "north" as Position | undefined,
    vulnerability: Vulnerability.None,
    activePositions: PositionHelper.all(),
    uiOptions: {
      endMessage: "Well done!",
      verticalLayout: false,
    },
  };
}

export function normalizeConfiguratorOptions(
  obj: unknown
): ConfiguratorOptions {
  let result = {
    cards: {
      north: "",
      east: "",
      south: "",
      west: "",
    },
    fake: { ns: 0, ew: 0 },
    firstPlayer: Position.West,
    bidding: true,
    contract: undefined,
    trumps: undefined,
    dummy: undefined,
    staticDummyPosition: undefined,
    vulnerability: Vulnerability.None,
    activePositions: PositionHelper.all(),
    uiOptions: {
      endMessage: undefined,
      verticalLayout: false,
    },
  };

  Object.assign(result, obj);
  (result.uiOptions = {
    endMessage: undefined,
    verticalLayout: false,
  }),
    Object.assign(result, obj);

  return result;
}

export function validateConfiguratorOptions(
  opts: ConfiguratorOptions
): Record<string, string | Record<string, string>> {
  const errors = [] as Array<Record<string, string | Record<string, string>>>;

  if (!opts.activePositions.includes(opts.firstPlayer))
    errors.push({ firstPlayer: "First player must be active" });

  return errors.reduce((acc, cur) => ({ ...acc, ...cur }), {});
}

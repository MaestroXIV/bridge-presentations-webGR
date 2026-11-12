/**
 * Hand-over of the boards loaded in the deal editor (LIN / Myhands import or
 * the single board being edited) to the presenter. Stored in this browser's
 * localStorage only, then read and removed by the presenter.
 */
import type { ConfiguratorOptions } from "@/presentations/class/options";
import type { LinBoard } from "@/presentations/class/lin";
import { sessionFromLin, sessionToJson } from "./model/session";

export const HANDOFF_KEY = "bridge-presenter-handoff";

export function presenterUrl(): string {
  return `${location.pathname}?mode=presenter`;
}

export function isPresenterUrl(): boolean {
  return new URLSearchParams(location.search).get("mode") === "presenter" || location.hash === "#presenter";
}

/** Converts what the editor has loaded into a session and opens the presenter. */
export function openPresenterWith(opts: ConfiguratorOptions) {
  let boards: LinBoard[];
  let title: string;
  if (opts.playlist?.boards.length) {
    boards = opts.playlist.boards;
    title = opts.playlist.title;
  } else {
    const filled = Object.values(opts.cards).every((h) => h.trim().length > 0);
    if (!filled) {
      location.href = presenterUrl();
      return;
    }
    const label = opts.script?.label ?? "";
    const name = label.replace(/^BBO( LIN)?\s*[—-]\s*/, "").split(" · ")[0] || "Board";
    const num = name.match(/(\d+)/);
    boards = [
      {
        name,
        number: num ? parseInt(num[1]) : undefined,
        players: opts.script?.players ?? { north: "", east: "", south: "", west: "" },
        dealer: opts.firstPlayer,
        vulnerability: opts.vulnerability,
        cards: { ...opts.cards },
        script: opts.script ?? { label: "", actions: [] },
        warnings: [],
      },
    ];
    title = name;
  }
  localStorage.setItem(HANDOFF_KEY, sessionToJson(sessionFromLin({ title, boards })));
  location.href = presenterUrl();
}

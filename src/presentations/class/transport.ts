/**
 * Messages between the teacher window and audience windows.
 *
 * The teacher window is the authority: after every change it broadcasts its
 * whole state (options + the history of actions + hand visibility). An
 * audience window keeps its own game and moves it to the received history,
 * stepping forward or undoing as needed. Sending the full history instead of
 * deltas makes late joiners, lost messages and undo all the same case.
 *
 * The default transport is a BroadcastChannel: same origin, same browser
 * profile, no server — which is exactly a second window dragged to the
 * projector or shared in a video call. Remote students would need a
 * WebSocket/WebRTC transport implementing the same interface.
 */
import { ConfiguratorOptions } from "./options";

export type HandVisibility = { north: boolean; east: boolean; south: boolean; west: boolean };

export interface TeacherState {
  /** increments whenever the teacher starts a (new) game, so audiences rebuild */
  gameId: number;
  options: ConfiguratorOptions;
  /** history keys as produced by useReplay ("b:1S", "c:SA", "claim:9") */
  history: string[];
  visible: HandVisibility;
}

export type Message =
  | { t: "hello"; id: string } // audience → teacher: please send state
  | { t: "ping"; id: string } // audience → teacher: still here
  | { t: "bye"; id: string } // audience → teacher: window closing
  | { t: "state"; state: TeacherState }; // teacher → audiences

export interface Transport {
  send(msg: Message): void;
  onMessage(cb: (msg: Message) => void): () => void;
  close(): void;
}

export const CHANNEL_NAME = "bridge-presentation";

export class BroadcastChannelTransport implements Transport {
  private channel: BroadcastChannel | undefined;
  private listeners = new Set<(msg: Message) => void>();

  constructor(name = CHANNEL_NAME) {
    if (typeof BroadcastChannel === "undefined") return;
    this.channel = new BroadcastChannel(name);
    this.channel.onmessage = (ev: MessageEvent<Message>) => {
      this.listeners.forEach((cb) => cb(ev.data));
    };
  }

  get available(): boolean {
    return this.channel !== undefined;
  }

  send(msg: Message): void {
    // structured clone cannot copy Vue proxies or class instances with
    // methods reliably, so send plain JSON.
    this.channel?.postMessage(JSON.parse(JSON.stringify(msg)));
  }

  onMessage(cb: (msg: Message) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  close(): void {
    this.channel?.close();
    this.listeners.clear();
  }
}

/** URL of the audience window for the current page. */
export function audienceUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("role", "audience");
  return url.toString();
}

export function isAudienceRole(): boolean {
  return new URLSearchParams(window.location.search).get("role") === "audience";
}

export function openAudienceWindow(): Window | null {
  return window.open(audienceUrl(), "bridge-audience", "popup=yes,width=1280,height=800");
}

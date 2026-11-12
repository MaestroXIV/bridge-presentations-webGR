/**
 * Records the stage element of this tab plus the microphone.
 *
 * Capture: getDisplayMedia({ preferCurrentTab }) asks once per session to
 * share this tab. The video track is then limited to the stage element:
 *   1. Element Capture (RestrictionTarget, Chrome 132+): only the stage's own
 *      pixels, even if something overlaps it;
 *   2. Region Capture (CropTarget, Chrome 104+): the stage's rectangle;
 *   3. neither: the whole tab; the UI then switches to a "clean stage" layout
 *      while recording (controls hidden, stage fills the window).
 * The microphone track is added and both go to a MediaRecorder: MP4
 * (H.264 + AAC) where the browser supports it, WebM otherwise.
 */

export type CaptureMode = "element" | "region" | "tab";

/** MP4 only with H.264 + AAC (plays everywhere); otherwise WebM. A bare "video/mp4" is not used:
 * Chromium builds without H.264 then write VP9 into MP4, which QuickTime and older Safari cannot play. */
export const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.640028,mp4a.40.2"',
  'video/mp4;codecs="avc1.4D0028,mp4a.40.2"',
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMimeType(isSupported: (t: string) => boolean = (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)): string {
  return MIME_CANDIDATES.find((t) => isSupported(t)) ?? "";
}

export function extensionFor(mime: string): "mp4" | "webm" {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyTrack = MediaStreamTrack & { cropTo?: (t: unknown) => Promise<void>; restrictTo?: (t: unknown) => Promise<void> };

export interface StageCapture {
  stream: MediaStream;
  mode: CaptureMode;
  stop(): void;
}

/**
 * Asks to share this tab and restricts the video to `stage`. Throws if the
 * user declines. `onEnded` fires when sharing stops (e.g. the browser's
 * "Stop sharing" bar).
 */
export async function captureStage(stage: HTMLElement, onEnded: () => void): Promise<StageCapture> {
  const md = navigator.mediaDevices as MediaDevices & { getDisplayMedia(o: any): Promise<MediaStream> };
  if (!md?.getDisplayMedia) throw new Error("This browser cannot capture a tab (getDisplayMedia missing). Use desktop Chrome or Edge.");
  const stream = await md.getDisplayMedia({
    video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    monitorTypeSurfaces: "exclude",
  });
  const track = stream.getVideoTracks()[0] as AnyTrack;
  const w = window as any;
  let mode: CaptureMode = "tab";
  // Only restrict when we really got this tab ("browser" surface); for a window/screen it would fail.
  const surface = (track.getSettings() as any).displaySurface;
  try {
    if (surface !== "window" && surface !== "monitor") {
      if (w.RestrictionTarget && track.restrictTo) {
        await track.restrictTo(await w.RestrictionTarget.fromElement(stage));
        mode = "element";
      } else if (w.CropTarget && track.cropTo) {
        await track.cropTo(await w.CropTarget.fromElement(stage));
        mode = "region";
      }
    }
  } catch (e) {
    console.warn("[presenter] could not restrict capture to the stage, recording the whole tab", e);
    mode = "tab";
  }
  track.addEventListener("ended", onEnded);
  return {
    stream,
    mode,
    stop: () => stream.getTracks().forEach((t) => t.stop()),
  };
}

export interface TakeResult {
  blob: Blob;
  mime: string;
  durationMs: number;
}

/** One take: MediaRecorder over the stage video + mic audio, with pause-aware duration. */
export class TakeRecorder {
  private rec: MediaRecorder;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private accumulated = 0;
  readonly mime: string;
  private done: Promise<TakeResult>;

  constructor(video: MediaStream, mic: MediaStream | undefined, mime = pickMimeType()) {
    const tracks = [...video.getVideoTracks(), ...(mic?.getAudioTracks() ?? [])];
    const stream = new MediaStream(tracks);
    this.rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
    this.mime = this.rec.mimeType || mime || "video/webm";
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.done = new Promise((resolve, reject) => {
      this.rec.onstop = () => resolve({ blob: new Blob(this.chunks, { type: this.mime }), mime: this.mime, durationMs: this.elapsed() });
      this.rec.onerror = (e) => reject((e as any).error ?? new Error("MediaRecorder error"));
    });
  }

  get state(): RecordingState {
    return this.rec.state;
  }

  elapsed(): number {
    return this.accumulated + (this.rec.state === "recording" ? performance.now() - this.startedAt : 0);
  }

  start() {
    this.rec.start(1000);
    this.startedAt = performance.now();
  }

  pause() {
    if (this.rec.state !== "recording") return;
    this.accumulated += performance.now() - this.startedAt;
    this.rec.pause();
  }

  resume() {
    if (this.rec.state !== "paused") return;
    this.startedAt = performance.now();
    this.rec.resume();
  }

  stop(): Promise<TakeResult> {
    if (this.rec.state === "recording") this.accumulated += performance.now() - this.startedAt;
    if (this.rec.state !== "inactive") this.rec.stop();
    return this.done;
  }
}

/** File name of a clip: zero-padded order and board number, e.g. "03_board-12.mp4". */
export function clipFileName(order: number, boardNumber: number | undefined, boardId: string, ext: string, width = 2): string {
  const n = String(order).padStart(width, "0");
  const b = boardNumber !== undefined ? `board-${String(boardNumber).padStart(2, "0")}` : boardId.replace(/[^\w-]+/g, "_");
  return `${n}_${b}.${ext}`;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

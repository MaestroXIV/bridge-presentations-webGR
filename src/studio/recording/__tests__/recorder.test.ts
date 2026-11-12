import { describe, expect, it } from "vitest";
import { clipFileName, extensionFor, formatDuration, pickMimeType } from "../recorder";

describe("recorder helpers", () => {
  it("prefers H.264/AAC MP4, never a bare video/mp4, else WebM", () => {
    expect(pickMimeType((t) => t.startsWith("video/mp4;codecs=\"avc1"))).toMatch(/^video\/mp4;codecs="avc1/);
    expect(pickMimeType((t) => t === "video/mp4" || t.startsWith("video/webm"))).toBe("video/webm;codecs=vp9,opus");
    expect(pickMimeType(() => false)).toBe("");
    expect(extensionFor('video/mp4;codecs="avc1.640028,mp4a.40.2"')).toBe("mp4");
    expect(extensionFor("video/webm;codecs=vp9,opus")).toBe("webm");
  });
  it("names clips by order and board number", () => {
    expect(clipFileName(3, 12, "b12", "mp4")).toBe("03_board-12.mp4");
    expect(clipFileName(7, undefined, "intro deal", "webm", 3)).toBe("007_intro_deal.webm");
  });
  it("formats durations", () => {
    expect(formatDuration(102_400)).toBe("1:42");
    expect(formatDuration(0)).toBe("0:00");
  });
});

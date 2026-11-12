<template>
  <div class="studio" :class="{ clean: cleanStage }">
    <!-- presenter-only toolbar: never part of the recording -->
    <header class="tb">
      <div class="tb-group">
        <a class="tb-link" :href="editorUrl" title="Back to the deal editor">← Editor</a>
        <button @click="fileInput?.click()" :disabled="busy">Open…</button>
        <input ref="fileInput" type="file" accept=".json,.pbn,.lin,.txt,.html,.htm" hidden @change="onFile" />
        <button @click="loadSample" :disabled="busy">Sample</button>
        <button @click="saveSession" :disabled="!session">Save session</button>
      </div>
      <div class="tb-group seg" title="How the auction appears when a board opens">
        <button :class="{ on: auctionDefault === 'whole' }" @click="auctionDefault = 'whole'">Whole auction</button>
        <button :class="{ on: auctionDefault === 'step' }" @click="auctionDefault = 'step'">Call by call</button>
      </div>
      <div class="tb-group">
        <label>Camera</label>
        <select v-model="media.camId.value" title="Camera">
          <option value="">default</option>
          <option v-for="d in media.cameras.value" :key="d.deviceId" :value="d.deviceId">{{ d.label || "camera " + d.deviceId.slice(0, 6) }}</option>
        </select>
        <button :class="{ on: media.camStream.value }" @click="media.camStream.value ? media.stopCamera() : media.startCamera()">{{ media.camStream.value ? "Cam on" : "Cam off" }}</button>
        <label>Mic</label>
        <select v-model="media.micId.value" title="Microphone">
          <option value="">default</option>
          <option v-for="d in media.mics.value" :key="d.deviceId" :value="d.deviceId">{{ d.label || "mic " + d.deviceId.slice(0, 6) }}</option>
        </select>
        <button :class="{ on: media.micStream.value }" @click="media.micStream.value ? media.stopMic() : media.startMic()">{{ media.micStream.value ? "Mic on" : "Mic off" }}</button>
        <span class="meter" title="Microphone level"><span :style="{ width: Math.min(100, media.micLevel.value * 180) + '%' }"></span></span>
      </div>
      <div class="tb-group">
        <label>Head</label>
        <button v-for="s in (['S', 'M', 'L'] as const)" :key="s" :class="{ on: head.size === s }" @click="head.size = s">{{ s }}</button>
        <button :class="{ on: head.mirror }" @click="head.mirror = !head.mirror" title="Mirror the camera">Mirror</button>
        <button :class="{ on: head.snap }" @click="head.snap = !head.snap" title="Snap to the nearest corner when dropped">Snap</button>
        <button :class="{ on: !head.visible }" @click="head.visible = !head.visible" title="H">{{ head.visible ? "Hide" : "Show" }}</button>
      </div>
      <div class="tb-group rec">
        <template v-if="recState === 'idle'">
          <button class="rec-btn" @click="startTake" :disabled="!board || busy" title="R">● REC</button>
        </template>
        <template v-else-if="recState === 'countdown'">
          <span class="rec-status">starting… {{ countdown }}</span>
          <button @click="cancelCountdown">Cancel</button>
        </template>
        <template v-else>
          <span class="rec-dot" :class="{ paused: recState === 'paused' }"></span>
          <span class="rec-time" :class="{ long: elapsed > 180000 }">{{ formatDuration(elapsed) }}</span>
          <button @click="togglePause" :disabled="recState === 'saving'" title="P">{{ recState === "paused" ? "Resume" : "Pause" }}</button>
          <button @click="stopTake" :disabled="recState === 'saving'" title="Esc">■ Stop</button>
        </template>
        <span class="cap-mode" v-if="capture" :title="captureHelp">{{ captureLabel }}</span>
      </div>
    </header>

    <div class="body">
      <aside class="side">
        <div class="side-title" v-if="session">{{ session.title }}</div>
        <div class="empty" v-else>
          Open a session JSON, a PBN file, a LIN file or a saved BBO Myhands page — or load the sample. Everything stays in this browser.
        </div>
        <ul class="boards" v-if="session">
          <li v-for="(b, i) in session.boards" :key="b.id" :class="{ current: i === index }" @click="goTo(i)">
            <span class="b-no">{{ b.number ?? i + 1 }}</span>
            <span class="b-what">{{ boardLabel(b) }}</span>
            <span class="b-take" v-if="takes[b.id]">
              <span class="dot"></span>{{ formatDuration(takes[b.id].durationMs) }}
              <button class="mini" title="Preview" @click.stop="preview(b.id)">▶</button>
              <button class="mini" title="Download" @click.stop="downloadTake(b.id)">⬇</button>
              <button class="mini" title="Delete this take" @click.stop="removeTake(b.id)">✕</button>
            </span>
            <span class="b-take none" v-else>no take</span>
          </li>
        </ul>
        <div class="side-actions" v-if="session">
          <button @click="downloadAll" :disabled="takeCount === 0">Download all ({{ takeCount }})</button>
          <details>
            <summary>Join into one video</summary>
            <p>Put the downloaded clips and <code>concat.txt</code> in one folder, then run:</p>
            <code class="cmd">ffmpeg -f concat -safe 0 -i concat.txt -c copy session.{{ takeExt }}</code>
            <p>Works without re-encoding when all clips were recorded in the same browser at the same window size.</p>
          </details>
        </div>
        <div class="note-edit" v-if="board">
          <label>Auction on board {{ board.number ?? index + 1 }}</label>
          <select :value="board.auctionMode ?? ''" @change="setBoardMode(($event.target as HTMLSelectElement).value)">
            <option value="">as toolbar ({{ auctionDefault === "step" ? "call by call" : "whole" }})</option>
            <option value="whole">whole auction</option>
            <option value="step">call by call</option>
          </select>
          <label>Note for board {{ board.number ?? index + 1 }} <small>(shown on the left when there are no results)</small></label>
          <textarea v-model="board.note" rows="4" placeholder="Optional short note"></textarea>
        </div>
        <div class="msgs">
          <div class="err" v-for="(m, i) in errors" :key="'e' + i">{{ m }}</div>
          <div class="err" v-if="media.error.value">{{ media.error.value }}</div>
          <details v-if="warnings.length" class="warn">
            <summary>{{ warnings.length }} import warning(s)</summary>
            <div v-for="(w, i) in warnings" :key="i">{{ w }}</div>
          </details>
        </div>
        <div class="keys">
          <b>Keys</b> → / N next call or card · ← / Z back · Shift+→ rest of auction / trick · Shift+← trick back · B back to actual · A auto · Home restart · PgUp/PgDn board · R record/stop · P pause · H head · Esc stop
        </div>
      </aside>

      <main class="main">
        <div class="fit" ref="fitBox">
          <div class="stage-outer" v-if="board" :style="{ width: 1920 * scale + 'px', height: 1080 * scale + 'px' }">
            <div class="stage-scaler" ref="stageEl" :style="{ transform: `scale(${scale})` }">
              <stage :board="board" :play="play" :title="session!.title" :date="session!.date" :scoring="session!.scoring">
                <head-circle
                  :stream="media.camStream.value"
                  :size="HEAD_SIZES[head.size]"
                  :mirror="head.mirror"
                  :visible="head.visible"
                  :snap="head.snap"
                  :stage-w="1920"
                  :stage-h="1080"
                  :scale="scale"
                  v-model="head.pos"
                />
              </stage>
            </div>
          </div>
        </div>
        <div class="pbar" v-if="board">
          <button @click="play.reset()" :disabled="!play.canPrev.value" title="Home">⏮</button>
          <button @click="play.prevTrick()" :disabled="!play.canPrev.value" title="Shift+←">◀◀ trick</button>
          <button @click="play.prev()" :disabled="!play.canPrev.value" title="← / Z (undo)">◀ undo</button>
          <button @click="play.next()" :disabled="!play.canNext.value" title="→ / N">next ▶</button>
          <button @click="play.nextTrick()" :disabled="!play.canNext.value" title="Shift+→">trick ▶▶</button>
          <button @click="play.toggleAuto()" :class="{ on: play.auto.value }" :disabled="!play.canNext.value && !play.auto.value" title="A">auto</button>
          <button class="back" @click="play.toActual()" :disabled="play.variation.value === undefined" title="B">back to actual play</button>
          <span class="hint" v-if="play.variation.value !== undefined">variation from card {{ play.variation.value + 1 }}</span>
          <span class="hint" v-else-if="play.inAuction.value">auction: call {{ play.callsShown.value }} of {{ play.totalCalls.value }}</span>
          <span class="hint" v-else-if="play.playable.value && !board.play.length">no recorded play: click cards to play</span>
          <span class="spacer"></span>
          <button @click="goTo(index - 1)" :disabled="index <= 0 || recording">◀ board</button>
          <span class="hint">{{ index + 1 }} / {{ session?.boards.length }}</span>
          <button @click="goTo(index + 1)" :disabled="!session || index >= session.boards.length - 1 || recording">board ▶</button>
        </div>
      </main>
    </div>

    <div class="countdown" v-if="recState === 'countdown'">{{ countdown }}</div>

    <div class="modal" v-if="previewUrl" @click.self="closePreview">
      <div class="modal-box">
        <video :src="previewUrl" controls autoplay></video>
        <button @click="closePreview">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import Stage from "./components/Stage.vue";
import HeadCircle from "./components/HeadCircle.vue";
import { useBoardPlay } from "./useBoardPlay";
import { AuctionMode, effectiveMode } from "./model/steps";
import { useMedia } from "./useMedia";
import { loadSession, sessionFromLin, sessionToJson, SessionError } from "./model/session";
import { parsePbn } from "./model/pbn";
import { boardContract } from "./model/boardContract";
import { StudioBoard, StudioSession, SUIT_SYMBOL } from "./model/types";
import { importLin } from "@/presentations/class/lin";
import { captureStage, clipFileName, extensionFor, formatDuration, StageCapture, TakeRecorder } from "./recording/recorder";
import { deleteTake, listTakes, saveTake, sessionKeyOf, Take } from "./recording/takes";
import { HANDOFF_KEY } from "./handoff";
import sampleText from "../../docs/examples/sample-session.json?raw";

const LS_SESSION = "bridge-presenter-session";
const LS_HEAD = "bridge-presenter-head";
const HEAD_SIZES = { S: 190, M: 270, L: 370 } as const;

const session = ref<StudioSession>();
const index = ref(0);
const warnings = ref<string[]>([]);
const errors = ref<string[]>([]);
const busy = ref(false);
const board = computed<StudioBoard | undefined>(() => session.value?.boards[index.value]);
const LS_AUCTION = "bridge-presenter-auction-mode";
const auctionDefault = ref<AuctionMode>(localStorage.getItem(LS_AUCTION) === "step" ? "step" : "whole");
watch(auctionDefault, (m) => localStorage.setItem(LS_AUCTION, m));
const auctionMode = computed<AuctionMode>(() => effectiveMode(board.value?.auctionMode, auctionDefault.value));
const play = useBoardPlay(board, auctionMode);
const media = useMedia();
const fileInput = ref<HTMLInputElement>();
const fitBox = ref<HTMLElement>();
const stageEl = ref<HTMLElement>();
const scale = ref(0.5);
const editorUrl = location.pathname;

// ---- head circle settings ----------------------------------------------
const head = reactive({ size: "M" as "S" | "M" | "L", mirror: true, snap: true, visible: true, pos: { x: 1920 - 270 - 28, y: 1080 - 270 - 28 } });
try {
  Object.assign(head, JSON.parse(localStorage.getItem(LS_HEAD) ?? "{}"));
} catch {
  /* ignore */
}
watch(head, () => localStorage.setItem(LS_HEAD, JSON.stringify(head)), { deep: true });

// ---- loading -----------------------------------------------------------
function setSession(s: StudioSession, w: string[] = []) {
  session.value = s;
  index.value = 0;
  warnings.value = w;
  errors.value = [];
}
watch(
  session,
  (s) => {
    if (s) localStorage.setItem(LS_SESSION, sessionToJson(s));
  },
  { deep: true },
);

function importText(text: string, name: string) {
  const lower = name.toLowerCase();
  try {
    if (lower.endsWith(".json") || /^\s*\{/.test(text)) {
      const { session: s, warnings: w } = loadSession(text);
      setSession(s, w);
    } else if (lower.endsWith(".pbn") || /\[Deal\s+"/.test(text)) {
      const r = parsePbn(text);
      if (!r.boards.length) throw new SessionError("no board with a [Deal] tag found");
      setSession({ title: r.title ?? name.replace(/\.\w+$/, ""), scoring: r.boards[0].scoring, boards: r.boards }, r.warnings);
    } else {
      const imp = importLin(text);
      if (!imp.boards.length) throw new SessionError("no deal found (expected session JSON, PBN, LIN or a saved BBO Myhands page)");
      setSession(sessionFromLin(imp, name.replace(/\.\w+$/, "")), imp.boards.flatMap((b) => b.warnings.map((x) => `${b.name}: ${x}`)));
    }
  } catch (e) {
    errors.value = [`${name}: ${(e as Error).message}`];
  }
}
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  importText(await f.text(), f.name);
  input.value = "";
}
function loadSample() {
  importText(sampleText, "sample-session.json");
}
function saveSession() {
  if (!session.value) return;
  const name = (session.value.title || "session").replace(/[^\w-]+/g, "_");
  download(new Blob([sessionToJson(session.value)], { type: "application/json" }), `${name}.session.json`);
}

function boardLabel(b: StudioBoard) {
  const c = boardContract(b);
  if (!c) return b.title ?? "";
  if (c === "passed") return "passed out";
  return `${c.level}${c.strain === "N" ? "NT" : SUIT_SYMBOL[c.strain]}${c.doubled === 1 ? "×" : c.doubled === 2 ? "××" : ""} ${c.declarer}`;
}

function setBoardMode(v: string) {
  if (!board.value) return;
  if (v === "whole" || v === "step") board.value.auctionMode = v;
  else delete board.value.auctionMode;
}

function goTo(i: number) {
  if (!session.value || recording.value) return;
  if (i < 0 || i >= session.value.boards.length) return;
  index.value = i;
}

// ---- stage fit -----------------------------------------------------------
let ro: ResizeObserver | undefined;
function refit() {
  const el = fitBox.value;
  if (!el) return;
  const pad = cleanStage.value ? 0 : 20;
  scale.value = Math.max(0.2, Math.min((el.clientWidth - pad) / 1920, (el.clientHeight - pad) / 1080));
}

// ---- takes ---------------------------------------------------------------
const sessionKey = computed(() =>
  session.value ? sessionKeyOf(session.value.title, session.value.boards.map((b) => b.id), session.value.boards.map((b) => Object.values(b.hands).join(" "))) : "",
);
const takes = ref<Record<string, Take>>({});
const takeCount = computed(() => Object.keys(takes.value).length);
const takeExt = computed(() => {
  const t = Object.values(takes.value)[0];
  return t ? extensionFor(t.mime) : "mp4";
});
async function refreshTakes() {
  if (!sessionKey.value) return (takes.value = {});
  try {
    const list = await listTakes(sessionKey.value);
    takes.value = Object.fromEntries(list.map((t) => [t.boardId, t]));
  } catch (e) {
    errors.value.push(`Local storage of takes failed: ${(e as Error).message}`);
  }
}
watch(sessionKey, refreshTakes);

function orderOf(boardId: string) {
  return (session.value?.boards.findIndex((b) => b.id === boardId) ?? 0) + 1;
}
function fileNameOf(t: Take) {
  const b = session.value?.boards.find((x) => x.id === t.boardId);
  const width = Math.max(2, String(session.value?.boards.length ?? 0).length);
  return clipFileName(orderOf(t.boardId), b?.number, t.boardId, extensionFor(t.mime), width);
}
function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
function downloadTake(boardId: string) {
  const t = takes.value[boardId];
  if (t) download(t.blob, fileNameOf(t));
}
function concatList(): string {
  return sortedTakes()
    .map((t) => `file '${fileNameOf(t)}'`)
    .join("\n") + "\n";
}
function sortedTakes(): Take[] {
  return Object.values(takes.value).sort((a, b) => orderOf(a.boardId) - orderOf(b.boardId));
}
async function downloadAll() {
  const list = sortedTakes();
  if (!list.length) return;
  const w = window as unknown as { showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle> };
  if (w.showDirectoryPicker) {
    // one folder prompt, no "multiple downloads" prompt
    try {
      const dir = await w.showDirectoryPicker({ mode: "readwrite" });
      for (const t of list) {
        const fh = await dir.getFileHandle(fileNameOf(t), { create: true });
        const ws = await fh.createWritable();
        await ws.write(t.blob);
        await ws.close();
      }
      const fh = await dir.getFileHandle("concat.txt", { create: true });
      const ws = await fh.createWritable();
      await ws.write(concatList());
      await ws.close();
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
      console.warn("[presenter] folder save failed, falling back to downloads", e);
    }
  }
  for (const t of list) {
    download(t.blob, fileNameOf(t));
    await new Promise((r) => setTimeout(r, 500));
  }
  download(new Blob([concatList()], { type: "text/plain" }), "concat.txt");
}
async function removeTake(boardId: string) {
  if (!confirm("Delete this take? It cannot be undone.")) return;
  await deleteTake(sessionKey.value, boardId);
  await refreshTakes();
}
const previewUrl = ref("");
function preview(boardId: string) {
  const t = takes.value[boardId];
  if (t) previewUrl.value = URL.createObjectURL(t.blob);
}
function closePreview() {
  URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
}

// ---- recording -----------------------------------------------------------
type RecState = "idle" | "countdown" | "recording" | "paused" | "saving";
const recState = ref<RecState>("idle");
const recording = computed(() => recState.value !== "idle");
const countdown = ref(3);
const elapsed = ref(0);
const capture = ref<StageCapture>();
let recorder: TakeRecorder | undefined;
let recBoardId = "";
let tickTimer: ReturnType<typeof setInterval> | undefined;
let countdownTimer: ReturnType<typeof setTimeout> | undefined;
/** whole-tab fallback: hide every control while recording */
const cleanStage = computed(() => capture.value?.mode === "tab" && recording.value);
const captureLabel = computed(() => ({ element: "stage capture", region: "stage capture (region)", tab: "whole-tab capture" })[capture.value?.mode ?? "tab"]);
const captureHelp = computed(() =>
  capture.value?.mode === "tab"
    ? "This browser cannot crop the capture to the stage. While recording, the controls are hidden and the stage fills the window. Keys: P pause, Esc stop, arrows play."
    : "Only the stage (deal, auction, results, head) is recorded. Controls stay out of the video.",
);

async function ensureCapture(): Promise<boolean> {
  if (capture.value) return true;
  if (!stageEl.value) return false;
  try {
    capture.value = await captureStage(stageEl.value, () => {
      capture.value = undefined;
      if (recState.value === "recording" || recState.value === "paused") stopTake();
    });
    return true;
  } catch (e) {
    errors.value = [`Screen capture: ${(e as Error).message}`];
    return false;
  }
}

async function startTake() {
  if (recState.value !== "idle" || !board.value) return;
  errors.value = [];
  busy.value = true;
  try {
    if (!media.micStream.value && !(await media.startMic())) errors.value.push("Recording without microphone.");
    if (!(await ensureCapture())) return;
  } finally {
    busy.value = false;
  }
  recBoardId = board.value.id;
  recState.value = "countdown";
  countdown.value = 3;
  await nextTick();
  refit();
  const step = () => {
    if (recState.value !== "countdown") return;
    if (countdown.value > 1) {
      countdown.value--;
      countdownTimer = setTimeout(step, 1000);
    } else {
      countdown.value = 0;
      beginRecording();
    }
  };
  countdownTimer = setTimeout(step, 1000);
}
function cancelCountdown() {
  if (countdownTimer) clearTimeout(countdownTimer);
  recState.value = "idle";
}
async function beginRecording() {
  recState.value = "recording";
  // let the countdown overlay disappear before the first frame is recorded
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));
  if (!capture.value) {
    recState.value = "idle";
    return;
  }
  try {
    recorder = new TakeRecorder(capture.value.stream, media.micStream.value);
    recorder.start();
  } catch (e) {
    errors.value.push(`Recorder: ${(e as Error).message}`);
    recState.value = "idle";
    return;
  }
  elapsed.value = 0;
  tickTimer = setInterval(() => (elapsed.value = recorder?.elapsed() ?? 0), 250);
}
function togglePause() {
  if (!recorder) return;
  if (recState.value === "recording") {
    recorder.pause();
    recState.value = "paused";
  } else if (recState.value === "paused") {
    recorder.resume();
    recState.value = "recording";
  }
}
async function stopTake() {
  if (recState.value === "countdown") return cancelCountdown();
  if (!recorder || (recState.value !== "recording" && recState.value !== "paused")) return;
  recState.value = "saving";
  if (tickTimer) clearInterval(tickTimer);
  const r = recorder;
  recorder = undefined;
  try {
    const res = await r.stop();
    if (res.blob.size === 0) throw new Error("the recording is empty");
    const take = { sessionKey: sessionKey.value, boardId: recBoardId, blob: res.blob, mime: res.mime, durationMs: res.durationMs, createdAt: Date.now() };
    try {
      await saveTake(take);
      await refreshTakes();
    } catch (e) {
      errors.value.push(`Could not store the take locally (${(e as Error).message}); download it now.`);
      takes.value = { ...takes.value, [recBoardId]: { ...take, key: "" } };
    }
  } catch (e) {
    errors.value.push(`Recording failed: ${(e as Error).message}`);
  } finally {
    recState.value = "idle";
    await nextTick();
    refit();
  }
}

// ---- keyboard ------------------------------------------------------------
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  let handled = true;
  if (k === "ArrowRight" || k === "n" || k === "N") e.shiftKey ? play.nextTrick() : play.next();
  else if (k === "ArrowLeft") e.shiftKey ? play.prevTrick() : play.prev();
  else if (k === "z" || k === "Z" || k === "Backspace") play.prev();
  else if (k === "b" || k === "B") play.toActual();
  else if (k === "a" || k === "A") play.toggleAuto();
  else if (k === "Home") play.reset();
  else if (k === "PageDown") goTo(index.value + 1);
  else if (k === "PageUp") goTo(index.value - 1);
  else if (k === "r" || k === "R") recState.value === "idle" ? startTake() : stopTake();
  else if (k === "p" || k === "P") togglePause();
  else if (k === "h" || k === "H") head.visible = !head.visible;
  else if (k === "Escape") previewUrl.value ? closePreview() : stopTake();
  else handled = false;
  if (handled) e.preventDefault();
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  ro = new ResizeObserver(refit);
  if (fitBox.value) ro.observe(fitBox.value);
  refit();
  const handoff = localStorage.getItem(HANDOFF_KEY);
  const saved = localStorage.getItem(LS_SESSION);
  if (handoff) {
    localStorage.removeItem(HANDOFF_KEY);
    importText(handoff, "editor.json");
  } else if (saved) {
    try {
      const { session: s, warnings: w } = loadSession(saved);
      setSession(s, w);
    } catch {
      localStorage.removeItem(LS_SESSION);
    }
  }
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  ro?.disconnect();
  capture.value?.stop();
});
watch([board, cleanStage], () => nextTick(refit));
</script>

<style lang="scss">
html,
body,
#app {
  height: 100%;
  margin: 0;
}
.studio {
  box-sizing: border-box;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #2a2c31;
  color: #e9e9ea;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;

  button,
  select {
    font: inherit;
    background: #3a3d44;
    color: #eee;
    border: 1px solid #50545d;
    border-radius: 4px;
    padding: 4px 9px;
    cursor: pointer;
    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
    &.on {
      background: #5a6d3a;
      border-color: #7d9650;
    }
  }
  select {
    max-width: 150px;
  }
  .tb {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    align-items: center;
    padding: 6px 10px;
    background: #1d1f23;
    border-bottom: 1px solid #000;
  }
  .tb-group {
    display: flex;
    align-items: center;
    gap: 5px;
    label {
      color: #9a9ca3;
      margin-left: 4px;
    }
  }
  .seg button {
    margin: 0 -3px 0 0;
  }
  .tb-link {
    color: #9cc3ff;
    text-decoration: none;
    margin-right: 6px;
  }
  .meter {
    width: 60px;
    height: 8px;
    background: #111;
    border-radius: 4px;
    overflow: hidden;
    span {
      display: block;
      height: 100%;
      background: #6fdc8c;
    }
  }
  .rec {
    margin-left: auto;
  }
  .rec-btn {
    background: #a3262b;
    border-color: #c8363c;
    font-weight: 700;
  }
  .rec-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #e53935;
    animation: blink 1s infinite;
    &.paused {
      background: #e0a400;
      animation: none;
    }
  }
  .rec-time {
    font-variant-numeric: tabular-nums;
    font-size: 15px;
    min-width: 42px;
    &.long {
      color: #ffb74d;
    }
  }
  .cap-mode {
    color: #9a9ca3;
    font-size: 12px;
    border: 1px dashed #555;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .side {
    width: 270px;
    flex: none;
    overflow-y: auto;
    padding: 10px;
    background: #24262b;
    border-right: 1px solid #000;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .side-title {
    font-weight: 700;
    font-size: 14px;
  }
  .empty {
    color: #aaa;
    line-height: 1.4;
  }
  .boards {
    list-style: none;
    margin: 0;
    padding: 0;
    li {
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 2px 6px;
      padding: 5px 6px;
      border-radius: 4px;
      cursor: pointer;
      &:hover {
        background: #30333a;
      }
      &.current {
        background: #3b4a5e;
      }
    }
    .b-no {
      font-weight: 700;
      grid-row: span 2;
      font-size: 15px;
    }
    .b-take {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #b8e0b0;
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #6fdc8c;
      }
      &.none {
        color: #777;
      }
    }
    .mini {
      padding: 0 5px;
      font-size: 11px;
    }
  }
  .side-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    details {
      color: #bbb;
      p {
        margin: 4px 0;
      }
    }
    .cmd {
      display: block;
      background: #111;
      padding: 6px;
      border-radius: 4px;
      user-select: all;
      word-break: break-all;
    }
  }
  .note-edit {
    display: flex;
    flex-direction: column;
    gap: 4px;
    textarea {
      font: inherit;
      background: #1b1c20;
      color: #eee;
      border: 1px solid #50545d;
      border-radius: 4px;
      resize: vertical;
    }
    small {
      color: #888;
    }
  }
  .msgs .err {
    color: #ff8a80;
    margin-bottom: 4px;
  }
  .warn {
    color: #ffcc80;
  }
  .keys {
    b {
      display: block;
      color: #bbb;
    }
    color: #8a8c93;
    line-height: 1.5;
    font-size: 12px;
    margin-top: auto;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .fit {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
  }
  .stage-outer {
    position: relative;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
  }
  .stage-scaler {
    position: absolute;
    top: 0;
    left: 0;
    width: 1920px;
    height: 1080px;
    transform-origin: 0 0;
    isolation: isolate;
  }
  .pbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: #1d1f23;
    border-top: 1px solid #000;
    .back:not(:disabled) {
      background: #8a6a1e;
      border-color: #b08428;
    }
    .hint {
      color: #aaa;
    }
    .spacer {
      flex: 1;
    }
  }
  .countdown {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 220px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.92);
    text-shadow: 0 6px 40px rgba(0, 0, 0, 0.6);
    background: rgba(0, 0, 0, 0.25);
    z-index: 100;
    pointer-events: none;
  }
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  .modal-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    video {
      max-width: 80vw;
      max-height: 80vh;
      background: #000;
    }
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  /* whole-tab fallback while recording: only the stage is visible */
  &.clean {
    background: #000;
    .tb,
    .side,
    .pbar {
      display: none;
    }
    .fit {
      padding: 0;
    }
    .stage-outer {
      box-shadow: none;
    }
  }
}
@keyframes blink {
  50% {
    opacity: 0.25;
  }
}
</style>

<template>
  <div class="replay-panel" v-if="replay.script.value">
    <div class="rp-header">
      <span class="rp-title">{{ replay.script.value.label }}</span>
      <span class="rp-status" :class="statusClass">{{ statusText }}</span>
    </div>
    <div class="rp-playlist" v-if="playlist">
      <button class="rp-btn" :disabled="playlist.index <= 0" @click="emit('navigate-board', -1)" title="Previous board (PageUp)">◀</button>
      <span class="rp-playlist-title">{{ playlist.title }} · board {{ playlist.index + 1 }}/{{ playlist.boards.length }}<template v-if="playlist.boards[playlist.index]?.result"> · {{ playlist.boards[playlist.index].result?.percent }}</template></span>
      <button class="rp-btn" :disabled="playlist.index >= playlist.boards.length - 1" @click="emit('navigate-board', 1)" title="Next board (PageDown)">▶</button>
    </div>

    <div class="rp-controls">
      <button class="rp-btn" :disabled="!replay.canStep.value" @click="replay.step()" title="Next scripted action (N)">
        Next <kbd>N</kbd>
      </button>
      <button class="rp-btn" :disabled="!canPlayAuction" @click="replay.play('lead')" title="Play the auction, stop before the opening lead">
        Auction ▶
      </button>
      <button class="rp-btn" :disabled="!canPlayTrick" @click="replay.play('trick')" title="Play the rest of this trick">
        Trick ▶
      </button>
      <button class="rp-btn" :class="{ active: replay.autoplay.value }" :disabled="!replay.onScript.value || replay.finished.value" @click="replay.toggleAuto()" title="Auto-play to the end (A)">
        {{ replay.autoplay.value ? "Pause" : "All ▶▶" }} <kbd>A</kbd>
      </button>
    </div>

    <div class="rp-lines">
      <div class="rp-line">
        <span class="rp-line-name">Actual</span>
        <span class="rp-line-result">{{ actualText }}</span>
      </div>
      <div class="rp-line" :class="{ branched: replay.branchedAt.value !== undefined }">
        <span class="rp-line-name">{{ replay.branchedAt.value !== undefined ? "Your line" : "On script" }}</span>
        <span class="rp-line-result">{{ currentText }}</span>
      </div>
    </div>

    <div class="rp-play">
      <div class="rp-auction" v-if="auctionEntries.length">
        <span
          v-for="(e, i) in auctionEntries"
          :key="'a' + i"
          class="rp-chip"
          :class="e.state"
        >{{ e.label }}</span>
      </div>
      <div class="rp-tricks" ref="tricksEl">
        <div v-for="(row, t) in trickRows" :key="'t' + t" class="rp-trick">
          <span class="rp-trick-no">{{ t + 1 }}</span>
          <span
            v-for="(e, i) in row"
            :key="'c' + t + '-' + i"
            class="rp-chip"
            :class="[e.state, e.suitClass]"
          >{{ e.label }}</span>
        </div>
      </div>
      <div class="rp-hint rp-branch" v-if="replay.branchedAt.value !== undefined">
        <span>Branched at {{ branchLabel }} — <kbd>Z</kbd> undoes one card.</span>
        <button class="rp-btn" @click="replay.backToScript()" title="Undo until the play is back on the recorded line (B)">Back to actual <kbd>B</kbd></button>
      </div>
      <div class="rp-hint" v-else-if="replay.finished.value">End of the recorded play.</div>
      <div class="rp-hint" v-else>Play any other card to branch off and try a different line.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { useReplay } from "@/presentations/composables/useReplay";
import { actionLabel, contractToShortString } from "@/presentations/class/script";
import { PresentationGame } from "@/bridge/model/PresentationGame";
import type { Playlist } from "@/presentations/class/options";
import { PositionHelper, Side } from "@/bridge/model/Position";
import { useKeyboardShortcut } from "../composables/useKeyboardShortcut";

const props = defineProps<{
  replay: ReturnType<typeof useReplay>;
  game: PresentationGame;
  playlist?: Playlist;
}>();

const emit = defineEmits<{
  (e: "navigate-board", delta: number): void;
}>();

const replay = props.replay;

useKeyboardShortcut("n", null, () => {
  if (replay.canStep.value) replay.step();
});
useKeyboardShortcut("a", null, () => {
  if (replay.onScript.value) replay.toggleAuto();
});
useKeyboardShortcut("b", null, () => replay.backToScript());

// keep the next card (or the last played one) in view as the list scrolls
const tricksEl = ref<HTMLDivElement>();
watch(
  () => replay.history.value.length,
  () => nextTick(() => {
    const el = tricksEl.value?.querySelector(".rp-chip.next, .rp-chip.off:last-of-type") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }),
);

const canPlayAuction = computed(
  () => replay.onScript.value && !replay.autoplay.value && props.game.state === "bidding",
);
const canPlayTrick = computed(
  () => replay.onScript.value && !replay.autoplay.value && props.game.state === "cardplay" && !replay.finished.value,
);

const statusText = computed(() => {
  if (replay.branchedAt.value !== undefined) return "branched";
  if (replay.autoplay.value) return "playing";
  if (replay.finished.value) return "finished";
  return "on script";
});
const statusClass = computed(() => ({
  branched: replay.branchedAt.value !== undefined,
  playing: replay.autoplay.value,
}));

const actualText = computed(() => {
  const sim = replay.simulation.value;
  if (!sim) return "";
  const c = contractToShortString(sim.contract);
  if (!sim.contract || sim.contract === "passed") return c || "unknown contract";
  const tricks = sim.tricksDeclarer;
  if (tricks === undefined) return `${c} · ${sim.cardsPlayed} cards recorded`;
  const rel = tricks - sim.contract.level - 6;
  const relText = rel === 0 ? "=" : rel > 0 ? `+${rel}` : `${rel}`;
  return `${c} ${relText} · ${tricks} tricks`;
});

const currentText = computed(() => {
  const g = props.game;
  const contract = g.finalContract;
  if (!contract) return `auction · ${g.auction?.bids.length ?? 0} bids`;
  if (contract === "passed") return "passed out";
  const side = PositionHelper.side(contract.declarer);
  const made = g.trickCount(side);
  const opp = g.trickCount(side === Side.NS ? Side.EW : Side.NS);
  const total = made + opp;
  if (g.state === "finished") {
    const rel = made - contract.level - 6;
    const relText = rel === 0 ? "=" : rel > 0 ? `+${rel}` : `${rel}`;
    return `${contractToShortString(contract)} ${relText} · ${made} tricks`;
  }
  return `${contractToShortString(contract)} · ${made} of ${total} tricks so far`;
});

interface Entry {
  label: string;
  state: "done" | "off" | "next" | "todo";
  suitClass?: string;
}

/** Merge history (what happened) with the script (what was recorded) into one list. */
const entries = computed<{ kind: "bid" | "play"; e: Entry }[]>(() => {
  const h = replay.history.value;
  const a = replay.actions.value;
  const b = replay.branchedAt.value;
  const out: { kind: "bid" | "play"; e: Entry }[] = [];
  const n = Math.max(h.length, b === undefined ? a.length : h.length);
  for (let i = 0; i < n; i++) {
    const done = h[i];
    if (done) {
      if (done.kind === "claim") continue;
      const off = b !== undefined && i >= b;
      out.push({ kind: done.kind, e: { label: done.label, state: off ? "off" : "done", suitClass: suitOf(done.label) } });
    } else {
      const act = a[i];
      if (!act || act.t === "claim") continue;
      const label = actionLabel(act);
      out.push({
        kind: act.t === "bid" ? "bid" : "play",
        e: { label, state: i === h.length ? "next" : "todo", suitClass: suitOf(label) },
      });
    }
  }
  return out;
});

function suitOf(label: string): string | undefined {
  if (label.includes("♥")) return "hearts";
  if (label.includes("♦")) return "diamonds";
  if (label.includes("♣")) return "clubs";
  if (label.includes("♠")) return "spades";
  return undefined;
}

const auctionEntries = computed(() => entries.value.filter((x) => x.kind === "bid").map((x) => x.e));
const trickRows = computed(() => {
  const plays = entries.value.filter((x) => x.kind === "play").map((x) => x.e);
  const rows: Entry[][] = [];
  for (let i = 0; i < plays.length; i += 4) rows.push(plays.slice(i, i + 4));
  return rows;
});

const branchLabel = computed(() => {
  const b = replay.branchedAt.value;
  if (b === undefined) return "";
  const h = replay.history.value;
  const bidsBefore = h.slice(0, b).filter((x) => x.kind === "bid").length;
  if (h[b]?.kind === "bid") return `bid ${b + 1}`;
  const card = b - bidsBefore;
  return `trick ${Math.floor(card / 4) + 1}, card ${(card % 4) + 1}`;
});
</script>

<style scoped lang="scss">
.replay-panel {
  width: 100%;
  max-width: 460px;
  color: white;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
}

.rp-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  .rp-title { font-weight: 600; color: #ddd; }
  .rp-status {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9ccc9c;
    &.playing { color: #f0c987; }
    &.branched { color: #f87171; }
  }
}

.rp-playlist {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #bbb;
  .rp-playlist-title { flex: 1; text-align: center; }
  .rp-btn {
    background: rgba(0, 0, 0, 0.4);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    &:disabled { opacity: 0.35; cursor: default; }
  }
}

.rp-controls {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  .rp-btn {
    background: rgba(0, 0, 0, 0.4);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 3px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    &:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
    &:disabled { opacity: 0.35; cursor: default; }
    &.active { border-color: #f0c987; color: #f0c987; }
    kbd {
      font-family: inherit;
      font-size: 10px;
      opacity: 0.6;
      margin-left: 3px;
    }
  }
}

.rp-lines {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 12px;
  row-gap: 2px;
  .rp-line { display: contents; }
  .rp-line-name { color: #999; }
  .rp-line-result { font-variant-numeric: tabular-nums; }
  .rp-line.branched .rp-line-name { color: #f87171; }
}

.rp-play {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}
.rp-auction {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
.rp-tricks {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 46px; // at least two tricks visible; the rest scrolls
  overflow-y: auto;
}
.rp-trick {
  display: grid;
  grid-template-columns: 18px repeat(4, 38px);
  gap: 3px;
  align-items: center;
  .rp-trick-no { color: #777; font-size: 11px; text-align: right; padding-right: 2px; }
}
.rp-chip {
  display: inline-block;
  min-width: 34px;
  text-align: center;
  padding: 2px 5px;
  border-radius: 3px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.06);
  font-variant-numeric: tabular-nums;
  &.done { background: rgba(255, 255, 255, 0.16); }
  &.next { border-color: #9ccc9c; background: rgba(156, 204, 156, 0.15); }
  &.todo { opacity: 0.45; }
  &.off { border-color: #f87171; background: rgba(248, 113, 113, 0.18); }
  &.hearts { color: #f87171; }
  &.diamonds { color: #fb923c; }
  &.clubs { color: #60a5fa; }
  &.spades { color: #e5e7eb; }
  &.done.hearts, &.off.hearts { color: #fca5a5; }
}
.rp-hint {
  color: #999;
  font-size: 12px;
  kbd { font-family: inherit; border: 1px solid #555; border-radius: 3px; padding: 0 4px; }
  &.rp-branch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    .rp-btn {
      background: rgba(0, 0, 0, 0.4);
      color: white;
      border: 1px solid rgba(248, 113, 113, 0.6);
      border-radius: 3px;
      padding: 3px 8px;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      kbd { border: none; opacity: 0.6; font-size: 10px; }
    }
  }
}
</style>

/**
 * Card-play state of the board on the stage: the recorded line, the line on
 * screen, stepping, free play with follow-suit, variations and undo.
 */
import { computed, ref, watch, type Ref } from "vue";
import { boardContract } from "./model/boardContract";
import { backToActual, canPlay, nextActualCard, replayPlay, variationAt, type PlayState } from "./model/play";
import { Seat, StudioBoard } from "./model/types";

export function useBoardPlay(board: Ref<StudioBoard | undefined>) {
  const line = ref<string[]>([]);
  const auto = ref(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  const contract = computed(() => (board.value ? boardContract(board.value) : undefined));
  const playable = computed(() => contract.value !== undefined && contract.value !== "passed");
  const actual = computed(() => board.value?.play ?? []);

  const state = computed<PlayState | undefined>(() => {
    const b = board.value;
    const c = contract.value;
    if (!b || !c || c === "passed") return undefined;
    return replayPlay(b.hands, c.declarer, c.strain, line.value);
  });

  const variation = computed(() => variationAt(actual.value, line.value));
  const onRecord = computed(() => variation.value === undefined);
  const canNext = computed(() => playable.value && nextActualCard(actual.value, line.value) !== undefined);
  const canPrev = computed(() => line.value.length > 0);
  /** trick shown in the middle (the last one started); 0 before the lead */
  const trickNo = computed(() => state.value?.tricks.length ?? 0);
  const claimed = computed(() =>
    onRecord.value && board.value?.claim !== undefined && line.value.length === actual.value.length ? board.value.claim : undefined,
  );

  function stopAuto() {
    auto.value = false;
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  function next(): boolean {
    const c = nextActualCard(actual.value, line.value);
    if (!c) return false;
    line.value = [...line.value, c];
    return true;
  }
  function prev(): boolean {
    stopAuto();
    if (!line.value.length) return false;
    line.value = line.value.slice(0, -1);
    return true;
  }
  /** to the end of the current trick (or the next one if it is complete) */
  function nextTrick() {
    stopAuto();
    do {
      if (!next()) break;
    } while (line.value.length % 4 !== 0);
  }
  function prevTrick() {
    stopAuto();
    if (!line.value.length) return;
    const n = line.value.length % 4 === 0 ? line.value.length - 4 : line.value.length - (line.value.length % 4);
    line.value = line.value.slice(0, Math.max(0, n));
  }
  function play(seat: Seat, card: string): boolean {
    const s = state.value;
    if (!s || !canPlay(s, seat, card)) return false;
    stopAuto();
    line.value = [...line.value, card];
    return true;
  }
  function toActual() {
    stopAuto();
    line.value = backToActual(actual.value, line.value);
  }
  function reset() {
    stopAuto();
    line.value = [];
  }
  function toggleAuto(ms = 900) {
    if (auto.value) return stopAuto();
    if (!canNext.value) return;
    auto.value = true;
    timer = setInterval(() => {
      if (!next()) stopAuto();
    }, ms);
  }

  watch(() => board.value?.id, reset);

  return { line, contract, playable, state, variation, onRecord, canNext, canPrev, trickNo, claimed, auto, next, prev, nextTrick, prevTrick, play, toActual, reset, toggleAuto, stopAuto };
}

export type BoardPlay = ReturnType<typeof useBoardPlay>;

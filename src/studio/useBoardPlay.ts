/**
 * Stepping state of the board on the stage: the auction (whole, or call by
 * call), then the recorded play, free play with follow-suit, variations and
 * undo. The pure rules live in model/steps.ts and model/play.ts.
 */
import { computed, ref, watch, type Ref } from "vue";
import { boardContract } from "./model/boardContract";
import { canPlay, replayPlay, variationAt, type PlayState } from "./model/play";
import { AuctionMode, StepPos, auctionDone, startPos, stepNext, stepNextBig, stepPrev, stepPrevBig, toActual as posToActual, withCard } from "./model/steps";
import { Seat, StudioBoard } from "./model/types";

export function useBoardPlay(board: Ref<StudioBoard | undefined>, mode: Ref<AuctionMode>) {
  const totalCalls = computed(() => board.value?.auction.length ?? 0);
  const pos = ref<StepPos>(startPos(mode.value, totalCalls.value));
  const auto = ref(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  const line = computed(() => pos.value.cards);
  const callsShown = computed(() => pos.value.calls);
  const inAuction = computed(() => !auctionDone(pos.value, totalCalls.value));
  /** the final contract; undefined while the auction is still being revealed */
  const fullContract = computed(() => (board.value ? boardContract(board.value) : undefined));
  const contract = computed(() => (inAuction.value ? undefined : fullContract.value));
  const playable = computed(() => fullContract.value !== undefined && fullContract.value !== "passed");
  const actual = computed(() => board.value?.play ?? []);

  const state = computed<PlayState | undefined>(() => {
    const b = board.value;
    const c = fullContract.value;
    if (!b || !c || c === "passed" || inAuction.value) return undefined;
    return replayPlay(b.hands, c.declarer, c.strain, line.value);
  });

  const variation = computed(() => variationAt(actual.value, line.value));
  const onRecord = computed(() => variation.value === undefined);
  const canNext = computed(() => stepNext(pos.value, totalCalls.value, actual.value, playable.value) !== undefined);
  const canPrev = computed(() => stepPrev(pos.value, mode.value) !== undefined);
  /** trick shown in the middle (the last one started); 0 before the lead */
  const trickNo = computed(() => state.value?.tricks.length ?? 0);
  const claimed = computed(() =>
    onRecord.value && board.value?.claim !== undefined && line.value.length === actual.value.length && !inAuction.value ? board.value.claim : undefined,
  );

  function stopAuto() {
    auto.value = false;
    if (timer) clearInterval(timer);
    timer = undefined;
  }
  function apply(p: StepPos | undefined): boolean {
    if (!p) return false;
    pos.value = p;
    return true;
  }

  const next = () => apply(stepNext(pos.value, totalCalls.value, actual.value, playable.value));
  function prev() {
    stopAuto();
    return apply(stepPrev(pos.value, mode.value));
  }
  /** Shift+next: rest of the auction, or to the end of the trick */
  function nextTrick() {
    stopAuto();
    apply(stepNextBig(pos.value, totalCalls.value, actual.value, playable.value));
  }
  function prevTrick() {
    stopAuto();
    apply(stepPrevBig(pos.value, mode.value));
  }
  function play(seat: Seat, card: string): boolean {
    const s = state.value;
    if (!s || !canPlay(s, seat, card)) return false;
    stopAuto();
    return apply(withCard(pos.value, totalCalls.value, card));
  }
  function toActual() {
    stopAuto();
    pos.value = posToActual(pos.value, actual.value);
  }
  /** Home: back to the start (of the auction in call-by-call mode) */
  function reset() {
    stopAuto();
    pos.value = startPos(mode.value, totalCalls.value);
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
  // switching mode: whole shows every call at once; call-by-call keeps the cards only if the auction was complete
  watch(mode, (m) => {
    if (m === "whole") pos.value = { calls: totalCalls.value, cards: pos.value.cards };
    else if (pos.value.cards.length === 0) pos.value = startPos(m, totalCalls.value);
  });

  return {
    line,
    callsShown,
    totalCalls,
    inAuction,
    contract,
    playable,
    state,
    variation,
    onRecord,
    canNext,
    canPrev,
    trickNo,
    claimed,
    auto,
    next,
    prev,
    nextTrick,
    prevTrick,
    play,
    toActual,
    reset,
    toggleAuto,
    stopAuto,
  };
}

export type BoardPlay = ReturnType<typeof useBoardPlay>;

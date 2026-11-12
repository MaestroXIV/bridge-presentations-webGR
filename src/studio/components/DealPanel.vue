<template>
  <div class="deal-wrap">
    <div class="deal-panel">
      <div class="board-info">
        <div class="board-no">{{ board.number !== undefined ? "Board " + board.number : board.title || "Board" }}</div>
        <div class="board-meta">Dealer {{ SEAT_NAMES[board.dealer] }} · {{ vulText }}</div>
      </div>
      <div class="contract-badge" v-if="contractInfo">
        <div class="c-main">
          <template v-if="contractInfo.passed">Passed out</template>
          <template v-else>{{ contractInfo.level }}<span :class="'suit-' + contractInfo.strain">{{ symbol(contractInfo.strain) }}</span>{{ contractInfo.dbl }}</template>
        </div>
        <div class="c-sub" v-if="!contractInfo.passed">by {{ SEAT_NAMES[contractInfo.declarer!] }}</div>
        <div class="c-sub" v-if="scoringText">{{ scoringText }}</div>
      </div>

      <div v-for="seat in SEATS" :key="seat" class="hand" :class="['hand-' + seat, { 'to-play': play.state.value?.toPlay === seat }]">
        <div class="seat-name">
          <span class="seat-label" :class="{ vul: isVul(board.vul, sideOf(seat)) }">{{ SEAT_NAMES[seat] }}</span>
          <span class="player" v-if="board.players?.[seat]">{{ board.players[seat] }}</span>
        </div>
        <div v-for="suit in SUITS" :key="suit" class="suit-row">
          <span class="sym" :class="'suit-' + suit">{{ symbol(suit) }}</span>
          <span class="ranks">
            <span
              v-for="c in cardsOf(seat, suit)"
              :key="c"
              class="rank"
              :class="{ played: played.has(c), legal: isLegal(seat, c) }"
              @click="onCard(seat, c)"
              >{{ rankText(c[1]) }}</span
            >
            <span v-if="cardsOf(seat, suit).length === 0" class="void">—</span>
          </span>
        </div>
      </div>

      <div class="trick-area">
        <div v-if="!shownTrick && play.playable.value" class="lead-hint">{{ leaderName }} to lead</div>
        <template v-if="shownTrick">
          <div
            v-for="pc in shownTrick.cards"
            :key="pc.card"
            class="trick-card"
            :class="['tc-' + pc.seat, { leader: pc.seat === shownTrick.leader, winner: pc.seat === shownTrick.winner }]"
          >
            <span class="tc-rank" :class="'suit-' + pc.card[0]">{{ rankText(pc.card[1]) }}</span>
            <span class="tc-suit" :class="'suit-' + pc.card[0]">{{ symbol(pc.card[0]) }}</span>
            <span class="lead-mark" v-if="pc.seat === shownTrick.leader">lead</span>
          </div>
        </template>
      </div>
    </div>

    <div class="play-bar">
      <button class="pb-btn" :disabled="!play.canPrev.value" @click="play.prev()">◀ PREV</button>
      <div class="pb-mid">
        <span class="pb-trick" v-if="!play.playable.value">{{ contractInfo?.passed ? "PASSED OUT" : "NO CONTRACT" }}</span>
        <span class="pb-trick" v-else-if="play.trickNo.value === 0">OPENING LEAD</span>
        <span class="pb-trick" v-else>TRICK {{ play.trickNo.value }} / 13</span>
        <span class="pb-count" v-if="play.playable.value">N-S {{ play.state.value?.ns ?? 0 }} · E-W {{ play.state.value?.ew ?? 0 }}</span>
        <span class="pb-var" v-if="play.variation.value !== undefined">VARIATION</span>
        <span class="pb-claim" v-else-if="play.claimed.value !== undefined">Claim: {{ play.claimed.value }} tricks for declarer</span>
      </div>
      <button class="pb-btn" :disabled="!play.canNext.value" @click="play.next()">NEXT ▶</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RANKS } from "../model/play";
import { parseDotHand } from "../model/play";
import { Scoring, Seat, SEATS, SEAT_NAMES, StudioBoard, SUIT_SYMBOL, isVul, nextSeat, sideOf } from "../model/types";
import type { BoardPlay } from "../useBoardPlay";

const props = defineProps<{ board: StudioBoard; play: BoardPlay; scoring?: Scoring }>();
const SUITS = ["S", "H", "D", "C"];

const symbol = (s: string) => (s === "N" ? "NT" : SUIT_SYMBOL[s]);
const rankText = (r: string) => (r === "T" ? "10" : r);

const handCards = computed(() => {
  const out = {} as Record<Seat, string[]>;
  for (const s of SEATS) out[s] = parseDotHand(props.board.hands[s]);
  return out;
});
function cardsOf(seat: Seat, suit: string) {
  return handCards.value[seat].filter((c) => c[0] === suit).sort((a, b) => RANKS.indexOf(a[1]) - RANKS.indexOf(b[1]));
}
const played = computed(() => props.play.state.value?.played ?? new Set<string>());
const shownTrick = computed(() => {
  const t = props.play.state.value?.tricks;
  return t && t.length ? t[t.length - 1] : undefined;
});
function isLegal(seat: Seat, card: string) {
  const st = props.play.state.value;
  if (!st || st.toPlay !== seat || played.value.has(card)) return false;
  const cur = st.tricks[st.tricks.length - 1];
  const led = cur && cur.cards.length < 4 ? cur.cards[0].card[0] : undefined;
  const hand = st.remaining[seat];
  return !led || card[0] === led || !hand.some((c) => c[0] === led);
}
function onCard(seat: Seat, card: string) {
  props.play.play(seat, card);
}

const contractInfo = computed(() => {
  const c = props.play.contract.value;
  if (!c) return undefined;
  if (c === "passed") return { passed: true } as const;
  return { passed: false, level: c.level, strain: c.strain, declarer: c.declarer, dbl: c.doubled === 1 ? "×" : c.doubled === 2 ? "××" : "" };
});
const leaderName = computed(() => {
  const c = props.play.contract.value;
  return c && c !== "passed" ? SEAT_NAMES[nextSeat(c.declarer)] : "";
});
const vulText = computed(() => ({ None: "None vul", NS: "N-S vul", EW: "E-W vul", All: "Both vul" })[props.board.vul]);
const scoringText = computed(() => {
  const s = props.scoring ?? props.board.scoring;
  return s ? { MP: "Matchpoints", IMP: "IMPs", BAM: "Board-a-match", Total: "Total points" }[s] : "";
});
</script>

<style scoped lang="scss">
.deal-wrap {
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
}
.deal-panel {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--st-cream);
  border: 1px solid var(--st-cream-edge);
  border-radius: 10px;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04), 0 8px 24px rgba(60, 45, 20, 0.08);
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: auto 1fr auto;
  padding: 28px 36px;
}
.board-info {
  position: absolute;
  top: 22px;
  left: 28px;
  .board-no {
    font-family: var(--st-serif);
    font-size: 30px;
    font-weight: 700;
  }
  .board-meta {
    font-size: 19px;
    color: var(--st-muted);
    margin-top: 2px;
  }
}
.contract-badge {
  position: absolute;
  top: 18px;
  right: 18px;
  background: var(--st-ink-dark);
  color: #fff;
  border-radius: 8px;
  padding: 12px 20px 14px;
  min-width: 150px;
  text-align: center;
  .c-main {
    font-size: 44px;
    font-weight: 700;
    line-height: 1.05;
    .suit-S { color: #fff; }
    .suit-H { color: #ff6b6b; }
    .suit-D { color: #7fb2ff; }
    .suit-C { color: #6fdc8c; }
    .suit-N { color: #fff; }
  }
  .c-sub {
    font-size: 18px;
    opacity: 0.85;
    margin-top: 2px;
  }
}
.hand {
  align-self: center;
  justify-self: center;
  min-width: 230px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 2px solid transparent;
  &.to-play {
    border-color: rgba(176, 132, 40, 0.55);
    background: rgba(255, 255, 255, 0.35);
  }
}
.hand-N { grid-column: 2; grid-row: 1; }
.hand-W { grid-column: 1; grid-row: 2; justify-self: start; }
.hand-E { grid-column: 3; grid-row: 2; justify-self: end; }
.hand-S { grid-column: 2; grid-row: 3; }
.seat-name {
  font-size: 19px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--st-muted);
  margin-bottom: 4px;
  white-space: nowrap;
  .seat-label {
    font-weight: 700;
    color: var(--st-ink);
    &.vul { color: var(--st-red); }
  }
  .player {
    text-transform: none;
    letter-spacing: 0;
    margin-left: 10px;
    font-size: 20px;
  }
}
.suit-row {
  display: flex;
  align-items: baseline;
  font-size: 36px;
  line-height: 1.22;
  white-space: nowrap;
  .sym {
    width: 40px;
    flex: none;
  }
}
.rank {
  margin-right: 9px;
  font-weight: 600;
  color: var(--st-ink);
  transition: color 0.2s, opacity 0.2s;
  &.played {
    color: #b9ae98;
    font-weight: 400;
    text-decoration: line-through;
    text-decoration-thickness: 2px;
    text-decoration-color: rgba(185, 174, 152, 0.7);
  }
  &.legal {
    cursor: pointer;
    &:hover { color: #9a6b00; }
  }
}
.void { color: var(--st-muted); }
.trick-area {
  grid-column: 2;
  grid-row: 2;
  position: relative;
  width: 300px;
  height: 300px;
  justify-self: center;
  align-self: center;
}
.lead-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 21px;
  color: var(--st-muted);
  font-style: italic;
}
.trick-card {
  position: absolute;
  width: 84px;
  height: 116px;
  background: #fff;
  border: 1px solid #d6ccb6;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  animation: tc-in 0.18s ease-out;
  .tc-rank { font-size: 38px; font-weight: 700; line-height: 1; }
  .tc-suit { font-size: 40px; line-height: 1.1; }
  .lead-mark {
    position: absolute;
    top: -26px;
    font-size: 15px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #8a6a1e;
    font-weight: 700;
  }
  &.leader { border: 2px solid #b08428; }
  &.winner { box-shadow: 0 0 0 4px rgba(176, 132, 40, 0.35), 0 2px 6px rgba(0, 0, 0, 0.12); }
}
.tc-N { left: 108px; top: 0; }
.tc-S { left: 108px; bottom: 0; }
.tc-W { left: 0; top: 92px; }
.tc-E { right: 0; top: 92px; }
.tc-S .lead-mark { top: auto; bottom: -26px; }
@keyframes tc-in {
  from { transform: scale(0.85); opacity: 0; }
  to { transform: none; opacity: 1; }
}
.play-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  background: #fff;
  border: 1px solid var(--st-cream-edge);
  border-radius: 10px;
  padding: 0 10px;
}
.pb-btn {
  font: inherit;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.06em;
  background: var(--st-ink-dark);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 10px 22px;
  cursor: pointer;
  &:disabled { opacity: 0.25; cursor: default; }
}
.pb-mid {
  display: flex;
  align-items: center;
  gap: 26px;
  font-size: 22px;
  .pb-trick { font-weight: 700; letter-spacing: 0.08em; }
  .pb-count { color: var(--st-muted); }
  .pb-var {
    background: #b08428;
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 4px 10px;
    border-radius: 4px;
  }
  .pb-claim { color: var(--st-muted); font-style: italic; }
}
</style>

<template>
  <div class="auction">
    <table>
      <thead>
        <tr class="vul-bars">
          <th v-for="s in COLS" :key="s"><div class="bar" :class="{ vul: isVul(board.vul, sideOf(s)) }"></div></th>
        </tr>
        <tr>
          <th v-for="s in COLS" :key="s" class="col-head">
            <div class="seat">{{ SEAT_NAMES[s] }}</div>
            <div class="name">{{ board.players?.[s] ?? "" }}</div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i">
          <td v-for="(cell, j) in row" :key="j" :class="{ allpass: cell?.allPass }">
            <template v-if="cell">
              <span v-if="cell.allPass">All Pass</span>
              <template v-else>
                <span v-if="cell.level">{{ cell.level }}<span :class="'suit-' + cell.strain">{{ cell.symbol }}</span></span>
                <span v-else :class="{ dbl: cell.text !== 'Pass' }">{{ cell.text }}</span>
                <sup v-if="cell.note">{{ cell.note }}</sup>
              </template>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="board.auction.length === 0" class="empty">No auction</div>
    <ol class="notes" v-if="notes.length">
      <li v-for="n in notes" :key="n.no"><sup>{{ n.no }}</sup> <span v-html="withSymbols(n.text)"></span></li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Seat, SEAT_NAMES, StudioBoard, SUIT_SYMBOL, isVul, sideOf } from "../model/types";

const props = defineProps<{ board: StudioBoard }>();
const COLS: Seat[] = ["W", "N", "E", "S"];

interface Cell {
  level?: number;
  strain?: string;
  symbol?: string;
  text?: string;
  note?: number;
  allPass?: boolean;
}

const model = computed(() => {
  const calls = props.board.auction;
  const notes: { no: number; text: string }[] = [];
  const cells: (Cell | undefined)[] = [];
  for (let i = 0; i < COLS.indexOf(props.board.dealer); i++) cells.push(undefined);
  let end = calls.length;
  const allPass = calls.length >= 4 && calls.slice(-3).every((c) => c.call === "P") && calls.some((c) => c.call !== "P") && calls.slice(-3).every((c) => c.alert === undefined);
  if (allPass) end -= 3;
  calls.slice(0, end).forEach((c) => {
    const cell: Cell = {};
    const m = c.call.match(/^([1-7])([CDHSN])$/);
    if (m) {
      cell.level = parseInt(m[1]);
      cell.strain = m[2];
      cell.symbol = m[2] === "N" ? "NT" : SUIT_SYMBOL[m[2]];
    } else cell.text = c.call === "P" ? "Pass" : c.call === "X" ? "Dbl" : "Rdbl";
    if (c.alert !== undefined) {
      cell.note = notes.length + 1;
      notes.push({ no: cell.note, text: c.alert || "alerted" });
    }
    cells.push(cell);
  });
  if (allPass) cells.push({ allPass: true });
  const rows: (Cell | undefined)[][] = [];
  for (let i = 0; i < cells.length; i += 4) rows.push([...cells.slice(i, i + 4), undefined, undefined, undefined].slice(0, 4));
  return { rows, notes };
});
const rows = computed(() => model.value.rows);
const notes = computed(() => model.value.notes);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** "!S" / "!H" style suit marks (BBO) and bare suit symbols get the suit colours */
function withSymbols(t: string): string {
  return esc(t)
    .replace(/!([SHDC])/gi, (_m, s: string) => `<span class="suit-${s.toUpperCase()}">${SUIT_SYMBOL[s.toUpperCase()]}</span>`)
    .replace(/[♠♥♦♣]/g, (s) => `<span class="suit-${"SHDC"["♠♥♦♣".indexOf(s)]}">${s}</span>`);
}
</script>

<style scoped lang="scss">
.auction {
  background: #fff;
  border: 1px solid var(--st-cream-edge);
  border-radius: 10px;
  padding: 18px 18px 14px;
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.vul-bars th {
  padding: 0 4px 6px;
}
.bar {
  height: 10px;
  border-radius: 3px;
  background: #cfe3c6;
  &.vul { background: var(--st-red); }
}
.col-head {
  text-align: left;
  padding: 0 6px 10px;
  border-bottom: 2px solid var(--st-ink-dark);
  .seat {
    font-size: 19px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .name {
    font-size: 16px;
    font-weight: 400;
    color: var(--st-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: 1.2em;
  }
}
td {
  font-size: 28px;
  padding: 7px 6px;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 1px solid #efe8d8;
  sup {
    font-size: 15px;
    color: #8a6a1e;
    margin-left: 2px;
    font-weight: 700;
  }
  .dbl { color: var(--st-red); }
  &.allpass { font-weight: 400; font-style: italic; font-size: 24px; }
}
tbody td:not(:has(*)) { color: transparent; }
.empty {
  color: var(--st-muted);
  font-style: italic;
  font-size: 20px;
  padding: 12px 6px;
}
.notes {
  list-style: none;
  padding: 12px 4px 0;
  margin: 8px 0 0;
  border-top: 1px solid #efe8d8;
  font-size: 19px;
  line-height: 1.35;
  li { margin-bottom: 4px; }
  sup { color: #8a6a1e; font-weight: 700; }
}
</style>

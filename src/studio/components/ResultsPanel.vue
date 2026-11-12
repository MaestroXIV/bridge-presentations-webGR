<template>
  <div class="results" v-if="table">
    <h3>Other tables</h3>
    <p class="summary">{{ table.summary }}</p>
    <table>
      <thead>
        <tr>
          <th>Contract</th>
          <th>By</th>
          <th class="r">Res</th>
          <th class="r">Score {{ table.side === "EW" ? "E-W" : "N-S" }}</th>
          <th class="r">Tbl</th>
          <th class="r" v-if="table.valueKind">{{ table.valueKind === "MP" ? "%" : "IMPs" }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in visibleRows" :key="i" :class="{ mine: r.mine }">
          <td><span class="c-contract">{{ parts(r)[0] }}<span :class="'suit-' + r.strain">{{ parts(r)[1] }}</span>{{ parts(r)[2] }}</span></td>
          <td>{{ r.declarer }}</td>
          <td class="r">{{ r.result }}</td>
          <td class="r">{{ r.score === undefined ? "" : r.score > 0 ? "+" + r.score : r.score }}</td>
          <td class="r">{{ r.count }}</td>
          <td class="r" v-if="table.valueKind">{{ fmtValue(r.value) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="more" v-if="hidden > 0">… {{ hidden }} more {{ hidden === 1 ? "result" : "results" }}</div>
  </div>
  <div class="note" v-else-if="note">
    <p v-for="(para, i) in note.split(/\n{2,}/)" :key="i">{{ para }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { buildFrequencyTable } from "../model/travellers";
import { Scoring, StudioBoard, SUIT_SYMBOL } from "../model/types";
import type { FrequencyRow } from "../model/travellers";

const props = defineProps<{ board: StudioBoard; scoring?: Scoring }>();
const MAX_ROWS = 15;

const table = computed(() => {
  const t = props.board.travellers;
  if (!t || t.length === 0) return undefined;
  return buildFrequencyTable(t, props.board.vul, props.board.scoring ?? props.scoring, props.board.mySide ?? "NS");
});
const note = computed(() => props.board.note?.trim());
/** keep the own row visible even when the table is cut */
const visibleRows = computed(() => {
  const rows = table.value?.rows ?? [];
  if (rows.length <= MAX_ROWS) return rows;
  const cut = rows.slice(0, MAX_ROWS);
  const mine = rows.find((r) => r.mine);
  if (mine && !cut.includes(mine)) cut[MAX_ROWS - 1] = mine;
  return cut;
});
const hidden = computed(() => (table.value?.rows.length ?? 0) - visibleRows.value.length);
/** "4♠×" → ["4", "♠", "×"] so the suit can be coloured */
function parts(r: FrequencyRow): [string, string, string] {
  if (!r.strain) return [r.contract, "", ""];
  const sym = SUIT_SYMBOL[r.strain];
  const i = r.contract.indexOf(sym);
  return i < 0 ? [r.contract, "", ""] : [r.contract.slice(0, i), sym, r.contract.slice(i + sym.length)];
}
function fmtValue(v: number | undefined) {
  if (v === undefined) return "";
  if (table.value?.valueKind === "IMP") return (v > 0 ? "+" : "") + v.toFixed(1);
  return v.toFixed(0);
}
</script>

<style scoped lang="scss">
.results,
.note {
  background: #fff;
  border: 1px solid var(--st-cream-edge);
  border-radius: 10px;
  padding: 18px 20px;
}
h3 {
  margin: 0 0 6px;
  font-family: var(--st-serif);
  font-size: 26px;
}
.summary {
  margin: 0 0 14px;
  font-size: 21px;
  line-height: 1.3;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 20px;
}
th {
  text-align: left;
  font-size: 15px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--st-muted);
  font-weight: 600;
  padding: 0 6px 6px;
  border-bottom: 2px solid var(--st-ink-dark);
}
td {
  padding: 6px 6px;
  border-bottom: 1px solid #efe8d8;
  white-space: nowrap;
}
.r { text-align: right; }
tr.mine td {
  background: #fff2c4;
  font-weight: 700;
}
tr.mine td:first-child { box-shadow: inset 4px 0 0 #b08428; }
.c-contract { font-weight: 600; }
.more {
  margin-top: 8px;
  color: var(--st-muted);
  font-size: 17px;
}
.note {
  font-size: 23px;
  line-height: 1.4;
  p { margin: 0 0 12px; }
  p:last-child { margin-bottom: 0; }
}
</style>

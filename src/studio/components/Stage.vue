<template>
  <div class="stage" :class="{ collapsed: !hasLeft }" ref="root">
    <header class="stage-head">
      <span class="s-title">{{ title }}</span>
      <span class="s-date" v-if="date">{{ date }}</span>
    </header>
    <section class="zone-left">
      <results-panel v-if="hasLeft" :board="board" :scoring="scoring" />
    </section>
    <section class="zone-centre">
      <deal-panel :board="board" :play="play" :scoring="scoring" />
    </section>
    <section class="zone-right">
      <auction-table :board="board" :shown="play.callsShown.value" />
    </section>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import DealPanel from "./DealPanel.vue";
import AuctionTable from "./AuctionTable.vue";
import ResultsPanel from "./ResultsPanel.vue";
import { Scoring, StudioBoard } from "../model/types";
import type { BoardPlay } from "../useBoardPlay";

const props = defineProps<{ board: StudioBoard; play: BoardPlay; title: string; date?: string; scoring?: Scoring }>();
const root = ref<HTMLElement>();
const hasLeft = computed(() => (props.board.travellers?.length ?? 0) > 0 || !!props.board.note?.trim());
defineExpose({ root });
</script>

<style lang="scss">
.stage {
  --st-cream: #f6eedb;
  --st-cream-edge: #e3d6b8;
  --st-ink: #1d1d1f;
  --st-ink-dark: #22303f;
  --st-muted: #6e6658;
  --st-red: #c8262c;
  --st-serif: Georgia, "Times New Roman", serif;
  box-sizing: border-box;
  position: relative;
  width: 1920px;
  height: 1080px;
  background: #fbf9f4;
  color: var(--st-ink);
  font-family: "Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif;
  font-variant-emoji: text;
  display: grid;
  grid-template-columns: 500px 1fr 440px;
  grid-template-rows: 44px 1fr;
  column-gap: 36px;
  row-gap: 18px;
  padding: 30px 44px 40px;
  overflow: hidden;
  isolation: isolate;
  user-select: none;

  &.collapsed {
    grid-template-columns: 440px 1fr 440px;
  }
  .stage-head {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: 18px;
    border-bottom: 1px solid var(--st-cream-edge);
    .s-title {
      font-family: var(--st-serif);
      font-size: 26px;
      font-weight: 700;
    }
    .s-date {
      color: var(--st-muted);
      font-size: 19px;
    }
  }
  .zone-left,
  .zone-right {
    min-height: 0;
    overflow: hidden;
  }
  .zone-centre {
    min-width: 0;
    min-height: 0;
  }
  .suit-S { color: #111; }
  .suit-H { color: #d01f2a; }
  .suit-D { color: #1d5fd6; }
  .suit-C { color: #138a36; }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
}
</style>

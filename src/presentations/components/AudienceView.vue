<template>
  <div class="audience-view">
    <game-view :game="game" :handsVisible="handsVisible" :interactive="false" class="game-view"
      :endMessage="options?.uiOptions?.endMessage" :vertical-card-layout="options?.uiOptions?.verticalLayout ?? false" />
    <div class="side-panel">
      <status-panel :game="game" :class="{ 'appear': game.bidding }" />
      <bidding-history-view :auction="game?.auction" v-show="showBiddingHistory" class="appear" />
    </div>
    <div class="waiting" v-if="!connected">
      <div class="waiting-box">
        <div class="waiting-title">Audience window</div>
        <div v-if="!available">This browser does not support BroadcastChannel; the audience window needs a current Chrome, Edge, Firefox or Safari.</div>
        <div v-else>Waiting for the presentation… Keep this window open on the projector or share it in your video call; the teacher window drives it.</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import PlayerFactory from "@/bridge/factory/PlayerFactory";
import { Position, PositionHelper } from "@/bridge/model/Position";
import { PresentationGame, PresentationGameOptions } from "@/bridge/model/PresentationGame";
import { ConfiguratorOptions } from "@/presentations/class/options";
import { ScriptAction } from "@/presentations/class/script";
import { BroadcastChannelTransport, Message, TeacherState } from "@/presentations/class/transport";
import { useGameRef } from "@/presenter/composables/useGameRef";
import { useReplay } from "@/presentations/composables/useReplay";
import GameView from "@/presenter/components/GameView.vue";
import StatusPanel from "@/presenter/components/StatusPanel.vue";
import BiddingHistoryView from "@/presenter/components/BiddingHistoryView.vue";

const players = PlayerFactory.makePlayers();
const game = useGameRef(new PresentationGame(players, PresentationGameOptions.Default));
const replay = useReplay(game);
const options = ref<ConfiguratorOptions | undefined>();
const handsVisible = ref<Map<Position, boolean>>(new Map(PositionHelper.all().map((p) => [p, true])));
const connected = ref(false);

const transport = new BroadcastChannelTransport();
const available = transport.available;
const id = Math.random().toString(36).slice(2, 10);
let currentGameId = -1;

/** "b:1S" | "c:SA" | "claim:9" → ScriptAction */
function keysToActions(keys: string[]): ScriptAction[] {
  const out: ScriptAction[] = [];
  for (const k of keys) {
    if (k.startsWith("b:")) out.push({ t: "bid", bid: k.slice(2) });
    else if (k.startsWith("c:")) out.push({ t: "play", card: k.slice(2) });
    else if (k.startsWith("claim:")) out.push({ t: "claim", tricks: parseInt(k.slice(6)) });
  }
  return out;
}

function startGame(opts: ConfiguratorOptions, history: string[]) {
  const gameOpts = new PresentationGameOptions(
    opts.bidding, opts.fake?.ns, opts.fake?.ew, opts.contract, opts.trumps,
    opts.dummy, opts.staticDummyPosition, opts.activePositions,
  );
  game.value = new PresentationGame(players, gameOpts, opts.vulnerability);
  PlayerFactory.putHands(players, opts.cards);
  replay.start({ ...opts, script: { label: "audience", actions: keysToActions(history) } });
  nextTick(() => game.value.start(opts.firstPlayer as Position, opts.trumps));
}

function applyState(st: TeacherState) {
  connected.value = true;
  options.value = st.options;
  handsVisible.value = new Map<Position, boolean>([
    [Position.North, st.visible.north],
    [Position.East, st.visible.east],
    [Position.South, st.visible.south],
    [Position.West, st.visible.west],
  ]);
  if (st.gameId !== currentGameId) {
    currentGameId = st.gameId;
    busy = false;
    startGame(st.options, st.history);
  } else {
    replay.script.value = { label: "audience", actions: keysToActions(st.history) };
    sync();
  }
}

/**
 * Moves the local game towards the teacher's history: undo while the local
 * history is longer or has diverged, otherwise perform the next action. Each
 * step triggers game events, which re-run this until both match.
 */
let busy = false; // an undo or step is in flight until the history is rebuilt
function sync() {
  if (busy || !replay.script.value) return;
  const behind = replay.history.value.length > replay.actions.value.length;
  if (replay.branchedAt.value !== undefined || behind) {
    busy = true;
    game.value.undo();
    return;
  }
  if (replay.canStep.value) busy = replay.step();
}

watch(() => replay.changes.value, () => {
  busy = false;
  sync();
});
watch(() => replay.pending.value, () => sync());

const unsubscribe = transport.onMessage((msg: Message) => {
  if (msg.t === "state") applyState(msg.state);
});

let pingTimer: ReturnType<typeof setInterval> | undefined;
function bye() {
  transport.send({ t: "bye", id });
}

onMounted(() => {
  transport.send({ t: "hello", id });
  pingTimer = setInterval(() => transport.send({ t: "ping", id }), 3000);
  window.addEventListener("pagehide", bye);
});

onUnmounted(() => {
  if (pingTimer) clearInterval(pingTimer);
  window.removeEventListener("pagehide", bye);
  bye();
  unsubscribe();
  transport.close();
});

const showBiddingHistory = computed(
  () => (game.value.state === "cardplay" || game.value.state === "finished") && game.value.bidding,
);
</script>

<style lang="scss">
.audience-view {
  width: 100%;
  height: 100vh;
  padding: 0 20px;
  display: grid;
  grid-template-columns: 1fr 100vh minmax(300px, 2fr);
  background-color: black;
  position: relative;

  ::selection {
    color: none;
    background: none;
  }

  .game-view {
    grid-column: 2;
  }

  .side-panel {
    grid-column: 3;
    display: flex;
    flex-direction: column;
    gap: 40px;
    align-items: center;
  }

  .waiting {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
    color: #ddd;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

    .waiting-box {
      max-width: 480px;
      padding: 24px 28px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      font-size: 15px;
      line-height: 1.5;
    }
    .waiting-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 10px;
      color: #fff;
    }
  }
}
</style>

/**
 * Replays a Script (the recorded auction and play of a deal) through the
 * live PresentationGame, one action at a time, using the same player APIs the
 * bidding box and the control panel use. Because the game stays fully
 * interactive, the teacher can take over at any card: the moment a manual
 * action differs from the script, the replay marks a branch point and stops
 * following the script. Undo works as usual — the position on the script is
 * recomputed from the game's history after every change, so stepping back to
 * before the branch point puts the replay back on the actual line.
 */
import { computed, ref, watch, type Ref, onUnmounted } from "vue";
import { PresentationGame } from "@/bridge/model/PresentationGame";
import { PresentationPlayer } from "@/bridge/model/PresentationPlayer";
import { Player } from "@/bridge/model/Player";
import { PositionHelper, Side } from "@/bridge/model/Position";
import {
  Script,
  ScriptAction,
  actionKey,
  bidFromKey,
  bidKey,
  cardKey,
  simulateScript,
  ScriptSimulation,
} from "@/presentations/class/script";
import { ConfiguratorOptions } from "@/presentations/class/options";

export type ReplayStopAt = "lead" | "trick" | "end";

export interface HistoryEntry {
  key: string;
  label: string;
  kind: "bid" | "play";
}

export function useReplay(game: Ref<PresentationGame>) {
  const script = ref<Script | undefined>();
  const simulation = ref<ScriptSimulation | undefined>();

  /** what the game has done so far, in order, as comparable keys */
  const history = ref<HistoryEntry[]>([]);
  /** the player the game is currently waiting for, and what kind of action */
  const pending = ref<{ player: PresentationPlayer; kind: "bid" | "play" } | undefined>();

  const autoplay = ref(false);
  const stopAt = ref<ReplayStopAt>("lead");
  const speedMs = ref(900);
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: Array<() => void> = [];

  const actions = computed<ScriptAction[]>(() => script.value?.actions ?? []);

  /** index of the first history entry that differs from the script, if any */
  const branchedAt = computed<number | undefined>(() => {
    const h = history.value;
    const a = actions.value;
    for (let i = 0; i < h.length; i++) {
      if (i >= a.length) return i;
      if (actionKey(a[i]) !== h[i].key) return i;
    }
    return undefined;
  });

  const onScript = computed(() => script.value !== undefined && branchedAt.value === undefined);
  /** next script action to perform, when still on script */
  const nextAction = computed<ScriptAction | undefined>(() =>
    onScript.value ? actions.value[history.value.length] : undefined,
  );
  const finished = computed(() => onScript.value && history.value.length >= actions.value.length);
  const canStep = computed(() => {
    const n = nextAction.value;
    if (!n) return false;
    if (n.t === "claim") return game.value.state === "cardplay";
    return pending.value?.kind === n.t;
  });

  const cardsPlayed = computed(() => history.value.filter((h) => h.kind === "play").length);
  const trickNumber = computed(() => Math.floor(cardsPlayed.value / 4) + 1);

  function rebuildHistory() {
    const g = game.value;
    const h: HistoryEntry[] = [];
    g.auction?.bids.forEach((b) =>
      h.push({ key: `b:${bidKey(b.bid)}`, label: b.bid.toString(), kind: "bid" }),
    );
    g.tricks.forEach((t) =>
      t.cards.forEach((c) =>
        h.push({ key: `c:${cardKey(c.card)}`, label: c.card.toShortString(), kind: "play" }),
      ),
    );
    history.value = h;
  }

  function clearAutoTimer() {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = undefined;
  }

  /** Performs the next scripted action. Returns false if nothing could be done. */
  function step(): boolean {
    clearAutoTimer();
    const next = nextAction.value;
    if (!next) return false;
    const g = game.value;

    if (next.t === "claim") {
      if (g.state !== "cardplay" || !simulation.value?.declarer) return false;
      const declSide = PositionHelper.side(simulation.value.declarer);
      const won = g.trickCount(declSide);
      const finishedTricks = g.tricks.filter((t) => t.isFinished).length;
      const remaining = 13 - finishedTricks;
      const extraDecl = Math.max(0, Math.min(remaining, next.tricks - won));
      const extraNS = declSide === Side.NS ? extraDecl : remaining - extraDecl;
      g.claim(extraNS);
      return true;
    }

    const p = pending.value;
    if (!p || p.kind !== next.t) return false;

    if (next.t === "bid") {
      const bid = bidFromKey(next.bid);
      if (!bid) return false;
      return p.player.bid(bid);
    }

    const card = p.player.hand.cards.find((c) => cardKey(c) === next.card);
    if (!card) return false;
    return p.player.playCard(card);
  }

  /** Whether autoplay should hand control back before the pending action. */
  function shouldPauseBefore(): boolean {
    const p = pending.value;
    if (stopAt.value === "end" || !p || p.kind !== "play") return false;
    if (stopAt.value === "lead") return cardsPlayed.value === 0; // stop before the opening lead
    return cardsPlayed.value > 0 && cardsPlayed.value % 4 === 0; // stop before each new trick
  }

  function scheduleAuto() {
    clearAutoTimer();
    if (!autoplay.value || !onScript.value) return;
    if (finished.value || shouldPauseBefore()) {
      autoplay.value = false;
      return;
    }
    autoTimer = setTimeout(() => {
      if (!autoplay.value) return;
      if (!step()) autoplay.value = false;
    }, speedMs.value);
  }

  /** Auto-plays the script until the chosen stop point. */
  function play(until: ReplayStopAt = stopAt.value) {
    stopAt.value = until;
    autoplay.value = true;
    if (canStep.value) step();
    else scheduleAuto();
  }

  function pause() {
    autoplay.value = false;
    clearAutoTimer();
  }

  function toggleAuto() {
    if (autoplay.value) pause();
    else play("end");
  }

  let returningToScript = false;
  /** Undoes step by step until the game is back on the recorded line. */
  function backToScript() {
    if (branchedAt.value === undefined) return;
    pause();
    returningToScript = true;
    game.value.undo();
  }

  function attach(g: PresentationGame) {
    unsubscribe.forEach((u) => u());
    unsubscribe = [];
    pending.value = undefined;

    Object.values(g.players).forEach((player: Player) => {
      unsubscribe.push(
        player.bidRequested.sub(({ player }) => {
          pending.value = { player: player as PresentationPlayer, kind: "bid" };
          scheduleAuto();
        }),
        player.playRequested.sub(({ player }) => {
          pending.value = { player: player as PresentationPlayer, kind: "play" };
          scheduleAuto();
        }),
        player.bidRequestCancelled.sub(() => (pending.value = undefined)),
        player.playRequestCancelled.sub(() => (pending.value = undefined)),
      );
    });

    const onChange = () => {
      rebuildHistory();
      if (!onScript.value) pause();
      if (returningToScript) {
        if (onScript.value) returningToScript = false;
        else setTimeout(() => g.undo(), 120);
      }
    };
    unsubscribe.push(
      g.bidMade.sub(onChange),
      g.cardPlayed.sub(onChange),
      g.undoMade.sub(onChange),
      g.claimMade.sub(() => rebuildHistory()),
      g.gameEnded.sub(() => pause()),
    );
    rebuildHistory();
  }

  /** Call when a new game starts with the given options. */
  function start(opts: ConfiguratorOptions) {
    pause();
    script.value = opts.script;
    simulation.value = opts.script
      ? simulateScript(opts.cards, opts.firstPlayer, opts.script.actions)
      : undefined;
    history.value = [];
    attach(game.value);
  }

  watch(game, (g) => attach(g));
  onUnmounted(() => {
    pause();
    unsubscribe.forEach((u) => u());
  });

  return {
    script,
    simulation,
    history,
    actions,
    branchedAt,
    onScript,
    nextAction,
    finished,
    canStep,
    cardsPlayed,
    trickNumber,
    autoplay,
    stopAt,
    speedMs,
    step,
    play,
    pause,
    toggleAuto,
    backToScript,
    start,
  };
}

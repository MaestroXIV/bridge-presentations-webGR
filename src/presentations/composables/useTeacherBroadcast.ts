/**
 * Teacher side of the audience window: broadcasts the presenter's state
 * (options, action history, hand visibility) after every change, answers
 * "hello" from newly opened audience windows, and counts the windows that
 * are alive.
 */
import { computed, onUnmounted, ref, watch, type Ref } from "vue";
import { PresentationGame } from "@/bridge/model/PresentationGame";
import { Position } from "@/bridge/model/Position";
import { ConfiguratorOptions } from "@/presentations/class/options";
import {
  BroadcastChannelTransport,
  HandVisibility,
  Message,
  TeacherState,
  openAudienceWindow,
} from "@/presentations/class/transport";
import type { useReplay } from "./useReplay";

const PING_TIMEOUT_MS = 8000;

export function useTeacherBroadcast(
  game: Ref<PresentationGame>,
  replay: ReturnType<typeof useReplay>,
  handsVisible: Ref<Map<Position, boolean>>,
) {
  const transport = new BroadcastChannelTransport();
  const available = transport.available;

  let gameId = 0;
  let options: ConfiguratorOptions | undefined;
  const audiences = ref(new Map<string, number>()); // id → last seen
  const audienceCount = computed(() => audiences.value.size);

  function visibility(): HandVisibility {
    const v = handsVisible.value;
    return {
      north: v.get(Position.North) ?? true,
      east: v.get(Position.East) ?? true,
      south: v.get(Position.South) ?? true,
      west: v.get(Position.West) ?? true,
    };
  }

  function currentState(): TeacherState | undefined {
    if (!options) return undefined;
    return {
      gameId,
      options,
      history: replay.history.value.map((h) => h.key),
      visible: visibility(),
    };
  }

  function broadcast() {
    const state = currentState();
    if (state) transport.send({ t: "state", state });
  }

  /** Call when a new game starts (same moment as replay.start). */
  function start(opts: ConfiguratorOptions) {
    gameId++;
    options = opts;
    broadcast();
  }

  const unsubscribe = transport.onMessage((msg: Message) => {
    if (msg.t === "hello" || msg.t === "ping") {
      audiences.value.set(msg.id, Date.now());
      audiences.value = new Map(audiences.value);
      if (msg.t === "hello") broadcast();
    } else if (msg.t === "bye") {
      audiences.value.delete(msg.id);
      audiences.value = new Map(audiences.value);
    }
  });

  // any change of the game history or of hand visibility → broadcast
  watch(() => replay.changes.value, broadcast);
  watch(handsVisible, broadcast, { deep: true });
  watch(() => game.value.state, broadcast);

  const sweep = setInterval(() => {
    const now = Date.now();
    let changed = false;
    audiences.value.forEach((seen, id) => {
      if (now - seen > PING_TIMEOUT_MS) {
        audiences.value.delete(id);
        changed = true;
      }
    });
    if (changed) audiences.value = new Map(audiences.value);
  }, 2000);

  onUnmounted(() => {
    clearInterval(sweep);
    unsubscribe();
    transport.close();
  });

  return { available, audienceCount, start, broadcast, openAudienceWindow };
}

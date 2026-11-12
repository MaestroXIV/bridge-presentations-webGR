<template>
  <div
    v-show="visible && stream"
    class="head-circle"
    :class="{ dragging }"
    :style="{ width: size + 'px', height: size + 'px', left: pos.x + 'px', top: pos.y + 'px' }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <video ref="video" autoplay muted playsinline :class="{ mirrored: mirror }"></video>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";

export type HeadCorner = "tl" | "tr" | "bl" | "br";

const props = defineProps<{
  stream?: MediaStream;
  size: number;
  mirror: boolean;
  visible: boolean;
  snap: boolean;
  /** stage size in stage pixels and the current on-screen scale */
  stageW: number;
  stageH: number;
  scale: number;
  modelValue: { x: number; y: number };
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: { x: number; y: number }): void }>();

const MARGIN = 28;
const video = ref<HTMLVideoElement>();
const pos = ref({ ...props.modelValue });
const dragging = ref(false);
let start = { px: 0, py: 0, x: 0, y: 0 };

watch(
  () => props.modelValue,
  (v) => (pos.value = { ...v }),
);
function attach() {
  if (video.value) video.value.srcObject = props.stream ?? null;
}
watch(() => props.stream, attach);
onMounted(attach);

function clamp(p: { x: number; y: number }) {
  return {
    x: Math.min(Math.max(p.x, 0), props.stageW - props.size),
    y: Math.min(Math.max(p.y, 0), props.stageH - props.size),
  };
}
/** nearest corner, keeping a margin */
function snapped(p: { x: number; y: number }) {
  const right = p.x + props.size / 2 > props.stageW / 2;
  const bottom = p.y + props.size / 2 > props.stageH / 2;
  return {
    x: right ? props.stageW - props.size - MARGIN : MARGIN,
    y: bottom ? props.stageH - props.size - MARGIN : MARGIN,
  };
}
watch(
  () => props.size,
  () => {
    pos.value = props.snap ? snapped(pos.value) : clamp(pos.value);
    emit("update:modelValue", pos.value);
  },
);

function onDown(e: PointerEvent) {
  dragging.value = true;
  start = { px: e.clientX, py: e.clientY, x: pos.value.x, y: pos.value.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onMove(e: PointerEvent) {
  if (!dragging.value) return;
  const s = props.scale || 1;
  pos.value = clamp({ x: start.x + (e.clientX - start.px) / s, y: start.y + (e.clientY - start.py) / s });
}
function onUp() {
  if (!dragging.value) return;
  dragging.value = false;
  if (props.snap) pos.value = snapped(pos.value);
  emit("update:modelValue", pos.value);
}
</script>

<style scoped>
.head-circle {
  position: absolute;
  z-index: 20;
  border-radius: 50%;
  overflow: hidden;
  border: 5px solid #fff;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
  background: #2b2b2b;
  cursor: grab;
  touch-action: none;
  transition: left 0.18s ease-out, top 0.18s ease-out, width 0.18s, height 0.18s;
}
.head-circle.dragging {
  cursor: grabbing;
  transition: none;
}
video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
video.mirrored {
  transform: scaleX(-1);
}
</style>

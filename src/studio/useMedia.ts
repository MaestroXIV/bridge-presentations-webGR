/**
 * Camera and microphone for the head circle and the recording. Devices are
 * opened only when the presenter asks; streams never leave the page.
 */
import { onUnmounted, ref, watch } from "vue";

const LS_CAM = "bridge-presenter-cam";
const LS_MIC = "bridge-presenter-mic";

export function useMedia() {
  const cameras = ref<MediaDeviceInfo[]>([]);
  const mics = ref<MediaDeviceInfo[]>([]);
  const camId = ref(localStorage.getItem(LS_CAM) ?? "");
  const micId = ref(localStorage.getItem(LS_MIC) ?? "");
  const camStream = ref<MediaStream>();
  const micStream = ref<MediaStream>();
  const micLevel = ref(0);
  const error = ref("");
  let audioCtx: AudioContext | undefined;
  let raf = 0;

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    cameras.value = all.filter((d) => d.kind === "videoinput");
    mics.value = all.filter((d) => d.kind === "audioinput");
  }

  async function startCamera() {
    error.value = "";
    stopCamera();
    try {
      camStream.value = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: camId.value ? { exact: camId.value } : undefined, width: { ideal: 720 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      await refreshDevices();
    } catch (e) {
      error.value = `Camera: ${(e as Error).message}`;
    }
  }
  function stopCamera() {
    camStream.value?.getTracks().forEach((t) => t.stop());
    camStream.value = undefined;
  }

  function meter(stream: MediaStream) {
    cancelAnimationFrame(raf);
    audioCtx?.close();
    audioCtx = new AudioContext();
    const src = audioCtx.createMediaStreamSource(stream);
    const an = audioCtx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      micLevel.value = micLevel.value * 0.7 + (peak / 128) * 0.3;
      raf = requestAnimationFrame(tick);
    };
    tick();
  }

  async function startMic(): Promise<boolean> {
    error.value = "";
    stopMic();
    try {
      micStream.value = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: micId.value ? { exact: micId.value } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      meter(micStream.value);
      await refreshDevices();
      return true;
    } catch (e) {
      error.value = `Microphone: ${(e as Error).message}`;
      return false;
    }
  }
  function stopMic() {
    cancelAnimationFrame(raf);
    audioCtx?.close();
    audioCtx = undefined;
    micLevel.value = 0;
    micStream.value?.getTracks().forEach((t) => t.stop());
    micStream.value = undefined;
  }

  watch(camId, (id) => {
    localStorage.setItem(LS_CAM, id);
    if (camStream.value) startCamera();
  });
  watch(micId, (id) => {
    localStorage.setItem(LS_MIC, id);
    if (micStream.value) startMic();
  });

  navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
  refreshDevices();
  onUnmounted(() => {
    stopCamera();
    stopMic();
    navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  });

  return { cameras, mics, camId, micId, camStream, micStream, micLevel, error, startCamera, stopCamera, startMic, stopMic, refreshDevices };
}

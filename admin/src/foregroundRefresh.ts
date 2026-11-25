import { onMounted, onUnmounted } from "vue";

/** Revalidate only while the page is visible. Callers guard edits and writes. */
export function useForegroundRefresh(refresh: () => void, interval = 0) {
  let lastRun = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  function run() {
    const now = Date.now();
    if (document.visibilityState === "hidden" || now - lastRun < 750) return;
    lastRun = now;
    refresh();
  }
  onMounted(() => {
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    if (interval) timer = setInterval(run, interval);
  });
  onUnmounted(() => {
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", run);
    clearInterval(timer);
  });
}

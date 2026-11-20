import { onUnmounted, ref, watch } from "vue";
import { currentUser, errorMessage, request } from "./api";
import { displayDate } from "./forms";

type RosterRow = {
  name: string;
  maskedPhone: string;
  status: "CONFIRMED" | "CANCELLED";
  createdAt: string;
};

function saveCsv(entries: RosterRow[], title: string) {
  const quote = (value: string) => {
    const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows = [["姓名", "手机号（脱敏）", "报名状态", "报名时间（北京时间）"]];
  for (const entry of entries) {
    rows.push([
      entry.name, entry.maskedPhone,
      entry.status === "CONFIRMED" ? "已报名" : "已取消",
      displayDate(entry.createdAt),
    ]);
  }
  const csv = rows.map((row) => row.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  const name = title.replace(/[<>:"/\\|?*]/g, "_").trim().slice(0, 80);
  link.download = `${name ? name + "-" : ""}报名名单-脱敏.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useRosterExport() {
  const exporting = ref(false);
  const exportError = ref("");
  let controller: AbortController | undefined;

  function resetExport() {
    controller?.abort();
    controller = undefined;
    exporting.value = false;
    exportError.value = "";
  }

  watch(currentUser, resetExport, { flush: "sync" });
  onUnmounted(resetExport);

  async function downloadRoster(activityId: string, title: string, filters?: { query: string; status: string }) {
    if (exporting.value || currentUser.value?.role !== "ADMIN" || !activityId) return;
    const attempt = new AbortController();
    controller = attempt;
    exporting.value = true;
    exportError.value = "";
    const params = new URLSearchParams();
    if (filters?.query) params.set("query", filters.query);
    if (filters?.status) params.set("status", filters.status);
    const endpoint = `/admin/activities/${encodeURIComponent(activityId)}/registrations/export`;
    try {
      const entries = await request<RosterRow[]>(params.size ? `${endpoint}?${params}` : endpoint, {
        signal: attempt.signal, cache: "no-store",
      });
      if (attempt.signal.aborted) return;
      if (!entries.length) exportError.value = "没有可导出的报名记录。";
      else saveCsv(entries, title);
    } catch (e) {
      if (!attempt.signal.aborted) exportError.value = errorMessage(e);
    } finally {
      if (!attempt.signal.aborted) {
        controller = undefined;
        exporting.value = false;
      }
    }
  }

  return { exporting, exportError, downloadRoster, resetExport };
}

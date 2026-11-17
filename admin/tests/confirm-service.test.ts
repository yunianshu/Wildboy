import { afterEach, expect, it } from "vitest";
import { nextTick } from "vue";
import { askConfirm } from "../src/confirm";
import { currentUser } from "../src/api";

afterEach(() => {
  currentUser.value = null;
  document.body.replaceChildren();
});
it("cancels without performing the action and restores the opener", async () => {
  currentUser.value = { id: "admin", nickname: "管理员", role: "ADMIN" };
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const result = askConfirm("确认取消报名？");
  await nextTick();
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(
    document.querySelector('[role="dialog"]')?.contains(document.activeElement),
  ).toBe(true);
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  expect(await result).toBe(false);
  await nextTick();
  expect(document.activeElement).toBe(opener);
});
it("rejects duplicate prompts and cancels a pending decision when the identity changes", async () => {
  currentUser.value = { id: "admin", nickname: "管理员", role: "ADMIN" };
  const result = askConfirm("确认批准全额退款？");
  expect(await askConfirm("确认批准全额退款？")).toBe(false);
  currentUser.value = null;
  expect(await result).toBe(false);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

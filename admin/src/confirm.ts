import { createVNode, render, watch } from "vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import { currentUser } from "./api";

let pending = false;

/** The same confirmation shell for actions and unsaved-change guards. */
type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
};

export function askConfirm(options: string | ConfirmationOptions): Promise<boolean> {
  const description = typeof options === "string" ? options : options.description;
  if (pending) return Promise.resolve(false);
  pending = true;
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.append(host);
    let settled = false;
    let stop = () => {};
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      stop();
      render(null, host);
      host.remove();
      pending = false;
      resolve(accepted);
    };
    stop = watch(currentUser, () => finish(false), { flush: "sync" });
    const discard = /未保存|丢弃|放弃|清空/.test(description);
    const label = discard
      ? "放弃修改"
      : /查看/.test(description)
        ? "确认查看"
        : /下架/.test(description)
          ? "确认下架"
          : /补报|上报/.test(description)
            ? "确认补报"
            : /批准/.test(description)
              ? "批准退款"
              : /重试/.test(description)
                ? "确认重试"
                : /关闭/.test(description)
                  ? "关闭订单"
                  : /取消/.test(description)
                    ? "确认取消"
                    : "确认继续";
    render(
      createVNode(ConfirmDialog, {
        title: discard ? "放弃未保存的修改？" : label,
        description,
        confirmLabel: label,
        danger: discard || /取消|下架|关闭/.test(label),
        ...(typeof options === "string" ? {} : options),
        onConfirm: () => finish(true),
        onCancel: () => finish(false),
      }),
      host,
    );
  });
}

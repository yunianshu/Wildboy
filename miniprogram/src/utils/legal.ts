import { request } from "./api";
export interface LegalDocument {
  kind: "PRIVACY" | "TERMS";
  version: number;
  title: string;
  content: string;
  publishedAt: string;
}
export interface LegalCurrent {
  ready: boolean;
  privacy: LegalDocument | null;
  terms: LegalDocument | null;
}
export interface LegalVersions {
  privacyVersion: number;
  termsVersion: number;
}
export function versionsOf(current: LegalCurrent): LegalVersions {
  if (
    !current?.ready ||
    current.privacy?.kind !== "PRIVACY" ||
    current.terms?.kind !== "TERMS" ||
    !Number.isInteger(current.privacy.version) ||
    current.privacy.version < 1 ||
    !Number.isInteger(current.terms.version) ||
    current.terms.version < 1 ||
    !current.privacy.content?.trim() ||
    !current.terms.content?.trim()
  )
    throw new Error("运营方尚未发布完整隐私政策和用户协议，请稍后再试");
  return {
    privacyVersion: current.privacy.version,
    termsVersion: current.terms.version,
  };
}
export function sameVersions(a: LegalVersions, b: LegalVersions) {
  return (
    a.privacyVersion === b.privacyVersion && a.termsVersion === b.termsVersion
  );
}
export async function currentLegal() {
  const current = await request<LegalCurrent>("/legal/current");
  versionsOf(current);
  return current;
}
export function legalLink(
  kind: "PRIVACY" | "TERMS",
  current?: LegalCurrent | null,
) {
  const version =
    kind === "PRIVACY" ? current?.privacy?.version : current?.terms?.version;
  return (
    "/pages/privacy/index?kind=" + kind + (version ? "&version=" + version : "")
  );
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  request,
  acceptAuth,
  clearSession,
  currentUser,
  ApiError,
  errorMessage,
} from "../src/api";
beforeEach(() => clearSession());
describe("API boundary", () => {
  it("requires admin role before retaining token", () => {
    expect(() =>
      acceptAuth({
        token: "x",
        user: { id: "u", nickname: "u", role: "USER" },
      }),
    ).toThrow();
    expect(currentUser.value).toBeNull();
  });
  it("uses bearer token only in memory and omits browser cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    acceptAuth({
      token: "secret-test",
      user: { id: "a", nickname: "admin", role: "ADMIN" },
    });
    await request("/me");
    expect(fetchMock.mock.calls[0]?.[1].headers.Authorization).toBe(
      "Bearer secret-test",
    );
    expect(fetchMock.mock.calls[0]?.[1].credentials).toBe("omit");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it("clears auth on expired session", async () => {
    acceptAuth({ token: "x", user: { id: "a", nickname: "a", role: "ADMIN" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: "EXPIRED", message: "请重新登录" }),
      }),
    );
    await expect(request("/me")).rejects.toMatchObject({ status: 401 });
    expect(currentUser.value).toBeNull();
  });
  it("does not expire a new login when an old session returns 401", async () => {
    acceptAuth({
      token: "old",
      user: { id: "a", nickname: "a", role: "ADMIN" },
    });
    let respond!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((r) => (respond = r))),
    );
    const pending = expect(request("/me")).rejects.toMatchObject({
      code: "SESSION_CHANGED",
    });
    acceptAuth({
      token: "new",
      user: { id: "b", nickname: "b", role: "ADMIN" },
    });
    respond({
      ok: false,
      status: 401,
      json: async () => ({ code: "EXPIRED" }),
    });
    await pending;
    expect(currentUser.value?.id).toBe("b");
  });
  it("rejects private data that arrives after logout", async () => {
    acceptAuth({
      token: "old",
      user: { id: "a", nickname: "a", role: "ADMIN" },
    });
    let respond!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((r) => (respond = r))),
    );
    const pending = expect(request("/admin/orders")).rejects.toMatchObject({
      code: "SESSION_CHANGED",
    });
    clearSession();
    respond({ ok: true, status: 200, json: async () => ({ private: true }) });
    await pending;
    expect(currentUser.value).toBeNull();
  });
  it("reports stale version without automatic overwrite", () =>
    expect(errorMessage(new ApiError(409, "VERSION_CONFLICT", "x"))).toContain(
      "不会自动覆盖",
    ));
  it("handles non-JSON server failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error("html");
        },
      }),
    );
    await expect(request("/me")).rejects.toMatchObject({
      status: 503,
      code: "REQUEST_FAILED",
    });
  });
});

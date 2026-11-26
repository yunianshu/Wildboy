import { afterEach, expect, it, vi } from "vitest";
import { imageSize, uploadAdminImage, uploadSize } from "../src/image-upload";

const mime = "image/png";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function fixture(width = 1, height = 1, bytes = 0) {
  const data = Uint8Array.from(Buffer.from(png, "base64"));
  new DataView(data.buffer).setUint32(16, width);
  new DataView(data.buffer).setUint32(20, height);
  return new File([data, new ArrayBuffer(bytes)], "fixture.png", {
    type: mime,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const success = {
  ok: true,
  status: 200,
  json: async () => ({ url: "/assets/uploads/photo.png" }),
};

function mockEncoder(sizes: number[]) {
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 6000, height: 4000, close })),
  );
  const ctx = { drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) =>
    cb(new Blob([new ArrayBuffer(sizes.shift()!)], { type: mime })),
  );
  return { close, ctx };
}

it("reads JPEG dimensions and respects the side, pixel and aspect-ratio limits", () => {
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0, 8, 8, 0x0f, 0xa0, 0x17, 0x70, 1,
  ]);
  expect(imageSize(jpeg.buffer, "image/jpeg")).toEqual({
    width: 6000,
    height: 4000,
  });
  expect(uploadSize(9000, 1000)).toEqual({ width: 6000, height: 666 });
  const result = uploadSize(6000, 4000);
  expect(result.width * result.height).toBeLessThanOrEqual(16_000_000);
  expect(result.width / result.height).toBeCloseTo(1.5, 2);
});

it("sends an already compliant image byte-for-byte, without decoding", async () => {
  const fetch = vi.fn().mockResolvedValue(success);
  const decode = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("createImageBitmap", decode);
  await expect(uploadAdminImage(fixture(), () => true)).resolves.toEqual({
    url: "/assets/uploads/photo.png",
  });
  expect(JSON.parse(fetch.mock.calls[0]![1].body).dataBase64).toBe(png);
  expect(decode).not.toHaveBeenCalled();
});

it("shrinks oversized pixels or bytes, and only sends the final fitting image", async () => {
  const fetch = vi.fn().mockResolvedValue(success);
  vi.stubGlobal("fetch", fetch);
  const { ctx, close } = mockEncoder([4 * 1024 * 1024, 500]);
  await uploadAdminImage(fixture(6000, 4000, 5 * 1024 * 1024), () => true);
  expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  const [, , , w, h] = ctx.drawImage.mock.calls[0]!;
  expect(w * h).toBeLessThanOrEqual(16_000_000);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(
    Buffer.from(JSON.parse(fetch.mock.calls[0]![1].body).dataBase64, "base64"),
  ).toHaveLength(500);
  expect(close).toHaveBeenCalledOnce();
});

it("only retries the server image validation rejection and stops when the caller is stale", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ code: "INVALID_IMAGE" }),
    })
    .mockResolvedValue(success);
  vi.stubGlobal("fetch", fetch);
  mockEncoder([500]);
  await uploadAdminImage(fixture(), () => true);
  expect(fetch).toHaveBeenCalledTimes(2);
  await uploadAdminImage(fixture(), () => false);
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockRejectedValueOnce(new Error("offline"));
  await expect(uploadAdminImage(fixture(), () => true)).rejects.toThrow(
    "offline",
  );
  expect(fetch).toHaveBeenCalledTimes(3);
});

import { describe, expect, it } from "vitest";
import { articleStatusLabel } from "../src/statusTone";

describe("article status labels", () => {
  it("tells an unpublished article apart from a never-published draft", () => {
    expect(articleStatusLabel({ status: "PUBLISHED" })).toBe("已发布");
    expect(
      articleStatusLabel({
        status: "DRAFT",
        publishedAt: "2026-11-01T00:00:00Z",
      }),
    ).toBe("已下架");
    expect(articleStatusLabel({ status: "DRAFT", publishedAt: null })).toBe(
      "草稿",
    );
    expect(articleStatusLabel({ status: "DRAFT" })).toBe("草稿");
  });
});

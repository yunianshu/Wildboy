import { describe, it, expect } from "vitest";
import {
  toShanghaiInput,
  fromShanghaiInput,
  validateActivity,
  imageUrlValid,
} from "../src/forms";
import type { ActivityInput } from "../src/types";
const valid: ActivityInput = {
  title: "周末徒步",
  category: "WEEKLY",
  coverUrl: "/assets/hiking.jpg",
  galleryUrls: [],
  summary: "轻松山野之旅",
  description: "带上水和合适装备，一起出发。",
  location: "厦门",
  meetingPoint: "地铁站 A 出口",
  startAt: "2027-01-02T09:00:00+08:00",
  endAt: "2027-01-02T17:00:00+08:00",
  registrationDeadline: "2027-01-01T18:00:00+08:00",
  capacity: 20,
  priceCents: 0,
};
describe("Shanghai date boundaries", () => {
  it("normalizes UTC into Shanghai regardless of host timezone", () =>
    expect(toShanghaiInput("2027-01-01T18:30:00Z")).toBe("2027-01-02T02:30"));
  it("serializes explicit +08 offset", () =>
    expect(fromShanghaiInput("2027-01-02T09:00")).toBe(
      "2027-01-02T09:00:00+08:00",
    ));
  it.each(["", "invalid", "2027-02-30T09:00", "2027-01-02T25:00"])(
    "rejects invalid time %s",
    (v) => expect(fromShanghaiInput(v)).toBe(""),
  );
});
describe("activity form validation", () => {
  it("accepts valid free activity", () =>
    expect(validateActivity(valid)).toEqual({}));
  it("rejects paid activities", () =>
    expect(
      validateActivity({ ...valid, priceCents: 1 }).priceCents,
    ).toBeTruthy());
  it("rejects capacity reduction below confirmed members", () =>
    expect(
      validateActivity({ ...valid, capacity: 4 }, 5).capacity,
    ).toBeTruthy());
  it.each([0, -1, 1.5, 10001, NaN])("rejects invalid capacity %s", (capacity) =>
    expect(validateActivity({ ...valid, capacity }).capacity).toBeTruthy(),
  );
  it("requires end after start and registration before start", () => {
    const errors = validateActivity({
      ...valid,
      endAt: valid.startAt,
      registrationDeadline: valid.endAt,
    });
    expect(errors.endAt).toBeTruthy();
    expect(errors.registrationDeadline).toBeTruthy();
  });
  it("rejects empty or long required text", () => {
    expect(validateActivity({ ...valid, title: " " }).title).toBeTruthy();
    expect(
      validateActivity({ ...valid, summary: "x".repeat(301) }).summary,
    ).toBeTruthy();
  });
  it.each([
    "javascript:alert(1)",
    "http://example.com/a.jpg",
    "//evil.com/a",
    "/assets/../secret",
    "https://user:pass@example.com/a",
  ])("rejects unsafe image %s", (url) =>
    expect(imageUrlValid(url)).toBe(false),
  );
  it("accepts safe hosted or bundled images", () => {
    expect(imageUrlValid("https://images.example.com/a.jpg")).toBe(true);
    expect(imageUrlValid("/assets/hiking.jpg")).toBe(true);
  });
});

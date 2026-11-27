import { maxBoardingPointLength, maxBoardingPoints } from "./forms";
import type { ActivityInput, BoardingPointLocation, NavigationPoint } from "./types";

export function boardingDisplayName(row: BoardingPointLocation) {
  return row.displayName?.trim() || row.address || row.name;
}

// Registration records have a shorter key than a full navigation address.
export function boardingName(address: string, names: Iterable<string>) {
  if (address.length <= maxBoardingPointLength) return address;
  const used = new Set(names);
  let suffix = "…";
  for (let i = 2; ; i++) {
    const name =
      address.slice(0, maxBoardingPointLength - suffix.length) + suffix;
    if (!used.has(name)) return name;
    suffix = "…" + i;
  }
}

export function activityStops(
  activity: Pick<
    ActivityInput,
    "boardingPoints" | "navigationPoints" | "meetingPoint"
  >,
) {
  const boardingPoints = [...(activity.boardingPoints || [])];
  const navigationPoints: NavigationPoint[] = [];
  const points = activity.navigationPoints || [];
  for (const point of points) {
    const address = point.address?.trim();
    if (
      point.kind === "MEETING" &&
      point.label === "示例集合点" &&
      address &&
      address !== point.label
    ) {
      const match = [...points, ...navigationPoints].find(
        (p) => p.kind === "BOARDING" && (p.address || p.label) === address,
      );
      const name = match?.label || boardingName(address, boardingPoints);
      if (
        boardingPoints.includes(name) ||
        boardingPoints.length < maxBoardingPoints
      ) {
        if (!boardingPoints.includes(name)) boardingPoints.push(name);
        if (
          !match &&
          !navigationPoints.some(
            (p) => p.kind === "BOARDING" && p.label === name,
          )
        ) {
          navigationPoints.push({
            ...point,
            kind: "BOARDING",
            label: name,
            address,
          });
        }
        continue;
      }
    }
    navigationPoints.push({ ...point });
  }
  const addresses = boardingPoints.map(
    (name) =>
      navigationPoints.find((p) => p.kind === "BOARDING" && p.label === name)
        ?.address || name,
  );
  const meeting = activity.meetingPoint?.trim() || "";
  const meetingPoint =
    meeting === "示例集合点"
      ? navigationPoints.find(
          (p) => p.kind === "MEETING" && p.address && p.address !== meeting,
        )?.address || ""
      : meeting;
  return {
    boardingPoints,
    navigationPoints,
    addresses,
    meetingPoint: addresses.some(
      (a) => a === meetingPoint || a.slice(0, 200) === meetingPoint,
    )
      ? ""
      : meetingPoint,
  };
}

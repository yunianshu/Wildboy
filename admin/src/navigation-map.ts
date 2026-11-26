export type Coordinate = { latitude: number; longitude: number };
export type MapPlace = Coordinate & { title: string; address: string };

export const pickerOrigin = "https://apis.map.qq.com";
export const mapKey = () =>
  (import.meta.env.VITE_TENCENT_MAP_PICKER_KEY || "").trim();

export function coordinate(lng: unknown, lat: unknown): Coordinate | null {
  return typeof lng === "number" &&
    Math.abs(lng) <= 180 &&
    typeof lat === "number" &&
    Math.abs(lat) <= 90
    ? { latitude: lat, longitude: lng }
    : null;
}

export function pickerUrl(
  point: Coordinate = { latitude: 24.479834, longitude: 118.089425 },
) {
  const url = new URL("/tools/locpicker", pickerOrigin);
  url.search = new URLSearchParams({
    type: "1",
    search: "1",
    referer: "WildBoy",
    key: mapKey(),
    coordtype: "5",
    coord: `${point.latitude},${point.longitude}`,
  }).toString();
  return url.href;
}

export function readSelection(data: unknown): MapPlace | null {
  if (!data || typeof data !== "object") return null;
  const result = data as Record<string, unknown>;
  if (
    result.module !== "locationPicker" ||
    !result.latlng ||
    typeof result.latlng !== "object"
  )
    return null;
  const { lat, lng } = result.latlng as Record<string, unknown>;
  const point = coordinate(lng, lat);
  if (!point) return null;
  const name = typeof result.poiname === "string" ? result.poiname.trim() : "";
  const address =
    typeof result.poiaddress === "string" ? result.poiaddress.trim() : "";
  return {
    ...point,
    title: (name || address || "地图标记点").slice(0, 200),
    address: address.slice(0, 300),
  };
}

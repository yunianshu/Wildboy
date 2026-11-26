export type Coordinate = [longitude: number, latitude: number];

export type MapPlace = {
  title: string;
  address: string;
  latitude: number;
  longitude: number;
};

type LngLat = { getLng(): number; getLat(): number };
type MapInstance = {
  on(event: "click", callback: (event: { lnglat: LngLat }) => void): void;
  setCenter(center: Coordinate): void;
  destroy(): void;
};
type MapSdk = {
  Map: new (
    container: HTMLElement,
    options: { center: Coordinate; zoom: number },
  ) => MapInstance;
  Marker: new (options: { map: MapInstance; position: Coordinate }) => {
    setPosition(position: Coordinate): void;
  };
  PlaceSearch: new (options: { pageSize: number }) => {
    search(
      keyword: string,
      callback: (
        status: string,
        result: {
          poiList?: {
            pois?: { name?: string; address?: string; location?: LngLat }[];
          };
        },
      ) => void,
    ): void;
  };
  Geocoder: new () => {
    getAddress(
      coordinate: Coordinate,
      callback: (
        status: string,
        result: {
          regeocode?: { formattedAddress?: string };
        },
      ) => void,
    ): void;
  };
};
type MapWindow = Window & {
  AMap?: MapSdk;
  _AMapSecurityConfig?: { serviceHost: string };
};

export function coordinate(lng: unknown, lat: unknown): Coordinate | null {
  return typeof lng === "number" &&
    Math.abs(lng) <= 180 &&
    typeof lat === "number" &&
    Math.abs(lat) <= 90
    ? [lng, lat]
    : null;
}

export function readLngLat(value?: LngLat): Coordinate | null {
  return coordinate(value?.getLng?.(), value?.getLat?.());
}

export const mapKey = () => (import.meta.env.VITE_AMAP_JS_KEY || "").trim();

let loading: Promise<MapSdk> | undefined;
export function loadNavigationMap(): Promise<MapSdk> {
  const key = mapKey();
  if (!key) return Promise.reject(new Error("Missing map key"));
  if (loading) return loading;
  const browser = window as MapWindow;
  browser._AMapSecurityConfig = {
    serviceHost: location.origin + "/_AMapService",
  };
  loading = new Promise<MapSdk>((resolve, reject) => {
    const script = document.createElement("script");
    const url = new URL("https://webapi.amap.com/maps");
    url.search = new URLSearchParams({
      v: "2.0",
      key,
      plugin: "AMap.PlaceSearch,AMap.Geocoder",
    }).toString();
    script.src = url.href;
    script.async = true;
    const timeout = window.setTimeout(fail, 10000);
    function fail() {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error("Map SDK unavailable"));
    }
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timeout);
      const sdk = browser.AMap;
      if (sdk?.Map && sdk.Marker && sdk.PlaceSearch && sdk.Geocoder)
        resolve(sdk);
      else fail();
    };
    document.head.append(script);
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

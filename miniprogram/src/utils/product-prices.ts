import { money } from "./shop";

/** Missing legacy fields never invent a discount or change the transaction price. */
export function originalPriceText(current: number | undefined, original: number | undefined): string {
  return Number.isSafeInteger(current) && Number.isSafeInteger(original) &&
    current! >= 1 && original! > current! && original! <= 100000000 ? money(original!) : "";
}

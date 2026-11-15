import { money } from "./money";

/** Only a whole non-negative cent amount renders as a price; anything else stays blank. */
export function priceText(cents: number | undefined): string {
  return typeof cents === "number" && Number.isSafeInteger(cents) && cents >= 0
    ? money(cents)
    : "";
}

/** Missing legacy fields never invent a discount or change the transaction price. */
export function originalPriceText(current: number | undefined, original: number | undefined): string {
  return Number.isSafeInteger(current) && Number.isSafeInteger(original) &&
    current! >= 1 && original! > current! && original! <= 100000000 ? money(original!) : "";
}

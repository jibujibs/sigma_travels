import type { ShortlistItem } from "../../shared/flights";
import { buildItineraryPdf, type PdfCustomer } from "../../shared/itineraryPdf";

export { buildItineraryPdf, type PdfCustomer } from "../../shared/itineraryPdf";

export async function downloadItineraryPdf(customer: PdfCustomer, items: ShortlistItem[]): Promise<void> {
  if (!items.length) return;
  const { bytes, filename } = await buildItineraryPdf(customer, items);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** PDF bytes → base64 for the email request. */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Prices are shown in the currency of the airport the trip starts from (the international standard:
 * a ticket bought from India is priced in rupees, one from the USA in dollars). An airport we don't
 * know is priced in US dollars.
 */

/** Country (ISO 3166 alpha-2) of each airport in shared/airports.ts, plus a few other common ones. */
const COUNTRY: Record<string, string> = {
  // India
  ...Object.fromEntries("COK TRV CCJ CNN BLR MAA BOM DEL HYD CCU AMD PNQ GOI GOX JAI LKO CJB IXM TRZ IXE VNS ATQ IXC BBI GAU IDR NAG SXR IXZ".split(" ").map((c) => [c, "IN"])),
  // Middle East
  DXB: "AE", AUH: "AE", SHJ: "AE", DOH: "QA", MCT: "OM", BAH: "BH", KWI: "KW", RUH: "SA", JED: "SA", DMM: "SA", AMM: "JO", TLV: "IL",
  // Asia and Oceania
  SIN: "SG", KUL: "MY", BKK: "TH", HKT: "TH", DPS: "ID", CGK: "ID", HKG: "HK", HND: "JP", NRT: "JP", KIX: "JP", ICN: "KR", PEK: "CN",
  PVG: "CN", TPE: "TW", MNL: "PH", HAN: "VN", SGN: "VN", CMB: "LK", MLE: "MV", KTM: "NP", DAC: "BD", KHI: "PK", SYD: "AU", MEL: "AU",
  BNE: "AU", PER: "AU", AKL: "NZ",
  // Europe
  LHR: "GB", LGW: "GB", MAN: "GB", EDI: "GB", DUB: "IE", CDG: "FR", AMS: "NL", FRA: "DE", MUC: "DE", BER: "DE", ZRH: "CH", GVA: "CH",
  VIE: "AT", FCO: "IT", MXP: "IT", MAD: "ES", BCN: "ES", LIS: "PT", ATH: "GR", IST: "TR", CPH: "DK", ARN: "SE", OSL: "NO", HEL: "FI",
  BRU: "BE", PRG: "CZ", WAW: "PL", BUD: "HU", KEF: "IS",
  // Americas
  ...Object.fromEntries("SFO SJC LAX SAN SEA LAS JFK EWR LGA BOS IAD DCA ORD DFW DAL IAH ATL MIA MCO DEN PHX OAK SMF PDX MSP DTW PHL CLT AUS SLC".split(" ").map((c) => [c, "US"])),
  YYZ: "CA", YVR: "CA", YUL: "CA", YYC: "CA", MEX: "MX", CUN: "MX", GRU: "BR", GIG: "BR", EZE: "AR", LIM: "PE", BOG: "CO",
  // Africa
  JNB: "ZA", CPT: "ZA", NBO: "KE", CAI: "EG", ADD: "ET", CMN: "MA", LOS: "NG", MRU: "MU", SEZ: "SC", ZNZ: "TZ",
};

const EURO = new Set(["IE", "FR", "NL", "DE", "AT", "IT", "ES", "PT", "GR", "FI", "BE"]);
const CURRENCY_OF_COUNTRY: Record<string, string> = {
  IN: "INR", US: "USD", AE: "AED", QA: "QAR", OM: "OMR", BH: "BHD", KW: "KWD", SA: "SAR", JO: "JOD", IL: "ILS",
  SG: "SGD", MY: "MYR", TH: "THB", ID: "IDR", HK: "HKD", JP: "JPY", KR: "KRW", CN: "CNY", TW: "TWD", PH: "PHP", VN: "VND",
  LK: "LKR", MV: "MVR", NP: "NPR", BD: "BDT", PK: "PKR", AU: "AUD", NZ: "NZD",
  GB: "GBP", CH: "CHF", TR: "TRY", DK: "DKK", SE: "SEK", NO: "NOK", CZ: "CZK", PL: "PLN", HU: "HUF", IS: "ISK",
  CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", PE: "PEN", CO: "COP",
  ZA: "ZAR", KE: "KES", EG: "EGP", ET: "ETB", MA: "MAD", NG: "NGN", MU: "MUR", SC: "SCR", TZ: "TZS",
};

/** The default when the starting airport isn't known. */
export const DEFAULT_CURRENCY = "USD";

/** "COK" → "IN"; unknown → "" (callers then use US dollars). from may be "COK,TRV": the first code counts. */
export function countryOfAirport(from: string): string {
  const code = from.split(",")[0]?.trim().toUpperCase() ?? "";
  return COUNTRY[code] ?? "";
}

/** "COK" → "INR", "SFO" → "USD", "DXB" → "AED"; unknown → "USD". */
export function currencyForAirport(from: string): string {
  const c = countryOfAirport(from);
  return EURO.has(c) ? "EUR" : CURRENCY_OF_COUNTRY[c] ?? DEFAULT_CURRENCY;
}

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", GBP: "£", EUR: "€" };

/**
 * Money for people: "₹1,79,038" (Indian grouping), "$2,150", "€1,240", "AED 4,800".
 * No decimals: these are whole-ticket prices. Searches saved before currencies were added are in rupees.
 */
export function money(n: number | null | undefined, currency = "INR"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const cur = (currency || "INR").toUpperCase();
  const amount = Math.round(n).toLocaleString(cur === "INR" ? "en-IN" : "en-US");
  return SYMBOL[cur] ? `${SYMBOL[cur]}${amount}` : `${cur} ${amount}`;
}

/** Same, for the PDF's built-in fonts (no ₹ sign there): "INR 1,79,038", "$2,150". */
export function moneyPdf(n: number, currency = "INR"): string {
  const cur = (currency || "INR").toUpperCase();
  return cur === "INR" ? `INR ${Math.round(n).toLocaleString("en-IN")}` : money(n, cur);
}

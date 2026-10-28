/**
 * Suggestions for the "home airport" and "From" fields, as "City (IATA)".
 * Travellers can still type any city; this list only helps them pick a clear one.
 */
export const AIRPORTS: string[] = [
  // India
  "Kochi (COK)", "Trivandrum (TRV)", "Kozhikode (CCJ)", "Kannur (CNN)", "Bengaluru (BLR)", "Chennai (MAA)",
  "Mumbai (BOM)", "Delhi (DEL)", "Hyderabad (HYD)", "Kolkata (CCU)", "Ahmedabad (AMD)", "Pune (PNQ)",
  "Goa (GOI)", "Goa Mopa (GOX)", "Jaipur (JAI)", "Lucknow (LKO)", "Coimbatore (CJB)",
  "Madurai (IXM)", "Tiruchirappalli (TRZ)", "Mangaluru (IXE)", "Varanasi (VNS)", "Amritsar (ATQ)", "Chandigarh (IXC)",
  "Bhubaneswar (BBI)", "Guwahati (GAU)", "Indore (IDR)", "Nagpur (NAG)", "Srinagar (SXR)", "Port Blair (IXZ)",
  // Middle East
  "Dubai (DXB)", "Abu Dhabi (AUH)", "Sharjah (SHJ)", "Doha (DOH)", "Muscat (MCT)", "Bahrain (BAH)",
  "Kuwait (KWI)", "Riyadh (RUH)", "Jeddah (JED)", "Dammam (DMM)", "Amman (AMM)", "Tel Aviv (TLV)",
  // Asia and Oceania
  "Singapore (SIN)", "Kuala Lumpur (KUL)", "Bangkok (BKK)", "Phuket (HKT)", "Bali Denpasar (DPS)", "Jakarta (CGK)",
  "Hong Kong (HKG)", "Tokyo Haneda (HND)", "Tokyo Narita (NRT)", "Osaka (KIX)", "Seoul (ICN)", "Beijing (PEK)",
  "Shanghai (PVG)", "Taipei (TPE)", "Manila (MNL)", "Hanoi (HAN)", "Ho Chi Minh City (SGN)", "Colombo (CMB)",
  "Male (MLE)", "Kathmandu (KTM)", "Dhaka (DAC)", "Karachi (KHI)", "Sydney (SYD)", "Melbourne (MEL)",
  "Brisbane (BNE)", "Perth (PER)", "Auckland (AKL)",
  // Europe
  "London Heathrow (LHR)", "London Gatwick (LGW)", "Manchester (MAN)", "Edinburgh (EDI)", "Dublin (DUB)", "Paris (CDG)",
  "Amsterdam (AMS)", "Frankfurt (FRA)", "Munich (MUC)", "Berlin (BER)", "Zurich (ZRH)", "Geneva (GVA)",
  "Vienna (VIE)", "Rome (FCO)", "Milan (MXP)", "Madrid (MAD)", "Barcelona (BCN)", "Lisbon (LIS)",
  "Athens (ATH)", "Istanbul (IST)", "Copenhagen (CPH)", "Stockholm (ARN)", "Oslo (OSL)", "Helsinki (HEL)",
  "Brussels (BRU)", "Prague (PRG)", "Warsaw (WAW)", "Budapest (BUD)", "Reykjavik (KEF)",
  // Americas
  "San Francisco (SFO)", "San Jose (SJC)", "Los Angeles (LAX)", "San Diego (SAN)", "Seattle (SEA)", "Las Vegas (LAS)",
  "New York JFK (JFK)", "Newark (EWR)", "Boston (BOS)", "Washington Dulles (IAD)", "Chicago (ORD)", "Dallas (DFW)",
  "Houston (IAH)", "Atlanta (ATL)", "Miami (MIA)", "Orlando (MCO)", "Denver (DEN)", "Phoenix (PHX)",
  "Toronto (YYZ)", "Vancouver (YVR)", "Montreal (YUL)", "Calgary (YYC)", "Mexico City (MEX)", "Cancun (CUN)",
  "São Paulo (GRU)", "Rio de Janeiro (GIG)", "Buenos Aires (EZE)", "Lima (LIM)", "Bogotá (BOG)",
  // Africa
  "Johannesburg (JNB)", "Cape Town (CPT)", "Nairobi (NBO)", "Cairo (CAI)", "Addis Ababa (ADD)", "Casablanca (CMN)",
  "Lagos (LOS)", "Mauritius (MRU)", "Seychelles (SEZ)", "Zanzibar (ZNZ)",
];

/** Other names people say for a city in the list. */
const ALIASES: Record<string, string> = {
  cochin: "Kochi", ernakulam: "Kochi", thiruvananthapuram: "Trivandrum", calicut: "Kozhikode", bombay: "Mumbai",
  bangalore: "Bengaluru", madras: "Chennai", calcutta: "Kolkata", "new delhi": "Delhi", "new york": "New York JFK", nyc: "New York JFK",
};

/**
 * The airport code for a city in the list ("Dubai" → "DXB", "cochin" → "COK"), or "" when the name isn't a
 * city we know (a country such as "Saudi Arabia" stays without a code, so Sunny is asked which city).
 */
export function airportFor(city: string): string {
  const c = city.trim().toLowerCase().replace(/\s+/g, " ");
  if (!c) return "";
  const name = (ALIASES[c] ?? c).toLowerCase();
  const hit = AIRPORTS.find((a) => a.slice(0, a.lastIndexOf(" (")).toLowerCase() === name);
  return hit ? hit.slice(-4, -1) : "";
}

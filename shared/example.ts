import type { Stop, TripBrief, TripPlan } from "./types.js";

/** A sample plan in the same shape Gemini returns, shown before the first search. */
const s = (time: string, name: string, note: string, kind: Stop["kind"] = "visit", closed: number[] = []): Stop => ({ time, name, note, kind, closed });

export const EXAMPLE_BRIEF: TripBrief = {
  idea: "", origin: "Kochi (COK)", start: "2026-11-18", days: 7, pax: 2, budget: "Mid-range", interests: ["History", "Food"],
};

export const EXAMPLE_PLAN: TripPlan = {
  destination: { city: "New Delhi", country: "India", airport: "DEL", currency: "INR", summary: "Mughal monuments, Old Delhi food lanes and a Taj Mahal day trip, based in central Connaught Place." },
  flights: {
    outbound: [
      { airline: "IndiGo", route: "COK → DEL", depart: "06:05", arrive: "09:20", arrive_next_day: false, duration: "3h 15m", stops: "Nonstop", fare_inr: 8450 },
      { airline: "Air India", route: "COK → DEL", depart: "07:00", arrive: "10:15", arrive_next_day: false, duration: "3h 15m", stops: "Nonstop", fare_inr: 9554 },
      { airline: "Air India Express", route: "COK → DEL", depart: "10:40", arrive: "15:55", arrive_next_day: false, duration: "5h 15m", stops: "1 stop via BLR", fare_inr: 7900 },
    ],
    return: [
      { airline: "Air India Express", route: "DEL → COK", depart: "16:30", arrive: "21:50", arrive_next_day: false, duration: "5h 20m", stops: "1 stop via BLR", fare_inr: 7650 },
      { airline: "IndiGo", route: "DEL → COK", depart: "19:10", arrive: "22:25", arrive_next_day: false, duration: "3h 15m", stops: "Nonstop", fare_inr: 8900 },
      { airline: "Air India", route: "DEL → COK", depart: "20:15", arrive: "23:30", arrive_next_day: false, duration: "3h 15m", stops: "Nonstop", fare_inr: 9890 },
    ],
  },
  hotels: [
    { name: "Radisson Blu Marina", area: "Connaught Place", tier: "Mid-range", rate_inr: 10500, why: "Central, walkable, metro at the door" },
    { name: "Hotel Palace Heights", area: "Connaught Place", tier: "Budget", rate_inr: 5200, why: "Good-value boutique rooms" },
    { name: "The Park New Delhi", area: "Parliament Street", tier: "Mid-range", rate_inr: 9500, why: "Design hotel with a pool" },
    { name: "The Imperial", area: "Janpath", tier: "Luxury", rate_inr: 24000, why: "1931 heritage landmark" },
  ],
  hotel_tax_pct: 18,
  cars: [
    { name: "Sedan (Swift Dzire)", company: "Local chauffeur service", seats: 4, daily_inr: 2500, mode: "With driver", includes: "8 hr / 80 km, fuel, driver" },
    { name: "MUV (Ertiga / Innova)", company: "Local chauffeur service", seats: 6, daily_inr: 3500, mode: "With driver", includes: "8 hr / 80 km, fuel, driver" },
    { name: "Innova Crysta", company: "Local chauffeur service", seats: 6, daily_inr: 4500, mode: "With driver", includes: "8 hr / 80 km, fuel, driver" },
  ],
  car_days: 6,
  car_note: "Chauffeur-driven is the norm in Delhi. The Agra day uses the train.",
  food_per_person_day_inr: 1800,
  activities_per_person_inr: 3200,
  days: [
    { title: "Arrive · Old Delhi", stops: [s("10:45", "Driver meets you at arrivals", "{car}", "car"), s("12:00", "Check in · {hotel}", "Base for the trip", "hotel"), s("14:30", "Red Fort", "Mughal palace complex", "visit", [1]), s("16:30", "Chandni Chowk rickshaw ride", "Spice and silver lanes"), s("19:30", "Dinner at Karim's", "Mughlai kebabs since 1913")] },
    { title: "New Delhi landmarks", stops: [s("08:00", "India Gate & Kartavya Path", "Before the crowds"), s("11:00", "Gurudwara Bangla Sahib", "Free community kitchen"), s("15:30", "Humayun's Tomb", "The tomb that inspired the Taj"), s("18:00", "Nizamuddin Dargah", "Qawwali on Thursday evenings")] },
    { title: "South Delhi", stops: [s("08:00", "Qutub Minar", "73 m minaret from 1193"), s("13:00", "Hauz Khas Village", "Lunch by the lake"), s("15:30", "Lotus Temple", "Bahá'í House of Worship", "visit", [1]), s("18:00", "Dilli Haat INA", "Crafts from every state")] },
    { title: "Taj Mahal day trip", stops: [s("07:15", "Drop at Hazrat Nizamuddin station", "{car}", "car"), s("08:10", "Gatimaan Express to Agra", "About 1 hr 40 min"), s("10:15", "Taj Mahal", "Book tickets online", "visit", [5]), s("13:30", "Agra Fort", "Red sandstone fortress"), s("19:30", "Station pickup", "{car}", "car")] },
    { title: "Museums and gardens", stops: [s("10:00", "National Museum", "5,000 years of Indian art", "visit", [1]), s("13:00", "Khan Market", "Cafés and bookshops"), s("15:00", "Lodhi Garden", "15th-century tombs"), s("18:00", "Akshardham", "Temple and water show", "visit", [1])] },
    { title: "Markets and food", stops: [s("08:00", "Sunder Nursery", "Heritage park"), s("12:00", "Janpath Market", "Handicrafts, bargain hard"), s("14:30", "Sarojini Nagar", "Bargain clothing"), s("19:00", "Majnu ka Tilla", "Tibetan momos")] },
    { title: "Shop · fly home", stops: [s("09:00", "Jantar Mantar", "18th-century observatory"), s("12:00", "Check out · {hotel}", "Luggage in the car", "hotel"), s("16:30", "Drop at Delhi airport", "{car}", "car")] },
  ],
  tips: [
    "Many monuments close on Mondays, and the Taj Mahal closes on Fridays.",
    "Check the air quality index each morning from late October.",
    "The Delhi Metro beats traffic for city-centre hops.",
    "Cover shoulders and knees at religious sites.",
    "Book Agra trains on IRCTC well ahead.",
  ],
};

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const needsSchema = z.object({
  flights: z.boolean(),
  hotel: z.boolean(),
  car: z.boolean(),
  itinerary: z.boolean(),
}).refine((n) => n.flights || n.hotel || n.car || n.itinerary, { message: "Choose at least one: flights, hotel, car or day-by-day plan" });

export const briefSchema = z.object({
  idea: z.string().trim().max(500).default(""),
  origin: z.string().trim().min(2).max(80),
  start: isoDate,
  days: z.coerce.number().int().min(1).max(10),
  pax: z.coerce.number().int().min(1).max(6),
  budget: z.enum(["Budget", "Mid-range", "Luxury"]),
  interests: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  needs: needsSchema.optional(),
}).refine((b) => b.idea.length > 0 || b.interests.length > 0, {
  message: "Describe a travel idea or choose at least one interest",
  path: ["idea"],
});

export const recommendRequestSchema = z.object({ brief: briefSchema });

export const intentRequestSchema = z.object({
  idea: z.string().trim().min(1, "Describe what you need").max(500),
  origin: z.string().trim().max(80).default(""),
});

export const planRequestSchema = z.object({
  brief: briefSchema,
  destination: z.object({
    city: z.string().trim().min(1).max(80),
    country: z.string().trim().max(80).default(""),
    airport: z.string().trim().max(4).default(""),
  }),
});

/* ---------- saved trips & Sigma Copilot ---------- */

export const guestIdSchema = z.string().uuid("Invalid guest id");

export const saveTripSchema = z.object({
  guestId: guestIdSchema,
  brief: z.object({
    idea: z.string().max(500).default(""),
    origin: z.string().max(80),
    start: isoDate,
    days: z.coerce.number().int().min(1).max(10),
    pax: z.coerce.number().int().min(1).max(6),
    budget: z.enum(["Budget", "Mid-range", "Luxury"]),
    interests: z.array(z.string().max(30)).max(12).default([]),
    needs: needsSchema.optional(),
  }),
  plan: z.unknown(),
  sel: z.object({
    out: z.number().int().min(0).max(9),
    ret: z.number().int().min(0).max(9),
    hotel: z.number().int().min(0).max(9),
    car: z.number().int().min(0).max(9),
  }),
  carOn: z.boolean(),
  food: z.enum(["street", "mid", "fine"]),
  total: z.number().min(0).max(1e9),
});

export const chatRequestSchema = z.object({
  guestId: guestIdSchema,
  threadId: z.string().uuid("Invalid thread id"),
  message: z.string().trim().min(1, "Type a question").max(1000),
  /** What the traveller sees right now (plan summary, recommendations), built by the browser. */
  context: z.string().max(20_000).default(""),
  /** Recent turns kept by the browser, oldest first. */
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).default([]),
});

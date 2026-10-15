import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const briefSchema = z.object({
  idea: z.string().trim().max(500).default(""),
  origin: z.string().trim().min(2).max(80),
  start: isoDate,
  days: z.coerce.number().int().min(3).max(10),
  pax: z.coerce.number().int().min(1).max(6),
  budget: z.enum(["Budget", "Mid-range", "Luxury"]),
  interests: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
}).refine((b) => b.idea.length > 0 || b.interests.length > 0, {
  message: "Describe a travel idea or choose at least one interest",
  path: ["idea"],
});

export const recommendRequestSchema = z.object({ brief: briefSchema });

export const planRequestSchema = z.object({
  brief: briefSchema,
  destination: z.object({
    city: z.string().trim().min(1).max(80),
    country: z.string().trim().max(80).default(""),
    airport: z.string().trim().max(4).default(""),
  }),
});

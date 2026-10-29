/**
 * Everything that makes the Customer tab a demo, in one place.
 * Before real customers use the page, empty both lists: the chips disappear and the form starts blank.
 */

/** Demo customers: the form starts filled with the first; a chip fills in another. */
export interface DemoCustomer { name: string; phone: string; email: string }
export interface DemoSample { id: string; label: string; voice: string; text: string; meta: string }

export const DEMO_CUSTOMERS: readonly DemoCustomer[] = [
  { name: "Dayalu", phone: "9999999991", email: "djoseph@jibstech.com" },
  { name: "Jimson", phone: "9999999992", email: "jimson@jibstech.com" },
  { name: "Aiswarya", phone: "9999999993", email: "aiswarya@jibstech.com" },
];

/**
 * Sample voice messages (AI voices made once with `npm run samples`, saved in public/samples/).
 * A card loads one into the recorder, so the whole flow can be shown without speaking.
 * `label` is the route on the card, `meta` the line under it; `text` is what the voice says (only the words; nothing else, or it is spoken too); `voice`: Puck or Charon
 * (male), Kore or Aoede (female). scripts/make-samples.mjs reads this list: change it, then run npm run samples.
 */
export const DEMO_SAMPLES: readonly DemoSample[] = [
  {
    id: "dubai-en", label: "Kochi → Dubai", voice: "Puck",
    text: "Hi Sunny, this is a request for two adults from Kochi to Dubai on December 20th, coming back on the 27th. We prefer Emirates. Please call me back. Thank you.",
    meta: "English · 2 adults · return · 0:12",
  },
  {
    id: "doha-ml", label: "Kochi → Doha", voice: "Kore",
    text: "ഹലോ സണ്ണി, ഞാനും എന്റെ അമ്മയും ഡിസംബർ പതിനെട്ടിന് കൊച്ചിയിൽ നിന്ന് ദോഹയിലേക്ക് പോകാൻ ആഗ്രഹിക്കുന്നു. ജനുവരി രണ്ടിന് തിരിച്ചു വരണം. ഖത്തർ എയർവേയ്സ് ആണെങ്കിൽ നല്ലത്. ദയവായി എന്നെ തിരിച്ചു വിളിക്കൂ. നന്ദി.",
    meta: "Malayalam · 2 adults · return · 0:13",
  },
  {
    id: "sfo-en", label: "San Francisco → Kochi", voice: "Charon",
    text: "Hello, we are four adults flying one way from San Francisco to Kochi on December 15th. Any airline is fine, but please find us a good price. Thanks.",
    meta: "English · 4 adults · one way · 0:13",
  },
  {
    id: "saudi-en", label: "Kochi → Riyadh", voice: "Aoede",
    text: "Hi Sunny, three of us want to fly from Kochi to Riyadh on November 15th, one way. Economy is fine. Please send me some options. Thank you.",
    meta: "English · 3 adults · one way · 0:10",
  },
];

export const sampleUrl = (s: DemoSample) => `/samples/${s.id}.wav`;

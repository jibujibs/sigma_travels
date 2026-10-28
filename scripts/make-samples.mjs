// Makes the sample voice messages for the Customer tab with Gemini's text-to-speech.
// Run once on your computer:  npm run samples
// Reads GEMINI_API_KEY from .env.local (it never leaves your computer) and writes public/samples/<id>.wav.
// The texts and voices are in src/customer/demo.ts. Change them there and run again to remake the files.
import { mkdir, readFile, writeFile } from "node:fs/promises";

const key = process.env.GEMINI_API_KEY?.trim();
if (!key) { console.error("GEMINI_API_KEY is missing. Put it in .env.local, then run: npm run samples"); process.exit(1); }
const API = "https://generativelanguage.googleapis.com/v1beta";
const headers = { "content-type": "application/json", "x-goog-api-key": key };

// The list of samples, read from demo.ts (plain data, no TypeScript needed).
const src = await readFile(new URL("../src/customer/demo.ts", import.meta.url), "utf8");
const block = src.slice(src.indexOf("DEMO_SAMPLES"));
const samples = [...block.matchAll(/id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*voice:\s*"([^"]+)",\s*text:\s*"([^"]+)"/g)]
  .map(([, id, label, voice, text]) => ({ id, label, voice, text }));
if (!samples.length) { console.error("No samples found in src/customer/demo.ts."); process.exit(1); }

// Text-to-speech models this key can use, newest first; GEMINI_TTS_MODEL picks one by name.
async function ttsModels() {
  if (process.env.GEMINI_TTS_MODEL) return [process.env.GEMINI_TTS_MODEL.trim()];
  const res = await fetch(`${API}/models?pageSize=1000`, { headers });
  if (!res.ok) throw new Error(`Couldn't list Gemini models (${res.status}). Check the key.`);
  const names = ((await res.json()).models ?? []).map((m) => m.name.replace(/^models\//, "")).filter((n) => /tts/i.test(n));
  if (!names.length) throw new Error("This Gemini key has no text-to-speech model.");
  return names.sort((a, b) => (/flash/.test(b) - /flash/.test(a)) || b.localeCompare(a, undefined, { numeric: true }));
}

/** 16-bit mono PCM (what Gemini returns) → a WAV file. */
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function speak(model, s) {
  const res = await fetch(`${API}/models/${model}:generateContent`, {
    method: "POST", headers,
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Say this naturally, like a customer leaving a voice message for a travel agent:\n${s.text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } } } },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error("No audio came back.");
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? "")?.[1]) || 24000;
  return { file: wav(Buffer.from(part.inlineData.data, "base64"), rate), rate };
}

const models = await ttsModels();
await mkdir(new URL("../public/samples/", import.meta.url), { recursive: true });
let failed = 0;
for (const s of samples) {
  let done = false;
  for (const model of models) {
    try {
      const { file, rate } = await speak(model, s);
      await writeFile(new URL(`../public/samples/${s.id}.wav`, import.meta.url), file);
      console.log(`✓ ${s.id}.wav  ${(file.length / 1024).toFixed(0)} KB  ${((file.length - 44) / (rate * 2)).toFixed(1)} s  (${model}, voice ${s.voice})  ${s.label}`);
      done = true;
      break;
    } catch (e) {
      console.warn(`  ${s.id}: ${model} didn't work: ${e.message}`);
    }
  }
  if (!done) { failed++; console.error(`✗ ${s.id}: no model could make it.`); }
}
console.log(failed ? `\n${failed} sample(s) failed. See the messages above.` : "\nAll samples are in public/samples/. Play them, then run: npm run dev");
process.exit(failed ? 1 : 0);

import { useMemo, useState, type FormEvent } from "react";
import {
  autoSearchBlockers, CABIN_OPTIONS, dayShift, hm, KERALA, queryFromTrip, rupees, SHORTLIST_MAX, shortlistText, stopsOf, suggestions,
  timeOnly, travellers, niceTime, type FlightOption, type FlightQuery, type ShortlistItem,
} from "../../shared/flights";
import type { VoiceRequest } from "../../shared/voice";
import { api } from "../lib/api";
import { AIRPORTS } from "../lib/airports";

type Sort = "best" | "price" | "duration" | "depart";
const QUICK_FROM = ["COK", "TRV", "CCJ", "DFW"];
const PAGE = 12;
const todayIso = () => new Date().toISOString().slice(0, 10);

/** "Kochi (COK), TRV" → "COK,TRV" (up to 3 codes). */
function codesOf(text: string): string {
  const out: string[] = [];
  for (const part of text.split(",")) {
    const m = /\(([A-Za-z]{3})\)/.exec(part) ?? /^\s*([A-Za-z]{3})\s*$/.exec(part);
    if (m) out.push(m[1].toUpperCase());
  }
  return [...new Set(out)].slice(0, 3).join(",");
}

/** "COK,TRV" → "Kochi (COK), Trivandrum (TRV)" using the airport list, so the field reads nicely. */
function labelOf(codes: string): string {
  return codes.split(",").filter(Boolean).map((c) => AIRPORTS.find((a) => a.endsWith(`(${c})`)) ?? c).join(", ");
}

const sorters: Record<Sort, (a: FlightOption, b: FlightOption) => number> = {
  best: () => 0,
  price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  duration: (a, b) => a.minutes - b.minutes,
  depart: (a, b) => a.legs[0].dep.localeCompare(b.legs[0].dep),
};

/**
 * Real flights for one voice message (phase C): a search form filled from the trip (Sunny can change
 * everything), Google Flights results to sort and filter, and Sunny's shortlist to copy for the customer.
 */
export function VoiceFlights({ v, onChange }: { v: VoiceRequest; onChange: (r: VoiceRequest) => void }) {
  const today = todayIso();
  const search = v.flights?.search ?? null;
  const shortlist = v.flights?.shortlist ?? [];
  // The last search, unless Sunny has edited the trip since: then the edited trip (gaps filled from the last search).
  const fromTrip = queryFromTrip(v.trip, today);
  const start: FlightQuery = !search ? fromTrip : !v.trip?.edited ? search.query
    : { ...search.query, ...Object.fromEntries(Object.entries(fromTrip).filter(([k, val]) => val !== "" && !(k === "cabin" && !v.trip?.cabin))) };

  const [from, setFrom] = useState(labelOf(start.from));
  const [to, setTo] = useState(labelOf(start.to));
  const [depart, setDepart] = useState(start.depart);
  const [ret, setRet] = useState(start.return);
  const [oneWay, setOneWay] = useState(!start.return);
  const [adults, setAdults] = useState(start.adults);
  const [children, setChildren] = useState(start.children);
  const [infants, setInfants] = useState(start.infants);
  const [cabin, setCabin] = useState(start.cabin);
  const [stops, setStops] = useState(start.stops);

  const [sort, setSort] = useState<Sort>("best");
  const [nonstopOnly, setNonstopOnly] = useState(false);
  const [airline, setAirline] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [returns, setReturns] = useState<{ forId: string; options: FlightOption[] | null; error?: string } | null>(null);

  const id = (k: string) => `vf-${v.id}-${k}`;
  const blockers = autoSearchBlockers(v.trip, today);
  const travellersNotSaid = !v.trip || v.trip.adults + v.trip.children + v.trip.infants === 0;

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    const q: FlightQuery = { from: codesOf(from), to: codesOf(to).split(",")[0] ?? "", depart, return: oneWay ? "" : ret, adults, children, infants, cabin, stops };
    const problem = !q.from ? "Choose where they fly from: an airport such as Kochi (COK), or press a quick button."
      : !q.to ? "Choose where they fly to: an airport such as Dubai (DXB)."
      : !q.depart ? "Choose the departure date."
      : q.depart < today ? "The departure date has passed."
      : !oneWay && !q.return ? "Choose the return date, or tick One way."
      : q.return && q.return < q.depart ? "The return date is before the departure date."
      : q.infants > q.adults ? "Each infant needs an adult." : "";
    if (problem) return setError(problem);
    setBusy("search");
    setError(undefined);
    setReturns(null);
    setShowAll(false);
    try { onChange((await api.voice.searchFlights(v.id, q)).request); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(undefined); }
  }

  async function loadReturns(o: FlightOption) {
    if (!search || !o.departureToken) return;
    if (returns?.forId === o.id) return setReturns(null);
    setReturns({ forId: o.id, options: null });
    try { setReturns({ forId: o.id, options: (await api.voice.returnFlights(v.id, search.query, o.departureToken)).returns }); }
    catch (err) { setReturns({ forId: o.id, options: [], error: (err as Error).message }); }
  }

  async function saveList(next: ShortlistItem[]) {
    setBusy("save");
    setError(undefined);
    try { onChange((await api.voice.saveShortlist(v.id, next)).request); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(undefined); }
  }

  const add = (out: FlightOption, back: FlightOption | null) => search && void saveList([...shortlist, {
    id: `${out.id}|${back?.id ?? ""}`, out, back, price: back ? back.price : out.price, query: search.query, googleUrl: search.googleUrl, addedAt: new Date().toISOString(),
  }]);
  const inList = (out: FlightOption, back: FlightOption | null) => shortlist.some((s) => s.id === `${out.id}|${back?.id ?? ""}` && s.query.depart === search?.query.depart);
  const full = shortlist.length >= SHORTLIST_MAX;

  const marks = useMemo(() => suggestions(search?.options ?? [], v.trip?.airline ?? ""), [search, v.trip?.airline]);
  const airlines = useMemo(() => [...new Set((search?.options ?? []).map((o) => o.airline))].sort(), [search]);
  const shown = useMemo(() => (search?.options ?? [])
    .filter((o) => (!nonstopOnly || stopsOf(o) === 0) && (!airline || o.airline === airline))
    .sort(sorters[sort]), [search, nonstopOnly, airline, sort]);
  const roundTrip = Boolean(search?.query.return);

  async function copy() {
    try { await navigator.clipboard.writeText(shortlistText(v.name, shortlist)); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    catch { setError("Couldn't copy. Select the text in the preview and copy it by hand."); }
  }

  const num = (k: string, label: string, value: number, set: (n: number) => void, min: number, max: number) => (
    <div className="field"><label className="lbl" htmlFor={id(k)}>{label}</label>
      <select id={id(k)} value={value} onChange={(e) => set(+e.target.value)}>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => <option key={n} value={n}>{n}</option>)}
      </select></div>
  );

  return (
    <section className="vf-box" aria-label={`Flights for ${v.name}`}>
      <div className="vt-head"><h3>✈ Flights <span className="vf-sub">real fares from Google Flights</span></h3></div>

      {!v.flightsSaved && <p className="note small">Search results and Sunny's options aren't kept yet: run <code>alter table public.voice_requests add column if not exists flights jsonb;</code> in the Supabase SQL Editor.</p>}
      {!search && blockers.length > 0 && <p className="vt-missing" role="note">⚠ Not searched yet. Confirm with the customer: {blockers.join(", ")}. Then fill in below and press Search.</p>}
      {!search && v.flights?.note && <p className="warn-text small">{v.flights.note}</p>}

      <form className="vf-form" onSubmit={(e) => void runSearch(e)} noValidate aria-label="Flight search">
        <datalist id={id("airports")}>{AIRPORTS.map((a) => <option key={a} value={a} />)}</datalist>
        <div className="vt-fields">
          <div className="field vf-from"><label className="lbl" htmlFor={id("from")}>From</label>
            <input id={id("from")} list={id("airports")} value={from} placeholder="Choose: e.g. Kochi (COK)" aria-invalid={!codesOf(from)} onChange={(e) => setFrom(e.target.value)} />
            <div className="vf-quick" role="group" aria-label="Quick departure airports">
              {QUICK_FROM.map((c) => <button key={c} type="button" className="chip" aria-pressed={codesOf(from) === c} onClick={() => { setFrom(labelOf(c)); setError(undefined); }}>{c}</button>)}
              <button type="button" className="chip" aria-pressed={codesOf(from) === KERALA} onClick={() => { setFrom(labelOf(KERALA)); setError(undefined); }}>All Kerala airports</button>
            </div></div>
          <div className="field"><label className="lbl" htmlFor={id("to")}>To</label>
            <input id={id("to")} list={id("airports")} value={to} placeholder="Choose: e.g. Dubai (DXB)" aria-invalid={!codesOf(to)} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="field"><label className="lbl" htmlFor={id("depart")}>Depart</label>
            <input id={id("depart")} type="date" min={today} value={depart} aria-invalid={!depart} onChange={(e) => setDepart(e.target.value)} /></div>
          <div className="field"><label className="lbl" htmlFor={id("return")}>Return</label>
            <input id={id("return")} type="date" min={depart || today} value={oneWay ? "" : ret} disabled={oneWay} onChange={(e) => setRet(e.target.value)} /></div>
          <label className="vt-check"><input type="checkbox" checked={oneWay} onChange={(e) => setOneWay(e.target.checked)} /> One way</label>
          {num("adults", "Adults", adults, setAdults, 1, 9)}
          {num("children", "Children", children, setChildren, 0, 8)}
          {num("infants", "Infants (lap)", infants, setInfants, 0, 4)}
          <div className="field"><label className="lbl" htmlFor={id("cabin")}>Class</label>
            <select id={id("cabin")} value={cabin} onChange={(e) => setCabin(e.target.value as FlightQuery["cabin"])}>{CABIN_OPTIONS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label className="lbl" htmlFor={id("stops")}>Stops</label>
            <select id={id("stops")} value={stops} onChange={(e) => setStops(e.target.value as FlightQuery["stops"])}>
              <option value="any">Any</option><option value="nonstop">Nonstop only</option><option value="1">1 stop or fewer</option>
            </select></div>
        </div>
        {travellersNotSaid && <p className="hint small">The customer didn't say how many are travelling; prices are for the travellers chosen here.</p>}
        <div className="vt-head-actions">
          <button type="submit" className="btn solid" disabled={!!busy}>{busy === "search" ? "Searching Google Flights…" : search ? "Search again" : "Search flights"}</button>
          <span className="hint small">Each search uses 1 of the month's SerpApi searches.</span>
        </div>
      </form>

      {error && <p className="err-text" role="alert">{error}</p>}

      {search && (
        <div className="vf-results">
          <p className="vf-summary">
            <b>{search.options.length} flights</b> · {labelOf(search.query.from)} → {labelOf(search.query.to)} · {niceTime(`${search.query.depart} 00:00`).slice(0, -6)}
            {search.query.return && <> – {niceTime(`${search.query.return} 00:00`).slice(0, -6)}</>} · {travellers(search.query)} · {search.query.cabin}
            {search.auto && <span className="vt-tag">Found automatically</span>}
            {search.priceLevel && <span className={`vf-level ${search.priceLevel}`}>Prices are {search.priceLevel} now{search.typical ? ` (usual ${rupees(search.typical[0])}–${rupees(search.typical[1])})` : ""}</span>}
          </p>
          <p className="hint small">Prices are Google's, in ₹, for all {travellers(search.query)}{roundTrip ? ", for the whole return trip" : ""}. Searched {new Date(search.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.</p>

          {search.options.length === 0 ? <p className="note">Google Flights found no flights for these details. Try another date, airport or Stops: Any.</p> : (
            <>
              <div className="vf-tools">
                <div className="vf-sort" role="group" aria-label="Sort flights">
                  {(["best", "price", "duration", "depart"] as Sort[]).map((s) => (
                    <button key={s} type="button" className="chip" aria-pressed={sort === s} onClick={() => setSort(s)}>
                      {{ best: "Google's order", price: "Cheapest", duration: "Fastest", depart: "Departure time" }[s]}
                    </button>))}
                </div>
                <label className="vt-check"><input type="checkbox" checked={nonstopOnly} onChange={(e) => setNonstopOnly(e.target.checked)} /> Nonstop only</label>
                <label className="vf-airline"><span className="lbl">Airline</span>
                  <select value={airline} onChange={(e) => setAirline(e.target.value)}><option value="">All airlines</option>{airlines.map((a) => <option key={a}>{a}</option>)}</select></label>
              </div>

              {shown.length === 0 && <p className="note small">No flights match these filters.</p>}
              <ol className="vf-list">
                {(showAll ? shown : shown.slice(0, PAGE)).map((o) => (
                  <li key={o.id}>
                    <FlightRow o={o} why={marks.get(o.id)}>
                      {roundTrip
                        ? <button className="btn small-btn" onClick={() => void loadReturns(o)} aria-expanded={returns?.forId === o.id}>{returns?.forId === o.id ? "Hide return flights" : "Choose return →"}</button>
                        : <button className="btn solid small-btn" disabled={busy === "save" || full || inList(o, null)} onClick={() => add(o, null)}>{inList(o, null) ? "✓ Added" : "+ Add"}</button>}
                    </FlightRow>
                    {returns?.forId === o.id && (
                      <div className="vf-returns">
                        <p className="lbl">Return flights with this one · price is for the whole trip</p>
                        {returns.options === null ? <p className="hint small"><span className="spin" aria-hidden="true" /> Loading return flights…</p>
                          : returns.error ? <p className="err-text">{returns.error}</p>
                          : returns.options.length === 0 ? <p className="note small">No return flights found for this one.</p>
                          : <ol className="vf-list">{returns.options.map((b) => (
                            <li key={b.id}><FlightRow o={b}>
                              <button className="btn solid small-btn" disabled={busy === "save" || full || inList(o, b)} onClick={() => add(o, b)}>{inList(o, b) ? "✓ Added" : "+ Add"}</button>
                            </FlightRow></li>))}</ol>}
                      </div>)}
                  </li>
                ))}
              </ol>
              {!showAll && shown.length > PAGE && <button className="btn small-btn" onClick={() => setShowAll(true)}>Show all {shown.length} flights</button>}
              {full && <p className="hint small">Sunny's list is full ({SHORTLIST_MAX}). Remove one to add another.</p>}
            </>
          )}
        </div>
      )}

      {shortlist.length > 0 && (
        <div className="vf-short" aria-label="Sunny's options">
          <h4>Sunny's options for {v.name} <span className="hint">({shortlist.length})</span></h4>
          <ol>
            {shortlist.map((s, i) => (
              <li key={s.id + i} className="vf-short-item">
                <div>
                  <b>Option {i + 1} · {rupees(s.price)}</b> <span className="hint small">for {travellers(s.query)} · {s.query.cabin}{s.back ? " · return trip" : ""}</span>
                  <FlightLine o={s.out} />
                  {s.back && <FlightLine o={s.back} label="Return" />}
                </div>
                <button className="btn small-btn" disabled={busy === "save"} onClick={() => void saveList(shortlist.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`}>Remove</button>
              </li>
            ))}
          </ol>
          <div className="vt-head-actions">
            <button className="btn solid" onClick={() => void copy()}>{copied ? "✓ Copied" : "📋 Copy for customer"}</button>
            {(shortlist[0].googleUrl || search?.googleUrl) && <a className="btn" href={shortlist[0].googleUrl || search!.googleUrl} target="_blank" rel="noreferrer">Open in Google Flights ↗</a>}
          </div>
          <details className="vf-preview"><summary>Preview the text</summary><pre>{shortlistText(v.name, shortlist)}</pre></details>
          <p className="hint small">Nothing is sent to the customer from here, and nothing is booked: Sunny sends the text and books in Sabre as usual.</p>
        </div>
      )}
      {shortlist.length === 0 && search && search.googleUrl && (
        <p className="small"><a href={search.googleUrl} target="_blank" rel="noreferrer">Open this search in Google Flights ↗</a></p>
      )}
    </section>
  );
}

function FlightLine({ o, label }: { o: FlightOption; label?: string }) {
  const a = o.legs[0], z = o.legs[o.legs.length - 1], plus = dayShift(a.dep, z.arr);
  return (
    <p className="vf-line small">{label && <b>{label}: </b>}{o.airline} {o.legs.map((l) => l.flightNo).join(" / ")} · {niceTime(a.dep)} {a.from} → {timeOnly(z.arr)} {z.to}{plus > 0 ? ` (+${plus})` : ""} · {o.layovers.length ? `${o.layovers.length} stop` : "Nonstop"} · {hm(o.minutes)}</p>
  );
}

function FlightRow({ o, why, children }: { o: FlightOption; why?: string[]; children: React.ReactNode }) {
  const a = o.legs[0], z = o.legs[o.legs.length - 1], plus = dayShift(a.dep, z.arr);
  return (
    <div className={`vf-row${why ? " suggested" : ""}`}>
      <div className="vf-air">
        {o.logo && <img src={o.logo} alt="" width={28} height={28} loading="lazy" />}
        <div>
          <b>{o.airline}</b>
          <span className="hint small">{o.legs.map((l) => l.flightNo).join(" / ")}</span>
          {why && <span className="vf-why">⭐ Suggested: {why.join(", ")}</span>}
        </div>
      </div>
      <div className="vf-times">
        <b>{timeOnly(a.dep)} → {timeOnly(z.arr)}{plus > 0 && <sup>+{plus}</sup>}</b>
        <span className="hint small">{a.from} → {z.to}</span>
      </div>
      <div className="vf-stops">
        <span>{o.layovers.length === 0 ? "Nonstop" : `${o.layovers.length} stop${o.layovers.length > 1 ? "s" : ""}`}</span>
        {o.layovers.length > 0 && <span className="hint small">{o.layovers.map((l) => `${l.airport} ${hm(l.minutes)}${l.overnight ? " overnight" : ""}`).join(", ")}</span>}
      </div>
      <div className="vf-dur">{hm(o.minutes)}</div>
      <div className="vf-price"><b>{rupees(o.price)}</b></div>
      <div className="vf-act">{children}</div>
    </div>
  );
}

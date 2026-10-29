import { useMemo, useState, type FormEvent } from "react";
import {
  autoSearchBlockers, CABIN_OPTIONS, dayShift, hm, queryFromTrip, rupees, SHORTLIST_MAX, topThree,
  timeOnly, travellers, niceTime, type FlightOption, type FlightQuery, type ShortlistItem,
} from "../../shared/flights";
import type { VoiceRequest } from "../../shared/voice";
import { api } from "../lib/api";
import { AIRPORTS } from "../lib/airports";
import { downloadItineraryPdf } from "./itineraryPdf";
import { EmailPdf } from "./EmailPdf";

type Sort = "best" | "price" | "duration" | "depart";
type Slot = "early" | "morning" | "afternoon" | "evening";
const SLOTS: { k: Slot; label: string; icon: string; from: number; to: number }[] = [
  { k: "early", label: "Early", icon: "🌅", from: 0, to: 6 }, { k: "morning", label: "Morning", icon: "☀", from: 6, to: 12 },
  { k: "afternoon", label: "Afternoon", icon: "🌤", from: 12, to: 18 }, { k: "evening", label: "Evening", icon: "🌙", from: 18, to: 24 },
];
const slotOf = (o: FlightOption): Slot => { const h = +o.legs[0].dep.slice(11, 13); return h < 6 ? "early" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"; };
const stopKey = (o: FlightOption) => Math.min(2, o.layovers.length);
const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
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
  // Filters on the flights already found (no new search): empty = all.
  const [fStops, setFStops] = useState<number[]>([]);
  const [fAir, setFAir] = useState<string[]>([]);
  const [fTime, setFTime] = useState<Slot[]>([]);
  const [fShort, setFShort] = useState(false);
  const [fNoNight, setFNoNight] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [paxOpen, setPaxOpen] = useState(false);
  const [listShown, setListShown] = useState(false);
  // The full list starts folded under the Top 3, so the page stays short; Sunny opens it when he needs another flight.
  const [listOpen, setListOpen] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [returns, setReturns] = useState<{ forId: string; options: FlightOption[] | null; error?: string } | null>(null);

  const id = (k: string) => `vf-${v.id}-${k}`;
  const blockers = autoSearchBlockers(v.trip, today);
  const travellersNotSaid = !v.trip || v.trip.adults + v.trip.children + v.trip.infants === 0;

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    const q: FlightQuery = { from: codesOf(from), to: codesOf(to).split(",")[0] ?? "", depart, return: oneWay ? "" : ret, adults, children, infants, cabin, stops };
    const problem = !q.from ? "Choose where they fly from: type the city and pick its airport from the list."
      : !q.to ? "Choose where they fly to: type the city and pick its airport from the list."
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
    setListOpen(false);
    setPaxOpen(false);
    clearFilters();
    try { onChange((await api.voice.searchFlights(v.id, q)).request); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(undefined); }
  }

  /** `where` keeps the Top 3 card and the full list apart, so the return flights open under the row that was pressed. */
  async function loadReturns(o: FlightOption, where = "list") {
    if (!search || !o.departureToken) return;
    const forId = `${where}:${o.id}`;
    if (returns?.forId === forId) return setReturns(null);
    setReturns({ forId, options: null });
    try { setReturns({ forId, options: (await api.voice.returnFlights(v.id, search.query, o.departureToken)).returns }); }
    catch (err) { setReturns({ forId, options: [], error: (err as Error).message }); }
  }

  async function saveList(next: ShortlistItem[]) {
    setBusy("save");
    setError(undefined);
    try { onChange((await api.voice.saveShortlist(v.id, next)).request); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(undefined); }
  }

  const item = (out: FlightOption, back: FlightOption | null): ShortlistItem => ({
    id: `${out.id}|${back?.id ?? ""}`, out, back, price: back ? back.price : out.price, query: search!.query, googleUrl: search!.googleUrl, addedAt: new Date().toISOString(),
  });
  const add = (out: FlightOption, back: FlightOption | null) => search && void saveList([...shortlist, item(out, back)]);
  const inList = (out: FlightOption, back: FlightOption | null) => shortlist.some((s) => s.id === `${out.id}|${back?.id ?? ""}` && s.query.depart === search?.query.depart);
  const full = shortlist.length >= SHORTLIST_MAX;

  const roundTrip = Boolean(search?.query.return);
  const top = useMemo(() => topThree(search?.options ?? [], v.trip?.airline ?? ""), [search, v.trip?.airline]);
  // Folded only when the Top 3 doesn't already show every flight.
  const canFold = top.length > 0 && (search?.options.length ?? 0) > top.length;
  const folded = canFold && !listOpen;
  // Airlines in the full list that aren't in the Top 3 (named next to "Show all", e.g. Emirates).
  const others = useMemo(() => {
    const inTop = new Set(top.map((t) => t.option.airline));
    return [...new Set((search?.options ?? []).map((o) => o.airline).filter((a) => !inTop.has(a)))];
  }, [search, top]);
  const topReason = useMemo(() => new Map(top.map((t) => [t.option.id, t.reason])), [top]);
  const topToAdd = top.filter((t) => !inList(t.option, null));
  // "Add all 3" adds the picks not added yet, as many as Sunny's list still has room for.
  const addTop = () => search && void saveList([...shortlist, ...topToAdd.slice(0, SHORTLIST_MAX - shortlist.length).map((t) => item(t.option, null))]);

  const returnsPanel = (o: FlightOption, where: string) => returns?.forId === `${where}:${o.id}` && (
    <div className="vf-returns">
      <p className="lbl">Return flights with this one · price is for the whole trip</p>
      {returns.options === null ? <p className="hint small"><span className="spin" aria-hidden="true" /> Loading return flights…</p>
        : returns.error ? <p className="err-text">{returns.error}</p>
        : returns.options.length === 0 ? <p className="note small">No return flights found for this one.</p>
        : <ol className="vf-list">{returns.options.map((b) => (
          <li key={b.id}><FlightRow o={b} seats={seats}>
            <button className="btn solid small-btn" disabled={busy === "save" || full || inList(o, b)} onClick={() => add(o, b)}>{inList(o, b) ? "✓ Added" : "+ Add"}</button>
          </FlightRow></li>))}</ol>}
    </div>);
  const action = (o: FlightOption, where: string) => roundTrip
    ? <button className="btn small-btn" onClick={() => void loadReturns(o, where)} aria-expanded={returns?.forId === `${where}:${o.id}`}>{returns?.forId === `${where}:${o.id}` ? "Hide return flights" : "Choose return →"}</button>
    : <button className="btn solid small-btn" disabled={busy === "save" || full || inList(o, null)} onClick={() => add(o, null)}>{inList(o, null) ? "✓ Added" : "+ Add"}</button>;
  // Seats that pay: Google's price is for everyone; a lap infant costs little, so "per person" divides by adults + children.
  const seats = Math.max(1, (search?.query.adults ?? 1) + (search?.query.children ?? 0));
  const all = search?.options ?? [];
  const clearFilters = () => { setFStops([]); setFAir([]); setFTime([]); setFShort(false); setFNoNight(false); };
  const filtersOn = fStops.length + fAir.length + fTime.length > 0 || fShort || fNoNight;
  const pass = (o: FlightOption, skip?: "stops" | "air" | "time") =>
    (skip === "stops" || !fStops.length || fStops.includes(stopKey(o))) && (skip === "air" || !fAir.length || fAir.includes(o.airline))
    && (skip === "time" || !fTime.length || fTime.includes(slotOf(o))) && (!fShort || o.minutes < 720) && (!fNoNight || !o.layovers.some((l) => l.overnight));
  /** Count and lowest price for one filter value, given the other filters (like Expedia). */
  const facet = (match: (o: FlightOption) => boolean, skip: "stops" | "air" | "time") => {
    const xs = all.filter((o) => match(o) && pass(o, skip));
    const prices = xs.map((o) => o.price).filter((p): p is number => p != null);
    return { n: xs.length, min: prices.length ? Math.min(...prices) : null };
  };
  const airlines = useMemo(() => [...new Set(all.map((o) => o.airline))].sort(), [all]);
  const shown = useMemo(() => all.filter((o) => pass(o)).sort(sorters[sort]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, fStops, fAir, fTime, fShort, fNoNight, sort]);
  const cheapest = useMemo(() => [...all].filter((o) => o.price != null).sort(sorters.price)[0], [all]);
  const fastest = useMemo(() => [...all].sort(sorters.duration)[0], [all]);
  const pp = (n: number | null | undefined) => (n == null ? "—" : rupees(Math.round(n / seats)));
  // The Top 3 view: the picks first, the rest folded under "Show N more flights". Filters or another sort show the full list.
  const topView = sort === "best" && !filtersOn && top.length > 0;

  const [pdfBusy, setPdfBusy] = useState(false);
  async function pdf() {
    setPdfBusy(true);
    try { await downloadItineraryPdf({ name: v.name, phone: v.phone, email: v.email }, shortlist); }
    catch { setError("Couldn't make the PDF. Try again."); }
    finally { setPdfBusy(false); }
  }

  const num = (k: string, label: string, value: number, set: (n: number) => void, min: number, max: number) => (
    <div className="field"><label className="lbl" htmlFor={id(k)}>{label}</label>
      <select id={id(k)} value={value} onChange={(e) => set(+e.target.value)}>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => <option key={n} value={n}>{n}</option>)}
      </select></div>
  );
  const people = adults + children + infants;
  const paxText = `${people} ${children + infants ? (people === 1 ? "traveller" : "travellers") : people === 1 ? "adult" : "adults"}, ${cabin}${stops !== "any" ? ` · ${stops === "nonstop" ? "nonstop" : "≤1 stop"}` : ""}`;
  const check = (on: boolean, flip: () => void, label: string, f?: { n: number; min: number | null }) => (
    <label className={`vf-check${f && f.n === 0 ? " none" : ""}`}>
      <input type="checkbox" checked={on} onChange={flip} disabled={!!f && f.n === 0 && !on} />
      <span>{label}{f && ` (${f.n})`}</span>
      {f && f.min != null && <span className="vf-check-p">{pp(f.min)}</span>}
    </label>
  );

  return (
    <section className="vf-box" aria-label={`Flights for ${v.name}`}>
      {!v.flightsSaved && <p className="note small">Search results and Sunny's options aren't kept yet: run <code>alter table public.voice_requests add column if not exists flights jsonb;</code> in the Supabase SQL Editor.</p>}
      {!search && v.searching && <p className="vf-finding" role="status"><span className="spin" aria-hidden="true" /> Finding flights on Google Flights… the Top 3 will appear here by itself.</p>}
      {!search && blockers.length > 0 && <p className="vt-missing" role="note">⚠ Not searched yet. Confirm with the customer: {blockers.join(", ")}. Then fill in below and press Search.</p>}
      {!search && v.flights?.note && <p className="warn-text small">{v.flights.note}</p>}

      <form className="vf-form vf-bar" onSubmit={(e) => void runSearch(e)} noValidate aria-label="Flight search">
        <datalist id={id("airports")}>{AIRPORTS.map((a) => <option key={a} value={a} />)}</datalist>
        <div className="vf-bar-top">
          <div className="vf-type" role="group" aria-label="Trip type">
            <button type="button" aria-pressed={!oneWay} onClick={() => setOneWay(false)}>Round trip</button>
            <button type="button" aria-pressed={oneWay} onClick={() => setOneWay(true)}>One way</button>
          </div>
          <span className="hint small">{search ? "Change anything and Search again · each search uses 1 of the month's SerpApi searches" : "Filled in from the message · change anything and Search"}</span>
        </div>
        <div className="vf-bar-row">
          <div className="vf-cell field"><label className="lbl" htmlFor={id("from")}>Leaving from</label>
            <input id={id("from")} list={id("airports")} value={from} placeholder="City or airport" aria-invalid={!codesOf(from)} onChange={(e) => setFrom(e.target.value)} /></div>
          <button type="button" className="vf-swap" aria-label="Swap from and to" onClick={() => { setFrom(to); setTo(from); }}>⇄</button>
          <div className="vf-cell field"><label className="lbl" htmlFor={id("to")}>Going to</label>
            <input id={id("to")} list={id("airports")} value={to} placeholder="City or airport" aria-invalid={!codesOf(to)} onChange={(e) => setTo(e.target.value)} /></div>
          <div className={`vf-cell vf-dates${oneWay ? "" : " two"}`}>
            <div className="field"><label className="lbl" htmlFor={id("depart")}>{oneWay ? "Date" : "Depart"}</label>
              <input id={id("depart")} type="date" min={today} value={depart} aria-invalid={!depart} onChange={(e) => setDepart(e.target.value)} /></div>
            {!oneWay && <div className="field"><label className="lbl" htmlFor={id("return")}>Return</label>
              <input id={id("return")} type="date" min={depart || today} value={ret} onChange={(e) => setRet(e.target.value)} /></div>}
          </div>
          <div className="vf-cell vf-pax">
            <button type="button" className="vf-pax-btn" aria-expanded={paxOpen} aria-controls={id("pax")} onClick={() => setPaxOpen((x) => !x)}>
              <span className="lbl">Travellers, cabin</span><b>👤 {paxText}</b>
            </button>
          </div>
          <button type="submit" className="btn solid vf-go" disabled={!!busy || (!search && v.searching)}>{busy === "search" ? "Searching…" : !search && v.searching ? "Finding flights…" : search ? "Search again" : "Search flights"}</button>
        </div>
        <div className="vf-pax-panel" id={id("pax")} hidden={!paxOpen}>
              {num("adults", "Adults", adults, setAdults, 1, 9)}
              {num("children", "Children", children, setChildren, 0, 8)}
              {num("infants", "Infants (lap)", infants, setInfants, 0, 4)}
              <div className="field"><label className="lbl" htmlFor={id("cabin")}>Class</label>
                <select id={id("cabin")} value={cabin} onChange={(e) => setCabin(e.target.value as FlightQuery["cabin"])}>{CABIN_OPTIONS.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="field"><label className="lbl" htmlFor={id("stops")}>Stops</label>
                <select id={id("stops")} value={stops} onChange={(e) => setStops(e.target.value as FlightQuery["stops"])}>
                  <option value="any">Any</option><option value="nonstop">Nonstop only</option><option value="1">1 stop or fewer</option>
                </select></div>
              <button type="button" className="btn small-btn" onClick={() => setPaxOpen(false)}>Done</button>
            </div>
        {travellersNotSaid && <p className="hint small">The customer didn't say how many are travelling; prices are for the travellers chosen here.</p>}
      </form>

      {error && <p className="err-text" role="alert">{error}</p>}

      {search && (
        <div className="vf-results">
          <p className="vf-summary">
            {labelOf(search.query.from)} → {labelOf(search.query.to)} · {niceTime(`${search.query.depart} 00:00`).slice(0, -6)}
            {search.query.return && <> – {niceTime(`${search.query.return} 00:00`).slice(0, -6)}</>} · {travellers(search.query)} · {search.query.cabin}
            {!search.query.return && <span className="vt-tag">One way</span>}
            {search.auto && <span className="vt-tag">Found automatically</span>}
            {search.priceLevel && <span className={`vf-level ${search.priceLevel}`}>Prices are {search.priceLevel} now{search.typical ? ` (usual ${rupees(search.typical[0])}–${rupees(search.typical[1])})` : ""}</span>}
            <span className="hint small"> · searched {new Date(search.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
          </p>

          {all.length === 0 ? <p className="note">Google Flights found no flights for these details. Try another date, airport or Stops: Any.</p> : (
            <div className="vf-res">
              <aside className="vf-filters" aria-label="Filter flights">
                <fieldset><legend>Stops</legend>
                  {[0, 1, 2].map((k) => check(fStops.includes(k), () => setFStops(toggle(fStops, k)), k === 0 ? "Nonstop" : k === 1 ? "1 stop" : "2+ stops", facet((o) => stopKey(o) === k, "stops")))}
                </fieldset>
                <fieldset><legend>Airlines</legend>
                  {airlines.map((a) => <div key={a}>{check(fAir.includes(a), () => setFAir(toggle(fAir, a)), a, facet((o) => o.airline === a, "air"))}</div>)}
                </fieldset>
                <fieldset><legend>Departure time</legend>
                  <div className="vf-slots">
                    {SLOTS.map((t) => { const f = facet((o) => slotOf(o) === t.k, "time");
                      return <button key={t.k} type="button" className="vf-slot" aria-pressed={fTime.includes(t.k)} disabled={f.n === 0 && !fTime.includes(t.k)} onClick={() => setFTime(toggle(fTime, t.k))}>
                        <b>{t.icon} {t.label}</b><small>{String(t.from).padStart(2, "0")}–{String(t.to).padStart(2, "0")}</small></button>; })}
                  </div>
                </fieldset>
                <fieldset><legend>Trip length</legend>
                  {check(fShort, () => setFShort(!fShort), "Under 12 hours")}
                  {check(fNoNight, () => setFNoNight(!fNoNight), "No overnight layover")}
                </fieldset>
                {filtersOn && <button type="button" className="btn small-btn" onClick={clearFilters}>Clear filters</button>}
              </aside>

              <div className="vf-main">
                <div className="vf-main-head">
                  <h4><b>{filtersOn ? `${shown.length} of ${all.length}` : all.length} flights</b> <span className="hint small">Google Flights · prices per person, total for {travellers(search.query)} below{roundTrip ? " · whole return trip" : ""}</span></h4>
                  <label className="vf-sortby"><span className="lbl">Sort by</span>
                    <select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setShowAll(false); }}>
                      <option value="best">Recommended</option><option value="price">Cheapest</option><option value="duration">Fastest</option><option value="depart">Departure time</option>
                    </select></label>
                </div>
                <div className="vf-sort vf-cards" role="group" aria-label="Quick views">
                  <button type="button" aria-pressed={topView} onClick={() => { setSort("best"); clearFilters(); setListOpen(false); }}>
                    <span>Top {top.length || 3} picks</span><b>{top.length} airline{top.length === 1 ? "" : "s"}</b></button>
                  <button type="button" aria-pressed={sort === "price" && !filtersOn} onClick={() => { setSort("price"); clearFilters(); setShowAll(false); }}>
                    <span>Cheapest</span><b>{cheapest ? `${pp(cheapest.price)} · ${hm(cheapest.minutes)}` : "—"}</b></button>
                  <button type="button" aria-pressed={sort === "duration" && !filtersOn} onClick={() => { setSort("duration"); clearFilters(); setShowAll(false); }}>
                    <span>Fastest</span><b>{fastest ? `${pp(fastest.price)} · ${hm(fastest.minutes)}` : "—"}</b></button>
                </div>

                {topView ? (
                  <div className="vf-top" aria-label="Top picks">
                    <div className="vf-top-head">
                      <p className="hint small">Top {top.length} · one each from different airlines, so the customer has a real choice. Suggestions only: Sunny decides.</p>
                      {!roundTrip && top.length > 1 && (
                        <button className="btn solid small-btn" disabled={busy === "save" || full || topToAdd.length === 0} onClick={addTop}>
                          {topToAdd.length === 0 ? "✓ All added" : topToAdd.length === top.length ? `Add all ${top.length}` : `Add the other ${topToAdd.length}`}
                        </button>)}
                    </div>
                    <ol className="vf-list">
                      {top.map((t) => (
                        <li key={t.option.id}>
                          <FlightRow o={t.option} why={t.reason} seats={seats}>{action(t.option, "top")}</FlightRow>
                          {returnsPanel(t.option, "top")}
                        </li>))}
                    </ol>
                    {roundTrip && <p className="hint small">Return trip: press Choose return on a pick, then + Add the return flight.</p>}
                    {canFold && (folded ? (
                      <div className="vf-more">
                        <button type="button" className="btn small-btn" aria-expanded="false" onClick={() => setListOpen(true)}>▾ Show {all.length - top.length} more flight{all.length - top.length === 1 ? "" : "s"}</button>
                        {others.length > 0 && <span className="hint small">{others.slice(0, 4).join(", ")}{others.length > 4 ? "…" : ""}</span>}
                      </div>
                    ) : (
                      <>
                        <ol className="vf-list">
                          {all.filter((o) => !topReason.has(o.id)).map((o) => (
                            <li key={o.id}><FlightRow o={o} seats={seats}>{action(o, "list")}</FlightRow>{returnsPanel(o, "list")}</li>))}
                        </ol>
                        <div className="vf-more"><button type="button" className="btn small-btn" aria-expanded="true" onClick={() => setListOpen(false)}>▴ Hide the other flights</button></div>
                      </>
                    ))}
                  </div>
                ) : (
                  <>
                    {shown.length === 0 && <p className="note small">No flights match these filters. <button type="button" className="linkish" onClick={clearFilters}>Clear filters</button></p>}
                    <ol className="vf-list">
                      {(showAll ? shown : shown.slice(0, PAGE)).map((o) => (
                        <li key={o.id}>
                          <FlightRow o={o} seats={seats} tag={topReason.has(o.id) ? "Top pick" : undefined}>{action(o, "list")}</FlightRow>
                          {returnsPanel(o, "list")}
                        </li>
                      ))}
                    </ol>
                    {!showAll && shown.length > PAGE && <div className="vf-more"><button className="btn small-btn" onClick={() => setShowAll(true)}>▾ Show {shown.length - PAGE} more flights</button></div>}
                  </>
                )}
                {full && <p className="hint small">Sunny's list is full ({SHORTLIST_MAX}). Remove one to add another.</p>}
                {search.googleUrl && <p className="small"><a href={search.googleUrl} target="_blank" rel="noreferrer">Open this search in Google Flights ↗</a></p>}
              </div>
            </div>
          )}
        </div>
      )}

      {(search || shortlist.length > 0) && (
        <div className="vf-short" id={id("short")} aria-label="Sunny's options">
          <div className="vf-short-bar">
            <button type="button" className="vf-short-toggle" aria-expanded={listShown && shortlist.length > 0} disabled={!shortlist.length} onClick={() => setListShown((x) => !x)}>
              <span aria-hidden="true">📄</span> <b>Sunny's options for {v.name} · {shortlist.length} added</b>
              <span className="hint small">{shortlist.length ? (listShown ? "▴ hide" : "▾ show") : "Add flights, then download or email the PDF for the customer."}</span>
            </button>
            <div className="vf-short-actions">
              {shortlist.length > 0 && <EmailPdf v={v} shortlist={shortlist} onChange={onChange} />}
              <button className="btn" disabled={pdfBusy || !shortlist.length} onClick={() => void pdf()}>{pdfBusy ? "Making PDF…" : "📄 Download PDF"}</button>
            </div>
          </div>
          {listShown && shortlist.length > 0 && (
            <>
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
              <p className="hint small">Nothing is booked from here: Sunny emails or downloads the PDF, then books in Sabre as usual.</p>
            </>
          )}
        </div>
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

const cityOf = (code: string, name: string) => AIRPORTS.find((a) => a.endsWith(`(${code})`)) ?? (name ? `${name.replace(/ (International )?Airport$/i, "")} (${code})` : code);

/** One flight, Expedia-style: times on a line with a dot per stop, route and flight numbers, stops, per-person and total price.
 * `why` = the reason on a Top 3 pick; `tag` = "Top pick" on the same flight in the full list. */
function FlightRow({ o, why, tag, seats, children }: { o: FlightOption; why?: string; tag?: string; seats: number; children: React.ReactNode }) {
  const a = o.legs[0], z = o.legs[o.legs.length - 1], plus = dayShift(a.dep, z.arr);
  const n = o.layovers.length;
  const code = (o.legs[0].flightNo.match(/^[A-Z0-9]{2}/)?.[0] ?? o.airline.slice(0, 2)).toUpperCase();
  return (
    <div className={`vf-row${tag || why ? " suggested" : ""}`}>
      <div className="vf-logo" aria-hidden="true">{o.logo ? <img src={o.logo} alt="" width={30} height={30} loading="lazy" /> : code}</div>
      <div className="vf-when">
        <div className="vf-times">
          <b>{timeOnly(a.dep)}</b>
          <span className="vf-track" aria-hidden="true">{o.layovers.map((l) => <i key={l.airport} />)}</span>
          <b>{timeOnly(z.arr)}{plus > 0 && <sup>+{plus}</sup>}</b>
        </div>
        <span className="hint small vf-route">{cityOf(a.from, a.fromName)} → {cityOf(z.to, z.toName)} · <b className="vf-air">{o.airline}</b> {o.legs.map((l) => l.flightNo).join(" / ")}</span>
        {why && <span className={`vf-why ${/cheap/i.test(why) ? "cheap" : /google/i.test(why) ? "best" : "value"}`}>{why}</span>}
        {tag && <span className="vf-why best">{tag}</span>}
      </div>
      <div className="vf-stops">
        <b>{hm(o.minutes)} · {n === 0 ? "Nonstop" : `${n} stop${n > 1 ? "s" : ""}`}</b>
        <span className="hint small">{n === 0 ? "Direct flight" : o.layovers.map((l) => `${hm(l.minutes)} in ${l.name ? `${l.name.replace(/ (International )?Airport$/i, "")} (${l.airport})` : l.airport}${l.overnight ? " · overnight" : ""}`).join(", ")}</span>
      </div>
      <div className="vf-price">
        <b>{o.price == null ? "—" : rupees(Math.round(o.price / seats))}</b>
        <span className="hint small">{seats > 1 && o.price != null ? `per person · ${rupees(o.price)} total` : "total"}</span>
        <div className="vf-act">{children}</div>
      </div>
    </div>
  );
}

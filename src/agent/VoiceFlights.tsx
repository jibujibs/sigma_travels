import { useMemo, useState, type FormEvent } from "react";
import {
  autoSearchBlockers, CABIN_OPTIONS, dayShift, hm, queryFromTrip, rupees, SHORTLIST_MAX, stopsOf, topThree,
  timeOnly, travellers, niceTime, type FlightOption, type FlightQuery, type ShortlistItem,
} from "../../shared/flights";
import type { VoiceRequest } from "../../shared/voice";
import { api } from "../lib/api";
import { AIRPORTS } from "../lib/airports";
import { downloadItineraryPdf } from "./itineraryPdf";
import { EmailPdf } from "./EmailPdf";

type Sort = "best" | "price" | "duration" | "depart";
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
          <li key={b.id}><FlightRow o={b}>
            <button className="btn solid small-btn" disabled={busy === "save" || full || inList(o, b)} onClick={() => add(o, b)}>{inList(o, b) ? "✓ Added" : "+ Add"}</button>
          </FlightRow></li>))}</ol>}
    </div>);
  const action = (o: FlightOption, where: string) => roundTrip
    ? <button className="btn small-btn" onClick={() => void loadReturns(o, where)} aria-expanded={returns?.forId === `${where}:${o.id}`}>{returns?.forId === `${where}:${o.id}` ? "Hide return flights" : "Choose return →"}</button>
    : <button className="btn solid small-btn" disabled={busy === "save" || full || inList(o, null)} onClick={() => add(o, null)}>{inList(o, null) ? "✓ Added" : "+ Add"}</button>;
  const airlines = useMemo(() => [...new Set((search?.options ?? []).map((o) => o.airline))].sort(), [search]);
  const shown = useMemo(() => (search?.options ?? [])
    .filter((o) => (!nonstopOnly || stopsOf(o) === 0) && (!airline || o.airline === airline))
    .sort(sorters[sort]), [search, nonstopOnly, airline, sort]);

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

  return (
    <section className="vf-box" aria-label={`Flights for ${v.name}`}>
      <div className="vt-head"><h3>✈ Flights <span className="vf-sub">real fares from Google Flights</span></h3></div>

      {!v.flightsSaved && <p className="note small">Search results and Sunny's options aren't kept yet: run <code>alter table public.voice_requests add column if not exists flights jsonb;</code> in the Supabase SQL Editor.</p>}
      {!search && v.searching && <p className="vf-finding" role="status"><span className="spin" aria-hidden="true" /> Finding flights on Google Flights… the Top 3 will appear here by itself.</p>}
      {!search && blockers.length > 0 && <p className="vt-missing" role="note">⚠ Not searched yet. Confirm with the customer: {blockers.join(", ")}. Then fill in below and press Search.</p>}
      {!search && v.flights?.note && <p className="warn-text small">{v.flights.note}</p>}

      <form className="vf-form" onSubmit={(e) => void runSearch(e)} noValidate aria-label="Flight search">
        <datalist id={id("airports")}>{AIRPORTS.map((a) => <option key={a} value={a} />)}</datalist>
        <div className="vt-fields">
          <div className="field"><label className="lbl" htmlFor={id("from")}>From</label>
            <input id={id("from")} list={id("airports")} value={from} placeholder="Type a city or airport" aria-invalid={!codesOf(from)} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label className="lbl" htmlFor={id("to")}>To</label>
            <input id={id("to")} list={id("airports")} value={to} placeholder="Type a city or airport" aria-invalid={!codesOf(to)} onChange={(e) => setTo(e.target.value)} /></div>
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
          <button type="submit" className="btn solid" disabled={!!busy || (!search && v.searching)}>{busy === "search" ? "Searching Google Flights…" : !search && v.searching ? "Finding flights…" : search ? "Search again" : "Search flights"}</button>
          <span className="hint small">Each search uses 1 of the month's SerpApi searches.</span>
        </div>
      </form>

      {error && <p className="err-text" role="alert">{error}</p>}

      {shortlist.length > 0 && (
        <div className="vf-short" id={id("short")} aria-label="Sunny's options">
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
            <EmailPdf v={v} shortlist={shortlist} onChange={onChange} />
            <button className="btn" disabled={pdfBusy} onClick={() => void pdf()}>{pdfBusy ? "Making PDF…" : "📄 Download PDF"}</button>
            {(shortlist[0].googleUrl || search?.googleUrl) && <a className="btn" href={shortlist[0].googleUrl || search!.googleUrl} target="_blank" rel="noreferrer">Open in Google Flights ↗</a>}
          </div>
          <p className="hint small">Nothing is booked from here: Sunny emails or downloads the PDF, then books in Sabre as usual.</p>
        </div>
      )}

      {search && (
        <div className="vf-results">
          <p className="vf-summary">
            <b>{search.options.length} flights</b> · {labelOf(search.query.from)} → {labelOf(search.query.to)} · {niceTime(`${search.query.depart} 00:00`).slice(0, -6)}
            {search.query.return && <> – {niceTime(`${search.query.return} 00:00`).slice(0, -6)}</>} · {travellers(search.query)} · {search.query.cabin}
            {!search.query.return && <span className="vt-tag">One way</span>}
            {search.auto && <span className="vt-tag">Found automatically</span>}
            {search.priceLevel && <span className={`vf-level ${search.priceLevel}`}>Prices are {search.priceLevel} now{search.typical ? ` (usual ${rupees(search.typical[0])}–${rupees(search.typical[1])})` : ""}</span>}
          </p>
          <p className="hint small">Prices are Google's, in ₹, for all {travellers(search.query)}{roundTrip ? ", for the whole return trip" : ""}. Searched {new Date(search.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.</p>

          {search.options.length === 0 ? <p className="note">Google Flights found no flights for these details. Try another date, airport or Stops: Any.</p> : (
            <>
              {top.length > 0 && (
                <div className="vf-top" aria-label="Top picks">
                  <div className="vf-top-head">
                    <h4>Top {top.length} picks · {top.length} airline{top.length > 1 ? "s" : ""}</h4>
                    {!roundTrip && top.length > 1 && (
                      <button className="btn solid small-btn" disabled={busy === "save" || full || topToAdd.length === 0} onClick={addTop}>
                        {topToAdd.length === 0 ? "✓ All added" : topToAdd.length === top.length ? `Add all ${top.length}` : `Add the other ${topToAdd.length}`}
                      </button>)}
                  </div>
                  <p className="hint small">One each from different airlines, so the customer has a real choice. Suggestions only: Sunny decides.</p>
                  <ol className="vf-list">
                    {top.map((t) => (
                      <li key={t.option.id}>
                        <FlightRow o={t.option} why={t.reason}>{action(t.option, "top")}</FlightRow>
                        {returnsPanel(t.option, "top")}
                      </li>))}
                  </ol>
                  {roundTrip && <p className="hint small">Return trip: press Choose return on a pick, then + Add the return flight.</p>}
                </div>)}

              {folded ? (
                <div className="vf-more">
                  <button type="button" className="btn small-btn" aria-expanded="false" onClick={() => setListOpen(true)}>▾ Show all {search.options.length} flights</button>
                  <span className="hint small">{search.options.length - top.length} more{others.length ? ` · ${others.slice(0, 4).join(", ")}${others.length > 4 ? "…" : ""}` : ""}</span>
                </div>
              ) : <>
              <div className="vf-all-bar">
                <h4 className="vf-all-head">All flights</h4>
                {canFold && <button type="button" className="btn small-btn" aria-expanded="true" onClick={() => setListOpen(false)}>▴ Hide all flights</button>}
              </div>
              <div className="vf-tools">
                <div className="vf-sort" role="group" aria-label="Sort flights">
                  {(["best", "price", "duration", "depart"] as Sort[]).map((s) => (
                    <button key={s} type="button" className="chip" aria-pressed={sort === s} onClick={() => setSort(s)}>
                      {{ best: "Google's order", price: "Cheapest", duration: "Fastest", depart: "Departure time" }[s]}
                    </button>))}
                </div>
                <label className="vt-check"><input type="checkbox" checked={nonstopOnly} onChange={(e) => setNonstopOnly(e.target.checked)} /> Nonstop only</label>
                {shortlist.length > 0 && <a className="vf-jump" href={`#${id("short")}`}>✓ {shortlist.length} in Sunny's options ↑</a>}
                <label className="vf-airline"><span className="lbl">Airline</span>
                  <select value={airline} onChange={(e) => setAirline(e.target.value)}><option value="">All airlines</option>{airlines.map((a) => <option key={a}>{a}</option>)}</select></label>
              </div>

              {shown.length === 0 && <p className="note small">No flights match these filters.</p>}
              <ol className="vf-list">
                {(showAll ? shown : shown.slice(0, PAGE)).map((o) => (
                  <li key={o.id}>
                    <FlightRow o={o} tag={topReason.has(o.id) ? "Top pick" : undefined}>{action(o, "list")}</FlightRow>
                    {returnsPanel(o, "list")}
                  </li>
                ))}
              </ol>
              {!showAll && shown.length > PAGE && <button className="btn small-btn" onClick={() => setShowAll(true)}>Show all {shown.length} flights</button>}
              </>}
              {full && <p className="hint small">Sunny's list is full ({SHORTLIST_MAX}). Remove one to add another.</p>}
            </>
          )}
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

/** `why` = the reason on a Top 3 pick; `tag` = "Top pick" on the same flight in the full list. */
function FlightRow({ o, why, tag, children }: { o: FlightOption; why?: string; tag?: string; children: React.ReactNode }) {
  const a = o.legs[0], z = o.legs[o.legs.length - 1], plus = dayShift(a.dep, z.arr);
  return (
    <div className={`vf-row${tag ? " suggested" : ""}`}>
      <div className="vf-air">
        {o.logo && <img src={o.logo} alt="" width={28} height={28} loading="lazy" />}
        <div>
          <b>{o.airline}</b>
          <span className="hint small">{o.legs.map((l) => l.flightNo).join(" / ")}</span>
          {why && <span className="vf-why">⭐ {why}</span>}
          {tag && <span className="vf-why">⭐ {tag}</span>}
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

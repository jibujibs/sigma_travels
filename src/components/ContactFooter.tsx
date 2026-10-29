import { CONTACT_EMAIL } from "../../shared/contact";
/** Sigma Travel & Tours contact details, as on sigmatravelplan.com/content/3415/1/contact-details. */
export function ContactFooter() {
  return (
    <footer className="contact-foot" aria-label="Contact Sigma Travel & Tours">
      <div className="cf-col">
        <b className="cf-name">Sigma Travel &amp; Tours</b>
        <address>12959 Jupiter Road, Suite 100<br />Dallas, TX 75238</address>
      </div>
      <div className="cf-col">
        <span>Phone <a href="tel:+12142213300">214 221 3300</a></span>
        <span>Cell <a href="tel:+12145521411">214 552 1411</a></span>
        <span>Fax 214 221 3301</span>
        <span><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></span>
      </div>
      <div className="cf-col">
        <span>Mon–Fri 9:00 AM – 6:00 PM</span>
        <span>Sat 9:00 AM – 1:00 PM</span>
        <span>Sun closed</span>
      </div>
    </footer>
  );
}

/** Customer tab: the "Talk to Sunny" card beside Find your booking. */
export function TalkToSunny() {
  return (
    <section className="desk-hero talk-card" aria-labelledby="talk-h">
      <h2 id="talk-h">Talk to Sunny</h2>
      <p>Phone <a href="tel:+12142213300">214 221 3300</a> · Cell <a href="tel:+12145521411">214 552 1411</a></p>
      <p><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
      <p className="muted">Mon–Fri 9:00 AM – 6:00 PM · Sat 9:00 AM – 1:00 PM</p>
      <p className="muted">12959 Jupiter Road, Suite 100, Dallas, TX 75238</p>
    </section>
  );
}

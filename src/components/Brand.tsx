/** "Σ Sigma Travels · <section>": the name in bold, the section lighter, so the company name leads. */
export function Brand({ section }: { section?: string }) {
  return (
    <div className="brand">
      <span className="logo" aria-hidden="true">Σ</span>
      <span className="brand-name">Sigma Travels</span>
      {section && <><span className="brand-dot" aria-hidden="true">·</span><span className="brand-sub">{section}</span></>}
    </div>
  );
}

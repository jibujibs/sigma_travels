import { useEffect, useRef, useState } from "react";
import type { Profile } from "../lib/api";

interface Props {
  user: Profile;
  onChangeAirport: () => void;
  onSignOut: () => void;
}

/** Header button: photo and first name; opens email, home airport and Sign out. */
export function AccountMenu({ user, onChangeAirport, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const first = user.name.split(" ")[0] || user.email;
  return (
    <div className="account" ref={ref}>
      <button className="btn account-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        {user.avatar
          ? <img className="avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" />
          : <span className="avatar" aria-hidden="true">{first.charAt(0).toUpperCase()}</span>}
        {first}
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-who"><b>{user.name}</b><span>{user.email}</span></div>
          <div className="account-row">
            <span><span className="lbl">Home airport</span>{user.homeAirport || "Not set"}</span>
            <button className="btn" role="menuitem" onClick={() => { setOpen(false); onChangeAirport(); }}>Change</button>
          </div>
          <button className="btn" role="menuitem" onClick={() => { setOpen(false); onSignOut(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

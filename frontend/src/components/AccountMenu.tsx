import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ListTodo, LogOut } from "lucide-react";

import type { User } from "../types";
import "../account-menu.css";

interface Props {
  user?: User;
  children: ReactNode;
  onLogout: () => void;
}

export default function AccountMenu({ user, children, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return <div
    ref={root}
    className="account-menu"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
    onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    }}
  >
    <button
      ref={trigger}
      type="button"
      className="account-menu-trigger"
      aria-label="Account menu"
      aria-expanded={open}
      aria-controls={panelId}
      title="Account menu"
      onClick={() => setOpen((current) => !current)}
    >{children}</button>
    {open && <div id={panelId} className="account-menu-panel" role="region" aria-label="Your account">
      <div className="account-menu-identity">
        <span>{user ? "Signed in as" : "Your account"}</span>
        <strong>{user?.email ?? "Loading account…"}</strong>
      </div>
      <Link to="/personal" className="account-menu-action" onClick={() => setOpen(false)}><ListTodo size={17} />Personal tasks</Link>
      <button type="button" className="account-menu-action account-menu-signout" onClick={() => { setOpen(false); onLogout(); }}><LogOut size={17} />Sign out</button>
    </div>}
  </div>;
}

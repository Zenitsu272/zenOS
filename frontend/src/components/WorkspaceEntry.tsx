import { Check, LayoutGrid, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export default function WorkspaceEntry({ children, brandLink = false }: { children: ReactNode; brandLink?: boolean }) {
  const brand = <><Zap fill="currentColor" aria-hidden="true" size={26} />zenOS</>;
  return (
    <main className="workspace-entry">
      <div className="entry-layout">
        <div className="entry-cover">
          {brandLink ? <Link className="entry-wordmark" to="/">{brand}</Link> : <div className="entry-wordmark">{brand}</div>}
          <div className="entry-art" aria-hidden="true">
            <div className="entry-sheet entry-sheet-back" />
            <div className="entry-sheet entry-sheet-middle" />
            <div className="entry-sheet entry-sheet-front">
              <div className="entry-sheet-toolbar"><LayoutGrid size={23} /><i /><i /></div>
              <div className="entry-sheet-row"><Check /><i /></div>
              <div className="entry-sheet-row"><Check /><i /></div>
              <div className="entry-sheet-row"><span /><i /></div>
            </div>
          </div>
        </div>
        <div className="entry-content">{children}</div>
      </div>
    </main>
  );
}

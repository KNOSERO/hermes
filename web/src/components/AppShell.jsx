"use client";

import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import RunJobDialog from "./RunJobDialog";

const titles = {
  "/": "Uruchom job",
  "/history": "Historia jobów",
  "/config": "Konfiguracje",
};

export default function AppShell({ children }) {
  const router = useRouter();
  const addMenu = useRef(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const title = pathname === "/job"
    ? "Szczegóły joba"
    : titles[pathname] || "Panel";

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (addMenu.current?.open && !addMenu.current.contains(event.target)) {
        addMenu.current.open = false;
      }
    }
    function closeOnEscape(event) {
      if (event.key === "Escape" && addMenu.current?.open) {
        addMenu.current.open = false;
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Hermes <span>/</span> {title}
          </div>
          <div className="topbar-actions">
            <details className="add-menu" ref={addMenu}>
              <summary className="button primary add-button">
                Nowe <span className="menu-caret" aria-hidden="true" />
              </summary>
              <div className="add-menu-panel">
                <button className="add-menu-item" type="button" onClick={(event) => {
                  event.currentTarget.closest("details").open = false;
                  setRunDialogOpen(true);
                }}>
                  <span className="add-menu-icon" aria-hidden="true">▶</span>
                  <span><strong>Run job</strong><small>Wybierz operację i konfigurację</small></span>
                </button>
                <Link href="/config#new" className="add-menu-item" onClick={(event) => {
                  event.currentTarget.closest("details").open = false;
                }}>
                  <span className="add-menu-icon" aria-hidden="true">⚙</span>
                  <span><strong>Nowa konfiguracja</strong><small>Dodaj Docker lub Kubernetes</small></span>
                </Link>
              </div>
            </details>
          </div>
        </header>
        {children}
        <footer>
          <span>HERMES LOCAL CONTROL</span>
          <span>Panel dostępny tylko z tego komputera</span>
        </footer>
      </main>
      <RunJobDialog
        open={runDialogOpen}
        onClose={() => setRunDialogOpen(false)}
        onStarted={(job) => router.push(`/job?id=${encodeURIComponent(job.id)}`)}
      />
    </div>
  );
}

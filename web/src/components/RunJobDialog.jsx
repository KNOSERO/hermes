import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { actions } from "../lib/labels";

const operations = [
  { id: "install", symbol: "↓", tone: "install", description: "Przygotuj konfigurację i dane Hermes." },
  { id: "run", symbol: "▶", tone: "gateway", description: "Uruchom Hermes Gateway." },
  { id: "stop", symbol: "■", tone: "terminal", description: "Zatrzymaj usługi Hermes, zachowując dane." },
  { id: "connect", symbol: "↗", tone: "gateway", description: "Uruchom serwer połączenia Hermes Desktop." },
  { id: "backup", symbol: "◫", tone: "backup", description: "Utwórz kopię danych Hermes." },
  { id: "restore", symbol: "↺", tone: "restore", description: "Odtwórz dane z wybranej kopii." },
];

const backendNames = {
  podman: "Podman lokalny",
  docker: "Docker przez SSH",
  k3s: "Kubernetes",
};

export default function RunJobDialog({ open, onClose, onStarted }) {
  const dialog = useRef(null);
  const [targets, setTargets] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [action, setAction] = useState("run");
  const [showOperations, setShowOperations] = useState(false);
  const [label, setLabel] = useState("");
  const [archive, setArchive] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [backups, setBackups] = useState([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const targetGroups = useMemo(
    () =>
      targets.reduce((groups, target) => {
        const query = targetSearch.trim().toLocaleLowerCase();
        const searchable = `${target.name} ${backendNames[target.backend] || target.backend}`.toLocaleLowerCase();
        if (query && !searchable.includes(query)) return groups;
        (groups[target.backend] ||= []).push(target);
        return groups;
      }, {}),
    [targets, targetSearch],
  );
  const selectedOperation = operations.find((operation) => operation.id === action) || operations[0];

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    if (!open) return;

    setError("");
    setAction("run");
    setShowOperations(false);
    setLabel("");
    setArchive("");
    setConfirmRestore(false);
    setLoadingTargets(true);
    api("/api/targets")
      .then((result) => {
        const saved = result.targets || [];
        setTargets(saved);
        setTargetId((current) =>
          saved.some((target) => target.id === current)
            ? current
            : saved.find((target) => target.backend === "podman")?.id || saved[0]?.id || "",
        );
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoadingTargets(false));
  }, [open]);

  useEffect(() => {
    if (!open || action !== "restore" || !targetId) {
      setBackups([]);
      setArchive("");
      return;
    }
    let active = true;
    api(`/api/backups?targetId=${encodeURIComponent(targetId)}`)
      .then((result) => {
        if (!active) return;
        const files = result.files || [];
        setBackups(files);
        setArchive((current) => files.includes(current) ? current : "");
      })
      .catch((cause) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [open, action, targetId]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (action === "restore" && !confirmRestore) {
      setError("Potwierdź zastąpienie obecnych danych wybranym archiwum.");
      return;
    }
    setBusy(true);
    try {
      const job = await api("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId,
          action,
          label,
          archive,
          confirmRestore: action === "restore" && confirmRestore,
        }),
      });
      onClose();
      onStarted(job);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="run-job-dialog"
      aria-labelledby="run-job-title"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header className="run-job-dialog-header">
          <div>
            <p className="section-kicker">NOWY JOB</p>
            <h2 id="run-job-title">Wybierz operację i konfigurację</h2>
          </div>
          <button className="dialog-close" type="button" aria-label="Zamknij" onClick={onClose}>×</button>
        </header>

        <fieldset className="run-operation-picker">
          <legend>Wybierz operację</legend>
          <div className="run-operation-select">
            <button
              className="run-operation-trigger"
              type="button"
              aria-expanded={showOperations}
              aria-controls="run-operation-options"
              onClick={() => setShowOperations((current) => !current)}
            >
              <span className={`op-symbol ${selectedOperation.tone}-symbol`}>{selectedOperation.symbol}</span>
              <span className="run-option-copy">
                <strong>{actions[selectedOperation.id] || selectedOperation.id}</strong>
                <small>{selectedOperation.description}</small>
              </span>
              <span className={`run-select-caret${showOperations ? " open" : ""}`} aria-hidden="true">⌄</span>
            </button>
            {showOperations && (
              <div className="run-operation-options" id="run-operation-options" role="group" aria-label="Dostępne operacje">
                {operations.map((operation) => (
                  <button
                    className={`run-operation-option${action === operation.id ? " selected" : ""}`}
                    type="button"
                    aria-pressed={action === operation.id}
                    key={operation.id}
                    onClick={() => {
                      setAction(operation.id);
                      setShowOperations(false);
                    }}
                  >
                    <span className={`op-symbol ${operation.tone}-symbol`}>{operation.symbol}</span>
                    <span className="run-option-copy">
                      <strong>{actions[operation.id] || operation.id}</strong>
                      <small>{operation.description}</small>
                    </span>
                    <span className="run-option-check" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </fieldset>

        <fieldset className="run-target-picker">
          <legend>Konfiguracja docelowa</legend>
          {targets.length > 3 && (
            <label className="target-search">
              <span className="sr-only">Szukaj konfiguracji</span>
              <span aria-hidden="true">⌕</span>
              <input value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} placeholder="Szukaj po nazwie lub typie…" />
              {targetSearch && <button type="button" aria-label="Wyczyść wyszukiwanie" onClick={() => setTargetSearch("")}>×</button>}
            </label>
          )}
          {loadingTargets ? (
            <p className="target-picker-message" role="status">Wczytywanie konfiguracji…</p>
          ) : !targets.length ? (
            <p className="target-picker-message">Nie masz konfiguracji. Utwórz ją z menu „Nowe”.</p>
          ) : !Object.keys(targetGroups).length ? (
            <p className="target-picker-message">Brak konfiguracji pasujących do „{targetSearch}”.</p>
          ) : (
            <div className="run-target-list">
              {Object.entries(targetGroups).map(([backend, items]) => (
                <section className="run-target-group" key={backend} aria-label={backendNames[backend] || backend}>
                  <h3>{backendNames[backend] || backend}</h3>
                  <div className="run-target-options">
                    {items.map((target) => (
                      <label
                        className={`run-target-card${targetId === target.id ? " selected" : ""}`}
                        key={target.id}
                      >
                        <input className="run-radio" type="radio" name="job-target" value={target.id} checked={targetId === target.id} onChange={() => setTargetId(target.id)} />
                        <span className="target-type-mark" aria-hidden="true">{(backendNames[backend] || backend).slice(0, 1)}</span>
                        <span className="run-option-copy">
                          <strong>{target.name}</strong>
                          <small>{backendNames[backend] || backend}</small>
                        </span>
                        <span className="run-option-check" aria-hidden="true" />
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </fieldset>

        {action === "backup" && (
          <label className="dialog-field">
            Etykieta kopii <span className="optional-label">opcjonalna</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="np. przed aktualizacją" />
          </label>
        )}

        {action === "restore" && (
          <>
            <label className="dialog-field">
              Kopia do odtworzenia
              <select value={archive} onChange={(event) => setArchive(event.target.value)} required disabled={!backups.length}>
                <option value="">{backups.length ? "Wybierz archiwum" : "Brak kopii dla tej konfiguracji"}</option>
                {backups.map((file) => <option key={file} value={file}>{file}</option>)}
              </select>
            </label>
            <label className="restore-confirm">
              <input type="checkbox" checked={confirmRestore} onChange={(event) => setConfirmRestore(event.target.checked)} />
              <span>Rozumiem, że obecne dane zostaną zastąpione wybraną kopią.</span>
            </label>
          </>
        )}

        {error && <p className="error-message" role="alert">{error}</p>}

        <footer className="dialog-actions">
          <button className="button secondary" type="button" onClick={onClose}>Anuluj</button>
          <button className={`button ${action === "restore" ? "danger" : "primary"}`} disabled={busy || loadingTargets || !targetId || (action === "restore" && (!archive || !confirmRestore))}>
            {busy ? "Uruchamianie…" : "Uruchom job"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

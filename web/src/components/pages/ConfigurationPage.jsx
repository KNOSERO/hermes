import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const emptyTarget = {
  backend: "docker",
  name: "",
  user: "",
  host: "",
  port: "22",
  context: "",
  desktopUrl: "",
  hermesName: "hermes-agent",
  namespace: "hermes",
  storage: "10Gi",
  dataPath: "/opt/data",
  image: "nousresearch/hermes-agent:latest",
};

export default function ConfigurationPage({ selectedTargetId }) {
  const [defaults, setDefaults] = useState({});
  const [targets, setTargets] = useState([]);
  const [form, setForm] = useState(emptyTarget);
  const [file, setFile] = useState(null);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [config, savedTargets] = await Promise.all([
      api("/api/config"),
      api("/api/targets"),
    ]);
    setDefaults(config.defaults || {});
    setTargets(savedTargets.targets || []);
  }

  useEffect(() => {
    load().catch((cause) => setError(cause.message));
  }, []);

  const selectedTarget = targets.find((target) => target.id === selectedTargetId);
  const remoteTargets = targets.filter((target) => target.id !== "local-podman");

  const updateDefault = (key) => (event) =>
    setDefaults((current) => ({ ...current, [key]: event.target.value }));
  const updateTarget = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function saveDefaults(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults }),
      });
      setDefaults(result.defaults);
      setMessage("Zapisano domyślne ustawienia Hermes.");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTarget(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const credential = file ? await file.text() : "";
      const target = {
        ...form,
        credential,
      };
      await api(editingId ? `/api/targets/${editingId}` : "/api/targets", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      await load();
      resetForm();
      setMessage(editingId ? "Zaktualizowano profil." : "Dodano profil.");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  function editTarget(target) {
    setEditingId(target.id);
    setForm({ ...emptyTarget, ...target });
    setFile(null);
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingId("");
    setForm(emptyTarget);
    setFile(null);
  }

  async function deleteTarget(target) {
    if (
      !window.confirm(
        `Usunąć profil „${target.name}” i powiązany sekret z .secret?`,
      )
    )
      return;
    setError("");
    setMessage("");
    try {
      await api(`/api/targets/${target.id}`, { method: "DELETE" });
      if (editingId === target.id) resetForm();
      await load();
      setMessage("Usunięto profil i powiązany plik sekretu.");
    } catch (cause) {
      setError(cause.message);
    }
  }

  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">KONFIGURACJA REPOZYTORIUM</p>
          <h1>{selectedTarget ? `Konfiguracja: ${selectedTarget.name}` : "Profile i ustawienia"}</h1>
          <p className="intro">
            {selectedTarget
              ? "Szczegóły wybranego środowiska i jego parametry."
              : "Połączenia i domyślne parametry zapisują się w `.config`; sekrety trafiają do lokalnego `.secret`."}
          </p>
        </div>
      </section>

      {(message || error) && (
        <p className={error ? "error-message" : "success-message"}>
          {error || message}
        </p>
      )}

      {selectedTarget && (
        <section className="panel config-panel selected-config-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">WYBRANA KONFIGURACJA</p>
              <h2>{selectedTarget.name}</h2>
            </div>
            {selectedTarget.id !== "local-podman" && (
              <button className="button secondary" onClick={() => editTarget(selectedTarget)}>
                Edytuj konfigurację
              </button>
            )}
          </div>
          <div className="profile-card selected-profile-card">
            <div>
              <strong>{selectedTarget.backend === "podman" ? "Lokalny Podman" : selectedTarget.backend === "docker" ? "Docker przez SSH" : "Kubernetes"}</strong>
              {selectedTarget.backend === "docker" && <small>{selectedTarget.user}@{selectedTarget.host}:{selectedTarget.port}</small>}
              {selectedTarget.backend === "k3s" && <small>{selectedTarget.context || "Domyślny kontekst kubeconfig"}</small>}
              <small>Hermes Desktop: {selectedTarget.desktopUrl || "nie skonfigurowano"}</small>
              <small>Instancja: {selectedTarget.hermesName || defaults.name || "hermes-agent"} · Namespace: {selectedTarget.namespace || defaults.namespace || "hermes"}</small>
              <small>Dane: {selectedTarget.dataPath || defaults.data_path || "—"} · PVC: {selectedTarget.storage || defaults.storage || "—"}</small>
              <small>Obraz: {selectedTarget.image || defaults.image || "—"}</small>
              {selectedTarget.id !== "local-podman" && (
                <small className={selectedTarget.hasCredential ? "secret-ok" : "secret-missing"}>
                  {selectedTarget.hasCredential ? "Sekret jest zapisany w .secret" : "Brak pliku sekretu"}
                </small>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="config-layout">
        {(!selectedTarget || selectedTarget.id === "local-podman") && (
        <section className="panel config-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">USTAWIENIA ANSIBLE</p>
              <h2>Domyślne parametry Hermes</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={saveDefaults}>
            <label>
              Nazwa instancji
              <input
                value={defaults.name || ""}
                onChange={updateDefault("name")}
                required
              />
            </label>
            <label>
              Namespace
              <input
                value={defaults.namespace || ""}
                onChange={updateDefault("namespace")}
                required
              />
            </label>
            <label>
              Rozmiar PVC
              <input
                value={defaults.storage || ""}
                onChange={updateDefault("storage")}
                required
              />
            </label>
            <label>
              Ścieżka danych
              <input
                value={defaults.data_path || ""}
                onChange={updateDefault("data_path")}
                required
              />
            </label>
            <label className="wide-field">
              Obraz Hermes
              <input
                value={defaults.image || ""}
                onChange={updateDefault("image")}
                required
              />
            </label>
            <button className="button primary" disabled={busy}>
              Zapisz ustawienia
            </button>
          </form>
        </section>
        )}

        {!selectedTarget && (
        <section className="panel config-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">ZAPISANE POŁĄCZENIA</p>
              <h2>Profile środowisk</h2>
            </div>
            <span className="profile-count">{remoteTargets.length}</span>
          </div>
          <div className="profile-list">
            {remoteTargets.map((target) => (
              <article className="profile-card" key={target.id}>
                <div>
                  <strong>{target.name}</strong>
                  <small>
                    {target.backend === "docker"
                      ? `Docker · ${target.user}@${target.host}:${target.port}`
                      : `Kubernetes · ${target.context || "domyślny kontekst"}`}
                  </small>
                  <small>
                    {target.hermesName} · {target.namespace} · {target.storage}
                  </small>
                  <small>
                    Desktop: {target.desktopUrl || (target.backend === "docker" ? `http://${target.host}:9119` : "wymaga adresu NodePort")}
                  </small>
                  <small className={target.hasCredential ? "secret-ok" : "secret-missing"}>
                    {target.hasCredential ? "Sekret jest zapisany w .secret" : "Brak pliku sekretu"}
                  </small>
                </div>
                <div className="profile-actions">
                  <button
                    className="text-button"
                    onClick={() => editTarget(target)}
                  >
                    Edytuj
                  </button>
                  <button
                    className="text-button danger-text"
                    onClick={() => deleteTarget(target)}
                  >
                    Usuń
                  </button>
                </div>
              </article>
            ))}
            {!remoteTargets.length && (
              <p className="empty">Nie dodano jeszcze zdalnych profili.</p>
            )}
          </div>
        </section>
        )}

        {(!selectedTarget || (selectedTarget.id !== "local-podman" && editingId === selectedTarget.id)) && (
        <section className="panel config-panel profile-form-panel" id="new">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">
                {editingId ? "EDYCJA PROFILU" : "NOWE POŁĄCZENIE"}
              </p>
              <h2>{editingId ? "Edytuj profil" : "Dodaj Docker lub Kubernetes"}</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={saveTarget}>
            <label>
              Typ środowiska
              <select
                value={form.backend}
                disabled={Boolean(editingId)}
                onChange={updateTarget("backend")}
              >
                <option value="docker">Docker przez SSH</option>
                <option value="k3s">Kubernetes</option>
              </select>
            </label>
            <label>
              Nazwa profilu
              <input
                value={form.name}
                onChange={updateTarget("name")}
                placeholder="np. Produkcja"
                required
              />
            </label>
            {form.backend === "docker" ? (
              <>
                <label>
                  Użytkownik SSH
                  <input
                    value={form.user}
                    onChange={updateTarget("user")}
                    placeholder="np. deploy"
                    required
                  />
                </label>
                <label>
                  Host SSH
                  <input
                    value={form.host}
                    onChange={updateTarget("host")}
                    placeholder="np. docker.example.com"
                    required
                  />
                </label>
                <label>
                  Port SSH
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={form.port}
                    onChange={updateTarget("port")}
                    required
                  />
                </label>
              </>
            ) : (
              <label>
                Kontekst kubeconfig
                <input
                  value={form.context}
                  onChange={updateTarget("context")}
                  placeholder="puste = current-context"
                />
              </label>
            )}
            <label className="wide-field">
              Adres dla Hermes Desktop
              <input
                type="url"
                value={form.desktopUrl}
                onChange={updateTarget("desktopUrl")}
                placeholder={form.backend === "docker" ? "domyślnie http://host:9119" : "np. http://192.168.1.20:31119"}
              />
              <small>
                Dla Kubernetes podaj adres węzła osiągalny z tego komputera. Serwer będzie dostępny na porcie NodePort 31119.
              </small>
            </label>
            <label>
              Nazwa instancji Hermes
              <input
                value={form.hermesName}
                onChange={updateTarget("hermesName")}
                required
              />
            </label>
            <label>
              Namespace
              <input
                value={form.namespace}
                onChange={updateTarget("namespace")}
                required
              />
            </label>
            <label>
              Rozmiar PVC
              <input
                value={form.storage}
                onChange={updateTarget("storage")}
                required
              />
            </label>
            <label>
              Ścieżka danych
              <input
                value={form.dataPath}
                onChange={updateTarget("dataPath")}
                required
              />
            </label>
            <label className="wide-field">
              Obraz Hermes
              <input
                value={form.image}
                onChange={updateTarget("image")}
                required
              />
            </label>
            <label className="wide-field file-field">
              {form.backend === "docker" ? "Prywatny klucz SSH" : "Plik kubeconfig"}
              <input
                type="file"
                accept={form.backend === "docker" ? ".pem,.key,*" : ".yaml,.yml,*"}
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                required={!editingId}
              />
              <small>
                {form.backend === "docker"
                  ? file?.name || (editingId ? "Pozostaw puste, aby zachować klucz." : "Klucz bez hasła; zapis lokalnie w .secret/ssh.")
                  : file?.name || (editingId ? "Pozostaw puste, aby zachować kubeconfig." : "Użyj pliku z danymi certyfikatu wbudowanymi w kubeconfig.")}
              </small>
            </label>
            <div className="form-actions wide-field">
              <button className="button primary" disabled={busy}>
                {editingId ? "Zapisz profil" : "Dodaj profil"}
              </button>
              {editingId && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={resetForm}
                >
                  Anuluj edycję
                </button>
              )}
            </div>
          </form>
        </section>
        )}
      </div>
    </>
  );
}

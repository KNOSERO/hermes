import { useState } from "react";

export default function DesktopConnectionCard({ connection }) {
  const [message, setMessage] = useState("");
  if (!connection) return null;

  async function copyConnection() {
    try {
      await navigator.clipboard.writeText(
        `URL: ${connection.url}\nUżytkownik: ${connection.username}\nHasło: ${connection.password}`,
      );
      setMessage("Skopiowano dane połączenia.");
    } catch {
      setMessage("Schowek niedostępny. Skopiuj dane ręcznie.");
    }
  }

  return (
    <section className="panel desktop-connection">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">HERMES DESKTOP</p>
          <h2>Połączenie gotowe</h2>
        </div>
        <button className="button secondary" onClick={copyConnection}>
          Kopiuj dane
        </button>
      </div>
      <dl className="connection-details">
        <div><dt>Remote URL</dt><dd>{connection.url || "Ustaw URL Desktop w profilu"}</dd></div>
        <div><dt>Użytkownik</dt><dd>{connection.username}</dd></div>
        <div><dt>Hasło</dt><dd>{connection.password}</dd></div>
      </dl>
      <p className="help-text">
        W Desktop wybierz Settings → Gateways → Remote gateway, wpisz URL i zaloguj się tymi danymi.
      </p>
      {message && <p className="setting-foot">{message}</p>}
    </section>
  );
}

export default function SettingsPanel({ defaults, form, updateField }) {
  return (
    <section className="panel settings" id="settings">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">KONFIGURACJA</p>
          <h2>Parametry</h2>
        </div>
        <span className="gear">⚙</span>
      </div>
      <label>
        Nazwa instalacji
        <input
          value={form.name}
          onChange={updateField("name")}
          autoComplete="off"
          placeholder={defaults.name || "hermes-agent"}
        />
      </label>
      <p className="help-text">
        Puste pole używa wartości z ansible/config.yml.
      </p>
      <div className="setting-foot">
        <span className="status-dot" /> Wartości z formularza dotyczą
        kolejnego zadania.
      </div>
    </section>
  );
}

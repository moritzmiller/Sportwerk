const tools = [
  {
    name: "Pressespiegel",
    area: "Kommunikation",
    status: "Aktiv",
    href: "/pressespiegel",
    accent: "orange",
    metrics: ["PDF Export", "Artikelgruppen", "Layouts"],
  },
  {
    name: "Transkript",
    area: "Meetings",
    status: "Vorbereitet",
    href: null,
    accent: "blue",
    metrics: ["Aufnahmen", "Protokolle"],
  },
  {
    name: "Protokoll",
    area: "Dokumentation",
    status: "Vorbereitet",
    href: null,
    accent: "green",
    metrics: ["Vorlagen", "Export"],
  },
  {
    name: "Spieltage",
    area: "Sportdaten",
    status: "Vorbereitet",
    href: null,
    accent: "orange",
    metrics: ["Datenbank", "Spielpläne"],
  },
  {
    name: "Analytics",
    area: "Auswertung",
    status: "Vorbereitet",
    href: null,
    accent: "blue",
    metrics: ["Reports", "Kennzahlen"],
  },
  {
    name: "Aufgabenverwaltung",
    area: "Kundenarbeit",
    status: "Konzept",
    href: "/aufgabenverwaltung",
    accent: "green",
    metrics: ["Kunden", "Aufgaben", "Zeiten"],
  },
  {
    name: "Trello",
    area: "Projektarbeit",
    status: "Aktiv",
    href: "/trello",
    accent: "blue",
    metrics: ["Boards", "Zusammenfassung"],
  },
  {
    name: "Teilnahmebedingungen",
    area: "Dokumente",
    status: "Aktiv",
    href: "/teilnahmebedingungen",
    accent: "orange",
    metrics: ["DOCX", "Caption", "Gewinnspiel"],
  },
];

function ToolCard({ tool }) {
  const content = (
    <>
      <div className="tool-card__top">
        <div className={`tool-card__mark tool-card__mark--${tool.accent}`} aria-hidden="true">
          {tool.name.slice(0, 2).toUpperCase()}
        </div>
        <span className={tool.href ? "status-pill status-pill--active" : "status-pill"}>
          {tool.status}
        </span>
      </div>
      <div>
        <p className="tool-card__area">{tool.area}</p>
        <h2>{tool.name}</h2>
      </div>
      <div className="tool-card__metrics" aria-label={`${tool.name} Module`}>
        {tool.metrics.map((metric) => (
            <span key={metric} dangerouslySetInnerHTML={{ __html: metric }} />
        ))}
      </div>
    </>
  );

  if (tool.href) {
    return (
      <a className="tool-card tool-card--link" href={tool.href}>
        {content}
      </a>
    );
  }

  return (
    <article className="tool-card tool-card--disabled" aria-disabled="true">
      {content}
    </article>
  );
}

function Dashboard() {
  const activeTools = tools.filter((tool) => tool.href).length;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Sportwerk</p>
          <h1>Werkzeugzentrale</h1>
        </div>
        <div className="dashboard-header__meta" aria-label="Dashboard Status">
          <div>
            <strong>{activeTools}</strong>
            <span>aktiv</span>
          </div>
          <div>
            <strong>{tools.length}</strong>
            <span>Tools</span>
          </div>
        </div>
      </header>

      <section className="dashboard-hero" aria-label="Sportwerk Dashboard">
        <div>
          <p className="dashboard-hero__label">Unternehmensportal</p>
          <h2>Ein zentraler Einstieg für Sportwerk-Workflows.</h2>
        </div>
        <a className="button button--primary dashboard-hero__action" href="/pressespiegel">
          Pressespiegel öffnen
        </a>
      </section>

      <section className="tool-grid" aria-label="Sportwerk Tools">
        {tools.map((tool) => (
          <ToolCard key={tool.name} tool={tool} />
        ))}
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.querySelector("#dashboard-root")).render(<Dashboard />);

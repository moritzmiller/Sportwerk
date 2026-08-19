// Generated from ../dashboard.jsx by scripts/build-jsx.js
const tools = [{
  name: "Pressespiegel",
  area: "Kommunikation",
  status: "Aktiv",
  href: "/pressespiegel",
  accent: "orange",
  metrics: ["PDF Export", "Artikelgruppen", "Layouts"]
}, {
  name: "Transkript",
  area: "Meetings",
  status: "Vorbereitet",
  href: null,
  accent: "blue",
  metrics: ["Aufnahmen", "Protokolle"]
}, {
  name: "Protokoll",
  area: "Dokumentation",
  status: "Vorbereitet",
  href: null,
  accent: "green",
  metrics: ["Vorlagen", "Export"]
}, {
  name: "Spieltage",
  area: "Sportdaten",
  status: "Vorbereitet",
  href: null,
  accent: "orange",
  metrics: ["Datenbank", "Spielpläne"]
}, {
  name: "Analytics",
  area: "Auswertung",
  status: "Vorbereitet",
  href: null,
  accent: "blue",
  metrics: ["Reports", "Kennzahlen"]
}, {
  name: "Aufgabenverwaltung",
  area: "Kundenarbeit",
  status: "Konzept",
  href: "/aufgabenverwaltung",
  accent: "green",
  metrics: ["Kunden", "Aufgaben", "Zeiten"]
}, {
  name: "Trello",
  area: "Projektarbeit",
  status: "Aktiv",
  href: "/trello",
  accent: "blue",
  metrics: ["Boards", "Zusammenfassung"]
}, {
  name: "Teilnahmebedingungen",
  area: "Dokumente",
  status: "Aktiv",
  href: "/teilnahmebedingungen",
  accent: "orange",
  metrics: ["DOCX", "Caption", "Gewinnspiel"]
}];
function ToolCard({
  tool
}) {
  const content = React.createElement(React.Fragment, null, React.createElement("div", {
    className: "tool-card__top"
  }, React.createElement("div", {
    className: `tool-card__mark tool-card__mark--${tool.accent}`,
    "aria-hidden": "true"
  }, tool.name.slice(0, 2).toUpperCase()), React.createElement("span", {
    className: tool.href ? "status-pill status-pill--active" : "status-pill"
  }, tool.status)), React.createElement("div", null, React.createElement("p", {
    className: "tool-card__area"
  }, tool.area), React.createElement("h2", null, tool.name)), React.createElement("div", {
    className: "tool-card__metrics",
    "aria-label": `${tool.name} Module`
  }, tool.metrics.map(metric => React.createElement("span", {
    key: metric,
    dangerouslySetInnerHTML: {
      __html: metric
    }
  }))));
  if (tool.href) {
    return React.createElement("a", {
      className: "tool-card tool-card--link",
      href: tool.href
    }, content);
  }
  return React.createElement("article", {
    className: "tool-card tool-card--disabled",
    "aria-disabled": "true"
  }, content);
}
function Dashboard() {
  const activeTools = tools.filter(tool => tool.href).length;
  return React.createElement("main", {
    className: "dashboard-shell"
  }, React.createElement("header", {
    className: "dashboard-header"
  }, React.createElement("div", null, React.createElement("p", {
    className: "eyebrow"
  }, "Sportwerk"), React.createElement("h1", null, "Werkzeugzentrale")), React.createElement("div", {
    className: "dashboard-header__meta",
    "aria-label": "Dashboard Status"
  }, React.createElement("div", null, React.createElement("strong", null, activeTools), React.createElement("span", null, "aktiv")), React.createElement("div", null, React.createElement("strong", null, tools.length), React.createElement("span", null, "Tools")))), React.createElement("section", {
    className: "dashboard-hero",
    "aria-label": "Sportwerk Dashboard"
  }, React.createElement("div", null, React.createElement("p", {
    className: "dashboard-hero__label"
  }, "Unternehmensportal"), React.createElement("h2", null, "Ein zentraler Einstieg für Sportwerk-Workflows.")), React.createElement("a", {
    className: "button button--primary dashboard-hero__action",
    href: "/pressespiegel"
  }, "Pressespiegel öffnen")), React.createElement("section", {
    className: "tool-grid",
    "aria-label": "Sportwerk Tools"
  }, tools.map(tool => React.createElement(ToolCard, {
    key: tool.name,
    tool: tool
  }))));
}
ReactDOM.createRoot(document.querySelector("#dashboard-root")).render(React.createElement(Dashboard, null));

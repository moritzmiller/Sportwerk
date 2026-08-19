// Generated from ../aufgabenverwaltung.jsx by scripts/build-jsx.js
const customers = [{
  id: "adler",
  name: "Adler Apotheke",
  initials: "AA",
  manager: "Moritz",
  status: "Aktiv",
  priority: "Hoch",
  departments: ["Projektmanagement", "Design", "Marketing"],
  openTasks: 14,
  overdueTasks: 3,
  nextDeadline: "2026-08-05",
  lastActivity: "Landingpage-Freigabe angefragt",
  trackedTime: "42:15 h",
  openEmails: 5,
  blocker: "Feedback zur Kampagne fehlt",
  contacts: ["Julia Kramer", "Markus Vogt"],
  boards: ["Allgemein", "Marketing", "Design"],
  tasks: [{
    title: "Sommerkampagne finalisieren",
    status: "In Bearbeitung",
    priority: "Hoch",
    due: "2026-08-05",
    assignee: "Anna",
    department: "Marketing",
    labels: ["Freigabe", "Kundenfeedback"],
    estimate: "6 h",
    tracked: "4:20 h"
  }, {
    title: "Hero-Grafik überarbeiten",
    status: "Zur Prüfung",
    priority: "Mittel",
    due: "2026-08-06",
    assignee: "Lea",
    department: "Design",
    labels: ["Design"],
    estimate: "3 h",
    tracked: "2:45 h"
  }, {
    title: "Ansprechpartner für Newsletter klären",
    status: "Wartet auf Rückmeldung",
    priority: "Hoch",
    due: "2026-08-03",
    assignee: "Moritz",
    department: "Projektmanagement",
    labels: ["Kundenfeedback"],
    estimate: "1 h",
    tracked: "0:35 h"
  }],
  emails: ["Re: Sommerkampagne Freigabe", "Neue Bildrechte für Kampagne", "Rückfrage zur Newsletter-Zielgruppe"],
  activity: ["Anna hat den Status auf In Bearbeitung gesetzt.", "Lea hat eine Datei hochgeladen.", "Moritz wurde in einer Nachricht erwähnt."]
}, {
  id: "cityfit",
  name: "CityFit Studios",
  initials: "CF",
  manager: "Anna",
  status: "Wartet auf Kunden",
  priority: "Mittel",
  departments: ["Projektmanagement", "Entwicklung", "Support"],
  openTasks: 9,
  overdueTasks: 1,
  nextDeadline: "2026-08-07",
  lastActivity: "Support-Ticket in Aufgabe umgewandelt",
  trackedTime: "18:40 h",
  openEmails: 2,
  blocker: "Vertragsdaten fehlen",
  contacts: ["Nina Scholz"],
  boards: ["Allgemein", "Entwicklung", "Support"],
  tasks: [{
    title: "Mitgliederbereich Fehleranalyse",
    status: "Geplant",
    priority: "Hoch",
    due: "2026-08-07",
    assignee: "Jonas",
    department: "Entwicklung",
    labels: ["Entwicklung", "Dringend"],
    estimate: "5 h",
    tracked: "1:10 h"
  }, {
    title: "Support-Antwort vorbereiten",
    status: "Offen",
    priority: "Mittel",
    due: "2026-08-08",
    assignee: "Anna",
    department: "Support",
    labels: ["Kundenfeedback"],
    estimate: "2 h",
    tracked: "0:00 h"
  }, {
    title: "Vertragsdaten nachfassen",
    status: "Wartet auf Rückmeldung",
    priority: "Mittel",
    due: "2026-08-02",
    assignee: "Moritz",
    department: "Projektmanagement",
    labels: ["Intern"],
    estimate: "1 h",
    tracked: "0:25 h"
  }],
  emails: ["Support-Ticket Mitgliederbereich", "Vertragsdaten Studio 3"],
  activity: ["Support-Mail wurde CityFit Studios zugeordnet.", "Jonas wurde der Aufgabe Mitgliederbereich Fehleranalyse zugewiesen.", "Deadline für Vertragsdaten nachfassen wurde geändert."]
}, {
  id: "nordlicht",
  name: "Nordlicht Events",
  initials: "NE",
  manager: "Moritz",
  status: "Blockiert",
  priority: "Hoch",
  departments: ["Eventmanagement", "Design", "Buchhaltung"],
  openTasks: 21,
  overdueTasks: 6,
  nextDeadline: "2026-08-04",
  lastActivity: "Budgetfreigabe blockiert",
  trackedTime: "67:05 h",
  openEmails: 8,
  blocker: "Budgetfreigabe offen",
  contacts: ["Felix Neumann", "Sarah Heise"],
  boards: ["Allgemein", "Eventmanagement", "Abrechnung"],
  tasks: [{
    title: "Budgetfreigabe einholen",
    status: "Blockiert",
    priority: "Hoch",
    due: "2026-08-04",
    assignee: "Moritz",
    department: "Eventmanagement",
    labels: ["Freigabe", "Dringend"],
    estimate: "2 h",
    tracked: "1:15 h"
  }, {
    title: "Sponsorenwand Druckdaten",
    status: "In Bearbeitung",
    priority: "Hoch",
    due: "2026-08-05",
    assignee: "Lea",
    department: "Design",
    labels: ["Design"],
    estimate: "4 h",
    tracked: "3:30 h"
  }, {
    title: "Abrechnung Zwischenstand",
    status: "Offen",
    priority: "Mittel",
    due: "2026-08-09",
    assignee: "Mara",
    department: "Buchhaltung",
    labels: ["Abrechnung"],
    estimate: "3 h",
    tracked: "0:40 h"
  }],
  emails: ["Budgetentscheidung", "Druckdaten Sponsorenwand", "Freigabe Bühnenplan"],
  activity: ["Status wurde auf Blockiert gesetzt.", "Neue E-Mail Budgetentscheidung ist offen.", "Mara hat einen Zeiteintrag erstellt."]
}, {
  id: "werkbank",
  name: "Werkbank Medien",
  initials: "WM",
  manager: "Lea",
  status: "In Vorbereitung",
  priority: "Niedrig",
  departments: ["Vertrieb", "Projektmanagement"],
  openTasks: 5,
  overdueTasks: 0,
  nextDeadline: "2026-08-12",
  lastActivity: "Standardboards angelegt",
  trackedTime: "6:30 h",
  openEmails: 1,
  blocker: "",
  contacts: ["Tobias Lenz"],
  boards: ["Allgemein", "Vertrieb"],
  tasks: [{
    title: "Kickoff vorbereiten",
    status: "Geplant",
    priority: "Mittel",
    due: "2026-08-12",
    assignee: "Lea",
    department: "Projektmanagement",
    labels: ["Intern"],
    estimate: "2 h",
    tracked: "0:30 h"
  }, {
    title: "Angebotsunterlagen prüfen",
    status: "Offen",
    priority: "Niedrig",
    due: "",
    assignee: "Moritz",
    department: "Vertrieb",
    labels: ["Abrechnung"],
    estimate: "1 h",
    tracked: "0:00 h"
  }],
  emails: ["Kickoff Terminvorschlag"],
  activity: ["Kunde wurde angelegt.", "Boards Allgemein und Vertrieb wurden aus Vorlage erstellt.", "Lea wurde als Projektmanagerin gesetzt."]
}];
const statusOptions = ["Alle Status", "Aktiv", "Wartet auf Kunden", "Blockiert", "In Vorbereitung"];
const departmentOptions = ["Alle Abteilungen", "Projektmanagement", "Marketing", "Design", "Entwicklung", "Support", "Eventmanagement", "Buchhaltung", "Vertrieb"];
function isOverdue(dateValue) {
  return dateValue && new Date(dateValue) < new Date("2026-08-04T23:59:00");
}
function formatDate(dateValue) {
  if (!dateValue) {
    return "Ohne Deadline";
  }
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(dateValue));
}
function StatusPill({
  value
}) {
  const modifier = value === "Blockiert" ? "danger" : value === "Aktiv" ? "active" : value === "Wartet auf Kunden" ? "waiting" : "neutral";
  return React.createElement("span", {
    className: `status-pill status-pill--${modifier}`
  }, value);
}
function SectionHeader({
  title,
  meta
}) {
  return React.createElement("div", {
    className: "task-section-header"
  }, React.createElement("h2", null, title), meta && React.createElement("span", null, meta));
}
function TaskRow({
  task
}) {
  return React.createElement("article", {
    className: isOverdue(task.due) ? "task-row task-row--overdue" : "task-row"
  }, React.createElement("div", null, React.createElement("strong", null, task.title), React.createElement("span", null, task.department, " - ", task.assignee)), React.createElement("div", {
    className: "task-row__meta"
  }, React.createElement("span", {
    className: isOverdue(task.due) ? "task-date task-date--overdue" : "task-date"
  }, formatDate(task.due)), React.createElement("span", null, task.status), React.createElement("span", null, task.tracked, " / ", task.estimate)), React.createElement("div", {
    className: "concept-chip-grid concept-chip-grid--compact"
  }, task.labels.map(label => React.createElement("span", {
    key: label
  }, label))));
}
function CustomerCard({
  customer,
  selected,
  onSelect
}) {
  const hasRisk = customer.overdueTasks > 0 || customer.openEmails > 3 || customer.status === "Blockiert";
  return React.createElement("button", {
    className: selected ? "customer-card customer-card--selected" : "customer-card",
    type: "button",
    onClick: () => onSelect(customer.id)
  }, React.createElement("div", {
    className: "customer-card__top"
  }, React.createElement("span", {
    className: "customer-avatar"
  }, customer.initials), React.createElement("div", null, React.createElement("strong", null, customer.name), React.createElement("span", null, customer.manager, " - ", customer.priority)), React.createElement(StatusPill, {
    value: customer.status
  })), React.createElement("div", {
    className: "customer-card__metrics"
  }, React.createElement("span", null, customer.openTasks, " Aufgaben"), React.createElement("span", null, customer.overdueTasks, " überfällig"), React.createElement("span", null, customer.openEmails, " E-Mails")), React.createElement("div", {
    className: "customer-card__deadline"
  }, React.createElement("span", null, "Nächste Deadline"), React.createElement("strong", null, formatDate(customer.nextDeadline))), hasRisk && React.createElement("div", {
    className: "customer-card__warning"
  }, customer.status === "Blockiert" ? customer.blocker : `${customer.overdueTasks} überfällig`));
}
function Metric({
  label,
  value
}) {
  return React.createElement("div", null, React.createElement("strong", null, value), React.createElement("span", null, label));
}
function CustomerDetail({
  customer
}) {
  return React.createElement("section", {
    className: "customer-detail"
  }, React.createElement("div", {
    className: "customer-detail__header"
  }, React.createElement("div", {
    className: "customer-detail__identity"
  }, React.createElement("span", {
    className: "customer-avatar customer-avatar--large"
  }, customer.initials), React.createElement("div", null, React.createElement("h2", null, customer.name), React.createElement("div", {
    className: "customer-detail__meta"
  }, React.createElement(StatusPill, {
    value: customer.status
  }), React.createElement("span", null, "PM: ", customer.manager), React.createElement("span", null, "Nächste Deadline: ", formatDate(customer.nextDeadline)))))), React.createElement("section", {
    className: "meeting-status-strip",
    "aria-label": "Projektstatus"
  }, React.createElement("article", null, React.createElement("span", null, "Letzter Stand"), React.createElement("strong", null, customer.lastActivity)), React.createElement("article", {
    className: customer.blocker ? "meeting-status-strip__risk" : ""
  }, React.createElement("span", null, "Blocker"), React.createElement("strong", null, customer.blocker || "Keine aktiven Blocker")), React.createElement("article", null, React.createElement("span", null, "Beteiligte Bereiche"), React.createElement("strong", null, customer.departments.join(", ")))), React.createElement("div", {
    className: "customer-detail__grid"
  }, React.createElement("section", {
    className: "task-panel"
  }, React.createElement(SectionHeader, {
    title: "Aktuelle Aufgaben",
    meta: `${customer.tasks.length} im Fokus`
  }), React.createElement("div", {
    className: "task-list"
  }, customer.tasks.map(task => React.createElement(TaskRow, {
    key: task.title,
    task: task
  })))), React.createElement("section", {
    className: "task-panel"
  }, React.createElement(SectionHeader, {
    title: "Meeting-Daten"
  }), React.createElement("div", {
    className: "task-metrics task-metrics--stacked"
  }, React.createElement(Metric, {
    label: "Offene Aufgaben",
    value: customer.openTasks
  }), React.createElement(Metric, {
    label: "Überfällig",
    value: customer.overdueTasks
  }), React.createElement(Metric, {
    label: "Offene E-Mails",
    value: customer.openEmails
  }), React.createElement(Metric, {
    label: "Zeit im Zeitraum",
    value: customer.trackedTime
  }))), React.createElement("section", {
    className: "task-panel"
  }, React.createElement(SectionHeader, {
    title: "Offene E-Mails",
    meta: `${customer.openEmails} offen`
  }), React.createElement("ul", {
    className: "compact-feed"
  }, customer.emails.map(email => React.createElement("li", {
    key: email
  }, email)))), React.createElement("section", {
    className: "task-panel"
  }, React.createElement(SectionHeader, {
    title: "Aktivitätsverlauf"
  }), React.createElement("ul", {
    className: "compact-feed"
  }, customer.activity.map(entry => React.createElement("li", {
    key: entry
  }, entry)))), React.createElement("section", {
    className: "task-panel task-panel--wide"
  }, React.createElement(SectionHeader, {
    title: "Kundeninformationen"
  }), React.createElement("div", {
    className: "info-list info-list--grid"
  }, React.createElement("div", null, React.createElement("strong", null, "Abteilungen"), React.createElement("span", null, customer.departments.join(", "))), React.createElement("div", null, React.createElement("strong", null, "Boards"), React.createElement("span", null, customer.boards.join(", "))), React.createElement("div", null, React.createElement("strong", null, "Ansprechpartner"), React.createElement("span", null, customer.contacts.join(", "))), React.createElement("div", null, React.createElement("strong", null, "Blocker"), React.createElement("span", null, customer.blocker || "Keine aktiven Blocker"))))));
}
function WorkspaceView() {
  const [selectedId, setSelectedId] = React.useState(customers[0].id);
  const [status, setStatus] = React.useState("Alle Status");
  const [department, setDepartment] = React.useState("Alle Abteilungen");
  const [query, setQuery] = React.useState("");
  const [onlyRisk, setOnlyRisk] = React.useState(false);
  const filteredCustomers = customers.filter(customer => {
    const matchesStatus = status === "Alle Status" || customer.status === status;
    const matchesDepartment = department === "Alle Abteilungen" || customer.departments.includes(department);
    const matchesQuery = customer.name.toLowerCase().includes(query.toLowerCase());
    const matchesRisk = !onlyRisk || customer.overdueTasks > 0 || customer.openEmails > 3 || customer.status === "Blockiert";
    return matchesStatus && matchesDepartment && matchesQuery && matchesRisk;
  });
  const selectedCustomer = filteredCustomers.find(customer => customer.id === selectedId) || filteredCustomers[0] || customers[0];
  const riskCount = customers.filter(customer => customer.overdueTasks > 0 || customer.openEmails > 3 || customer.status === "Blockiert").length;
  const blockedCount = customers.filter(customer => customer.status === "Blockiert").length;
  const openEmails = customers.reduce((sum, customer) => sum + customer.openEmails, 0);
  return React.createElement(React.Fragment, null, React.createElement("section", {
    className: "task-summary",
    "aria-label": "Aufgabenverwaltung Kennzahlen"
  }, React.createElement(Metric, {
    label: "Kunden/Projekte",
    value: customers.length
  }), React.createElement(Metric, {
    label: "Offene Aufgaben",
    value: customers.reduce((sum, customer) => sum + customer.openTasks, 0)
  }), React.createElement(Metric, {
    label: "Blockiert",
    value: blockedCount
  }), React.createElement(Metric, {
    label: "Offene E-Mails",
    value: openEmails
  })), React.createElement("section", {
    className: "meeting-controls"
  }, React.createElement(SectionHeader, {
    title: "Meeting-Filter",
    meta: `${filteredCustomers.length} von ${customers.length}`
  }), React.createElement("div", {
    className: "meeting-filter-grid"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", null, "Kunde suchen"), React.createElement("input", {
    value: query,
    onChange: event => setQuery(event.target.value),
    placeholder: "Name eingeben"
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", null, "Status"), React.createElement("select", {
    value: status,
    onChange: event => setStatus(event.target.value)
  }, statusOptions.map(option => React.createElement("option", {
    key: option
  }, option)))), React.createElement("label", {
    className: "field"
  }, React.createElement("span", null, "Abteilung"), React.createElement("select", {
    value: department,
    onChange: event => setDepartment(event.target.value)
  }, departmentOptions.map(option => React.createElement("option", {
    key: option
  }, option)))), React.createElement("label", {
    className: "toggle-row"
  }, React.createElement("input", {
    type: "checkbox",
    checked: onlyRisk,
    onChange: event => setOnlyRisk(event.target.checked)
  }), React.createElement("span", null, "Nur Warnungen")))), React.createElement("section", {
    className: "meeting-workspace"
  }, React.createElement("section", {
    className: "customer-column",
    "aria-label": "Kundenübersicht"
  }, React.createElement(SectionHeader, {
    title: "Kundenstatus",
    meta: `${riskCount} Warnungen`
  }), React.createElement("div", {
    className: "customer-list"
  }, filteredCustomers.map(customer => React.createElement(CustomerCard, {
    key: customer.id,
    customer: customer,
    selected: customer.id === selectedCustomer.id,
    onSelect: setSelectedId
  })), filteredCustomers.length === 0 && React.createElement("p", {
    className: "notice"
  }, "Keine Kunden für diese Filter gefunden."))), React.createElement(CustomerDetail, {
    customer: selectedCustomer
  })));
}
function Aufgabenverwaltung() {
  return React.createElement("main", {
    className: "dashboard-shell"
  }, React.createElement("header", {
    className: "dashboard-header"
  }, React.createElement("div", null, React.createElement("h1", null, "Aufgabenverwaltung")), React.createElement("div", {
    className: "topbar__meta"
  }, React.createElement("a", {
    href: "/"
  }, "Dashboard"))), React.createElement(WorkspaceView, null));
}
ReactDOM.createRoot(document.querySelector("#task-management-root")).render(React.createElement(Aufgabenverwaltung, null));

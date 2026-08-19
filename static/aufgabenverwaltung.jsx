const customers = [
  {
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
    tasks: [
      { title: "Sommerkampagne finalisieren", status: "In Bearbeitung", priority: "Hoch", due: "2026-08-05", assignee: "Anna", department: "Marketing", labels: ["Freigabe", "Kundenfeedback"], estimate: "6 h", tracked: "4:20 h" },
      { title: "Hero-Grafik überarbeiten", status: "Zur Prüfung", priority: "Mittel", due: "2026-08-06", assignee: "Lea", department: "Design", labels: ["Design"], estimate: "3 h", tracked: "2:45 h" },
      { title: "Ansprechpartner für Newsletter klären", status: "Wartet auf Rückmeldung", priority: "Hoch", due: "2026-08-03", assignee: "Moritz", department: "Projektmanagement", labels: ["Kundenfeedback"], estimate: "1 h", tracked: "0:35 h" },
    ],
    emails: [
      "Re: Sommerkampagne Freigabe",
      "Neue Bildrechte für Kampagne",
      "Rückfrage zur Newsletter-Zielgruppe",
    ],
    activity: [
      "Anna hat den Status auf In Bearbeitung gesetzt.",
      "Lea hat eine Datei hochgeladen.",
      "Moritz wurde in einer Nachricht erwähnt.",
    ],
  },
  {
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
    tasks: [
      { title: "Mitgliederbereich Fehleranalyse", status: "Geplant", priority: "Hoch", due: "2026-08-07", assignee: "Jonas", department: "Entwicklung", labels: ["Entwicklung", "Dringend"], estimate: "5 h", tracked: "1:10 h" },
      { title: "Support-Antwort vorbereiten", status: "Offen", priority: "Mittel", due: "2026-08-08", assignee: "Anna", department: "Support", labels: ["Kundenfeedback"], estimate: "2 h", tracked: "0:00 h" },
      { title: "Vertragsdaten nachfassen", status: "Wartet auf Rückmeldung", priority: "Mittel", due: "2026-08-02", assignee: "Moritz", department: "Projektmanagement", labels: ["Intern"], estimate: "1 h", tracked: "0:25 h" },
    ],
    emails: ["Support-Ticket Mitgliederbereich", "Vertragsdaten Studio 3"],
    activity: [
      "Support-Mail wurde CityFit Studios zugeordnet.",
      "Jonas wurde der Aufgabe Mitgliederbereich Fehleranalyse zugewiesen.",
      "Deadline für Vertragsdaten nachfassen wurde geändert.",
    ],
  },
  {
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
    tasks: [
      { title: "Budgetfreigabe einholen", status: "Blockiert", priority: "Hoch", due: "2026-08-04", assignee: "Moritz", department: "Eventmanagement", labels: ["Freigabe", "Dringend"], estimate: "2 h", tracked: "1:15 h" },
      { title: "Sponsorenwand Druckdaten", status: "In Bearbeitung", priority: "Hoch", due: "2026-08-05", assignee: "Lea", department: "Design", labels: ["Design"], estimate: "4 h", tracked: "3:30 h" },
      { title: "Abrechnung Zwischenstand", status: "Offen", priority: "Mittel", due: "2026-08-09", assignee: "Mara", department: "Buchhaltung", labels: ["Abrechnung"], estimate: "3 h", tracked: "0:40 h" },
    ],
    emails: ["Budgetentscheidung", "Druckdaten Sponsorenwand", "Freigabe Bühnenplan"],
    activity: [
      "Status wurde auf Blockiert gesetzt.",
      "Neue E-Mail Budgetentscheidung ist offen.",
      "Mara hat einen Zeiteintrag erstellt.",
    ],
  },
  {
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
    tasks: [
      { title: "Kickoff vorbereiten", status: "Geplant", priority: "Mittel", due: "2026-08-12", assignee: "Lea", department: "Projektmanagement", labels: ["Intern"], estimate: "2 h", tracked: "0:30 h" },
      { title: "Angebotsunterlagen prüfen", status: "Offen", priority: "Niedrig", due: "", assignee: "Moritz", department: "Vertrieb", labels: ["Abrechnung"], estimate: "1 h", tracked: "0:00 h" },
    ],
    emails: ["Kickoff Terminvorschlag"],
    activity: [
      "Kunde wurde angelegt.",
      "Boards Allgemein und Vertrieb wurden aus Vorlage erstellt.",
      "Lea wurde als Projektmanagerin gesetzt.",
    ],
  },
];

const statusOptions = ["Alle Status", "Aktiv", "Wartet auf Kunden", "Blockiert", "In Vorbereitung"];
const departmentOptions = ["Alle Abteilungen", "Projektmanagement", "Marketing", "Design", "Entwicklung", "Support", "Eventmanagement", "Buchhaltung", "Vertrieb"];

function isOverdue(dateValue) {
  return dateValue && new Date(dateValue) < new Date("2026-08-04T23:59:00");
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "Ohne Deadline";
  }
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(dateValue));
}

function StatusPill({ value }) {
  const modifier = value === "Blockiert" ? "danger" : value === "Aktiv" ? "active" : value === "Wartet auf Kunden" ? "waiting" : "neutral";
  return <span className={`status-pill status-pill--${modifier}`}>{value}</span>;
}

function SectionHeader({ title, meta }) {
  return (
    <div className="task-section-header">
      <h2>{title}</h2>
      {meta && <span>{meta}</span>}
    </div>
  );
}

function TaskRow({ task }) {
  return (
    <article className={isOverdue(task.due) ? "task-row task-row--overdue" : "task-row"}>
      <div>
        <strong>{task.title}</strong>
        <span>{task.department} - {task.assignee}</span>
      </div>
      <div className="task-row__meta">
        <span className={isOverdue(task.due) ? "task-date task-date--overdue" : "task-date"}>{formatDate(task.due)}</span>
        <span>{task.status}</span>
        <span>{task.tracked} / {task.estimate}</span>
      </div>
      <div className="concept-chip-grid concept-chip-grid--compact">
        {task.labels.map((label) => <span key={label}>{label}</span>)}
      </div>
    </article>
  );
}

function CustomerCard({ customer, selected, onSelect }) {
  const hasRisk = customer.overdueTasks > 0 || customer.openEmails > 3 || customer.status === "Blockiert";

  return (
    <button className={selected ? "customer-card customer-card--selected" : "customer-card"} type="button" onClick={() => onSelect(customer.id)}>
      <div className="customer-card__top">
        <span className="customer-avatar">{customer.initials}</span>
        <div>
          <strong>{customer.name}</strong>
          <span>{customer.manager} - {customer.priority}</span>
        </div>
        <StatusPill value={customer.status} />
      </div>
      <div className="customer-card__metrics">
        <span>{customer.openTasks} Aufgaben</span>
        <span>{customer.overdueTasks} überfällig</span>
        <span>{customer.openEmails} E-Mails</span>
      </div>
      <div className="customer-card__deadline">
        <span>Nächste Deadline</span>
        <strong>{formatDate(customer.nextDeadline)}</strong>
      </div>
      {hasRisk && (
        <div className="customer-card__warning">
          {customer.status === "Blockiert" ? customer.blocker : `${customer.overdueTasks} überfällig`}
        </div>
      )}
    </button>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function CustomerDetail({ customer }) {
  return (
    <section className="customer-detail">
      <div className="customer-detail__header">
        <div className="customer-detail__identity">
          <span className="customer-avatar customer-avatar--large">{customer.initials}</span>
          <div>
            <h2>{customer.name}</h2>
            <div className="customer-detail__meta">
              <StatusPill value={customer.status} />
              <span>PM: {customer.manager}</span>
              <span>Nächste Deadline: {formatDate(customer.nextDeadline)}</span>
            </div>
          </div>
        </div>
      </div>

      <section className="meeting-status-strip" aria-label="Projektstatus">
        <article>
          <span>Letzter Stand</span>
          <strong>{customer.lastActivity}</strong>
        </article>
        <article className={customer.blocker ? "meeting-status-strip__risk" : ""}>
          <span>Blocker</span>
          <strong>{customer.blocker || "Keine aktiven Blocker"}</strong>
        </article>
        <article>
          <span>Beteiligte Bereiche</span>
          <strong>{customer.departments.join(", ")}</strong>
        </article>
      </section>

      <div className="customer-detail__grid">
        <section className="task-panel">
          <SectionHeader title="Aktuelle Aufgaben" meta={`${customer.tasks.length} im Fokus`} />
          <div className="task-list">
            {customer.tasks.map((task) => <TaskRow key={task.title} task={task} />)}
          </div>
        </section>

        <section className="task-panel">
          <SectionHeader title="Meeting-Daten" />
          <div className="task-metrics task-metrics--stacked">
            <Metric label="Offene Aufgaben" value={customer.openTasks} />
            <Metric label="Überfällig" value={customer.overdueTasks} />
            <Metric label="Offene E-Mails" value={customer.openEmails} />
            <Metric label="Zeit im Zeitraum" value={customer.trackedTime} />
          </div>
        </section>

        <section className="task-panel">
          <SectionHeader title="Offene E-Mails" meta={`${customer.openEmails} offen`} />
          <ul className="compact-feed">
            {customer.emails.map((email) => <li key={email}>{email}</li>)}
          </ul>
        </section>

        <section className="task-panel">
          <SectionHeader title="Aktivitätsverlauf" />
          <ul className="compact-feed">
            {customer.activity.map((entry) => <li key={entry}>{entry}</li>)}
          </ul>
        </section>

        <section className="task-panel task-panel--wide">
          <SectionHeader title="Kundeninformationen" />
          <div className="info-list info-list--grid">
            <div><strong>Abteilungen</strong><span>{customer.departments.join(", ")}</span></div>
            <div><strong>Boards</strong><span>{customer.boards.join(", ")}</span></div>
            <div><strong>Ansprechpartner</strong><span>{customer.contacts.join(", ")}</span></div>
            <div><strong>Blocker</strong><span>{customer.blocker || "Keine aktiven Blocker"}</span></div>
          </div>
        </section>
      </div>
    </section>
  );
}

function WorkspaceView() {
  const [selectedId, setSelectedId] = React.useState(customers[0].id);
  const [status, setStatus] = React.useState("Alle Status");
  const [department, setDepartment] = React.useState("Alle Abteilungen");
  const [query, setQuery] = React.useState("");
  const [onlyRisk, setOnlyRisk] = React.useState(false);

  const filteredCustomers = customers.filter((customer) => {
    const matchesStatus = status === "Alle Status" || customer.status === status;
    const matchesDepartment = department === "Alle Abteilungen" || customer.departments.includes(department);
    const matchesQuery = customer.name.toLowerCase().includes(query.toLowerCase());
    const matchesRisk = !onlyRisk || customer.overdueTasks > 0 || customer.openEmails > 3 || customer.status === "Blockiert";
    return matchesStatus && matchesDepartment && matchesQuery && matchesRisk;
  });
  const selectedCustomer = filteredCustomers.find((customer) => customer.id === selectedId) || filteredCustomers[0] || customers[0];
  const riskCount = customers.filter((customer) => customer.overdueTasks > 0 || customer.openEmails > 3 || customer.status === "Blockiert").length;
  const blockedCount = customers.filter((customer) => customer.status === "Blockiert").length;
  const openEmails = customers.reduce((sum, customer) => sum + customer.openEmails, 0);

  return (
    <>
      <section className="task-summary" aria-label="Aufgabenverwaltung Kennzahlen">
        <Metric label="Kunden/Projekte" value={customers.length} />
        <Metric label="Offene Aufgaben" value={customers.reduce((sum, customer) => sum + customer.openTasks, 0)} />
        <Metric label="Blockiert" value={blockedCount} />
        <Metric label="Offene E-Mails" value={openEmails} />
      </section>

      <section className="meeting-controls">
        <SectionHeader title="Meeting-Filter" meta={`${filteredCustomers.length} von ${customers.length}`} />
        <div className="meeting-filter-grid">
          <label className="field">
            <span>Kunde suchen</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name eingeben" />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {statusOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Abteilung</span>
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              {departmentOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={onlyRisk} onChange={(event) => setOnlyRisk(event.target.checked)} />
            <span>Nur Warnungen</span>
          </label>
        </div>
      </section>

      <section className="meeting-workspace">
        <section className="customer-column" aria-label="Kundenübersicht">
          <SectionHeader title="Kundenstatus" meta={`${riskCount} Warnungen`} />
          <div className="customer-list">
            {filteredCustomers.map((customer) => (
              <CustomerCard key={customer.id} customer={customer} selected={customer.id === selectedCustomer.id} onSelect={setSelectedId} />
            ))}
            {filteredCustomers.length === 0 && (
              <p className="notice">Keine Kunden für diese Filter gefunden.</p>
            )}
          </div>
        </section>

        <CustomerDetail customer={selectedCustomer} />
      </section>
    </>
  );
}

function Aufgabenverwaltung() {
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <h1>Aufgabenverwaltung</h1>
        </div>
        <div className="topbar__meta">
          <a href="/">Dashboard</a>
        </div>
      </header>

      <WorkspaceView />
    </main>
  );
}

ReactDOM.createRoot(document.querySelector("#task-management-root")).render(<Aufgabenverwaltung />);

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const dbPath = './niners.db';

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Fehler beim Oeffnen der DB:', err.message);
  } else {
    console.log('Erfolgreich mit SQLite-DB verbunden.');
  }
});

// API-Endpunkt: Zeigt nur noch zukuenftige Spiele.
app.get('/api/daten', (req, res) => {
  const sql = `
    SELECT *
    FROM niners
    WHERE
      substr(date, 7, 4) || '-' ||
      substr(date, 4, 2) || '-' ||
      substr(date, 1, 2) >= date('now', 'localtime')
    ORDER BY
      substr(date, 7, 4) || '-' ||
      substr(date, 4, 2) || '-' ||
      substr(date, 1, 2) ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Fehler bei SQL-Abfrage:', err.message);
      return res.status(500).json({ error: 'Datenbankfehler' });
    }

    // Gibt die zukuenftigen Spiele zurueck (leeres Array, falls keine vorhanden).
    res.json(rows);
  });
});

app.listen(3001, () => {
  console.log('Server laeuft auf http://localhost:3001');
});

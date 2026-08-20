# GateKeeper Go-Live: kostenlose Events

Dieses Runbook fokussiert den ersten Live-Pfad fuer kleine Veranstalter:

1. Veranstalterkonto anlegen.
2. Kostenloses Event mit Tickettyp `0 EUR` erstellen.
3. Besucherbuchung ohne Zahlungsanbieter abschliessen.
4. QR-Ticket per Mail und auf der Checkout-Seite bereitstellen.
5. Ticket am Eingang scannen.

## Lokale Readiness

Vor einem Release muessen diese Checks gruen sein:

```bash
npm test
npm run build
npm run lint
npm run check:system
```

Wenn externe Netzwerkchecks in CI nicht moeglich sind:

```bash
npm run check:system -- --skip-network
```

## Externe Live-Konfiguration

Diese Punkte koennen nicht im Code geloest werden und muessen im Deployment gesetzt sein:

- `APP_URL` und `NEXT_PUBLIC_APP_URL` zeigen auf dieselbe HTTPS-Produktionsdomain.
- Supabase Auth nutzt `APP_URL` als Site URL.
- Supabase Redirect URLs enthalten `${APP_URL}/auth` und `${APP_URL}/auth/reset-password`.
- Entweder Resend ist mit `RESEND_API_KEY` und verifiziertem `EMAIL_FROM` aktiv oder SMTP ist vollstaendig gesetzt.
- `TICKET_QR_SECRET`, `SCANNER_LINK_SECRET` und `CRON_SECRET` sind starke, explizite Produktionswerte.

PayPal und Stripe sind fuer rein kostenlose Events nicht erforderlich. Sobald bezahlte Tickets angeboten werden,
muessen die Zahlungsanbieter inklusive Webhooks produktionsbereit konfiguriert sein.

## Manueller End-to-End-Test

Nach Deployment und Systemcheck:

1. Mit einem Veranstalterkonto anmelden.
2. Ein Event mit Bild, Ort, Datum in der Zukunft und einem Tickettyp `0 EUR` erstellen.
3. Pruefen, dass das Event oeffentlich sichtbar ist.
4. Als Besucher eine Buchung fuer das kostenlose Ticket abschliessen.
5. Pruefen, dass die Checkout-Seite einen QR-Code zeigt.
6. Pruefen, dass die Ticketmail zugestellt wurde.
7. Im Veranstalter-Dashboard `/dashboard/check-in` oeffnen.
8. QR-Code scannen oder den Ticketcode manuell eingeben.
9. Direkt danach denselben Code erneut scannen und sicherstellen, dass der doppelte Scan abgewiesen wird.
10. Scan-Historie als CSV exportieren und pruefen, ob Event, Ticket, Status und Zeitpunkt enthalten sind.

## Go/No-Go

Go fuer den kostenlosen Erstbetrieb:

- Systemcheck ist gruen.
- Kostenloser Buchungspfad funktioniert ohne PayPal/Stripe.
- Ticketmail kommt an.
- QR-Scan akzeptiert gueltige Tickets.
- Doppelter Scan wird sichtbar abgewiesen.
- Organizer kann Buchungen und Scan-Historie einsehen.

No-Go:

- Mailprovider ist nicht erreichbar oder lehnt den API-Key ab.
- `APP_URL` zeigt auf `localhost` oder eine falsche Domain.
- Scanner kann gueltige Tickets nicht eindeutig pruefen.
- Buchungen bleiben bei kostenlosen Events in einem offenen Zahlungsstatus haengen.

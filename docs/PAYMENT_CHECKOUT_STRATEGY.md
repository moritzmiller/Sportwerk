# Gatekeeper Payment- und Checkout-Strategie

Stand: 2026-08-17

## Kurzentscheidung

Stripe sollte fuer das Payment-MVP nicht ersetzt, aber entkoppelt werden.

Gatekeeper sollte die strategische Schicht selbst besitzen:

- Checkout-Orchestrierung
- Payment-Domain mit eigenen IDs
- zentrale Fee-Logik
- idempotente Webhook-Verarbeitung
- internes Ledger
- Reporting, Reconciliation und Refund-Workflow
- spaeter Smart Routing

Regulierte Infrastruktur bleibt gekauft:

- Kartenverarbeitung
- Tokenization
- 3DS/SCA
- KYC/AML
- Verwahrung und Auszahlung von Geldern
- Chargeback-Netzwerkprozesse
- Pay-by-Bank- bzw. Open-Banking-Anbindung

Empfehlung: **Stripe weiter als stabilen Fallback nutzen, Mollie Connect als EU-/Ticketing-Kandidat evaluieren, Pay-by-Bank priorisiert anzeigen, aber Karten/Wallets immer als Fallback behalten.**

## Phase 1: Ist-Zustand im Code

### Bereits vorhanden

- Next.js 16, React 19, Prisma 7/Postgres, Supabase Auth.
- Booking-Modell mit `BookingStatus`, Tickettypen, Promo-Codes, individuellem `Ticket`-Modell und Refund-/Check-in-Status.
- Online-Zahlungen ueber Stripe Checkout und PayPal Checkout.
- Manuelle Zahlarten `INVOICE` und `BANK_TRANSFER`.
- Stripe-Webhook mit Signaturverifikation und idempotenter Status-Transition ueber `markBookingPaid`.
- PayPal-Webhook mit Signaturverifikation und Refund-Verarbeitung.
- Zentrale Gatekeeper-Fee-Logik in `src/lib/fees.js`.
- Payment-Method-Fee-Estimates in `src/lib/payment-methods.js`.

### Fehlend

- Eigene Payment-Entitaet mit `gatekeeper_payment_id`.
- Provider-unabhaengiges Payment-Interface.
- Webhook-Event-Tabelle mit Provider-Event-Dedupe.
- Ledger fuer Bruttozahlung, Provider-Fee, Gatekeeper-Fee, Organizer-Netto, Refunds, Chargebacks.
- Reconciliation-Workflow gegen Provider-Auswertungen.
- Veranstalter-Payout-/Marketplace-Struktur.
- Teilrefund-Status im Gatekeeper-Booking-MVP.
- Pay-by-Bank-Provider.
- explizite Zahlungsstatus wie `PROCESSING`, `PARTIALLY_REFUNDED`, `CHARGED_BACK`.

### Muss angepasst werden

- `Booking` enthaelt noch provider-spezifische IDs (`stripePaymentIntentId`, `paypalCaptureId`) als operative Quelle. Diese Felder sollten mittelfristig nur noch Legacy-/Convenience-Felder sein.
- Checkout-Routing entscheidet aktuell direkt in `/api/bookings`.
- Paymentkosten sind im UI nur grob geschaetzt und nicht als Provider-Kostenmodell versioniert.
- PayPal Direct-to-Organizer ueber `payee.email_address` ist rechtlich/operativ separat zu pruefen, weil Gatekeeper dadurch weniger Kontrolle ueber Refunds, Reconciliation und Dispute-Daten haben kann.

### Technische Risiken

- Ohne eigene Payment-Tabelle ist Multi-Provider-Orchestration schwer sauber abzubilden.
- Ohne Webhook-Dedupe-Tabelle ist Idempotency aktuell an Booking-Status und Provider-IDs gekoppelt, aber nicht revisionsfest nachvollziehbar.
- Ohne Ledger gibt es keine verlaessliche Grundlage fuer Auszahlung, Refund-Abgleich, Reporting und Audit.
- Ein zu frueher eigener Checkout mit Kartendaten wuerde PCI-Scope und Wartungsaufwand stark erhoehen.

## Phase 2: Payment-Anforderungen

MVP:

- EUR, Deutschland/EU zuerst.
- einmalige Zahlungen.
- Gastcheckout ohne Gatekeeper-Account.
- Apple Pay, Google Pay, Kredit-/Debitkarte.
- PayPal als optionaler Conversion-Fallback.
- Pay-by-Bank oder SEPA-nahe Bankzahlung als guenstigere Methode.
- Refunds und perspektivisch Teilrefunds.
- Webhooks mit Signaturverifikation und Dedupe.
- eigene Payment-ID + Provider-ID.
- Ledger und Reconciliation-Basis.
- Veranstalterzuordnung ueber Booking/Event/Organization.

Edge Cases:

- abgebrochene Zahlungen: Payment bleibt `PENDING` oder `CANCELLED`, keine Tickets.
- doppelte Webhooks: Provider-Event-ID deduplizieren.
- Timeout/verzoegerte Bankzahlung: Status `PROCESSING`, Ticket erst nach finaler Bestaetigung.
- Refund nach Check-in: erlauben nur mit expliziter Warnung/Audit, Ticket auf `REFUNDED`.
- Eventabsage: Batch-Refund-Workflow, keine automatische Loeschung.
- Anbieter-Ausfall: zweite Provider-Option nur bei genuegend Volumen sinnvoll.

## Phase 3: Stripe-Benchmark

Offizielle Quellen:

- Stripe Deutschland Pricing: Standardkarten aus Europa `1,5% + 0,25 EUR`; UK-Karten `2,5% + 0,25 EUR`; internationale Karten `3,15% + 0,25 EUR`; Checkout ist in Payments inklusive; Dispute received fee `20 EUR`.
- Stripe Connect Pricing: bei eigener Plattform-Preisgestaltung `2 EUR` pro monatlich aktivem Konto und `0,25% + 0,10 EUR` pro gesendeter Auszahlung.
- Stripe Checkout Docs: hosted Checkout ist die niedrigste Komplexitaet und bietet dynamische Zahlungsmethoden/Link.

### Stripe Standard, europaeische Standardkarte

| Ticketpreis | Kosten | Effektive Rate |
| ---: | ---: | ---: |
| 5 EUR | 0,33 EUR | 6,50% |
| 10 EUR | 0,40 EUR | 4,00% |
| 20 EUR | 0,55 EUR | 2,75% |
| 30 EUR | 0,70 EUR | 2,33% |
| 50 EUR | 1,00 EUR | 2,00% |
| 75 EUR | 1,38 EUR | 1,83% |
| 100 EUR | 1,75 EUR | 1,75% |
| 250 EUR | 4,00 EUR | 1,60% |

Fixkosten dominieren bei niedrigen Ticketpreisen. Gatekeeper sollte deshalb mehrere Tickets pro Warenkorb bevorzugen und nicht pro Ticket einzeln kassieren.

### Stripe bei GMV-Szenarien

| Jahres-GMV | Avg Basket 10 EUR | Avg Basket 20 EUR | Avg Basket 30 EUR | Avg Basket 50 EUR | Avg Basket 75 EUR |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100.000 EUR | 4.000 EUR / 4,00% | 2.750 EUR / 2,75% | 2.333 EUR / 2,33% | 2.000 EUR / 2,00% | 1.833 EUR / 1,83% |
| 500.000 EUR | 20.000 EUR / 4,00% | 13.750 EUR / 2,75% | 11.667 EUR / 2,33% | 10.000 EUR / 2,00% | 9.167 EUR / 1,83% |
| 1 Mio. EUR | 40.000 EUR / 4,00% | 27.500 EUR / 2,75% | 23.333 EUR / 2,33% | 20.000 EUR / 2,00% | 18.333 EUR / 1,83% |
| 5 Mio. EUR | 200.000 EUR / 4,00% | 137.500 EUR / 2,75% | 116.667 EUR / 2,33% | 100.000 EUR / 2,00% | 91.667 EUR / 1,83% |
| 10 Mio. EUR | 400.000 EUR / 4,00% | 275.000 EUR / 2,75% | 233.333 EUR / 2,33% | 200.000 EUR / 2,00% | 183.333 EUR / 1,83% |
| 50 Mio. EUR | 2.000.000 EUR / 4,00% | 1.375.000 EUR / 2,75% | 1.166.667 EUR / 2,33% | 1.000.000 EUR / 2,00% | 916.667 EUR / 1,83% |
| 100 Mio. EUR | 4.000.000 EUR / 4,00% | 2.750.000 EUR / 2,75% | 2.333.333 EUR / 2,33% | 2.000.000 EUR / 2,00% | 1.833.333 EUR / 1,83% |

## Phase 4: Alternativen

### Stripe

Staerken:

- beste Developer Experience, sehr gute Webhooks, Checkout, SCA, Wallets, Link, Radar, Connect.
- schnellster Weg zu hoher Conversion.
- geringster operativer Startaufwand.

Schwaechen:

- bei kleinen Ticketpreisen teuer wegen `0,25 EUR` Fixgebuehr.
- Connect mit eigener Preisgestaltung fuegt Auszahlungskosten und aktive-Konto-Kosten hinzu.
- Pay-by-Bank in Stripe ist fuer Deutschland/EUR nicht der klare Hebel; Stripe Pay by Bank ist laut Docs GBP/UK fokussiert.

Optimierung innerhalb Stripe:

- Hosted Checkout statt eigener Karteneingabe.
- Wallets und Link aktivieren.
- Warenkorb statt Einzelticket-Zahlung.
- ab ca. 1-5 Mio. EUR GMV Volumenrabatt verhandeln.
- Connect erst aktivieren, wenn Organizer-Payouts wirklich produktreif sind.

### Mollie

Offizielle Preise:

- EWR Consumer Cards: `1,80% + 0,25 EUR`.
- SEPA Direct Debit: `0,35 EUR`.
- SEPA Bank Transfer: `0,25 EUR`.
- Pay by Bank: `0,90% + 0,25 EUR`.
- Mollie Connect fuer Plattformen; Mollie uebernimmt KYC, Risiko und Compliance, 35+ Methoden inkl. Apple Pay, Google Pay, PayPal, SEPA.

Bewertung:

- fuer deutsche Ticketing-Plattformen sehr relevanter Kandidat.
- Pay-by-Bank kann Stripe bei Warenkoerben ab ca. 20-30 EUR deutlich schlagen.
- Kartenpreis ist aktuell hoeher als Stripe Standardkarten, also nicht als reiner Card-Replacement-Kandidat.
- Connect/Platform-Faehigkeit passt zur Gatekeeper-Strategie.

### PayPal

Offizielle Preise Deutschland:

- PayPal Checkout/Inland: `2,99% + 0,39 EUR`.
- Waren/Dienstleistungen: `2,49% + 0,35 EUR`.
- Online-Kartenzahlungen ueber PayPal: `2,99% + 0,39 EUR`.

Bewertung:

- wichtig fuer Conversion bei bestimmten Zielgruppen.
- wirtschaftlich kein Primaer-Provider.
- als optionaler Fallback behalten, aber nicht als Default fuer Gatekeeper-Kostenoptimierung.

### Adyen

Offizielle Preise:

- feste Processing Fee `0,13 USD` plus Payment-Method-Fee.
- Karten haeufig `Interchange++ + 0,60%`.
- Plattformprodukt mit Onboarding, Splits, Payouts, Reports und Risiko.

Bewertung:

- wirtschaftlich interessant bei hoeherem GMV und IC++-Faehigkeit.
- fuer fruehes MVP mehr Sales-/Integrationsaufwand als Stripe/Mollie.
- Kandidat ab ca. 5-10 Mio. EUR GMV, wenn Gatekeeper echte Kosten- und Routingdaten besitzt.

### GoCardless / Bank Debit

Offizielle Preise:

- Standard `1% + 20p`, UK-capped; internationale/Euro-Struktur muss konkret verhandelt/geprueft werden.
- stark fuer Lastschrift/Bankeinzug, weniger fuer spontane Event-Tickets mit sofortigem Eintrittsanspruch.

Bewertung:

- fuer wiederkehrende Organizer-Gebuehren oder B2B-Abrechnung interessant.
- fuer Endkunden-Tickets nur geeignet, wenn Zahlungsgarantie/Timing klar ist.

## Phase 5: Build vs Buy

| Komponente | Entscheidung | Begruendung |
| --- | --- | --- |
| Checkout UI | BUILD + hosted provider payment step | Gatekeeper kontrolliert Warenkorb, Fees, UX; Karteneingabe bleibt beim PSP. |
| Payment API | BUILD | eigene Domain, IDs, Statusmodell und Adapter-Vertrag sind strategisch. |
| Payment Router | LATER | sinnvoll ab messbarem Volumen und mehreren live Provider-Daten. |
| Card Processing | BUY | reguliert, PCI, Scheme- und Fraud-Komplexitaet. |
| Tokenization | BUY | niemals Kartendaten speichern. |
| Fraud Detection | BUY + LATER eigene Signale | Provider-Fraud zuerst, Gatekeeper kann spaeter Event-/Organizer-Risiko beisteuern. |
| 3DS/SCA | BUY | regulierte Pflicht, Provider soll Flow tragen. |
| Pay-by-Bank | BUY | Open-Banking/Bankabdeckung nicht selbst bauen. |
| Ledger | BUILD | strategische Kontroll- und Reporting-Schicht. |
| Reconciliation | BUILD | noetig fuer Zuverlaessigkeit und Margenkontrolle. |
| Refund-System | BUILD auf Provider-APIs | Business-Regeln gehoeren zu Gatekeeper, Geldbewegung zum PSP. |
| Veranstalterabrechnung | BUILD + PSP payouts | Gatekeeper muss Berechnung besitzen, Verwahrung vermeiden. |
| Settlement | BUY | keine Kundengelder halten. |
| Reporting | BUILD | Kernprodukt fuer Veranstalter. |
| Analytics | BUILD schlank | Conversion/Kostenmessung ist strategisch. |

## Phase 6: Rechtliche Grenze

Keine Rechtsberatung.

Technisch unkritisch:

- hosted Checkout oder Payment Elements ohne Kartendaten auf Gatekeeper-Servern.
- eigene Payment-IDs, Ledger, Reconciliation und Reporting.
- Provider-Webhooks verifizieren und speichern.
- Gatekeeper-Gebuehren berechnen und ueber Provider-Mechanismen einziehen.

Rechtlich zu pruefen:

- Marketplace-/Plattformmodell mit Gatekeeper-Gebuehren.
- Zahlungsrouting im Namen mehrerer Veranstalter.
- Refund-Entscheidungen nach Eventabsage oder Veranstalterinsolvenz.
- Direktzahlung an Veranstalter vs. Plattform-Settlement.
- PayPal `payee`-Weiterleitung an Veranstalter.

Vermutlich erlaubnispflichtig oder riskant:

- Gatekeeper verwahrt Kundengelder selbst.
- Gatekeeper zieht Zahlungen ein und zahlt spaeter aus eigenem Bankkonto an Veranstalter aus.
- eigene Zahlungsausloesedienste/Open-Banking ohne lizenzierte Partner.
- eigene Kartenannahme, Tokenization oder Acquiring.

Bevorzugte Architektur:

```text
Kunde
  -> lizenzierter PSP / Plattform-Provider
  -> Veranstalter / Connected Merchant

Gatekeeper:
  Checkout, Payment Domain, Ledger, Tickets, Refund-Workflow, Reporting
```

## Phase 7: Kostenmodelle

### Beispielkosten pro 30-EUR-Warenkorb

| Variante | Modell | Kosten | Rate | Einschätzung |
| --- | --- | ---: | ---: | --- |
| A Stripe Standard | 1,5% + 0,25 | 0,70 EUR | 2,33% | bester MVP-Fallback |
| B Stripe optimiert | Volumenrabatt angenommen 1,2% + 0,20 | 0,56 EUR | 1,87% | ab Verhandlung realistisch |
| C Mollie Card | 1,8% + 0,25 | 0,79 EUR | 2,63% | teurer als Stripe bei Karten |
| D Mollie Pay-by-Bank | 0,9% + 0,25 | 0,52 EUR | 1,73% | klarer Kostenvorteil, Conversion testen |
| E Adyen IC++ Schaetzung | 1,15% + 0,13 | 0,48 EUR | 1,58% | moeglich bei Volumen, Vertrag noetig |

### Effektive Rate bei Methodenmix

Annahme: 30-EUR-Warenkorb.

| Mix | Kosten je Zahlung | Rate |
| --- | ---: | ---: |
| 100% Stripe Card | 0,70 EUR | 2,33% |
| 70% Stripe Card, 30% Pay-by-Bank | 0,65 EUR | 2,15% |
| 50% Stripe Card, 50% Pay-by-Bank | 0,61 EUR | 2,03% |
| 30% Stripe Card, 70% Pay-by-Bank | 0,57 EUR | 1,85% |

Die wichtigste Stellschraube ist nicht ein Stripe-Klon, sondern der Anteil guenstiger Bankzahlungen ohne Conversion-Verlust.

## Phase 8: Break-even

Wenn eine komplexere Eigenentwicklung 40.000 EUR initial und 10.000 EUR laufend pro Jahr kostet:

| Einsparung auf GMV | Break-even Jahr 1 | Break-even Folgejahre |
| ---: | ---: | ---: |
| 0,30 Prozentpunkte | 16,7 Mio. EUR | 3,3 Mio. EUR |
| 0,50 Prozentpunkte | 10,0 Mio. EUR | 2,0 Mio. EUR |
| 0,75 Prozentpunkte | 6,7 Mio. EUR | 1,3 Mio. EUR |
| 1,00 Prozentpunkt | 5,0 Mio. EUR | 1,0 Mio. EUR |

Konsequenz: Ein provider-unabhaengiges Fundament lohnt sofort, weil es klein ist und Lock-in reduziert. Vollstaendige Orchestration lohnt erst, wenn Gatekeeper mindestens ca. 1-5 Mio. EUR GMV und reale Conversion-/Kosten-Daten hat.

## Phase 9: Checkout-Strategie

- Ein Warenkorb pro Bestellung, nicht pro Ticket zahlen.
- Pay-by-Bank bei Warenkoerben ab 20-30 EUR sichtbar bevorzugen, aber niemals erzwingen.
- Apple Pay/Google Pay/Card als schnellster Conversion-Pfad prominent halten.
- PayPal optional anzeigen, aber nicht als guenstig markieren.
- Paymentkosten intern pro Provider/Methode messen.
- Veranstalter-Gebuehren zentral konfigurieren: Gatekeeper-Fee, Provider-Fee, Weitergabe an Kaeufer oder Veranstalter.
- Ticket erst nach serverseitig bestaetigtem Payment ausstellen.

## Phase 10: Zielarchitektur

```text
Checkout
  -> Gatekeeper Payments API
  -> Payment Service
  -> Provider Adapter
  -> Stripe / Mollie / PayPal / spaeter Adyen

Provider Webhook
  -> Signature Verification
  -> PaymentWebhookEvent Dedupe
  -> Payment Status Transition
  -> Ledger Entries
  -> Ticket Fulfillment
```

Provider-Adapter-Vertrag:

```ts
interface PaymentProvider {
  createPayment(request): Promise<ProviderPayment>
  getPaymentStatus(payment): Promise<ProviderStatus>
  refundPayment(payment, amount): Promise<ProviderRefund>
  cancelPayment(payment): Promise<ProviderCancellation>
  handleWebhook(event): Promise<WebhookResult>
}
```

## Phase 11: Ledger-Design

Beispiel fuer 30 EUR:

| Type | Direction | Amount |
| --- | --- | ---: |
| GROSS_PAYMENT | CREDIT | 30,00 EUR |
| PROVIDER_FEE | DEBIT | 0,70 EUR |
| GATEKEEPER_FEE | DEBIT | 1,96 EUR |
| ORGANIZER_NET | CREDIT | 27,34 EUR |

Ledger-Zeilen werden nicht ueberschrieben. Korrekturen laufen ueber neue `REFUND`, `CHARGEBACK` oder `ADJUSTMENT`-Entries.

## Phase 12: Anbieterunabhaengigkeit

Neue zentrale Identitaet:

- `Payment.id`
- `Payment.provider`
- `Payment.providerPaymentId`
- `Payment.providerCheckoutId`
- `Payment.idempotencyKey`

Provider-spezifische Booking-Felder bleiben vorerst fuer Kompatibilitaet, sind aber nicht mehr das Zielmodell.

## Phase 13: MVP-Roadmap

### Payment MVP, sofort

- Payment-Domain und Ledger-Migration.
- Provider-Adapter-Vertrag.
- Stripe/PayPal in Adapterstruktur schrittweise migrieren.
- Webhook-Event-Dedupe nutzen.
- Reconciliation-Export/Report vorbereiten.

### Phase 2, ab ca. 500k-1 Mio. EUR GMV

- Mollie Connect Sandbox evaluieren.
- Pay-by-Bank A/B-Test.
- echte Provider-Kosten pro Zahlung speichern.
- Stripe Volume Pricing anfragen.

### Mollie-Sandbox-Fundament, umgesetzt am 2026-08-17

- Payment-Methode `MOLLIE_PAY_BY_BANK` ist im Prisma-Enum, in Event-Defaults, im Event-Formular und im Fee-Modell vorhanden.
- Mollie Pay by Bank wird intern mit `0,90% + 0,25 EUR` geschaetzt und bleibt klar von Stripe Card, PayPal und manuellen Zahlungsarten getrennt.
- `MOLLIE_ENV`, `MOLLIE_API_KEY`, `MOLLIE_CURRENCY` und optional `MOLLIE_WEBHOOK_SECRET` werden zentral validiert; Mollie darf lokal fehlen.
- Produktion blockiert aktivierte Mollie-Testkeys, solange `MOLLIE_ALLOW_TEST_IN_PRODUCTION=true` nicht bewusst gesetzt ist.
- Der Mollie-Adapter nutzt die Payments API direkt ueber `fetch`, erzeugt Payments mit `method=paybybank`, `redirectUrl`, `cancelUrl`, `webhookUrl` und Gatekeeper-Metadata.
- Mollie-Webhooks werden klassisch behandelt: Der Webhook liefert eine Payment-ID; Gatekeeper laedt den echten Status serverseitig bei Mollie nach und markiert Bookings erst danach als bezahlt oder fehlgeschlagen.
- Fuer den naechsten echten Sandbox-Test werden ein Mollie-Test-API-Key, eine oeffentlich erreichbare `APP_URL` und ein erreichbarer Webhook-Endpunkt benoetigt.

### Phase 3, ab ca. 1-5 Mio. EUR GMV

- Payment Router aktivieren.
- Routing nach Methode, Land, Warenkorb, Conversion und Kosten.
- Fallback bei Provider-Ausfall.

### Phase 4, ab ca. 10 Mio. EUR GMV

- Adyen IC++ evaluieren.
- eigene Reconciliation-Automation erweitern.
- Risiko-/Fraud-Signale aus Gatekeeper-Daten.

## Phase 14: Entscheidungsmatrix

Gewichte: Paymentkosten 25%, Conversion 20%, Entwicklungsaufwand 15%, Betriebskosten 10%, Skalierbarkeit 10%, rechtliches Risiko 10%, Anbieterabhaengigkeit 5%, Wartbarkeit 5%.

| Option | Kosten | Conv. | Dev | Ops | Scale | Legal | Lock-in | Maint. | Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Stripe Standard | 6 | 9 | 9 | 9 | 8 | 9 | 5 | 9 | 7,85 |
| Stripe optimiert | 7 | 9 | 8 | 8 | 8 | 9 | 5 | 8 | 7,95 |
| Mollie Connect + Pay-by-Bank | 8 | 7 | 7 | 7 | 8 | 8 | 7 | 7 | 7,50 |
| Adyen IC++ | 9 | 8 | 5 | 6 | 9 | 8 | 7 | 6 | 7,45 |
| eigene PayFac/Card Processing | 10 | 5 | 1 | 1 | 7 | 1 | 10 | 1 | 4,55 |
| Gatekeeper Router + PSPs | 8 | 8 | 6 | 6 | 9 | 8 | 9 | 6 | 7,55 |

## Phase 15: Empfehlung

### Jetzt bauen

- Provider-unabhaengige Payment-Domain.
- Ledger-Grundlage.
- Webhook-Dedupe-Tabelle.
- Adapter-Vertrag.
- Kosten-/Fee-Modell versionieren.

### Nicht bauen

- eigener Card Processor.
- eigene Tokenization.
- eigene Open-Banking-Lizenz.
- vollautomatischer Multi-Provider-Router vor realem GMV.
- eigener Wallet-/PayPal-Ersatz.

### Spaeter bauen

- Mollie/Pay-by-Bank live, sobald Checkout stabil und erste zahlende Organizer vorhanden sind.
- Routing ab messbarem Volumen und echten Conversion-Daten.
- Adyen/IC++ ab hohem GMV oder klarer Enterprise-Nachfrage.

### Payment Provider

Kurzfristig:

- Stripe: stabiler Card/Wallet-Fallback.
- PayPal: optionaler Conversion-Fallback.

Direkt evaluieren:

- Mollie Connect: EU-Ticketing, Pay-by-Bank, SEPA, Platform-KYC.

Spaeter:

- Adyen for Platforms: hohes Volumen, IC++ und starke Reconciliation.

### Erwartete Kosten und Einsparpotenzial

Bei 30-EUR-Warenkorb:

- Stripe Standard: ca. 0,70 EUR / 2,33%.
- 50% Pay-by-Bank + 50% Stripe Card: ca. 0,61 EUR / 2,03%.
- Einsparung: ca. 0,30 Prozentpunkte bzw. 9 Cent pro 30-EUR-Zahlung.
- Bei 1 Mio. EUR GMV: ca. 3.000 EUR/Jahr.
- Bei 10 Mio. EUR GMV: ca. 30.000 EUR/Jahr.

Groessere Einsparungen entstehen erst durch Volumenrabatte, IC++ oder sehr hohe Pay-by-Bank-Akzeptanz.

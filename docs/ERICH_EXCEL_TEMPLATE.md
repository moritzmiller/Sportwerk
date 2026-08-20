# ERICH Excel Template

The importer reads two required sheets: `Rennauswertung` and `Startgeld`.

## Rennauswertung

Rows 1-2 are reserved for headings. Data starts in row 3.

| Column | Field | Example | Required |
| --- | --- | --- | --- |
| A | Rennnummer | `17` | yes |
| B | Geschlecht | `M`, `W`, `M LG`, `W LG`, `M/W` | yes |
| C | Altersklasse | `U17`, `Masters A`, `PR1` | yes |
| D | Strecke | `500m`, `2000m`, `500m (4x)` | yes |
| E | ERICH | `x` | one of E-G |
| F | DM | `x` | one of E-G |
| G | MDM | `x` | one of E-G |
| H | Erwartete Starter | `24` | no |
| I | Mindestjahrgang | `2008` | no |
| J | Hoechstjahrgang | `2010` | no |
| K | Hoehermeldung erlaubt | `x` | no |
| L | Hoehermeldung ab Jahrgang | `2010` | no |
| M | Teamgroesse | `4` | no |
| N | Gleicher Verein Pflicht | `x` | no |
| O | Mixed Clubs erlaubt | `x` | no |
| P | Maenner im Team | `2` | no |
| Q | Frauen im Team | `2` | no |

## Startgeld / Startgelder

Rows 1-4 are reserved for headings. Data starts in row 5.

Row 2 defines the price period for the three phase columns. Supported examples:

- `2027-09-01 bis 2027-09-30`
- `01.10.2027 - 30.11.2027`
- `ab 01.12.2027`
- `bis 30.09.2027`

| Column | Field | Example |
| --- | --- | --- |
| A | Rennnummer | `17` |
| L | ERICH September | row 2: `bis 30.09.2027`, row 5+: `28` |
| M | ERICH Oktober/November | row 2: `01.10.2027 - 30.11.2027`, row 5+: `34` |
| N | ERICH Dezember/Januar | row 2: `ab 01.12.2027`, row 5+: `40` |
| S | DM September | `14` |
| T | DM Oktober/November | `17` |
| U | DM Dezember/Januar | `20` |
| AA | MDM September | `10` |
| AB | MDM Oktober/November | `12.5` |
| AC | MDM Dezember/Januar | `15` |

Amounts are entered as Euro values. The importer converts them to integer cents.

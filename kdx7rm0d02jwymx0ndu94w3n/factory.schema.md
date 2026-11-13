# factory.json — `desk.factory.v1`

Optionale Datei neben `data.json` und `terminal.html`. Der Desk schreibt die Live-Datei auf `gh-pages`. Dieses Repo enthält nur das Schema und `factory.example.json` mit erfundenen Werten.

`terminal.html` liest `factory.json` mit demselben Poll wie `data.json`. Fehlt die Datei (HTTP 404) oder ist sie leer, zeigt die Factory-Ansicht **KEINE DATEN** und der Rest der Seite läuft weiter. Ein ungültiger JSON-Text zeigt **UNGÜLTIG**. Jeder einzelne Wert darf `null` sein; die Zelle ist dann ein Gedankenstrich, ohne Pass/Fail.

Keine Kursreihe, keine Preise, keine Renditefelder, keine verschachtelten Arrays, keine Zeitreihen.

## Top-Level

Skalare zuerst, danach genau vier Arrays. Unbekannte Schlüssel ignoriert die Seite. Fehlende Schlüssel gelten wie `null`.

| Feld | Typ | Bedeutung |
|---|---|---|
| `schema` | string | Immer `desk.factory.v1` |
| `mode` | string | z. B. `paper`. Die Beispieldatei steht auf `example` |
| `generated` | string | ISO-8601, Europe/Rome |
| `generated_label` | string | Fertiges Label, z. B. `13.11.2026 16:14 Rom` |
| `pipeline_updated` | string | ISO-8601, Europe/Rome, letzter Pipeline-Lauf |
| `budget_day_utc` | string | UTC-Tag `YYYY-MM-DD` |
| `budget_used` | number | Verbrauchte Trials an diesem Tag |
| `budget_total` | number | Tagesbudget |
| `budget_remaining` | number | Rest |
| `budget_rule` | string | Kurzer Text zur Budgetregel |
| `dsr_n` | number | Stichprobenumfang für DSR |
| `gate_sharpe_gt` | number | Schwelle, Sharpe muss **größer** sein |
| `gate_dsr_gt` | number | Schwelle, DSR muss **größer** sein |
| `gate_pbo_lt` | number | Schwelle, PBO muss **kleiner** sein |
| `gate_max_dd_lt` | number | Schwelle als **Bruch** (`0.2` = 20 %), Max-DD muss **kleiner** sein |
| `gate_closes_ge` | number | Schwelle, Closes müssen **größer oder gleich** sein |
| `regime_filter` | string | z. B. `OFF` oder `ON` |
| `regime_risk_on` | boolean | |
| `regime_longs_allowed` | boolean | |
| `regime_shorts_allowed` | boolean | |
| `regime_day` | string | Bezugstag |
| `regime_as_of` | string | ISO-8601 |
| `regime_note` | string | Text, kein Kurs |
| `n_specs` | number | Anzahl Specs |
| `n_queue` | number | Anzahl in der Queue |
| `n_scored` | number | Anzahl bewertet |
| `n_pass` | number | Anzahl Pass laut Publisher |
| `fingerprint` | string | Kurzkennung des Stands |

Dazu die Arrays `counts`, `queue`, `candidates`, `notes`. Ein Array darf `[]` sein.

Die Live-Datei kann z. B. 41 Specs haben, eine leere Queue, Budget 2/2, `dsr_n` 282, `regime_filter` `OFF` und `regime_risk_on` `false`. Das Beispiel unten ist kürzer und erfunden.

## `counts[]`

| Feld | Typ |
|---|---|
| `status` | string |
| `n` | number |

## `queue[]`

| Feld | Typ |
|---|---|
| `id` | string |
| `name` | string |
| `family` | string |
| `units_needed` | number |
| `queued_at` | string, ISO-8601 |
| `waiting` | string oder number |

## `candidates[]`

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | string | |
| `variant` | string | |
| `name` | string | |
| `family` | string | |
| `status` | string | |
| `verdict` | string | Publisher-Urteil, z. B. `FAIL`. Die Seite rechnet es nicht um |
| `sharpe` | number | Gate: `> gate_sharpe_gt` |
| `dsr` | number | Gate: `> gate_dsr_gt` |
| `pbo` | number | Gate: `< gate_pbo_lt` |
| `max_dd` | number | Bruch, `0.378` = 37,8 %. Gate: `< gate_max_dd_lt` |
| `closes` | number | Gate: `>= gate_closes_ge` |
| `diagnostic` | boolean | `true` = nur Diagnose im offenen Fenster, kein Einsatz-Kandidat |
| `scored_at` | string | ISO-8601 |

Unbewertete Specs haben `null` in den Kennzahlen. `null` ist kein Fail. Ist die Schwelle selbst `null`, zeigt die Seite den Wert ohne Pass/Fail.

Typische Werte, die die Ansicht darstellen muss: Sharpe `-0.25` mit Urteil `FAIL`, Sharpe `0.0033` mit Urteil `FAIL`.

## `notes[]`

| Feld | Typ |
|---|---|
| `text` | string |

## Abgleich im Beispiel

Schwellen in `factory.example.json`: Sharpe `> 1`, DSR `> 0.95`, PBO `< 0.3`, Max-DD `< 0.2` (20 %), Closes `>= 40`.

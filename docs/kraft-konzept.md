# MaraPlanna Hybrid: Laufen + Kraft mit automatischer Übungserkennung

Stand: 2026-11-04. Das ist das Konzept, bevor gebaut wird. Es trennt, was ich geprüft habe, von dem, was noch gemessen werden muss.

## Stand der Umsetzung (2026-11-04)

Gebaut und getestet (Web 195 Tests, Uhr 43 Tests, Simulator-Durchlauf auf der FR165):
- **Website:** Seite "Strength" (Handgelenk, Material, Übungsliste, Einheit, Zustimmung, alles gespeichert in `profiles.strength`), Testtraining für heute, Liste der aufgezeichneten Sätze. Nichts Persönliches ist auf der Uhr fest eingetragen.
- **Server:** Übungsbibliothek und Feed in `supabase/functions/_shared/strength.ts`, Feed-Feld `strength` in `/watch/run`, Upload `POST /watch/strength`, Migration `20261104000000_strength.sql`.
- **Uhr:** Krafttraining im Menü "Training" (heutige Einheit und "Kraft frei"), Satzbeginn und -ende aus der Bewegung, Wiederholungen zählen, Bestätigungskarte mit Anpassen, Pausenzähler, Aufzeichnung mit einer Runde je Satz, Upload nach dem Training. Auf den sechs 128-KB-Uhren ist Kraft ausgeschlossen.

**Noch nicht gebaut:** die Erkennung der Übung aus der Bewegung. In dieser Version ist die Übung die nächste geplante, geändert wird sie auf der Karte. Die Zähl-Schwellen sind Schätzwerte und nur an künstlichen Signalen geprüft. Die Sätze des ersten echten Trainings (mit Messwerten je Satz in `strength_sets.diag`) sind die Grundlage, sie abzustimmen.

RecoFit liegt in `exercise-ml/data/raw` und lässt sich laden: 94 Personen in der Einzel-Datei (die README nennt über 200 im Gesamtdatensatz), 75 Übungsnamen, 4687 Aufnahmen, 78 Stunden, genau 50 Hz, Gyroskop auf demselben Zeitraster. Pro Übung etwa 25 bis 47 Aufnahmen. Für Bankdrücken gibt es nur "Chest Press (rack)", für Kreuzheben und Klimmzug nichts Passendes: Diese Klassen brauchen eigene Uhr-Daten.

## 1. Leitgedanken

1. **Eine App, nicht zwei.** Die Kraft-Funktion ist ein weiterer Trainingstyp in der bestehenden Uhr-App und in der bestehenden Website. Gleiche Kopplung, gleicher Plan, gleiche Wochenansicht.
2. **Alles läuft über die Uhr.** Erkennung, Zählen und Anzeige passieren auf der Uhr, ohne Handy im Gym. Die Website bekommt die Ergebnisse, zeigt sie an und kann sie korrigieren.
3. **Genauigkeit entsteht aus mehreren Schichten, nicht aus einem einzelnen Modell.** Ein Entscheidungsbaum auf 4-s-Fenstern allein reicht dafür nicht (Abschnitt 3).
4. **Die Uhr fragt nur, wenn sie unsicher ist.** Wer das tut, was im Plan steht, muss nichts drücken.
5. **Messen statt behaupten.** Jede Genauigkeitszahl kommt aus Tests nach Personen, nicht aus der Trainingsmenge.

## 2. Was ein Handgelenk überhaupt erkennen kann

Die Uhr misst die Bewegung des Handgelenks, nicht des Körpers. Daraus folgt, was machbar ist:

| Erkennbarkeit | Übungen | Warum |
|---|---|---|
| Gut | Bizepscurl, Schulterdrücken, Rudern (Langhantel/Kurzhantel), Liegestütz, Kniebeuge mit Hantel/Stange, Kreuzheben/RDL, Klimmzug, Trizepsdrücken | Die Hand bewegt sich auf einer eigenen, wiederholbaren Bahn. |
| Mittel | Bankdrücken gegen Schrägbank/Kurzhantel-Bankdrücken, Ausfallschritte, Frontheben/Seitheben | Bahnen ähneln einander. Reihenfolge und Plan helfen. |
| Schlecht | Beinpresse, Beinstrecker, Beinbeuger, Wadenheben an der Maschine, Latzug mit festem Griff, Hip Thrust ohne Gewicht in der Hand | Die Hand bewegt sich kaum oder gleich. Dort braucht es die Plan-Vorgabe und eine Bestätigung. |

Die Erkennung arbeitet deshalb in **zwei Ebenen**:
- **Bewegungsfamilie** (das erkennt das Modell): horizontales Drücken, vertikales Drücken, horizontales Ziehen, vertikales Ziehen, Curl, Trizeps, Kniebeuge, Hüftbeuge/Kreuzheben, Ausfallschritt, Liegestütz, Rumpf.
- **konkrete Übung** (das löst der Plan auf): Familie "vertikales Drücken" plus Plan "Overhead press" ergibt "Overhead press". Ohne Plan zeigt die Uhr die Familie und das häufigste Beispiel.

Das ist ehrlicher als 30 Einzelklassen, und es erhöht die echte Trefferquote.

## 3. Erkennungs-System

### 3.1 Die Schichten

| # | Schicht | Zweck | Erwartete Wirkung |
|---|---|---|---|
| L1 | **Beschleunigung und Gyroskop**, beides, 4-s-Fenster mit 1 s Schritt aus einem Ringpuffer | Drehung des Handgelenks trennt Curl von Drücken. Das Gyroskop ist in RecoFit vorhanden, die Entscheidung "mit oder ohne" fällt per Messung. | Hoch |
| L2 | **Satz-Erkennung**: erst "wird gerade ein Satz gemacht?" (Bewegungsenergie plus Periodizität), dann klassifizieren | Weniger Fehlalarme bei Pausen, Gerätewechsel, Trinken | Hoch |
| L3 | **Satz statt Fenster**: Beweise aus allen Fenstern eines Satzes werden zusammengezählt (Summe der Log-Wahrscheinlichkeiten). Entscheidung, sobald die Sicherheit hoch genug ist, spätestens am Satzende | Fensterfehler mitteln sich heraus | Sehr hoch |
| L4 | **Plan als Vorwissen**: Kandidaten sind die Übungen der heutigen Einheit. Im Schnitt 4 bis 6 statt 11 Familien | Das Paper meldet 99 % bei Zirkeln aus 4 Übungen und 96 % bei 13. Das ist die Größenordnung dieses Hebels. | Sehr hoch |
| L5 | **Reihenfolge-Vorwissen**: Der nächste Satz ist meist dieselbe Übung wie der letzte (Annahme: meistens, die Quote messen wir an eigenen Daten) oder die nächste im Plan | Überbrückt unsichere Sätze | Mittel |
| L6 | **Eigene Daten von der eigenen Uhr**, links und rechts getragen, mehrere Personen | RecoFit hat einen Arm-Sensor mit anderer Achsenlage und anderer Hardware. Eigene Daten schließen diese Lücke. | Sehr hoch, **Pflicht** |
| L7 | **Rückmeldung im Alltag**: Jede Bestätigung und Korrektur ist ein beschrifteter Satz (nur mit Zustimmung) und verbessert das nächste Modell | Das Modell passt sich dir an | Wächst mit der Zeit |
| L8 | **Unsicher heißt fragen**: Unter einer Schwelle wird nichts still eingetragen, die Uhr zeigt die drei besten Kandidaten | Eine falsche stille Zuordnung ist schlimmer als eine Rückfrage | Schützt die Datenqualität |

### 3.2 Wiederholungen zählen
Eigener Schritt, eigenes Verfahren: Hauptachse über Hauptkomponente des Satzes bestimmen, glätten, Spitzen mit Mindestabstand und Mindesthöhe zählen. RecoFit meldet für Zählen ±1 Wiederholung in 93 % der Sätze. Das ist die Messlatte.

### 3.3 Modellwahl
Im Notebook werden verglichen: Entscheidungsbaum (Basis), Random Forest, Gradient Boosting, kleines MLP auf denselben Merkmalen. Entscheidend ist die Leave-One-Subject-Out-Genauigkeit **pro Satz**, begrenzt durch das, was auf die Uhr passt (768 KB Speicher, wenige Dutzend Millisekunden pro Schritt).
- Auf die Uhr: der beste Kandidat, der in das Budget passt. Als Daten ausgeliefert (Arrays in einer Resource), nicht als riesiger Code-Block.
- Auf die Website: dasselbe oder ein stärkeres Modell, in TypeScript ausgeführt, für die nachträgliche Prüfung eines Trainings. Es braucht keinen eigenen Server, die Bäume sind nur Arrays.

### 3.4 Merkmale in Python und Monkey C
Der häufigste Fehler bei so etwas. Gegenmaßnahme: `exercise-ml/src/features.py` ist die einzige Spezifikation. Der Export erzeugt Golden-Vektoren, und `Tests.mc` prüft die Monkey-C-Merkmale gegen sie (Toleranz festgelegt, mindestens 20 Fenster pro Klasse). Das nutzt das vorhandene Testgerüst der Uhr-App (`monkeyc -t`).

### 3.5 Abnahmekriterien (Ziele, nicht Zusagen)
| Stufe | Test | Ziel |
|---|---|---|
| G1 | RecoFit, Leave-One-Subject-Out, pro Satz, alle Familien | 90 % oder mehr, Wert wird vorher festgelegt und danach nicht angepasst |
| G2 | Eigene Uhr-Daten, andere Person und andere Sitzung als im Training | 90 % ohne Plan, 97 % mit Plan, Zählen ±1 bei 90 % der Sätze |
| G3 | Echter Blindtest im Gym, 5 Sitzungen | Höchstens 2 % still falsch eingetragene Sätze (der Rest wird gefragt) |

Fällt eine Stufe durch, ändern wir Daten oder Ansatz, bevor wir weiterbauen.

## 4. Daten

### 4.1 RecoFit (Start und Vortraining)
- 94 Personen in der Einzel-Datei (laut README über 200 im Gesamtdatensatz), Beschleunigung und Gyroskop, 50 Hz. Lizenz CDLA-Permissive-2.0: Modelle daraus dürfen ohne Einschränkung genutzt werden, Quelle angeben. Die im ersten Entwurf befürchtete Lizenzfrage ist damit erledigt.
- Zwei Dateien mit je rund 1,5 GB (Git LFS, nicht im normalen Clone). `singleonly` ist je Übung getrennt (Erkennen, Zählen), `multionly` enthält ganze Einheiten mit Start- und Endzeiten und Wiederholungszahlen (Satz-Erkennung).
- Einheiten: Beschleunigung in g, Gyroskop in Grad/s. Die Uhr liefert milli-g. Umrechnung beim Laden.
- Sensorlage und Achsen weichen von der Uhr ab. Gegenmittel: achsen-invariante Merkmale (Betrag, Hauptkomponente, Gravitationswinkel relativ zur Satzmitte), Rotations-Augmentation, Spiegelung für die andere Hand.

### 4.2 Eigene Uhr-Daten (der wichtigste Hebel)
- **Recorder in der Uhr-App** (Entwickler-Menü): Übung wählen, Handgelenk wählen, START/STOPP pro Satz, Wiederholungen eintippen. Die Rohdaten gehen **direkt über die bestehende Kopplung an Supabase**, ohne USB und ohne Log-Datei-Trick. Das macht das Sammeln von hunderten Sätzen realistisch.
- Protokoll: je Übung 10 bis 15 Sätze, verschiedene Gewichte und Tempi, beide Handgelenke, mehrere Sitzungen. Mindestens **zwei Personen**, damit "andere Person" echt getestet wird. Dein Kollege mit der Forerunner 165 Music passt dafür.
- Vor jeder Aufnahme eine Ruhesekunde, danach eine: so entstehen saubere Satzgrenzen und "Nicht-Übung"-Daten (Trinken, Gerät umbauen, Gehen).
- Datenschutz: Rohdaten nur mit ausdrücklicher Zustimmung (Schalter in den Einstellungen), jederzeit löschbar. Die Datenschutzseite wird ergänzt, bevor das in die Store-Version kommt.

### 4.3 Wie es später weiterläuft
Bestätigte oder korrigierte Sätze aus dem Alltag (mit Zustimmung) werden neue Trainingsdaten. Neue Modelle kommen als **Daten** zur Uhr (über dieselbe Kopplung wie der Plan), ohne neue App-Version im Store. Dafür braucht die Uhr eine Modellversion und einen Rückfall auf das eingebaute Modell.

## 5. Uhr-App: Bedienung

Grundsatz: schwitzige Hände, Hantel in der Hand. **Tasten zuerst, Touch nur als Zusatz**, große Schrift, wenige Zustände.

### 5.1 Einstieg
Menü **Training** zeigt heute die geplante Einheit. Bei einer Krafteinheit steht dort z. B. "Heute · Kraft Oberkörper · 5 Übungen · 40 min". Dazu "Kraft frei" für Training ohne Plan.
Danach der gewohnte Bereit-Bildschirm mit Übungsliste und START.

### 5.2 Ablauf im Training (drei Zustände)

```
 RUHE                    SATZ LÄUFT               SATZ ENDE (3-5 s)
 zwischen den Sätzen     Bewegung erkannt         Karte zur Bestätigung

 ┌─────────────┐        ┌─────────────┐          ┌─────────────┐
 │ Bankdrücken │        │      7      │          │ ✓ Bankdrücken
 │ Satz 2 / 4  │        │     Wdh     │          │   8 Wdh · 60 kg
 │             │        │ Bankdrücken ●          │ AUF/AB Gewicht
 │    1:12     │        │   ♥ 134     │          │ START ok
 │  Ziel 8×60  │        └─────────────┘          └─────────────┘
 │   ♥ 98      │
 └─────────────┘
```

- **Ruhe:** Zeigt die nächste geplante Übung groß, den Satz (2/4), das Ziel (8 × 60 kg) und einen Pausen-Zähler. Am Ende der Pause eine sanfte Vibration (kein Ton, damit Musik nicht stottert).
- **Satz läuft:** Die Uhr merkt den Satzbeginn selbst. Große Wiederholungszahl, darunter der erkannte Name. Ein Punkt zeigt die Sicherheit (grau, gelb, grün). Nichts drücken.
- **Satz Ende:** Die Bewegung stoppt. Karte mit Übung, Wiederholungen, Gewicht. Ist die Erkennung sicher und passt zum Plan, **schließt sie sich nach 4 s von selbst** und der Satz ist eingetragen (kurze Doppelvibration). Nur bei Abweichung oder Unsicherheit bleibt sie stehen: AUF/AB wählt den Alternativ-Kandidaten, START bestätigt, BACK verwirft den Satz.
- **Gewicht:** Vorbelegt mit dem letzten Gewicht dieser Übung (kommt vom Plan und der Website). AUF/AB ändert in 2,5-kg-Schritten, nur falls abweichend. Kein Pflichteintrag.
- **Seiten (AUF/AB blättern):** Übersicht der Sätze heute, Puls und Zonen, Uhrzeit. BACK in der Ruhe überspringt die Übung, die Pause-Taste öffnet das Menü (Fortsetzen, Speichern, Verwerfen). Gleiche Abläufe wie beim Laufen, damit nichts neu gelernt werden muss.
- **Freies Training:** Gleiche Karten, aber die Kandidaten sind alle Familien. Der Name kommt aus Erkennung plus den bisherigen Sätzen der Einheit.

### 5.3 Aufzeichnung
Aktivitätstyp Krafttraining in Garmin Connect, eine Runde je Satz, Entwicklerfelder je Runde: Übung, Wiederholungen, Gewicht, Sicherheit. Puls und Dauer wie gewohnt.

### 5.4 Startseite und Wochenansicht
- Wochen-Seite: Kraft-Einheiten stehen neben den Läufen (Symbol Hantel), mit Häkchen wie beim Laufen.
- Startseite: Neben den Wochenkilometern kann "Sätze diese Woche" stehen. Die Auswahl liegt in den Einstellungen.

### 5.5 Einstellungen (neu)
Handgelenk links/rechts, Kraft-Erkennung an/aus, Auto-Bestätigung an/aus, Pausen-Signal (Vibration/Ton), Gewichtseinheit (kg/lb), "Trainingsdaten teilen" (Zustimmung, standardmäßig aus).

## 6. Website: Bedienung

Gleiche Navigation, gleiche Farbwelt, gleiche Kopplungskarte.

- **Plan / Kalender:** Kraft-Einheiten und Läufe in derselben Woche. Eine Krafteinheit lässt sich aufklappen: Übungen mit Sätzen × Wiederholungen. Nach dem Training erscheinen daneben die tatsächlichen Sätze von der Uhr, mit dem Hinweis "automatisch erkannt" oder "bitte prüfen".
- **Neue Seite "Kraft":**
  - *Einheit:* Zeitleiste der Sätze (farbig je Übung, Pausen als Lücken), darunter eine Tabelle. Jede Zeile lässt sich ändern: Übung (Auswahlliste), Wiederholungen, Gewicht, Löschen, Satz hinzufügen. Änderungen speichern sofort.
  - *Verlauf:* je Übung geschätztes 1RM, Volumen (Sätze × Wdh × kg), Bestwerte.
  - *Übungen:* Bibliothek mit Familie, Material und Erkennbarkeit ("gut/mittel/schlecht"). Hier wählt man, was in den Plan darf.
- **Fortschritt:** Die wöchentliche Belastung aus Laufen und Kraft nebeneinander (Läufe in km, Kraft in harten Sätzen je Muskelgruppe). Der Coach nutzt sein vorhandenes Wissen (Beine nicht direkt vor Schlüssel-Läufen) und bekommt echte Daten statt Annahmen.
- **Plan-Assistent:** Zwei Hybrid-Profile als Schnellauswahl: "Marathon mit Kraft-Erhalt" (2 Einheiten pro Woche) und "Ausgewogen" (3 bis 4). Alles andere bleibt im bisherigen Wochen-Baukasten einstellbar.
- **Einstellungen > Garmin-Uhr:** Neue Karte "Kraft-Erkennung": Modellversion, Handgelenk, Zustimmung zum Teilen, alle Kraftdaten löschen.
- **Korrektur als Teil der Seite:** Wer einen Satz ändert, sieht "Danke, das verbessert die Erkennung" (nur bei Zustimmung).

## 7. Datenmodell und Schnittstellen

Neue Tabellen (Skizze, wird als Migration `2026…_strength.sql` gebaut):

```
exercises        id, name_de, name_en, family, equipment, detect ('good'|'medium'|'poor')
strength_sets    id, user_id, activity_id?, planned_workout_id?, idx, started_at, duration_s,
                 exercise_id, family, reps, weight_kg?, confidence,
                 label_source ('auto'|'confirmed'|'corrected'|'manual'), model_version
strength_traces  set_id, fs, payload (Rohdaten), consent   -- nur mit Zustimmung
```

Der Plan nutzt schon `planned_workouts.steps` mit Übungen (`{type:'exercise', name, sets, reps}`). Er wird um eine `exercise_id` erweitert, damit Plan und Erkennung dieselben Namen sprechen.

Uhr-Feed (`/functions/v1/watch/run`) bekommt ein Feld `strength`: die heutige Einheit mit Übungen (`id, n, fam, sets, reps, kg, rest`), die zuletzt benutzten Gewichte und die Modellversion. Eine neue Route `POST /watch/strength` lädt die Sätze nach dem Training hoch (gleiche Kopplung wie beim Laufen). Die Aktivität selbst kommt wie bisher über Garmin Connect auf die Website.

## 8. Phasen

| Phase | Inhalt | Abnahme |
|---|---|---|
| 0 | **Sensor-Probe** auf deiner Uhr: echte Abtastraten, Lieferlücken, Rechenzeit, Akkuverbrauch, Musik läuft ungestört | Beschleunigung und Gyroskop liefern lückenlos, Musik unverändert |
| 1 | RecoFit laden, auf Uhrrate bringen, Merkmale, erste Modelle, G1. **Parallel:** Recorder in der App, Upload, erste Aufnahmen | G1 erreicht, 5 Übungen × 10 Sätze eigene Daten |
| 2 | Eigene Daten sammeln (du und dein Kollege), Modellvergleich, Export mit Golden-Vektoren | G2 erreicht |
| 3 | Uhr: Ringpuffer, Satz-Erkennung, Zählen, Klassifikator, Bedienung (Abschnitt 5), Aufzeichnung, Demo-Build mit aufgezeichneten Daten im Simulator | Tests grün, Simulator-Durchlauf, Uhr-Test |
| 4 | Website: Migration, Feed, Seiten (Abschnitt 6), Korrektur | Ende-zu-Ende: Satz auf der Uhr, Plan-Abgleich, Korrektur auf der Website |
| 5 | Rückkopplung, Modell als Daten per Kopplung, Blindtest G3, Store-Update | G3 erreicht |

Phase 0 und der Beginn von Phase 1 hängen nicht voneinander ab. Mit beiden fange ich an.

## 9. Risiken

- **Abtastrate und Rechenzeit auf der Uhr sind noch nicht gemessen.** Daran hängt, wie reich das Modell sein darf. Deshalb Phase 0.
- **Lücke zwischen RecoFit und Uhr.** Ohne eigene Daten bleibt die Genauigkeit unter dem Ziel. Eigene Daten sind kein Extra, sondern der Kern.
- **Maschinen-Übungen** bleiben schwach erkennbar. Die Bedienung fängt das ab (Plan plus Bestätigung), die Erkennung wird es nicht lösen.
- **Akku:** Zwei Sensoren dauernd an kosten Strom. Sie laufen nur im Krafttraining, nicht beim Laufen.
- **Kleine Uhren:** Der Kraft-Code bekommt eine Annotation und wird für Uhren ohne Gyroskop oder mit zu wenig Speicher ausgeschlossen. Laufen bleibt dort unverändert.
- **Musik:** Die Sensoren selbst brauchen kein Funk. Entscheidend ist, die Rechenlast klein zu halten und keine Töne zu spielen. Phase 0 prüft das mit laufendem Spotify.
- **Garmins eigenes Krafttraining:** Die Uhr hat selbst eine Wiederholungszählung. Eine Schnittstelle dafür für Connect-IQ-Apps habe ich in der API-Dokumentation nicht gefunden und nicht gezielt gesucht. Das Konzept geht davon aus, dass es keine gibt.

## 10. Offene Entscheidungen

1. Welche Übungen in Version 1? Vorschlag: deine sechs (Liegestütz, Bizepscurl, Schulterdrücken, Rudern, Bankdrücken, Kniebeuge) plus Kreuzheben, Ausfallschritt, Klimmzug, jeweils als Familie.
2. An welchem Handgelenk trägst du die Uhr im Gym?
3. Wie viele Freihantel-, wie viele Maschinenübungen machst du?
4. Bist du bereit, zwei bis drei Gym-Sitzungen für die Aufnahme zu nutzen, und hilft dein Kollege mit?

## Quellen

- RecoFit-Daten und Lizenz: [microsoft/Exercise-Recognition-from-Wearable-Sensors](https://github.com/microsoft/Exercise-Recognition-from-Wearable-Sensors)
- Morris, Saponas, Guillory, Kelner (2014): [RecoFit, CHI 2014](https://microsoft.com/en-us/research/wp-content/uploads/2016/12/p3225-morris.pdf). Die Werte 99/98/96 % für 4/7/13 Übungen und ±1 Wiederholung bei 93 % stammen aus der Zusammenfassung dieses Papers, nicht aus eigener Messung.
- Connect-IQ-API (SDK 9.3.0, lokale Dokumentation): `Sensor.registerSensorDataListener`, `AccelerometerData`, `GyroscopeData`, `FitContributor`, `ActivityRecording`.

# exercise-ml – Übungserkennung für die MaraPlanna-Uhr-App

## Ziel
Kraftübungen (Bankdrücken, Kniebeuge, …) automatisch aus den Bewegungsdaten der Garmin-Uhr erkennen und die Wiederholungen zählen.
Trainiert wird in Python, ausgeführt wird komplett auf der Uhr (Monkey C), damit das Gym ohne Handy funktioniert.
Das ist **keine eigene App**: Es ist eine Erweiterung der bestehenden Uhr-App (`../garmin-runapp`) und der Website (`../src`, `../supabase`).
Das Gesamtkonzept steht in `../docs/kraft-konzept.md`. Lies es, bevor du etwas Größeres änderst.

## Was "genau" heißt
- Gemessen wird pro **Satz**, nicht pro 4-s-Fenster. Fenster-Genauigkeit wird zusätzlich berichtet, entscheidet aber nichts.
- Aufteilung immer **nach Personen** (Leave-One-Subject-Out), nie nach Fenstern. Eigene Aufnahmen: nach Sitzung/Person.
- Zwei Zahlen pro Modell: (a) alle Klassen möglich, (b) nur die Übungen des Plans als Kandidaten (das ist der Alltag in der App).
- Zählen: Anteil der Sätze mit Fehler von höchstens ±1 Wiederholung.
- Zielwerte stehen im Konzept (Abschnitt Abnahmekriterien). Es sind Ziele, keine Zusagen. Erst die Messung zählt.

## Geprüfte Randbedingungen (Stand 2026-11-04)
- Zielgerät: Garmin Forerunner 165 Music (`fr165m`). Watch-App-Speicher dort: 768 KB. Andere Uhren bekommen Kraft nur, wenn Speicher und Sensoren reichen (Annotation `(:strength)`).
- Sensor-API: `Sensor.registerSensorDataListener` mit `:accelerometer` und `:gyroscope` (Gyroskop ab API 3.3.0, `fr165m` ist in der Geräteliste).
  - Beschleunigung in **milli-g**, Gyroskop in **Grad/s**.
  - `:period` ist das Lieferintervall (max. 4 s), **nicht** die Fensterlänge. Wir nutzen 1 s und halten einen Ringpuffer. So entstehen 4-s-Fenster mit 1 s Schritt.
  - Es gibt immer nur **einen** Listener gleichzeitig. Nicht aus Datenfeldern aufrufbar.
  - Abtastrate: `Sensor.getMaxSampleRate()` und `getMaxSampleRateForSensorType()`. Der Wert auf der echten Uhr ist noch nicht gemessen (Annahme 25 Hz, Phase 0 prüft das).
- RecoFit-Daten: 50 Hz, Beschleunigung in **g**, Gyroskop in Grad/s, Spalte 1 ist die Zeit. Für das Training auf die Uhrrate herunterrechnen und mit 1000 multiplizieren.
  Achsenbelegung und Sensorposition unterscheiden sich von der Uhr. Deshalb achsen-invariante Merkmale bevorzugen, Rotation als Augmentation nutzen und eigene Uhr-Daten als Pflicht ansehen.
- Keine ML-Laufzeit auf der Uhr. Erlaubt: Entscheidungsbäume, kleiner Random Forest, kleines MLP als Gewichte-Arrays.
  Das Modell wird als **Daten** (Resource/JSON) ausgeliefert, nicht als riesige if/else-Funktion (Code-Größe).
- FIT-Dateien: `FitContributor` kennt nur LAP, RECORD, SESSION (keine SET-Nachricht). Sätze werden als Runden plus Entwicklerfelder geschrieben.
- Python: `numpy pandas scipy scikit-learn h5py matplotlib joblib pytest` in `.venv` (`./.venv/Scripts/python`).

## Lizenz und Quellenangabe
RecoFit steht unter CDLA-Permissive-2.0 (`data/raw/LICENSE-RecoFit.txt`). Daten weitergeben: Lizenztext beilegen. Das trainierte Modell (Ergebnis) hat keine Einschränkung.
Quelle immer nennen: Morris, Saponas, Guillory, Kelner (2014), RecoFit, CHI 2014. Daten: github.com/microsoft/Exercise-Recognition-from-Wearable-Sensors.

## Ordner
- `data/raw/` RecoFit, geladen und mit `src/inspect_recofit.py` geprüft: 94 Personen, 75 Übungsnamen, 4687 Aufnahmen (nicht in Git, siehe `.gitignore`). `exercise_data.50.0000_singleonly.mat` = Erkennung und Zählen, `..._multionly.mat` = Satz-Erkennung (wann wird trainiert) und Wiederholungszahlen.
- `data/own/` eigene Uhr-Aufnahmen vom Recorder (Format steht in `data/own/README.md`).
- `src/` Python-Bibliothek: `features.py` ist die **einzige Quelle der Wahrheit** für die Merkmale.
- `notebooks/` Auswertungen. `tests/` pytest. `export/` erzeugte Dateien für die Uhr (Modell, Golden-Vektoren).

## Regeln
1. Merkmale werden einmal spezifiziert (`src/features.py`, Docstring = Spezifikation) und in Monkey C nachgebaut. Der Export schreibt **Golden-Vektoren** (Eingabefenster + erwartete Merkmale + erwartete Klasse) nach `export/golden.json`. `garmin-runapp/source/Tests.mc` prüft sie. Ohne grünen Test kein Modell auf der Uhr.
2. Rechenbudget: Pro 1-s-Schritt muss alles in wenigen Dutzend Millisekunden fertig sein (Musik/Bluetooth nicht stören, Akku).
3. Neue Modelle nur mit Versionsnummer exportieren. Alte Ergebnisse nicht überschreiben.
4. Nichts hartkodieren, was von der Uhr oder aus MaraPlanna kommen kann (siehe Memory-Regel der Projekte).

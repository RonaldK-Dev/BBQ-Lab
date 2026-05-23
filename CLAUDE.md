# CLAUDE.md — BBQ Lab

> Vollständiger Kontext für eine neue Chat-Session. Stand: Mai 2026.

---

## Projektübersicht

### Zweck und Ziel
**BBQ Lab** ist eine deutschsprachige Progressive Web App (PWA) für BBQ-Enthusiasten, die ihre **Gewürzmischungen, Rubs, Marinaden, Saucen und Dips** dokumentieren und über mehrere Versionen iterieren möchten. Jedes Rezept ist ein "Test" mit Zutaten, Versionsnummer, Sterne-Bewertung, Status, optionalem Foto, Typ-/Anwendungs-Tags und Geschmacks-Notizen.

**Hauptanwendungsfälle:**
- Neue Gewürzmischung erfassen mit Zutatenliste (Bruchteile ¼, ½, ¾, 1, 1½, 2, 3, 4 als Schnellbuttons)
- Versionen einer Mischung verfolgen ("Smoky Paprika Rub V.1, V.2 ...")
- Foto pro Rezept (Supabase Storage)
- Tags: Typ (Rub/Sauce/Marinade/Dip) + Anwendung (Rind/Schwein/Hähnchen/Lamm/Fisch/Gemüse)
- Status tracken: "in Arbeit", "fertig", "verworfen"
- Filtern nach Status, Typ, Anwendung, Sterne-Anzahl + Live-Suche
- Sync zwischen Geräten (Mobile PWA + Desktop)
- Selektiver Export (Long-Press auf Karten → Native Share Sheet)

### Tech Stack
| Technologie | Version | Verwendung |
|---|---|---|
| **HTML/CSS/Vanilla JavaScript** | ES2020+ | Komplette App in einer einzigen `index.html`, kein Framework, kein Build |
| **Supabase JS SDK** | v2 (CDN) | DB-Sync (PostgreSQL JSONB) + Storage (Fotos) |
| **localStorage** | nativ | Offline-Persistenz |
| **Web Share API** | nativ | `navigator.share()` für Export auf Mobile |
| **Service Worker** | nativ | Offline-Cache der App-Shell + Supabase-Daten (sw.js) |
| **Google Fonts** | – | `Bebas Neue` (Headlines), `DM Sans` (Body) |
| **PWA Manifest** | W3C | Installierbar auf iOS/Android/Windows Home-Screen |
| **Python http.server** | 3.x | Lokaler Dev-Server (Port 4321, via `.claude/launch.json`) |

**Keine Dependencies, kein npm, kein Bundler.** Supabase wird via `<script>`-Tag eingebunden.

### Projektstruktur
```
D:\Claude Projekte\BBQ-Lab\
├── index.html          # KOMPLETTE App: HTML, CSS, JS — ~920 Zeilen
├── sw.js               # Service Worker (Offline-Cache, ~75 Zeilen)
├── manifest.json       # PWA Manifest
├── icon.png            # 512×512 App-Icon
├── favicon.png         # 32×32 Browser-Icon
├── favicon-16.png      # 16×16
├── CLAUDE.md           # dieses Dokument
├── .gitignore          # ignoriert .claude/
├── .claude/launch.json # Python-Dev-Server Konfig (Port 4321)
└── .git/               # github.com/RonaldK-Dev/BBQ-Lab (Branch: main)
```

---

## Architektur & Key Decisions

### Architekturmuster
**Single-File-App mit globalem State + Imperatives DOM-Rendering.**
- Globales `S`-Objekt hält den State.
- `set(p)` mergt Updates in `S` und ruft `render()` auf.
- `render()` leert `#root.innerHTML` komplett und baut den DOM neu auf (List/Form/Detail).
- Auf Desktop wird die Form/Detail als **Modal-Overlay** über der List gerendert.

```
Click → Handler → set({...}) → render() leert #root → renderXxx() baut neu auf
```

### State `S` (Init in Zeile 284)
```js
{
  view: "list" | "form" | "detail",
  entries: Entry[],
  current: Entry | null,         // im Form bearbeitetes Rezept
  detailId: number | null,
  menuOpen: boolean,             // Mobile-Header ⋯ Dropdown
  importOpen: boolean,
  importText: string,
  focusedIng: number,            // Zutatenzeile mit Fokus (Bruch-Buttons)
  sidebarOpen: boolean,          // Desktop-Sidebar Open/Collapsed
  sidebarMenuOpen: boolean,      // Desktop-Sidebar ≡ Dropdown
  filter: null | "fertig" | "in Arbeit" | "verworfen",  // Status-Filter
  search: string,
  pendingPhoto: File | null,     // unhochgeladenes Foto im Form
  selectionMode: boolean,        // Long-Press / Hover-Checkbox aktiv
  selectedIds: number[],         // Ausgewählte für Export
  typeFilter: string | null,     // Typ-Filter (Rub/Sauce/...)
  meatFilter: string[],          // Anwendungs-Filter (Multi)
  ratingFilter: number | null    // Sterne-Filter (1-5)
}
```

### Entry-Schema (in `S.entries[]` und Supabase)
```js
{
  id: number,           // Date.now()
  name: string,
  version: string,      // "1", "2", ...
  date: string,         // ISO YYYY-MM-DD
  rating: 0..5,
  anwendung: string,    // LEGACY: Freitext-Feld, im UI entfernt, im Schema/Search noch erhalten
  notizen: string,
  status: "in Arbeit" | "fertig" | "verworfen",
  photoUrl: string,     // Supabase Storage URL (oder leer)
  type: string,         // "Rub" | "Sauce" | "Marinade" | "Dip" | ""
  meats: string[],      // ["Rind","Schwein",...] — UI-Label heißt "Anwendung"
  ingredients: [{ qty: string, unit: string, name: string }]
}
```

**Wichtig:** Das Feld `anwendung` ist als Freitext **aus dem UI entfernt**, bleibt aber im Schema (für alte Daten) und wird in `matchesSearch()` durchsucht. Neue Rezepte haben `anwendung: ""`.

### Konstanten (Zeilen 215–223 + VERSIONS-Array)
```js
const KEY="bbq-tasting-log";                    // localStorage-Key
const SUPABASE_URL="https://oltntsahncrrseufbowj.supabase.co";
const SUPABASE_KEY="sb_publishable_...";        // publishable, kein Secret
const UNITS=["TL","EL","Cup","g","ml","L","Prise","–"];
const FRACS=["¼","½","¾","1","1½","2","3","4"];
const TYPES=["Rub","Sauce","Marinade","Dip"];
const MEATS=["Rind","Schwein","Hähnchen","Lamm","Fisch","Gemüse"]; // Reihenfolge fix
const SC={"in Arbeit":"#f59e0b","fertig":"#10b981","verworfen":"#ef4444"};
const SI={"in Arbeit":"🔬","fertig":"✅","verworfen":"❌"};
const VERSIONS=[{v:"2.5",d:"...",c:"..."}, ...]; // Changelog, neueste oben
                                                 // VERSIONS[0].v erscheint im Sidebar-Footer
                                                 // Bei neuem Release: Eintrag oben einfügen + SW-CACHE hochzählen
```

### Wichtige Designentscheidungen

#### 1. Single-File-App ohne Build-System
Maximale Einfachheit. Eine Datei hochladen ⇒ Deploy fertig.

#### 2. Imperative DOM-Manipulation statt Framework
Helpers: `div(cls)`, `btn(cls,txt,cb)`, `inp(cls,val,cb,extra)`, `txt(cls,text)`, `span(text)` (Zeilen 272–282).

#### 3. `set()` als zentraler State-Updater
```js
function set(p){S=Object.assign({},S,p);render();}
```
**Aber:** Text-Inputs und Tag-Pills mutieren `S.current` direkt **ohne** `set()`, um Re-Render-Flicker und Fokus-Verlust zu vermeiden. Sie aktualisieren stattdessen einzelne DOM-Elemente (z.B. `pill.classList.toggle("active",...)` oder `btn.style.color=...`).

#### 4. Sortierreihenfolge: Fertig → In Arbeit → Verworfen
```js
const _statusOrder={"fertig":0,"in Arbeit":1,"verworfen":2};
filtered.sort((a,b)=>(_statusOrder[a.status]??1)-(_statusOrder[b.status]??1));
```
In `renderList()` (Zeile 396f).

#### 5. Mobile-First mit `@media(min-width:768px)` für Desktop
- Mobile: 480px max-width, Cards in Spalte, Sticky-Header, FAB
- Desktop: Sidebar (240px) + Card-Grid + Modals

#### 6. Offline-First + Cloud-Sync
- localStorage = Source of Truth lokal
- Supabase = Sync-Backend
- **Pull:** App-Start, Pull-to-Refresh, setInterval alle 10s
- **Push:** Nach jedem `save()`
- Supabase-Tabelle `entries`: `id BIGINT PK`, `data JSONB`, `updated_at TIMESTAMPTZ`

#### 7. Foto-Upload via Supabase Storage
- Bucket: `recipe-photos` (mit Anon-INSERT/UPDATE-RLS-Policies)
- Pfad: `<entryId>.<ext>`
- Upload erst in `doSave()` (nicht beim Auswählen) — `S.pendingPhoto` hält die File temporär.
- `entry.photoUrl` speichert die public URL.

#### 8. Export via Web Share API
`doExport()` (Zeile 786) erzeugt eine `.json`-Datei und ruft `navigator.share({files:[file]})` auf. Fallback: `doDownload()`. Optionales Argument `entriesToExport` für selektiven Export.

#### 9. Long-Press Selektion (Mobile) + Hover-Checkbox (Desktop)
- Mobile: 500ms Long-Press auf Karte → `selectionMode:true`, Checkbox erscheint.
- Desktop: `.entry-card:hover .card-check { opacity:1 }` zeigt Checkbox bei Hover.
- iOS-Textselektion blockiert: `.entry-card { -webkit-user-select:none; -webkit-touch-callout:none }`.

#### 10. Pull-to-Refresh = `location.reload()`
Nicht nur Daten-Sync, sondern komplettes Reload — damit auch neuer App-Code geladen wird (PWA-Cache umgehen).

#### 11. iOS Auto-Zoom-Prevention
Alle Inputs/Selects/Textareas haben mindestens **16px font-size** auf Mobile.

#### 12. Scrollbar-Gutter Stable
`.main-content { scrollbar-gutter:stable }` verhindert Layout-Shift beim Filtern.

#### 13. Badge mit fester Breite
`.desktop-list-header .badge { min-width:90px; text-align:center }` — kein Shift wenn der Text von "X Rezepte" auf "Y / X" wechselt.

#### 14. Dropdown-Menüs — zwei Patterns
- **Mobile (⋯):** globaler `document.click`-Listener schließt bei Klick außerhalb von `.menu-wrap`. **Wichtig:** der Menü-Button selbst nutzt `e.stopPropagation()` — sonst feuerte der Outside-Handler direkt nach dem Open-Click (Bug-Fix aus Commit `d208c7d`).
- **Desktop-Sidebar (≡):** `mouseleave` auf das Dropdown.

#### 15. Card-Stripe via CSS-Variable
```js
card.style.setProperty("--st-color", SC[e.status]);
```
4px breiter Status-Farbstrich links auf jeder Karte.

#### 16. Service Worker (`sw.js`) für Offline-Support
Registrierung am Anfang der init-IIFE: `navigator.serviceWorker.register("./sw.js")`.
Cache-Name: `bbq-lab-v1`. Strategien:
- **App-Shell** (HTML/Icons/Manifest): Stale-While-Revalidate — App startet **immer instant aus Cache**, Update läuft im Hintergrund. Löst das "Windows-PWA zeigt Offline-Dino"-Problem.
- **Supabase REST** (`/rest/`): Network-First mit Cache-Fallback — frische Daten online, letzter Stand offline.
- **Supabase Storage** (`/storage/`): Cache-First — Fotos sind statisch, einmal cachen reicht.
- **Google Fonts** (CDN): Stale-While-Revalidate.

**Update-Mechanismus:** Bei neuer App-Version wird `CACHE`-Konstante in `sw.js` hochgezählt (`v1` → `v2`). Activate-Handler löscht alte Caches. User sieht neue Version beim nächsten Start.

**Wichtig beim Deploy:** Falls App-Shell-Dateien hinzukommen, müssen sie ins `SHELL`-Array von `sw.js` ergänzt **und** die Cache-Version hochgezählt werden.

---

## Aktueller Stand

### Was funktioniert ✅
- CRUD: Anlegen, Bearbeiten, Löschen, Detail
- Bruch-Schnellbuttons für Zutaten-Mengen
- Sterne-Bewertung 0–5
- Status-System (in Arbeit/fertig/verworfen) mit Farbcodierung
- **Foto pro Rezept** (Supabase Storage, mit Preview im Form)
- **Tags:** Typ (Single-Select) + Anwendung (Multi-Select)
- **Filter-Pills** in Sidebar (Desktop) und Mobile-Scroll-Leiste
- **Sterne-Filter** als klickbarer Sterne-Balken
- Cloud-Sync via Supabase (Push bei Save, Pull alle 10s + bei Reload)
- Offline via localStorage **und Service Worker** (App-Shell + Daten-Cache)
- **Service Worker (sw.js)** — installierte PWA startet immer aus Cache, kein Offline-Dino mehr auf Windows/Android
- Pull-to-Refresh mit `location.reload()`
- Export via Web Share API (Mobile) / Download (Desktop) — selektiv über Long-Press / Hover-Checkbox
- Import via JSON-Textarea
- PWA-installierbar (iOS / Android / Windows / Edge / Chrome)
- Desktop-Layout mit einklappbarer Sidebar + Modals
- Mobile-Filter (Sterne/Typ/Anwendung) in **drei Zeilen mit Labels oberhalb** (wie Sidebar) — kein horizontales Scrollen
- Live-Suche in Name/Notizen/Zutaten/anwendung-Legacy
- "Rezepte"-Klick im Sidebar-Stat resettet **alle** Filter (Status, Typ, Anwendung, Rating)
- Sortierung Fertig → In Arbeit → Verworfen über alle Views
- Status-farbiger Card-Stripe
- Konsistente Stern-Darstellung (★) in Karten, Detail, Sidebar-Schnitt, Form
- Mengen-Einheit "L" (Liter) verfügbar zusätzlich zu ml
- **"Als V.X+1 duplizieren"**-Button im Detail-View — neue Iteration mit Zutaten/Tags übernommen, Rating/Notizen/Foto zurückgesetzt
- **Aktuelle Versionsnummer** im Sidebar-Footer (`BBQ Lab v2.5`) aus `VERSIONS[0].v`

### In Arbeit
Aktuell **keine offenen Tasks**. Letzter Commit: `ce681bb — Feature: "Als V.X+1 duplizieren"-Button im Detail-View`.

### Bekannte Bugs / Offene Punkte
- **Keine User-Auth** → alle Nutzer der Supabase-DB sehen dieselben Rezepte (privates Tool, ok für jetzt)
- **Datum-Picker auf iOS** je nach Browser unterschiedlich (nativer Picker)
- **Import-Validierung** prüft nur `Array.isArray()`, keine Schema-Validierung der Entries
- **Manifest hat nur 512×512-Icon** — Lighthouse mäkelt, funktioniert aber
- **`anwendung`-Freitextfeld** ist im UI weg, im Schema noch da — kann irgendwann ganz entfernt werden, sobald sicher dass kein Bestand darauf zugreift
- **SW-Update-Notification** fehlt — neue Version wird beim nächsten Start automatisch geladen, aber User bekommt keinen Hinweis "Update verfügbar"

---

## Nächste Schritte

### Priorisierte TODO-Liste

| Prio | Feature | Aufwand | Begründung |
|---|---|---|---|
| 🥇 #1 | **🌡️ Cook-Parameter strukturiert** | Klein-Mittel | Felder für Temperatur, Garzeit, Holzart, Methode statt alles in "Notizen" |
| 🥈 #2 | **📊 Versions-Vergleich** | Mittel | Karten gleichen Namens gruppieren, Side-by-Side-Diff |
| 🥉 #3 | **⌨️ Keyboard-Shortcuts** | Klein | N=Neu, /=Suche, Esc=Modal-Close, ←/→ im Detail |
| 4 | **📄 PDF/Bild-Export** | Mittel | Eine Karte als druckbares PDF oder Bild für WhatsApp |
| 5 | **Sync-Status-Indikator** | Trivial | Kleines Icon im Header: läuft/fertig/Fehler/offline |
| 6 | **SW-Update-Notification** | Trivial | Toast "Neue Version verfügbar — neu laden" bei wartendem SW |
| 7 | **Sticky Mobile-Suchleiste** | Trivial | `position:sticky` auf `.mobile-search-wrap` |

### Erledigt ✅
- ~~**📋 "Als V.X+1 duplizieren"**~~ — Detail-View-Button, `openDuplicate()` + `nextVersion()` (Commit `ce681bb`)
- ~~**Versionsnummer im Sidebar-Footer**~~ — `VERSIONS[0].v` (Commit `1ced7d2`)
- ~~**🔌 Service Worker**~~ — App-Shell + Daten-Cache (Commit `5f60352`)
- ~~**Mobile Filter-Layout untereinander**~~ — 3 Zeilen mit Labels oberhalb (Commit `75da228`)

### Offene Überlegungen (nicht entschieden)
- **Kategorie "Ideen"** als zusätzlicher Status: Überschneidet sich evtl. mit "in Arbeit" — abwägen, ob es einen echten Mehrwert bringt, bevor implementiert wird.

**Empfehlung als nächstes:** `#1 (Cook-Parameter)` — strukturierte Felder für Temperatur, Garzeit, Holzart, Methode. Würde die App vom reinen Rezept-Log zum echten BBQ-Logbuch upgraden.

---

## Wichtige Konventionen

### Coding-Style
- **Indentation:** 2 Spaces
- **JS-Style:** Minimal-Whitespace, mehrere Statements pro Zeile bei Render-Code. Beispiel: `const cn=div("card-name");cn.textContent=e.name;`
- **CSS:** Inline im `<style>`-Tag, minified (eine Regel pro Zeile)
- **Strings:** Doppelte Anführungszeichen
- **Funktionen:** `function`-Deklarationen für Top-Level, Arrow-Funcs nur als Inline-Handler
- **Naming:**
  - State: camelCase (`sidebarOpen`, `pendingPhoto`, `typeFilter`)
  - CSS: kebab-case (`tag-pill`, `card-tags`, `mobile-filter-wrap`)
  - JS-Variablen im Render-Code: kurz (`sb`, `mWrap`, `dlh`), in Logik beschreibend
  - **User-facing: Deutsch** (Code-Identifier teils Denglisch: `notizen`, `anwendung`, `meats`)

### Neue Features hinzufügen
1. **State** erweitern in `S`-Init (Zeile 284) mit sinnvollem Default.
2. **CSS** im `<style>`-Tag — Mobile-Basis vor `@media`-Block, Desktop-Overrides innerhalb. **Inputs mindestens 16px font-size auf Mobile.**
3. **Konstanten** ggf. zu `TYPES`/`MEATS`/`UNITS`/`FRACS` ergänzen (Zeilen 218–221).
4. **Render-Logik** in `renderList()` / `renderForm()` / `renderDetail()`. Bei größeren Sachen: eigene Funktion.
5. **State-Updates:** `set({...})` für globale Änderungen, **direkte Mutation** von `S.current` + DOM-Updates für Form-Interaktionen ohne Re-Render-Flicker.
6. **Filter:** Neue Filter erweitern `matchesTags(e)` (Zeile 270) **und** den `allActive`-Check in der Sidebar (Zeile 322) **und** den "Rezepte"-Reset-Handler.
7. **Verifikation** im Browser-Preview (Port 4321), Eval-basierte Tests via Preview-MCP.
8. **Commit** auf Deutsch mit Begründung + Co-Authored-By Claude.
9. **Push:** Im BBQ-Lab-Projekt **immer automatisch nach Commit** (User-Memory: `feedback_bbqlab_autopush.md`).

### Testing-Strategie
**Keine automatisierten Tests.** Verifikation läuft über:
1. **Browser-Preview** auf `http://localhost:4321` (Python http.server via `.claude/launch.json`)
2. **Beide Viewports**: Mobile (375×812) und Desktop (1280×800)
3. **Eval-Tests** via `mcp__Claude_Preview__preview_eval`:
   ```js
   (async()=>{ set({typeFilter:'Sauce'}); await new Promise(r=>setTimeout(r,200));
     return document.querySelectorAll('.entry-card').length; })()
   ```
4. **Mobile-Realtest** auf iPhone via PWA-Install
5. **Bei Bugs:** Eval-Test schreiben, der reproduziert → fixen → Eval erneut

**Hinweis:** `preview_screenshot` timeouted oft nach 30s — auf Eval-Tests umsteigen.

---

## Kritische Dateien

### `index.html` (905 Zeilen) — komplette App

| Bereich | Zeilen | Inhalt |
|---|---|---|
| `<head>` | 1–17 | Meta-Tags, PWA-Konfig, Fonts, Icons, Manifest |
| `<style>` Base | 19–~120 | Mobile-Basis + gemeinsame Styles |
| `<style>` Mobile-only | ~120–~150 | Sidebar default hidden, Mobile-Search-Wrap, Mobile-Filter-Wrap |
| `<style>` `@media ≥768px` | ~150–~210 | Desktop-Overrides, Modal-Styles, Hover, Animations |
| **Konstanten** | 215–223 | Keys, URLs, UNITS, FRACS, TYPES, MEATS, SC, SI |
| **Storage/Sync** | 225–267 | `load`, `save`, `getSB`, `syncToSupabase`, `loadFromSupabase`, `uploadPhoto` |
| **Helpers** | 268–282 | `stars`, `matchesSearch`, `matchesTags`, `div`, `btn`, `inp`, `txt`, `span` |
| **State** | 284 | `S`-Init |
| **`set()`** | 286 | Zentraler Updater |
| **`renderList()`** | 288–538 | Sidebar + Card-Grid + Mobile-Header + Search + Filter-Pills + Long-Press-Handling |
| **`renderForm()`** | 540–707 | Create/Edit-Form: Name+Version, Foto, Datum, Rating, Status, Typ-Pills, Anwendung-Pills, Zutaten, Notizen |
| **`renderDetail()`** | 709–765 | Readonly-Detail-View mit Foto, Tags, Sternen, Zutaten-Tabelle, Edit/Delete |
| **Actions** | ~795–830 | `openNew`, `openEdit`, **`nextVersion`**, **`openDuplicate`**, `doSave` (mit Photo-Upload), `doDownload`, `doExport` (Share Sheet), `doImport` |
| **`render()`** | 806–846 | Dispatcher, Desktop-Modal-Overlay, Search-Focus-Preservation |
| **`initPTR()`** | 849–878 | Pull-to-Refresh Touch-Handler (→ `location.reload()`) |
| **Init-IIFE** | ~890–910 | **SW-Registrierung**, Initial Load, PTR-Register, Mobile-Menü-Outside-Click, 10s-Polling |

### `sw.js` (~75 Zeilen) — Service Worker
Liegt im Repo-Root, wird unter `./sw.js` registriert → Scope = `/BBQ-Lab/` auf GitHub Pages bzw. `/` lokal.

| Bereich | Inhalt |
|---|---|
| `CACHE` | Cache-Name `bbq-lab-v1` — **bei Shell-Änderungen hochzählen** |
| `SHELL` | Pre-Cache-Liste: `./`, `./index.html`, `./manifest.json`, `./icon.png`, `./favicon.png`, `./favicon-16.png` |
| `install` | `skipWaiting()` — neue Version übernimmt sofort |
| `activate` | Alte Caches löschen + `clients.claim()` |
| `fetch` | Router nach URL-Pattern: Supabase REST → Network-First / Supabase Storage → Cache-First / Rest → Stale-While-Revalidate |

**Update-Workflow:** Code-Änderung → optional `CACHE` von `v1` auf `v2` (nur wenn Shell-Datei sich ändert) → push → User reload → neuer SW wartet → next reload aktiviert ihn.

### `manifest.json`
PWA-Manifest. `display:"standalone"` für Fullscreen auf iOS/Windows. Aktuell nur ein Icon (512×512, `purpose:"any maskable"`).

### `icon.png`
512×512 BBQ-Grill-Logo mit "BBQ"-Schriftzug.

### `.claude/launch.json`
Dev-Server für Preview-MCP (Port 4321, Python http.server). **Liegt in `D:\Claude Projekte\.claude\`** (Projekt-Root ist `D:\Claude Projekte\`, nicht das BBQ-Lab-Subverzeichnis).

### `.gitignore`
Ignoriert nur `.claude/`.

---

## Supabase-Backend

### Tabelle `entries`
```sql
CREATE TABLE entries (
  id BIGINT PRIMARY KEY,
  data JSONB,                  -- komplettes Entry-Objekt
  updated_at TIMESTAMPTZ
);
```
RLS: offen oder Anon-INSERT/UPDATE/SELECT-Policies. Kein User-Auth.

### Storage-Bucket `recipe-photos`
- Public Bucket
- Anon-Policies für INSERT + UPDATE (über SQL Editor angelegt)
- Pfad-Schema: `<entryId>.<ext>`

### Credentials
Im Code hardcoded (Zeilen 216–217). Der `sb_publishable_...` Key ist sicher öffentlich.

---

## Quick-Start für eine neue Session

1. **Code lesen:** `Read` auf `index.html` (905 Zeilen, evtl. in zwei Blöcken).
2. **Preview starten:** `mcp__Claude_Preview__preview_start({name:"BBQ-Lab"})` → Port 4321.
3. **Verifikation:** Preferiere `preview_eval` über `_screenshot` (Screenshots timeouten oft).
4. **State-Inspektion:**
   ```js
   (async()=>JSON.stringify({entries:S.entries.length,view:S.view,
     filter:S.filter,typeFilter:S.typeFilter,meatFilter:S.meatFilter,
     ratingFilter:S.ratingFilter}))()
   ```
5. **Mobile testen:** `preview_resize({preset:"mobile"})` → 375×812.
6. **Nach Code-Änderung:** `location.reload()` via eval.
7. **Commit:** Auf Deutsch + Begründung + Co-Authored-By Claude.
8. **Push:** **Automatisch nach jedem Commit** (User-Memory `feedback_bbqlab_autopush.md`).

---

## User-Präferenzen

- **Sprache:** Immer auf Deutsch antworten (Memory: `feedback_language.md`)
- **Auto-Push im BBQ-Lab:** Nach jedem `git commit` sofort `git push` — ohne zu fragen (Memory: `feedback_bbqlab_autopush.md`)
- **Workflow:** User testet im Browser-Preview, gibt direktes visuelles Feedback ("verrückt sich nach rechts", "der Stern ist zu klein"). Auf gezielte Eval-Tests + Fix reagieren, nicht theoretische Analyse.
- **Mobile-Anwendung:** User hat die PWA via Safari → "Zum Home-Bildschirm" installiert. Bei größeren UI-Änderungen ggf. App neu installieren empfehlen.
- **Antworten kurz halten.** User mag knappe, ergebnis-orientierte Antworten.

# CLAUDE.md — BBQ Lab

> Dieses Dokument ist der **vollständige Kontext** für eine neue Chat-Session. Es enthält alles Wichtige über Architektur, aktuellen Stand und Konventionen des Projekts.

---

## Projektübersicht

### Zweck und Ziel
**BBQ Lab** ist eine deutschsprachige Progressive Web App (PWA) für BBQ-Enthusiasten, die ihre selbst entwickelten **Gewürzmischungen, Rubs, Marinaden und Saucen dokumentieren und iterieren** möchten. Jedes Rezept ist ein "Test" mit Zutaten, Versionsnummer, Bewertung (0–5 Sterne), Status und Geschmacks-Notizen. Die App dient als persönliches Tasting-Log, um Mischungen über mehrere Iterationen hinweg zu verbessern.

**Hauptanwendungsfälle:**
- Neue Gewürzmischung erfassen mit Zutatenliste (Brüche wie ¼, ½, ¾, 1½ als Schnellbuttons)
- Versionen einer Mischung verfolgen (z.B. "Smoky Paprika Rub V.1, V.2, V.3")
- Status tracken: "in Arbeit", "fertig", "verworfen"
- Notizen zum Geschmack festhalten
- Daten synchronisieren zwischen mehreren Geräten (Handy + Desktop)

### Tech Stack
| Technologie | Version | Verwendung |
|---|---|---|
| **HTML/CSS/Vanilla JavaScript** | ES2020+ | Komplette App in einer einzigen `index.html`, kein Framework, kein Build-System |
| **Supabase JS SDK** | v2 (via CDN) | Cloud-Sync der Rezepte (REST-API zu PostgreSQL) |
| **localStorage** | nativ | Lokale Persistenz, Offline-Fallback |
| **Google Fonts** | – | `Bebas Neue` (Headlines), `DM Sans` (Body) |
| **PWA Manifest** | W3C Standard | Installierbar auf iOS/Android Home-Screen |
| **Python http.server** | 3.x | Lokaler Dev-Server (siehe `.claude/launch.json`) |

**Keine Dependencies, kein npm, kein Bundler.** Die App lädt Supabase via `<script src="...cdn">` und startet sofort.

### Projektstruktur
```
D:\Claude Projekte\BBQ-Lab\
├── index.html         # KOMPLETTE App: HTML, CSS (inline <style>), JS (inline <script>) – ~720 Zeilen
├── manifest.json      # PWA Manifest (name, icons, theme_color)
├── icon.png           # 512×512 App-Icon (BBQ-Logo)
├── favicon.png        # 32×32 Browser-Tab-Icon
├── favicon-16.png     # 16×16 Browser-Tab-Icon
├── .gitignore         # Ignoriert .claude/
├── .git/              # Git-Repo, gepusht zu github.com/RonaldK-Dev/BBQ-Lab
└── .claude/launch.json # Dev-Server Konfig (Python http.server auf Port 4321)
```

Es gibt **keine Build-Artefakte, kein dist/, kein node_modules**. Was du im Repo siehst, ist was im Browser läuft.

---

## Architektur & Key Decisions

### Architekturmuster
**Single-File-App mit globalem State + Imperative DOM-Rendering.** Es gibt kein Framework, keine Komponenten, kein Virtual DOM. Stattdessen:

- Ein **globales `S`-Objekt** hält den gesamten App-State (siehe unten).
- Eine **`set(p)`-Funktion** mergt Updates in `S` und triggert `render()`.
- **`render()`** löscht `#root.innerHTML` komplett und baut den DOM neu auf (`renderList()`, `renderForm()` oder `renderDetail()`).
- Auf Desktop wird zusätzlich ein **Modal-Overlay** über die Liste gerendert, wenn `view==="form"` oder `view==="detail"`.

```
┌─────────────────────────────────────────────────┐
│ Browser-Click → Event-Handler → set({...}) →    │
│ render() löscht #root → renderXxx() baut neu auf│
└─────────────────────────────────────────────────┘
```

### Zentrale Datenstrukturen

**State `S`** (init in Zeile 247):
```js
{
  view: "list" | "form" | "detail",     // welche View ist aktiv
  entries: Entry[],                      // alle Rezepte (auch im localStorage)
  current: Entry | null,                 // aktuell bearbeitetes Rezept (im Form)
  detailId: number | null,               // ID des Rezepts im Detail-View
  menuOpen: boolean,                     // Mobile-Header ⋯ Dropdown offen?
  importOpen: boolean,                   // Import-Dialog offen?
  importText: string,                    // Inhalt des Import-Textareas
  focusedIng: number,                    // Index der fokussierten Zutaten-Zeile (für Bruch-Buttons)
  sidebarOpen: boolean,                  // Desktop-Sidebar ausgeklappt? (default true)
  sidebarMenuOpen: boolean,              // Desktop-Sidebar ≡ Dropdown offen?
  filter: null | "fertig" | "in Arbeit" | "verworfen",  // aktiver Status-Filter
  search: string                         // aktueller Suchtext
}
```

**Entry-Schema** (in `S.entries[]` und Supabase):
```js
{
  id: number,           // Date.now() bei Erstellung
  name: string,         // z.B. "Smoky Paprika Rub"
  version: string,      // z.B. "1" oder "2"
  date: string,         // ISO-Datum YYYY-MM-DD
  rating: 0..5,         // Sterne-Bewertung
  anwendung: string,    // z.B. "Hähnchenschenkel"
  notizen: string,      // Geschmacks-Notizen
  status: "in Arbeit" | "fertig" | "verworfen",
  ingredients: Ingredient[]
}
```

**Ingredient-Schema:**
```js
{ qty: string, unit: string, name: string }
// qty kann ein Bruch sein: "¼", "½", "¾", "1", "1½", "2", "3", "4" oder eigene Zahl
// unit: "TL" | "EL" | "Cup" | "g" | "ml" | "Prise" | "–"
```

### Wichtige Designentscheidungen

#### 1. **Single-File-App ohne Build-System**
**Begründung:** Maximale Einfachheit für ein persönliches Tool, keine Build-Pipeline, keine npm-Deps. Hochladen einer Datei ⇒ Deploy fertig. Edits sind sofort live ohne Recompile.

#### 2. **Imperative DOM-Manipulation statt Framework**
**Begründung:** Die App ist klein (~700 Zeilen), ein Framework wäre Overkill. Helper-Funktionen `div()`, `btn()`, `inp()` (Zeilen 235–245) abstrahieren die Erstellung gut genug.
**Konsequenz:** `render()` rebuildet **alles** bei jedem `set()`-Aufruf. Text-Inputs aktualisieren `S` direkt ohne `set()`, um Re-Render und damit Focus-Verlust zu vermeiden.

#### 3. **Mobile-first, Desktop via einer einzigen `@media(min-width:768px)`-Query**
**Begründung:** Die App war ursprünglich nur für Mobile. Desktop wurde nachträglich darübergelegt mit einer Media-Query und etwas zusätzlicher Render-Logik. Auf Mobile bleibt alles unverändert.
- Mobile-Layout: 480px max-width zentriert, Cards in Spalte, Sticky-Header, FAB
- Desktop-Layout: Sidebar (240px) + Card-Grid (auto-fill, minmax(220px, 1fr)), Modals statt Vollbild-Views

#### 4. **State-Sync: localStorage primär + Supabase als Cloud-Backup**
**Begründung:** Offline-First. Alle Writes gehen sofort in localStorage; Supabase wird via `save()` async hochgeladen. Beim App-Start versucht `loadFromSupabase()` zuerst zu laden, fällt auf localStorage zurück.
- **Pull-Triggers:** App-Start, Pull-to-Refresh (Mobile), alle 10s im Hintergrund (setInterval)
- **Push-Triggers:** `save()` nach jedem Speichern in `doSave()`
- **Supabase-Schema:** Tabelle `entries`, Spalten: `id` (PK), `data` (JSONB = das ganze Entry-Objekt), `updated_at`

#### 5. **`set()`-Funktion als einziger State-Update-Punkt**
```js
function set(p) { S = Object.assign({}, S, p); render(); }
```
**Begründung:** Eine Zeile. Vorhersehbar. Alle Mutations triggern Re-Render. Vorher war das eine 53-Zeilen-Funktion mit Memory-Leak (siehe Git-History).

#### 6. **CSS-Variable `--st-color` für Status-Karten-Stripe**
```js
card.style.setProperty("--st-color", SC[e.status]);
// CSS: .entry-card::before { background: var(--st-color, fallback) }
```
Karten zeigen einen 4px breiten Status-Farbstrich links (grün/amber/rot/orange-Fallback). Status-Farben kommen aus dem `SC`-Objekt (Zeile 194).

#### 7. **iOS Auto-Zoom-Prevention**
**Alle Inputs/Selects/Textareas auf Mobile haben `font-size: 16px`.** Kleinere Werte (z.B. 13px für `.search-input` auf Desktop) sind nur via `@media(min-width:768px)` aktiv. Sonst zoomt iOS Safari automatisch und kehrt nicht zurück.

#### 8. **Scrollbar-Gutter Stable**
`.main-content` hat `scrollbar-gutter:stable`, damit das Auftauchen/Verschwinden der Scrollbar (bei Filter-/Such-Wechseln) **keinen Layout-Shift** im Header verursacht.

#### 9. **Badge mit fester Breite im Desktop-Header**
`.desktop-list-header .badge { min-width: 90px; text-align: center }` — verhindert dass die Suchleiste nach rechts shiftet, wenn der Badge-Text sich von "X Rezepte" (81px) auf "0 / 2" (52px) ändert.

#### 10. **Dropdown-Menüs: zwei verschiedene Patterns**
- **Mobile (⋯)**: globaler `document.addEventListener("click", ...)` schließt das Menü bei Klick außerhalb von `.menu-wrap` (Zeile 703–708)
- **Desktop-Sidebar (≡)**: `mouseleave` auf `dd` (Zeile 274) — funktioniert nur mit Maus, ok da Sidebar nur auf Desktop

### API-Design / Datenbankschema

**Supabase Tabelle `entries`:**
```sql
CREATE TABLE entries (
  id BIGINT PRIMARY KEY,           -- Date.now()
  data JSONB,                      -- komplettes Entry-Objekt
  updated_at TIMESTAMPTZ           -- für Sort/Sync
);
```
Zugriff via Supabase JS SDK mit dem **publishable** Key (siehe Zeilen 190–191, sind öffentlich, kein Geheimnis). Row Level Security ist offen oder dem User überlassen — die App nutzt einen geteilten Datenbestand ohne User-Auth.

---

## Aktueller Stand

### Was funktioniert (Stand: Mai 2026)
- ✅ **CRUD auf Rezepte**: Anlegen, Bearbeiten, Löschen, Detail-Ansicht
- ✅ **Bruch-Schnellbuttons** für Mengen (¼, ½, ¾, 1, 1½, 2, 3, 4)
- ✅ **Sterne-Bewertung** 0–5
- ✅ **Status-System** mit drei Zuständen + Farbcodierung
- ✅ **Cloud-Sync** via Supabase (Push bei Save, Pull alle 10s + bei PTR + bei Start)
- ✅ **Offline-First** über localStorage
- ✅ **Pull-to-Refresh** (Mobile)
- ✅ **Export/Import** über JSON-Text (Clipboard/Textarea)
- ✅ **PWA-installierbar** (manifest.json befüllt)
- ✅ **Desktop-Layout** mit einklappbarer Sidebar + Card-Grid + Modals
- ✅ **Status-Filter** durch klickbare Stats in der Sidebar
- ✅ **Live-Suche** in Name/Anwendung/Notizen/Zutaten (Desktop + Mobile)
- ✅ **X-Clear-Button** in der Suche
- ✅ **Status-farbiger Karten-Strich** (grün/amber/rot)
- ✅ **Smooth Animations** (Modal-Fade, Dropdown-Slide, Card-Hover-Lift)
- ✅ **iOS Auto-Zoom-Fix** (16px Mindest-Font-Size)
- ✅ **Header-Stabilität** bei Filter-/Such-Änderungen (Badge-Width fix)
- ✅ **Mobile-Menü** schließt bei Tippen außerhalb

### Was ist in Arbeit
Aktuell **keine offenen Tasks**. Letzter Commit: `25014b3 — 3 Fixes: Header-Shift, iOS-Auto-Zoom, Mobile-Menu Outside-Close`.

### Bekannte Bugs / offene Probleme
- **Kein Service Worker** → keine echte Offline-Fähigkeit, der erste Page-Load braucht immer Internet
- **Keine User-Authentication** → alle Nutzer der Supabase-DB sehen dieselben Rezepte (privates Tool, ok für jetzt)
- **Datum-Input auf iOS** kann je nach Browser unterschiedlich aussehen (native Picker)
- **Keine Validierung** bei Import-JSON außer "ist es ein Array?" → defektes JSON führt zu Alert, aber Inhalt wird nicht geprüft
- **Manifest hat nur 1 Icon-Größe (512×512)** → Lighthouse mosert evtl., funktioniert aber

---

## Nächste Schritte

### Priorisierte TODO-Liste

| Prio | Feature | Aufwand | Begründung |
|---|---|---|---|
| 🥇 #1 | **📸 Foto pro Rezept** | Mittel-Groß | Größter visueller Sprung. Speicherung via Supabase Storage. Macht aus einer Liste eine richtig schöne Food-App. |
| 🥈 #2 | **🏷️ Tags / Kategorien** | Mittel | Typ-Tags (Rub/Sauce/Marinade) + Fleisch-Tags (Hähnchen/Rind/...). Klickbare Pills auf Karten, Multi-Tag-Filter. |
| 🥉 #3 | **🌡️ Cook-Parameter strukturiert** | Klein-Mittel | Dedizierte Felder für Temperatur, Garzeit, Holzart, Methode statt alles in "Notizen". |
| 4 | **🔌 Service Worker** | Klein | Echter Offline-Cache + bessere Update-Kontrolle. Datei `sw.js` + `navigator.serviceWorker.register()` ergänzen. |
| 5 | **📊 Versions-Vergleich** | Mittel | Karten gleichen Namens gruppieren, Side-by-Side-Diff. |
| 6 | **📋 "Als V.2 duplizieren"** | Trivial | Im Detail-View ein Button, der `openNew()` mit Daten der aktuellen Version + version+1 aufruft. |
| 7 | **⌨️ Keyboard-Shortcuts** | Klein | N=Neu, /=Suche, Esc=Modal-Close, ←/→=Nav im Detail. |
| 8 | **📄 PDF/Bild-Export** | Mittel | Eine Karte als druckbares PDF oder Bild zum Teilen via WhatsApp. |
| 9 | **Sticky Mobile-Suchleiste** | Trivial | `position:sticky;top:[header-height]` auf `.mobile-search-wrap`. |
| 10 | **Sync-Status-Indikator** | Trivial | Kleines Icon: läuft/fertig/Fehler. |

### Was als nächstes implementiert werden soll
**Empfehlung: Mit `#1 (Foto pro Rezept)` starten**, weil es den visuellen Eindruck am stärksten verändert. Implementierungs-Skizze:
1. Im Form-View: File-Input + Drag-and-Drop-Zone
2. Bei Save: Datei in Supabase Storage hochladen, URL ins Entry-Objekt schreiben (`entry.photoUrl`)
3. Im Detail- und Card-View: Bild rendern (Card: Thumbnail oben oder Hintergrund mit Overlay)

---

## Wichtige Konventionen

### Coding-Style
- **Indentation:** 2 Spaces
- **JS-Style:** Minimal-Whitespace, viele Operationen in einer Zeile. Beispiel: `const cn=div("card-name");cn.textContent=e.name;`
  → Begründung: Die ganze App ist eine "code golf"-artige Single-File-App, Lesbarkeit wird durch klare Funktions-Grenzen erreicht, nicht durch luftiges Layout.
- **CSS:** Alles inline im `<style>`-Tag, minified (eine Regel pro Zeile)
- **Strings:** Doppelte Anführungszeichen für Strings, einfache nur in HTML-Attributen
- **Funktionen:** `function`-Deklarationen (kein `const xyz = () => {}`) für Top-Level. Inline-Handler dürfen Arrow-Funcs sein.
- **Naming:**
  - State-Felder: camelCase (`sidebarOpen`, `importText`)
  - CSS-Klassen: kebab-case (`sidebar-dropdown-item`, `entry-card`)
  - JS-Variablen: kurz im Render-Code (`sb`, `mWrap`, `dlh`), beschreibend in Logik (`filtered`, `avgRating`)
  - Sprache: **Deutsch** für alle User-facing Strings; Code-Identifier auf Englisch (oder Denglisch wie `notizen`, `anwendung`)

### Neue Features hinzufügen
1. **State-Erweiterung:** Neue Felder im `S`-Initializer (Zeile 247) hinzufügen mit sinnvollem Default.
2. **CSS:** Neue Styles im `<style>`-Tag platzieren:
   - Mobile-/Base-Styles **vor** dem `@media`-Block
   - Desktop-Styles **innerhalb** des `@media(min-width:768px)`-Blocks
   - **iOS-Regel:** Inputs auf Mobile **immer ≥16px font-size**
3. **JS:** Neue Render-Logik in `renderList()`, `renderForm()`, oder `renderDetail()`. Bei größeren Sachen: eigene Funktion.
4. **State-Updates** **immer** über `set({...})`, niemals direkt `S.foo = bar` (außer bei Text-Inputs, die kein Re-Render auslösen sollen).
5. **Verifikation:** Browser-Preview auf Port 4321 öffnen, mit `preview_eval` per JS testen (Screenshots timeouten häufig).
6. **Commit:** Aussagekräftige Commit-Message mit "Co-Authored-By: Claude Sonnet 4.7 <noreply@anthropic.com>".

### Testing-Strategie
**Es gibt keine automatisierten Tests.** Verifikation erfolgt durch:
1. **Browser-Preview** auf `http://localhost:4321` (Python http.server via `.claude/launch.json`)
2. **Manuelle Tests in beiden Viewports**: Mobile (375×812) und Desktop (1280×800)
3. **Eval-basierte Smoke-Tests** via Claude Preview MCP-Tool, z.B.:
   ```js
   (async()=>{ set({filter:'fertig'}); await new Promise(r=>setTimeout(r,200));
     return document.querySelectorAll('.entry-card').length; })()
   ```
4. **Mobile-Realtest** auf iPhone via Safari → "Zum Home-Bildschirm hinzufügen" (PWA-Install)
5. **Bei jedem Bug:** zuerst Eval-Test schreiben, der das Problem reproduziert; dann fixen.

**Wichtiger Hinweis:** Screenshots via `preview_screenshot` timeouten manchmal nach 30s. Dann auf Eval-basierte Verifikation umsteigen.

---

## Kritische Dateien

### `index.html` (719 Zeilen) — die ganze App
Eine einzige Datei mit drei klar getrennten Abschnitten:

- **Zeilen 1–17:** `<head>` mit Meta-Tags (Viewport, PWA, theme-color), Google-Fonts-Import, Icon-Links, Manifest-Reference
- **Zeilen 18–183:** `<style>` Block
  - Zeilen 19–107: Base CSS (Mobile + alle gemeinsamen Styles)
  - Zeilen 108–117: Mobile-spezifische CSS (Sidebar default hidden, Search-Wrap, Mobile-Search-Wrap)
  - Zeilen 118–182: `@media(min-width:768px)` Desktop-Overrides (Sidebar visible, Modal-Styles, Hover-States, Animations)
- **Zeilen 184–717:** `<script>` mit gesamter JS-Logik
  - Zeilen 189–195: Konstanten (Supabase-Creds, UNITS, FRACS, SC=Status-Colors, SI=Status-Icons)
  - Zeilen 197–245: Helper-Funktionen (load/save/sync, div/btn/inp, stars, matchesSearch)
  - Zeile 247: `S`-State-Init
  - Zeile 248: `set(p)` — der zentrale State-Updater
  - Zeilen 250–415: `renderList()` — Sidebar + Card-Grid + Mobile-Header + Search
  - Zeilen 417–535: `renderForm()` — Create/Edit-Form mit Bruch-Buttons
  - Zeilen 537–586: `renderDetail()` — Readonly-Detail-View
  - Zeilen 588–613: Action-Funktionen (openNew, openEdit, doSave, doExport, doImport)
  - Zeilen 615–655: `render()` — Dispatcher mit Desktop-Modal-Logik + Search-Focus-Preservation
  - Zeilen 656–692: `initPTR()` — Pull-to-Refresh Touch-Handler
  - Zeilen 694–716: Top-Level Init-IIFE — initial load, register PTR, global click-handler für Mobile-Menü, setInterval-Polling

### `manifest.json`
PWA-Manifest. Wichtig: `display:"standalone"` macht die App fullscreen auf iOS-Home-Screen. Nur **ein Icon (512×512)** ist eingetragen — könnte um 192×192 ergänzt werden für besseren Android-Support.

### `icon.png`
512×512 PWA-Install-Icon, BBQ-Grill-Logo mit "BBQ" Schriftzug. `purpose: "any maskable"` im Manifest.

### `.claude/launch.json`
Dev-Server-Konfiguration für die `mcp__Claude_Preview__*` Tools:
```json
{ "name": "BBQ-Lab", "runtimeExecutable": "python",
  "runtimeArgs": ["-m", "http.server", "4321", "--directory", "BBQ-Lab"],
  "port": 4321 }
```
**Wichtig:** Liegt in `D:\Claude Projekte\.claude\` (Projekt-Root ist `D:\Claude Projekte\`, nicht der BBQ-Lab-Subordner).

### `.gitignore`
Ignoriert nur `.claude/`. Keine `node_modules` etc., da keine Build-Pipeline.

---

## Quick-Start für eine neue Session

1. **Code lesen:** Mit `Read` die `index.html` vollständig laden (ist nur ~720 Zeilen).
2. **Preview starten:** `mcp__Claude_Preview__preview_start({name:"BBQ-Lab"})` → läuft auf Port 4321.
3. **Verifikation:** Preferiere `mcp__Claude_Preview__preview_eval` über `_screenshot` (Screenshots timeouten oft).
4. **State-Inspektion:** `(async()=>JSON.stringify({entries:S.entries.length, view:S.view, ...}))()` in eval.
5. **Mobile testen:** Viewport mit `preview_resize({preset:"mobile"})` auf 375×812.
6. **Bei Code-Änderung:** `location.reload()` via eval, dann erneut testen.
7. **Commit:** Auf Deutsch, mit Begründung + Co-Authored-By Claude.
8. **Push:** Nur wenn User explizit OK gibt — er hat in der Vergangenheit Pushes abgebrochen, um noch zu testen.

---

## User-Präferenzen

- **Sprache:** Antworte immer auf Deutsch (siehe `~/.claude/projects/D--Claude-Projekte/memory/feedback_language.md`)
- **Workflow:** User testet gerne im Browser-Preview, gibt direktes Feedback ("verrückt sich nach rechts", "das Bild wird größer"). Reagiere mit gezielten Eval-Tests + Fix, nicht mit theoretischer Analyse.
- **Pushes:** **Nicht ungefragt pushen.** User möchte vor jedem Push selbst entscheiden.
- **Mobile-Anwendung:** User hat die PWA via Safari → "Zum Home-Bildschirm" installiert. Cache-Invalidierung passiert nicht automatisch — bei sichtbaren Änderungen explizit "App vom Home-Screen löschen und neu installieren" empfehlen.

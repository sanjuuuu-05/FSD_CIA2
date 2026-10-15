# OSM Route Explorer

A front-end prototype for exploring a **driving route** between two places on an interactive OpenStreetMap map. Built with semantic HTML5, Tailwind CSS (CDN), vanilla JavaScript and Leaflet. No build step.

## What it does and the problem it addresses

The project's **initial hypothesis** (not validated by user evidence) is that users may struggle to understand the overall route layout, identify the start and destination, and see the route clearly on a map.

The prototype responds with functionality, not just styling:
- **Overall layout:** after a lookup the map auto-fits to the entire route; a **Fit route** button restores that view after panning/zooming.
- **Endpoints:** distinct green **A** (start) and red **B** (destination) markers, matched by A/B badges in the route summary.
- **Clear route:** a thick, high-contrast route line, plus a summary with resolved place names, distance and estimated driving time.

## Limited map area

The map is not the whole world: panning, zoom-out and tile requests are restricted to the **Bengaluru–Coimbatore region** (about 10.6–13.5°N, 76.4–78.0°E), and Nominatim searches use `viewbox` + `bounded=1`, with results re-checked against the area. To change the region, edit the single `AREA` constant at the top of `app.js`. This restriction was added after the Evidence checks below were run and has not itself been tested (`node --check` should be re-run).

## Existing-interface analysis

**Scope:** location selection, route display, map navigation and route information on https://www.openstreetmap.org/.

**Inspection status: NOT performed.** The build environment had no browser and no external network access, so the live site was not visited. The two points below are **informed hypotheses requiring validation**, not observed findings.

1. **Hypothesis – endpoints can be hard to tell apart / read at a glance.** Route views on general-purpose maps may show start and end with similar or small markers among many map features. *Informed the prototype:* large, lettered, colour-distinct A/B markers and matching summary badges.
2. **Hypothesis – the full route may not be visible after a lookup or after the user pans away.** *Informed the prototype:* automatic fit-to-route and a persistent Fit route control.

**Recommended validation:** a small task-based usability inspection (e.g. 5 students) on openstreetmap.org: plan an unfamiliar route, then ask them to point out start, end and total distance, and to recover the full-route view after panning. Record time, errors and comments, then compare with this prototype.

## Prerequisites and running locally

- A modern browser and internet access (Leaflet, Tailwind CDN, map tiles, Nominatim and OSRM are all loaded online).
- Serving over HTTP is recommended (some browsers restrict requests from `file://` pages). From this folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Or `npx serve`.)

## Map view

The map is **route-only by default**: no OSM street tiles are drawn, just a dark grid background, the route and the A/B markers. **Show basemap** optionally adds the OpenStreetMap tile layer. **Load sample route (offline)** draws `sample-route.geojson` (a recorded route supplied by the project owner); it is labelled as sample data and has no distance/time.

## Using the app

1. Enter **Start location** and **Destination** (adding city/country helps with ambiguous names).
2. Press **Show route**. Progress is announced as it runs.
3. **Swap** exchanges the two fields (and re-calculates if a route is shown).
4. Read the **Route summary**: resolved start/destination, distance, estimated driving time (no live traffic).
5. Navigate with the map's +/- buttons, mouse/touch drag and zoom, or keyboard (arrows, +/-). **Fit route** refits the view. Click a marker for its full place name.

## Data sources and caveats

| Service | Used for | Data sent |
|---|---|---|
| [Nominatim](https://nominatim.org/) search | Geocoding the two place names (JSON, up to 3 results, first valid one used) | The typed place text |
| [OSRM demo server](https://project-osrm.org/) | Driving route, GeoJSON geometry | The two resolved coordinates |
| OpenStreetMap tile server | Map tiles | Standard tile requests |

Attribution: © OpenStreetMap contributors (ODbL), shown on the map and in the page footer. Leaflet (BSD-2-Clause) is loaded from unpkg; Tailwind CSS from its CDN.

Policy handling in the browser: geocoding is sequential, with at least 1 s between uncached Nominatim requests, and successful results are cached in memory for the page session. Browsers send their own `User-Agent`/`Referer`, so the app cannot set a custom identifying header.

**These are public demo/educational services, not production infrastructure; no SLA is implied.** A production deployment should use a backend/proxy that identifies the application, adds caching and rate limiting, and use a geocoding/routing provider with suitable terms and reliability. The Tailwind CDN is a prototype convenience, not an optimised build.

## JavaScript events

| Event | Target | Behaviour |
|---|---|---|
| `submit` | form | Prevents default, validates, runs geocode → route → draw |
| `input` | both text fields | Clears that field's stale error and stale error banner while editing |
| `click` | Swap button | Swaps field values; re-runs lookup if a route is displayed |
| `click` | Try again | Re-runs the lookup after an error |
| `click` | Fit route | Refits the map to the route and endpoints |
| `click` | Show/Hide basemap | Toggles optional OSM tiles |
| `click` | Load sample route | Validates and draws the bundled GeoJSON |
| `resize` | window | Calls Leaflet `invalidateSize` so the map stays correct |

## States and error handling

- **Empty:** explanatory panel before any route.
- **Validation:** inline messages for blank fields and identical start/destination (focus moves to the first problem).
- **Loading:** spinner, disabled submit/swap, staged messages; duplicate submissions are ignored while busy.
- **Success:** summary, markers, route, confirmation message.
- **Errors (specific messages):** network failure, timeout (12 s), rate limiting (HTTP 429), other non-OK HTTP status, unreadable/malformed JSON, no geocoding match, unexpected geocoder data, no route (`NoRoute`), other routing failure, incomplete/invalid geometry. Recoverable errors show **Try again**. No route, coordinates, distance or duration is ever invented.
- Status changes are announced via an `aria-live="polite"` region.

## AI usage declaration

AI assistance (Claude, by Anthropic) was used to generate the implementation and this documentation. No human code review or user testing is claimed.

## Evidence (checks actually performed)

- `node --check app.js` → passed (JavaScript syntax valid).
- Served the folder with `python3 -m http.server`; `index.html`, `app.js`, `styles.css` each returned HTTP 200.
- Initial build: 6 `addEventListener` calls in `app.js`. The route-only/sample update was edited in afterwards; re-check after that edit: `node --check app.js` passed, 8 listeners present, `sample-route.geojson` parses as a 7,265-point LineString. Not tested in a browser.
- Probe of Nominatim from the build environment → failed (no external network). **Live geocoding, routing, tile loading, CDN loading and browser rendering were NOT tested.** The inspection of openstreetmap.org was also not performed.

### Manual verification checklist
- [ ] Page loads with no console errors; attribution visible on the map.
- [ ] Blank fields and identical values show inline errors.
- [ ] A valid pair (e.g. two places in one city) shows route, A/B markers and summary; map fits the route.
- [ ] Swap works with and without an existing route.
- [ ] Fit route restores the view after panning.
- [ ] Go offline → submit → network error and Try again appear; recovery works online.
- [ ] Narrow the window to ~360 px → no horizontal scroll; form, summary and map usable.
- [ ] Tab through all controls: focus rings visible; screen reader announces status changes.
- [ ] Enable "reduce motion" in the OS → animations minimal.

## Limitations

- Depends on public demo APIs that may be slow, rate-limited or unavailable; no production backend.
- **Driving only**; no walking, cycling or transit; no live traffic; single route, no alternatives.
- Geocoding uses the first valid result with no disambiguation picker or autocomplete.
- Nominatim/OSRM usage policy compliance is limited by being browser-only (no custom User-Agent).
- Responsiveness, accessibility and contrast were designed for but not tested with tools.
- Requires internet; CDN-delivered Tailwind is not production-optimised.

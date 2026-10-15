/* OSM Route Explorer — vanilla JS. Geocode (Nominatim) -> route (OSRM) -> draw (Leaflet). */
(() => {
  'use strict';

  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const OSRM = 'https://router.project-osrm.org/route/v1/driving';
  const TIMEOUT_MS = 12000;
  const MIN_GAP_MS = 1000; // Nominatim policy: max 1 request/second

  const $ = (id) => document.getElementById(id);
  const el = {
    form: $('route-form'), start: $('start'), dest: $('destination'),
    startErr: $('start-error'), destErr: $('destination-error'),
    swap: $('swap'), submit: $('submit'), label: $('submit-label'), spinner: $('submit-spinner'),
    status: $('status'), statusText: $('status-text'), retry: $('retry'),
    empty: $('empty-state'), summary: $('summary'),
    sumStart: $('sum-start'), sumEnd: $('sum-end'), sumDist: $('sum-distance'), sumDur: $('sum-duration'),
    refit: $('refit'), basemap: $('basemap'), sample: $('sample'),
  };

  // ---- Supported area: change this one constant to cover a different region ----
  // [south, west, north, east] — Bengaluru to Coimbatore corridor.
  const AREA = { name: 'Bengaluru–Coimbatore region', south: 10.6, west: 76.4, north: 13.5, east: 78.0 };
  const AREA_BOUNDS = L.latLngBounds([AREA.south, AREA.west], [AREA.north, AREA.east]);

  // ---- Map setup: panning is limited to the supported area ----
  const map = L.map('map', {
    zoomControl: true,
    maxBounds: AREA_BOUNDS.pad(0.1),
    maxBoundsViscosity: 1.0,
    minZoom: 8,
  });
  map.fitBounds(AREA_BOUNDS);
  // Route-only by default: tiles are optional (toggle). Attribution is always visible.
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, bounds: AREA_BOUNDS.pad(0.1) }); // no tile requests outside the area
  tiles.addTo(map); // basemap on by default; the toggle button can hide it
  map.attributionControl.addAttribution('Place &amp; route data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors');
  L.control.scale({ imperial: false }).addTo(map);

  let routeLayer = null;
  let markers = [];
  let currentBounds = null;

  const pinIcon = (cls, letter) => L.divIcon({
    className: '',
    html: `<div class="marker-pin ${cls}"><span>${letter}</span></div>`,
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
  });

  // ---- Errors ----
  class AppError extends Error {
    constructor(message, recoverable = true) { super(message); this.recoverable = recoverable; }
  }

  // ---- Networking helpers ----
  async function fetchJson(url, serviceName) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    } catch (err) {
      if (err.name === 'AbortError') throw new AppError(`${serviceName} took too long to respond (over ${TIMEOUT_MS / 1000}s). Please try again.`);
      throw new AppError(`Couldn't reach ${serviceName}. Check your internet connection and try again.`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) throw new AppError(`${serviceName} is rate-limiting requests. Wait a moment and try again.`);
    if (!res.ok) throw new AppError(`${serviceName} returned an error (HTTP ${res.status}). Try again later.`);
    try {
      return await res.json();
    } catch {
      throw new AppError(`${serviceName} sent a response that could not be read. Try again later.`);
    }
  }

  // ---- Geocoding: sequential, cached, >=1s between uncached requests ----
  const geoCache = new Map();
  let lastGeoRequest = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function geocode(query) {
    const key = query.trim().toLowerCase().replace(/\s+/g, ' ');
    if (geoCache.has(key)) return geoCache.get(key);

    const wait = lastGeoRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastGeoRequest = Date.now();

    // viewbox + bounded=1 restricts results to the supported area (viewbox is left,top,right,bottom)
    const viewbox = `${AREA.west},${AREA.north},${AREA.east},${AREA.south}`;
    const url = `${NOMINATIM}?format=jsonv2&limit=3&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(query.trim())}`;
    const data = await fetchJson(url, 'The location search service (Nominatim)');
    if (!Array.isArray(data)) throw new AppError('The location search service returned unexpected data. Try again later.');

    const hit = data.find((d) => d && AREA_BOUNDS.contains([parseFloat(d.lat), parseFloat(d.lon)]));
    if (!hit) throw new AppError(`No matching location found for "${query.trim()}" in the ${AREA.name}. Try a more specific name or check the spelling.`, true);

    const result = { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), name: String(hit.display_name || query.trim()) };
    geoCache.set(key, result);
    return result;
  }

  // ---- Routing ----
  async function fetchRoute(a, b) {
    const coords = `${a.lon},${a.lat};${b.lon},${b.lat}`;
    const url = `${OSRM}/${coords}?overview=full&geometries=geojson`;
    const data = await fetchJson(url, 'The routing service (OSRM)');

    if (!data || data.code !== 'Ok') {
      if (data && data.code === 'NoRoute') throw new AppError('No driving route could be found between these places (for example, they may be separated by water).');
      throw new AppError('The routing service could not calculate a route for these places.');
    }
    const r = Array.isArray(data.routes) ? data.routes[0] : null;
    const line = r && r.geometry;
    const valid = line && line.type === 'LineString' && Array.isArray(line.coordinates) && line.coordinates.length >= 2 &&
      line.coordinates.every((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
    if (!valid) throw new AppError('The routing service returned incomplete route geometry. Try again later.');

    return {
      latlngs: line.coordinates.map(([lon, lat]) => [lat, lon]),
      distance: Number.isFinite(r.distance) ? r.distance : null,
      duration: Number.isFinite(r.duration) ? r.duration : null,
    };
  }

  // ---- Formatting ----
  const fmtDistance = (m) => (m == null ? 'Not provided' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
  function fmtDuration(s) {
    if (s == null) return 'Not provided';
    const mins = Math.max(1, Math.round(s / 60));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? `${h} h ${m} min` : `${m} min`;
  }

  // ---- UI state ----
  function setStatus(state, text, { retry = false } = {}) {
    el.status.hidden = false;
    el.status.dataset.state = state;
    el.statusText.textContent = text;
    el.retry.hidden = !retry;
  }
  function clearStatus() { el.status.hidden = true; el.statusText.textContent = ''; el.retry.hidden = true; }

  function setLoading(on) {
    el.submit.disabled = on;
    el.swap.disabled = on;
    el.spinner.hidden = !on;
    el.label.textContent = on ? 'Finding route…' : 'Show route';
    el.form.setAttribute('aria-busy', String(on));
  }

  function setFieldError(input, errEl, msg) {
    errEl.hidden = !msg;
    errEl.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function validate() {
    const s = el.start.value.trim(), d = el.dest.value.trim();
    let ok = true;
    setFieldError(el.start, el.startErr, '');
    setFieldError(el.dest, el.destErr, '');
    if (!s) { setFieldError(el.start, el.startErr, 'Enter a start location, e.g. a landmark, address or town.'); ok = false; }
    if (!d) { setFieldError(el.dest, el.destErr, 'Enter a destination, e.g. a landmark, address or town.'); ok = false; }
    if (s && d && s.toLowerCase().replace(/\s+/g, ' ') === d.toLowerCase().replace(/\s+/g, ' ')) {
      setFieldError(el.dest, el.destErr, 'Start and destination are the same. Enter a different destination.');
      ok = false;
    }
    if (!ok) {
      setStatus('error', 'Please fix the highlighted field(s) and try again.');
      (el.start.getAttribute('aria-invalid') === 'true' ? el.start : el.dest).focus();
    }
    return ok;
  }

  function clearRoute() {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    markers.forEach((m) => map.removeLayer(m));
    markers = [];
    currentBounds = null;
    el.refit.disabled = true;
    el.summary.hidden = true;
    el.empty.hidden = false;
  }

  function showRoute(a, b, route) {
    clearRoute();
    routeLayer = L.polyline(route.latlngs, { color: '#06b6d4', weight: 6, opacity: 0.9, lineJoin: 'round' }).addTo(map);
    const mA = L.marker([a.lat, a.lon], { icon: pinIcon('marker-start', 'A'), title: 'Start' }).addTo(map).bindPopup(`<strong>Start</strong><br>${escapeHtml(a.name)}`);
    const mB = L.marker([b.lat, b.lon], { icon: pinIcon('marker-end', 'B'), title: 'Destination' }).addTo(map).bindPopup(`<strong>Destination</strong><br>${escapeHtml(b.name)}`);
    markers = [mA, mB];

    currentBounds = routeLayer.getBounds().extend([a.lat, a.lon]).extend([b.lat, b.lon]);
    refit();

    el.sumStart.textContent = a.name;
    el.sumEnd.textContent = b.name;
    el.sumDist.textContent = fmtDistance(route.distance);
    el.sumDur.textContent = fmtDuration(route.duration);
    el.empty.hidden = true;
    el.summary.hidden = false;
    el.refit.disabled = false;
  }

  function refit() {
    if (currentBounds) map.fitBounds(currentBounds, { padding: [50, 50], maxZoom: 17 });
  }

  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- Main flow ----
  let busy = false;
  async function lookup() {
    if (busy) return; // guard against duplicate submissions
    if (!validate()) return;
    busy = true;
    setLoading(true);
    clearRoute();
    try {
      setStatus('loading', 'Finding your start location…');
      const a = await geocode(el.start.value);
      setStatus('loading', 'Finding your destination…');
      const b = await geocode(el.dest.value);
      setStatus('loading', 'Calculating driving route…');
      const route = await fetchRoute(a, b);
      showRoute(a, b, route);
      setStatus('success', `Driving route found: ${fmtDistance(route.distance)}, about ${fmtDuration(route.duration)}.`);
    } catch (err) {
      const msg = err instanceof AppError ? err.message : 'Something unexpected went wrong. Please try again.';
      if (!(err instanceof AppError)) console.error(err);
      setStatus('error', msg, { retry: true });
    } finally {
      busy = false;
      setLoading(false);
    }
  }

  // ---- Events ----
  // 1. submit: validate and run the route lookup
  el.form.addEventListener('submit', (e) => { e.preventDefault(); lookup(); });

  // 2. input: clear stale field errors / stale status as the user edits
  [[el.start, el.startErr], [el.dest, el.destErr]].forEach(([input, err]) => {
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') setFieldError(input, err, '');
      if (el.status.dataset.state === 'error') clearStatus();
    });
  });

  // 3. click: swap start and destination (and re-run if a route is already shown)
  el.swap.addEventListener('click', () => {
    [el.start.value, el.dest.value] = [el.dest.value, el.start.value];
    setFieldError(el.start, el.startErr, '');
    setFieldError(el.dest, el.destErr, '');
    if (!el.summary.hidden) lookup();
    else setStatus('idle', 'Start and destination swapped.');
  });

  // 4. click: retry after a recoverable error
  el.retry.addEventListener('click', lookup);

  // 5. click: refit map to the full route
  el.refit.addEventListener('click', () => { refit(); });

  // 7. click: toggle the optional OSM basemap tiles
  el.basemap.addEventListener('click', () => {
    const on = !map.hasLayer(tiles);
    if (on) tiles.addTo(map); else map.removeLayer(tiles);
    el.basemap.setAttribute('aria-pressed', String(on));
    el.basemap.textContent = on ? 'Hide basemap' : 'Show basemap';
  });

  // 8. click: load the bundled sample route (real recorded geometry, labelled as sample data)
  el.sample.addEventListener('click', async () => {
    if (busy) return;
    try {
      const gj = await fetchJson('sample-route.geojson', 'The sample route file');
      const g = gj && (gj.type === 'Feature' ? gj.geometry : gj);
      const ok = g && g.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2 &&
        g.coordinates.every((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
      if (!ok) throw new AppError('The sample route file is not a valid LineString.');
      const latlngs = g.coordinates.map(([lon, lat]) => [lat, lon]);
      const [s, e] = [latlngs[0], latlngs[latlngs.length - 1]];
      showRoute({ lat: s[0], lon: s[1], name: 'Sample start (first point of bundled file)' },
        { lat: e[0], lon: e[1], name: 'Sample end (last point of bundled file)' },
        { latlngs, distance: null, duration: null });
      setStatus('idle', 'Showing bundled sample data, not a live result. Distance and time are not available for it.');
    } catch (err) {
      setStatus('error', err instanceof AppError ? err.message : 'Could not load the sample route.');
    }
  });

  // 6. window resize: keep the route in view when layout changes
  window.addEventListener('resize', () => { map.invalidateSize(); });
})();

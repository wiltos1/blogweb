const els = {
  mapStatus: document.getElementById('mapStatus'),
  locationList: document.getElementById('locationList'),
  locationCount: document.getElementById('locationCount'),
  postCount: document.getElementById('postCount'),
  countryCount: document.getElementById('countryCount'),
};

const geoCacheKey = 'memoryExplorer.geoCache.v1';
let geoCache = loadCache();

init();

async function init() {
  const posts = await loadPosts();
  els.postCount.textContent = posts.length.toLocaleString();
  const { locations, countries } = groupLocations(posts);
  els.locationCount.textContent = locations.size;
  els.countryCount.textContent = countries.size;
  renderLocationList(locations);
  await plotMap(locations);
}

async function loadPosts() {
  const sources = ['./posts_full.json', '../posts_full.json', '/posts_full.json'];
  for (const src of sources) {
    try {
      const res = await fetch(src);
      if (res.ok) return await res.json();
    } catch {
      /* try next */
    }
  }
  els.mapStatus.textContent = 'Unable to load posts_full.json';
  throw new Error('posts_full.json not found');
}

function groupLocations(posts) {
  const locations = new Map(); // key -> { label, posts }
  const countries = new Set();
  posts.forEach((post) => {
    const city = post.location_city || '';
    const country = post.location_country || '';
    if (!city && !country) return;
    const label = [city, country].filter(Boolean).join(', ');
    countries.add(country);
    if (!locations.has(label)) locations.set(label, { label, posts: [] });
    locations.get(label).posts.push(post);
  });
  return { locations, countries };
}

function renderLocationList(locations) {
  if (!locations.size) {
    els.locationList.textContent = 'No locations found';
    return;
  }
  const sorted = Array.from(locations.values()).sort((a, b) => b.posts.length - a.posts.length);
  els.locationList.innerHTML = '';
  sorted.forEach((loc) => {
    const div = document.createElement('div');
    div.className = 'location-row';
    div.innerHTML = `
      <div>
        <div class="location-name">${loc.label}</div>
        <div class="location-meta">${loc.posts.length} post${loc.posts.length > 1 ? 's' : ''}</div>
      </div>
      <button class="pill ghost">Focus</button>
    `;
    div.querySelector('button').addEventListener('click', async () => {
      const coord = await geocodeLocation(loc.label);
      if (coord && window._map) {
        window._map.setView([coord.lat, coord.lon], 6, { animate: true });
      }
    });
    els.locationList.appendChild(div);
  });
}

async function plotMap(locations) {
  const map = L.map('map', { worldCopyJump: true });
  window._map = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  map.setView([20, 0], 2);

  const entries = Array.from(locations.values());
  els.mapStatus.classList.remove('hidden');
  els.mapStatus.textContent = `Geocoding ${entries.length} locations...`;
  const coords = await geocodeAll(entries, 2);

  const markers = [];
  coords.forEach(({ loc, coord }) => {
    const marker = L.circleMarker([coord.lat, coord.lon], {
      radius: 8,
      color: '#7cc7ff',
      fillColor: '#67e8b1',
      fillOpacity: 0.7,
      weight: 2,
    }).addTo(map);
    marker.bindPopup(renderPopup(loc, map), { maxWidth: 320 });
    markers.push(marker);
  });

  if (markers.length) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
    els.mapStatus.classList.add('hidden');
    els.mapStatus.remove?.();
  } else {
    els.mapStatus.textContent = 'No mappable locations';
  }
  saveCache();
}

function renderPopup(loc, map) {
  const center = map.getCenter();
  const postsList = loc.posts
    .map(
      (p) =>
        `<li><a href="./index.html?post=${encodeURIComponent(p.url)}&from=map&lat=${center.lat.toFixed(
          5
        )}&lon=${center.lng.toFixed(5)}&zoom=${map.getZoom()}">${p.title}</a></li>`
    )
    .join('');
  return `
    <div class="popup">
      <div class="popup-title">${loc.label}</div>
      <div class="popup-sub">${loc.posts.length} post${loc.posts.length > 1 ? 's' : ''}</div>
      <ul class="popup-list scrollable">${postsList}</ul>
    </div>
  `;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function geocodeLocation(label, attempt = 1) {
  if (geoCache[label]) return geoCache[label];
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(label)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MemoryExplorerMap/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.length) return null;
    const { lat, lon } = data[0];
    geoCache[label] = { lat: parseFloat(lat), lon: parseFloat(lon) };
    return geoCache[label];
  } catch (e) {
    if (attempt < 3) {
      await wait(400 * attempt); // gentle backoff to avoid server refusals
      return geocodeLocation(label, attempt + 1);
    }
    return null;
  }
}

async function geocodeAll(entries, concurrency = 2) {
  const queue = [...entries];
  const results = [];
  const worker = async () => {
    while (queue.length) {
      const loc = queue.pop();
      const coord = await geocodeLocation(loc.label);
      if (coord) results.push({ loc, coord });
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function loadCache() {
  try {
    const raw = localStorage.getItem(geoCacheKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache() {
  try {
    localStorage.setItem(geoCacheKey, JSON.stringify(geoCache));
  } catch {
    /* ignore */
  }
}

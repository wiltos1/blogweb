const TRACKS = [
  ...['Abstract', 'Acoustic', 'Bass', 'Breakbeat', 'Calm', 'Cinematic', 'Classical', 'Cold', 'Nature', 'Upbeat'].map((name) => ({
    id: `nv-${name.toLowerCase()}`,
    title: name,
    artist: 'Instrumental',
    url: `./audio/non-vocal/${encodeURIComponent(name)}.mp3`,
    category: 'Non-vocal',
  })),
  ...[
    ['100 Years', 'Five for Fighting'],
    ['Best Day Of My Life', 'American Authors'],
    ['Good Riddance', 'Green Day'],
    ['Home', 'Edward Sharpe'],
    ['Landslide', 'Fleetwood Mac'],
    ['Memories', 'Maroon 5'],
    ['Photograph', 'Ed Sheeran'],
    ['Send Me On My Way', 'Rusted Root'],
    ['The Funeral', 'Band of Horses'],
    ['Viva La Vida', 'Coldplay'],
  ].map(([title, artist]) => ({
    id: `v-${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    artist,
    url: `./audio/vocal/${encodeURIComponent(`${title},${artist}`)}.mp3`,
    category: 'Vocal',
  })),
];

const state = {
  posts: [],
  filtered: [],
  search: '',
  persons: [],
  selected: [],
  slides: [],
  slideIndex: 0,
  timer: null,
  speedMs: 5000,
  sharpenCache: new Map(),
  slideToken: 0,
  loadingImage: false,
  audio: new Audio(),
  audioUrl: null,
  audioReady: false,
  selectedTrack: null,
  sampleTimer: null,
  customFilters: [],
  customFilter: null,
};

const CUSTOM_FILTER_KEY = 'memoryExplorer.customFilters.v1';

let els = {};

document.addEventListener("DOMContentLoaded", () => {
  els = {
    searchInput: document.getElementById('searchInput'),
    yearFilter: document.getElementById('yearFilter'),
    personFilter: document.getElementById('personFilter'),
  cityFilter: document.getElementById('cityFilter'),
  eventFilter: document.getElementById('eventFilter'),
  clearFilters: document.getElementById('clearFilters'),
  customFilterSelect: document.getElementById('customFilterSelect'),
  applyCustomFilter: document.getElementById('applyCustomFilter'),
  customFilterMeta: document.getElementById('customFilterMeta'),
  addAllBtn: document.getElementById('addAllBtn'),
  addRandomBtn: document.getElementById('addRandomBtn'),
  postList: document.getElementById('postList'),
  selection: document.getElementById('selection'),
    playBtn: document.getElementById('playBtn'),
    speedControl: document.getElementById('speedControl'),
    speedValue: document.getElementById('speedValue'),
    musicSample: document.getElementById('musicSample'),
    musicStatus: document.getElementById('musicStatus'),
    musicResults: document.getElementById('musicResults'),
    clearSelection: document.getElementById('clearSelection'),
    overlay: document.getElementById('overlay'),
    overlayImage: document.getElementById('overlayImage'),
    overlayCaption: document.getElementById('overlayCaption'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayDots: document.getElementById('overlayDots'),
    closeOverlay: document.getElementById('closeOverlay'),
    prevSlide: document.getElementById('prevSlide'),
    nextSlide: document.getElementById('nextSlide'),
  };

  window.addEventListener('storage', loadCustomFilters);
  window.addEventListener('focus', loadCustomFilters);

  init();
});



async function init() {
  bindEvents();
  loadCustomFilters();
  await loadPosts();
  hydrateFilters();
  applyFilters();
}

function bindEvents() {
  els.searchInput.addEventListener('input', (e) => {
    state.search = e.target.value.toLowerCase();
    applyFilters();
  });
  els.yearFilter.addEventListener('change', () => applyFilters());
  els.cityFilter.addEventListener('change', () => applyFilters());
  els.eventFilter.addEventListener('change', () => applyFilters());
  els.personFilter.addEventListener('change', () => {
    state.persons = Array.from(els.personFilter.selectedOptions).map((o) => o.value);
    applyFilters();
  });
  els.clearFilters.addEventListener('click', () => {
    resetFilters();
    applyFilters();
  });
  if (els.applyCustomFilter) {
    els.applyCustomFilter.addEventListener('click', () => applyCustomFilterByName(els.customFilterSelect.value));
  }
  els.addAllBtn.addEventListener('click', addAllToSelection);
  els.addRandomBtn.addEventListener('click', addRandomToSelection);
  els.playBtn.addEventListener('click', playSlideshow);
  if (els.speedControl)
    els.speedControl.addEventListener('input', onSpeedChange);
  if (els.musicSample)
    els.musicSample.addEventListener('click', toggleSample);
  renderMusicResults();

  els.clearSelection.addEventListener('click', () => {
    state.selected = [];
    renderSelection();
  });
  els.closeOverlay.addEventListener('click', stopSlideshow);
  els.prevSlide.addEventListener('click', () => showSlide(state.slideIndex - 1));
  els.nextSlide.addEventListener('click', () => showSlide(state.slideIndex + 1));
}

async function loadPosts() {
  const sources = ['./posts_full.json', '../posts_full.json', '/posts_full.json'];
  for (const src of sources) {
    try {
      const res = await fetch(src);
      if (res.ok) {
        state.posts = (await res.json()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        state.filtered = [...state.posts];
        return;
      }
    } catch {
      /* continue */
    }
  }
  alert('Unable to load posts_full.json');
}

function hydrateFilters() {
  const years = new Set();
  const people = new Map();
  const cities = new Set();
  const events = new Set();
  state.posts.forEach((post) => {
    const [y] = (post.date || '').split('-');
    if (y) years.add(y);
    (post.people || []).forEach((p) => people.set(p, (people.get(p) || 0) + 1));
    if (post.location_city) cities.add(post.location_city);
    (post.events || []).forEach((e) => events.add(e));
  });
  fillSelect(els.yearFilter, ['all', ...Array.from(years).sort((a, b) => b.localeCompare(a))], 'Year');
  fillSelect(els.personFilter, Array.from(people.entries()).sort((a, b) => b[1] - a[1]).map((p) => p[0]), null, true);
  fillSelect(els.cityFilter, ['all', ...Array.from(cities).sort()], 'City');
  fillSelect(els.eventFilter, ['all', ...Array.from(events).sort()], 'Event');
}

function fillSelect(selectEl, items, labelAll = null, multi = false) {
  selectEl.innerHTML = '';
  if (!multi && labelAll) {
    const opt = document.createElement('option');
    opt.value = 'all';
    opt.textContent = `All ${labelAll}`;
    selectEl.appendChild(opt);
  }
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    selectEl.appendChild(opt);
  });
}

function applyFilters() {
  const search = state.search || '';
  const criteria = buildActiveCriteria();
  state.filtered = state.posts.filter((post) => {
    const matchesSearch = !search || buildSearchString(post).includes(search);
    const matchesYear =
      !criteria.years.length || criteria.years.some((yr) => (post.date || '').startsWith(yr));
    const matchesCity = !criteria.cities.length || criteria.cities.includes(post.location_city);
    const matchesEvent =
      !criteria.events.length || (post.events || []).some((e) => criteria.events.includes(e));
    const matchesPersons =
      !criteria.persons.length || criteria.persons.every((p) => (post.people || []).includes(p));
    return matchesSearch && matchesYear && matchesCity && matchesEvent && matchesPersons;
  });
  renderList();
  updateAddAllState();
}

function buildActiveCriteria() {
  const cf = state.customFilter;
  const years = cf?.years?.filter(Boolean) || [];
  const cities = cf?.cities?.filter(Boolean) || [];
  const events = cf?.events?.filter(Boolean) || [];
  const persons = cf?.people?.filter(Boolean) || [];

  if (!cf) {
    const yearVal = els.yearFilter?.value;
    const cityVal = els.cityFilter?.value;
    const eventVal = els.eventFilter?.value;
    if (yearVal && yearVal !== 'all') years.push(yearVal);
    if (cityVal && cityVal !== 'all') cities.push(cityVal);
    if (eventVal && eventVal !== 'all') events.push(eventVal);
    if (state.persons?.length) persons.push(...state.persons);
  }

  return { years, cities, events, persons };
}

function loadCustomFilters() {
  try {
    const raw = localStorage.getItem(CUSTOM_FILTER_KEY);
    state.customFilters = raw ? JSON.parse(raw) : [];
  } catch {
    state.customFilters = [];
  }
  renderCustomFilterOptions();
}

function renderCustomFilterOptions() {
  if (!els.customFilterSelect) return;
  const previous = els.customFilterSelect.value;
  els.customFilterSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = state.customFilters.length ? 'Select a custom filter' : 'No custom filters saved';
  els.customFilterSelect.appendChild(placeholder);
  state.customFilters.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.name;
    opt.textContent = f.name;
    els.customFilterSelect.appendChild(opt);
  });
  if (previous) {
    const stillExists = state.customFilters.find((f) => f.name === previous);
    if (stillExists) els.customFilterSelect.value = previous;
  }
  updateCustomFilterMeta();
}

function describeFilter(filter) {
  const parts = [];
  if (filter.people?.length) parts.push(`${filter.people.length} people`);
  if (filter.events?.length) parts.push(`${filter.events.length} events`);
  if (filter.cities?.length) parts.push(`${filter.cities.length} cities`);
  if (filter.years?.length) parts.push(`${filter.years.length} years`);
  return parts.join(' • ') || 'No criteria';
}

function applyCustomFilterByName(name) {
  if (!name) {
    state.customFilter = null;
    if (els.customFilterSelect) els.customFilterSelect.value = '';
    updateCustomFilterMeta();
    applyFilters();
    return;
  }
  const filter = state.customFilters.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (!filter) {
    updateCustomFilterMeta('Custom filter not found.');
    return;
  }
  state.customFilter = filter;
  // Reset UI filters to prevent conflicts.
  if (els.yearFilter) els.yearFilter.value = 'all';
  if (els.cityFilter) els.cityFilter.value = 'all';
  if (els.eventFilter) els.eventFilter.value = 'all';
  if (els.personFilter) Array.from(els.personFilter.options).forEach((o) => (o.selected = false));
  state.persons = [];
  updateCustomFilterMeta();
  applyFilters();
}

function updateCustomFilterMeta(message) {
  if (!els.customFilterMeta) return;
  if (message !== undefined) {
    els.customFilterMeta.textContent = message;
    return;
  }
  if (state.customFilter) {
    els.customFilterMeta.textContent = `Using: ${state.customFilter.name} (${describeFilter(state.customFilter)})`;
  } else {
    els.customFilterMeta.textContent = 'No custom filter applied.';
  }
}

function renderList() {
  els.postList.innerHTML = '';
  state.filtered.forEach((post) => {
    const row = document.createElement('div');
    row.className = 'list-row draggable';
    row.draggable = true;
    row.innerHTML = `
      <div>
        <div class="list-title">${post.title}</div>
        <div class="list-meta">${post.date || ''} · ${post.location_city || ''}</div>
      </div>
      <button class="pill ghost">Add</button>
    `;
    row.querySelector('button').addEventListener('click', () => addToSelection(post));
    row.addEventListener('dragstart', (e) => startDrag(e, post, 'source'));
    els.postList.appendChild(row);
  });
}

function renderSelection() {
  els.selection.innerHTML = '';
  if (!state.selected.length) {
    els.selection.innerHTML = '<div class="empty">No posts selected yet.</div>';
    return;
  }
  state.selected.forEach((post, idx) => {
    const row = document.createElement('div');
    row.className = 'selection-row draggable';
    row.draggable = true;
    row.innerHTML = `
      <div>
        <div class="list-title">${post.title}</div>
        <div class="list-meta">${post.date || ''} · ${post.location_city || ''}</div>
      </div>
      <div class="selection-actions">
        <button class="pill ghost" data-dir="-1">↑</button>
        <button class="pill ghost" data-dir="1">↓</button>
        <button class="pill ghost" data-remove="1">Remove</button>
      </div>
    `;
    row.querySelector('[data-dir="-1"]').addEventListener('click', () => moveSelection(idx, -1));
    row.querySelector('[data-dir="1"]').addEventListener('click', () => moveSelection(idx, 1));
    row.querySelector('[data-remove]').addEventListener('click', () => removeSelection(idx));
    row.addEventListener('dragstart', (e) => startDrag(e, post, 'target', idx));
    els.selection.appendChild(row);
  });
}

function addToSelection(post) {
  if (state.selected.find((p) => p.url === post.url)) return;
  state.selected.push(post);
  renderSelection();
}

function addAllToSelection() {
  if (!state.filtered.length) {
    alert('No posts match the current filters.');
    return;
  }
  state.filtered.forEach((post) => addToSelection(post));
  updateAddAllState();
}

function addRandomToSelection() {
  if (state.filtered.length === 0) {
    alert('No posts match the current filters.');
    return;
  }
  const picks = [...state.filtered];
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  picks.slice(0, 5).forEach((post) => addToSelection(post));
  updateAddAllState();
}

function updateAddAllState() {
  if (!els.addAllBtn) return;
  els.addAllBtn.disabled = !state.filtered.length;
}

let dragData = null;

function startDrag(event, post, origin, idx = null) {
  dragData = { post, origin, idx };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', post.url);
}

['postList', 'selection'].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (!dragData) return;
    if (el.id === 'selection' && dragData.origin === 'source') {
      addToSelection(dragData.post);
    } else if (el.id === 'selection' && dragData.origin === 'target') {
      moveSelection(dragData.idx, state.selected.length - 1);
    } else if (el.id === 'postList' && dragData.origin === 'target') {
      removeSelection(dragData.idx);
    }
    dragData = null;
  });
});

function moveSelection(idx, delta) {
  const target = idx + delta;
  if (target < 0 || target >= state.selected.length) return;
  const tmp = state.selected[idx];
  state.selected[idx] = state.selected[target];
  state.selected[target] = tmp;
  renderSelection();
}

function removeSelection(idx) {
  state.selected.splice(idx, 1);
  renderSelection();
}

function upgradeResolution(url) {
  // Blogger images have size spec like /s320/, /s640/, etc.
  return url.replace(/\/s\d+\//, '/s0/');
}

function buildSlides() {
  const slides = [];
  state.selected.forEach((post) => {
    let lastText = '';
    post.content_blocks.forEach((block) => {
      if (block.type === 'text') lastText = block.content;
      if (block.type === 'image') {
        slides.push({ url: upgradeResolution(block.url), caption: lastText || post.title });
      }
    });
  });
  return slides;
}

function playSlideshow() {
  state.slides = buildSlides();
  if (!state.slides.length) {
    alert('No images found in selected posts.');
    return;
  }
  onSpeedChange(); // sync speed from slider before playing
  state.slideIndex = 0;
  buildDots();
  showSlide(0, true);
  els.overlay.classList.remove('hidden');
  requestFullscreen(els.overlay);
  playAudioIfReady();
}

function stopSlideshow() {
  els.overlay.classList.add('hidden');
  clearInterval(state.timer);
  state.loadingImage = false;
  stopAudio();
  if (document.fullscreenElement) document.exitFullscreen();
}

function buildDots() {
  els.overlayDots.innerHTML = '';
  state.slides.forEach((_, idx) => {
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.addEventListener('click', () => showSlide(idx, true));
    els.overlayDots.appendChild(dot);
  });
}

function showSlide(index, silent = false) {
  if (!state.slides.length) return;
  if (index >= state.slides.length) {
    stopTimer();
    showReplay();
    stopAudio();
    return;
  }
  const safe = ((index % state.slides.length) + state.slides.length) % state.slides.length;
  state.slideIndex = safe;
  const slide = state.slides[safe];
  state.slideToken += 1;
  const token = state.slideToken;
  state.loadingImage = true;
  els.overlayCaption.textContent = '';
  els.overlayTitle.textContent = `Slide ${safe + 1} / ${state.slides.length}`;
  enhanceCurrentImage(slide.url);
  // warm the cache for the upcoming slide to reduce visible load time
  if (safe + 1 < state.slides.length) {
    enhanceCurrentImage(state.slides[safe + 1].url);
  }
  Array.from(els.overlayDots.children).forEach((dot, i) => {
    dot.classList.toggle('active', i === safe);
  });
  const finalize = () => {
    if (token !== state.slideToken) return;
    state.loadingImage = false;
    els.overlayCaption.textContent = slide.caption;
    restartTimer();
  };
  els.overlayImage.onload = finalize;
  els.overlayImage.onerror = () => {
    if (token !== state.slideToken) return;
    state.loadingImage = false;
    els.overlayCaption.textContent = slide.caption;
    restartTimer();
  };
  els.overlayImage.dataset.src = slide.url;
  els.overlayImage.src = slide.url;
}

function buildSearchString(post) {
  return [
    post.title,
    post.date,
    post.location_city,
    post.location_country,
    ...(post.people || []),
    ...(post.events || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function resetFilters() {
  state.search = '';
  state.persons = [];
  state.customFilter = null;
  els.searchInput.value = '';
  els.yearFilter.value = 'all';
  els.cityFilter.value = 'all';
  els.eventFilter.value = 'all';
  Array.from(els.personFilter.options).forEach((o) => (o.selected = false));
  if (els.customFilterSelect) els.customFilterSelect.value = '';
  updateCustomFilterMeta();
}

function requestFullscreen(el) {
  if (el.requestFullscreen) el.requestFullscreen();
}

function restartTimer() {
  if (state.loadingImage) return;
  clearInterval(state.timer);
  state.timer = setInterval(() => showSlide(state.slideIndex + 1), state.speedMs);
}

function stopTimer() {
  clearInterval(state.timer);
}

function showReplay() {
  if (!els.overlayDots) return;
  const replay = document.createElement('button');
  replay.className = 'pill ghost';
  replay.textContent = 'Replay';
  replay.dataset.replay = '1';
  replay.addEventListener('click', () => {
    replay.remove();
    state.slideIndex = 0;
    showSlide(0, true);
    playAudioIfReady(true);
  });
  // remove any existing replay button
  Array.from(els.overlayDots.querySelectorAll('[data-replay]')).forEach((btn) => btn.remove());
  els.overlayDots.appendChild(replay);
}

function renderMusicResults() {
  if (!els.musicResults) return;
  els.musicResults.innerHTML = '';
  ['Non-vocal', 'Vocal'].forEach((category) => {
    const label = document.createElement('div');
    label.className = 'music-section-label';
    label.textContent = category;
    els.musicResults.appendChild(label);
    TRACKS.filter((t) => t.category === category).forEach((track) => {
      const row = document.createElement('div');
      row.className = 'music-result';
      if (state.selectedTrack && state.selectedTrack.id === track.id) {
        row.classList.add('active');
      }
      row.innerHTML = `
        <div>
          <div class="list-title">${track.title}</div>
          <div class="music-meta">${track.artist || ''}</div>
          <div class="music-tags">${track.category}</div>
        </div>
        <button class="pill ghost">${state.selectedTrack && state.selectedTrack.id === track.id ? 'Deselect' : 'Select'}</button>
      `;
      row.querySelector('button').addEventListener('click', () => toggleTrack(track));
      row.addEventListener('dblclick', () => toggleTrack(track));
      els.musicResults.appendChild(row);
    });
  });
  updateMusicControls();
}

function toggleTrack(track) {
  if (state.selectedTrack && state.selectedTrack.id === track.id) {
    state.selectedTrack = null;
    state.audioReady = false;
    stopAudio();
  } else {
    state.selectedTrack = track;
    state.audioUrl = track.url;
    state.audio.src = track.url;
    state.audio.loop = true;
    state.audioReady = true;
  }
  renderMusicResults();
  updateMusicControls();
}

function updateMusicControls() {
  if (els.musicSample) {
    els.musicSample.disabled = !state.selectedTrack;
    els.musicSample.textContent = state.audio.paused ? 'Sample track (10s)' : 'Stop sample';
  }
  if (els.musicStatus) {
    els.musicStatus.textContent = state.selectedTrack ? `Selected: ${state.selectedTrack.title}` : 'No track selected';
  }
}

function toggleSample() {
  if (!state.selectedTrack) return;
  if (state.audio.paused) {
    playAudioIfReady(true, false, true);
  } else {
    stopAudio();
  }
  updateMusicControls();
}

function playAudioIfReady(reset = false, loop = true, sample = false) {
  if (!state.audioReady || !state.audioUrl) return;
  try {
    if (reset) state.audio.currentTime = 0;
    state.audio.loop = loop;
    state.audio.play().then(() => {
      updateMusicControls();
      if (sample) {
        clearTimeout(state.sampleTimer);
        state.sampleTimer = setTimeout(() => {
          stopAudio();
        }, 10000);
      }
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

function stopAudio() {
  try {
    state.audio.pause();
    state.audio.currentTime = 0;
  } catch {
    /* ignore */
  }
  clearTimeout(state.sampleTimer);
  updateMusicControls();
}

function onSpeedChange() {
  const val = parseInt(els.speedControl.value, 10);
  state.speedMs = isNaN(val) ? 5000 : val;
  if (els.speedValue) {
    els.speedValue.textContent = `${(state.speedMs / 1000).toFixed(1)}s`;
  }
  if (!els.overlay.classList.contains('hidden') && state.slides.length) {
    restartTimer();
  }
}

async function enhanceCurrentImage(url) {
  try {
    // use cached enhanced version if available
    if (state.sharpenCache.has(url)) {
      if (els.overlayImage.dataset.src === url) {
        els.overlayImage.src = state.sharpenCache.get(url);
      }
      return;
    }
    const enhanced = await sharpenImage(url);
    if (enhanced) {
      state.sharpenCache.set(url, enhanced);
      if (els.overlayImage.dataset.src === url) {
        els.overlayImage.src = enhanced;
      }
    }
  } catch {
    // fall back silently if processing fails (e.g., CORS)
  }
}

async function sharpenImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxDim = 2000;
      const scale = Math.min(1.2, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      let imageData;
      try {
        imageData = ctx.getImageData(0, 0, w, h);
      } catch (err) {
        reject(err);
        return;
      }
      const data = imageData.data;
      const applyKernel = (centerWeight) => {
        const out = new Uint8ClampedArray(data.length);
        const kernel = [
          0, -1, 0,
          -1, centerWeight, -1,
          0, -1, 0,
        ];
        const clamp = (v) => Math.min(255, Math.max(0, v));
        out.set(data);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            for (let c = 0; c < 3; c++) {
              let sum = 0;
              let k = 0;
              for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++, k++) {
                  const idx = ((y + ky) * w + (x + kx)) * 4 + c;
                  sum += data[idx] * kernel[k];
                }
              }
              const outIdx = (y * w + x) * 4 + c;
              out[outIdx] = clamp(sum);
            }
            const alphaIdx = (y * w + x) * 4 + 3;
            out[alphaIdx] = data[alphaIdx];
          }
        }
        return out;
      };
      // two passes: moderate then light sharpen
      let pass = applyKernel(7);
      data.set(pass);
      pass = applyKernel(5);
      imageData.data.set(pass);
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = reject;
    img.src = url;
  });
}

const storageKey = 'memoryExplorer.customFilters.v1';

const state = {
  posts: [],
  saved: [],
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  state.saved = loadSaved();
  renderSaved();
  loadPosts().then(() => {
    hydrateOptions();
  });
});

function cacheElements() {
  els.filterName = document.getElementById('filterName');
  els.yearSelect = document.getElementById('yearSelect');
  els.personSelect = document.getElementById('personSelect');
  els.citySelect = document.getElementById('citySelect');
  els.eventSelect = document.getElementById('eventSelect');
  els.saveFilter = document.getElementById('saveFilter');
  els.saveStatus = document.getElementById('saveStatus');
  els.savedList = document.getElementById('savedList');
}

function bindEvents() {
  els.saveFilter?.addEventListener('click', handleSave);
}

async function loadPosts() {
  const sources = ['./posts_full.json', '../posts_full.json', '/posts_full.json'];
  for (const src of sources) {
    try {
      const res = await fetch(src);
      if (res.ok) {
        state.posts = await res.json();
        return;
      }
    } catch {
      /* try next */
    }
  }
  setStatus('Unable to load posts_full.json for filter options', true);
}

function hydrateOptions() {
  const years = new Set();
  const people = new Map();
  const cities = new Set();
  const events = new Set();

  state.posts.forEach((post) => {
    const [year] = (post.date || '').split('-');
    if (year) years.add(year);
    (post.people || []).forEach((p) => people.set(p, (people.get(p) || 0) + 1));
    if (post.location_city) cities.add(post.location_city);
    (post.events || []).forEach((e) => events.add(e));
  });

  fillSelect(els.yearSelect, Array.from(years).sort((a, b) => b.localeCompare(a)));
  fillSelect(
    els.personSelect,
    Array.from(people.entries())
      .sort((a, b) => b[1] - a[1])
      .map((p) => p[0])
  );
  fillSelect(els.citySelect, Array.from(cities).sort());
  fillSelect(els.eventSelect, Array.from(events).sort());
}

function fillSelect(selectEl, items) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    selectEl.appendChild(opt);
  });
}

function handleSave(event) {
  event.preventDefault();
  const name = els.filterName.value.trim();
  const filter = {
    name,
    years: getSelected(els.yearSelect),
    people: getSelected(els.personSelect),
    cities: getSelected(els.citySelect),
    events: getSelected(els.eventSelect),
    createdAt: Date.now(),
  };

  if (!name) {
    setStatus('Please give your custom filter a name.', true);
    return;
  }

  const hasCriteria = filter.years.length || filter.people.length || filter.cities.length || filter.events.length;
  if (!hasCriteria) {
    setStatus('Select at least one person, event, city, or year.', true);
    return;
  }

  const existingIdx = state.saved.findIndex((f) => f.name.toLowerCase() === name.toLowerCase());
  if (existingIdx >= 0) {
    state.saved[existingIdx] = { ...state.saved[existingIdx], ...filter };
  } else {
    state.saved.push(filter);
  }

  persist();
  renderSaved();
  setStatus('Saved custom filter.', false);
}

function getSelected(selectEl) {
  return Array.from(selectEl?.selectedOptions || []).map((opt) => opt.value);
}

function renderSaved() {
  if (!els.savedList) return;
  els.savedList.innerHTML = '';
  if (!state.saved.length) {
    els.savedList.textContent = 'No custom filters yet.';
    return;
  }

  state.saved
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((filter) => {
      const row = document.createElement('div');
      row.className = 'saved-row';
      const summary = document.createElement('div');
      summary.innerHTML = `
        <div class="eyebrow">${filter.name}</div>
        <div class="saved-meta">${describeFilter(filter)}</div>
      `;
      const actions = document.createElement('div');
      actions.className = 'saved-actions';
      const removeBtn = document.createElement('button');
      removeBtn.className = 'pill ghost small';
      removeBtn.textContent = 'Delete';
      removeBtn.addEventListener('click', () => removeFilter(filter.name));
      actions.appendChild(removeBtn);
      row.appendChild(summary);
      row.appendChild(actions);
      els.savedList.appendChild(row);
    });
}

function describeFilter(filter) {
  const parts = [];
  if (filter.people?.length) parts.push(`${filter.people.length} people`);
  if (filter.events?.length) parts.push(`${filter.events.length} events`);
  if (filter.cities?.length) parts.push(`${filter.cities.length} cities`);
  if (filter.years?.length) parts.push(`${filter.years.length} years`);
  return parts.join(' • ') || 'No criteria';
}

function removeFilter(name) {
  state.saved = state.saved.filter((f) => f.name.toLowerCase() !== name.toLowerCase());
  persist();
  renderSaved();
  setStatus('Removed filter.', false);
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state.saved));
  } catch {
    /* ignore */
  }
}

function setStatus(msg, isError = false) {
  if (!els.saveStatus) return;
  els.saveStatus.textContent = msg;
  els.saveStatus.classList.toggle('error', Boolean(isError));
}

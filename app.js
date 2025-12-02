const state = {
  posts: [],
  filtered: [],
  activePost: null,
  view: 'home',
  mapReturn: null,
  lastHomeScroll: 0,
  quickViewLimit: 60,
  slideIndex: 0,
  slideData: [],
  timelineMode: false,
  filter: {
    search: '',
    year: 'all',
    persons: [],
    city: 'all',
    event: 'all',
    favoritesOnly: false,
  },
  bookmarks: new Set(),
};

let els = {};

document.addEventListener('DOMContentLoaded', () => {
  // Only run on pages that actually contain the app layout.
  if (!document.getElementById('app')) return;

  els = {
    searchInput: document.getElementById('searchInput'),
    randomBtn: document.getElementById('randomBtn'),
    timelineToggle: document.getElementById('timelineToggle'),
    yearFilter: document.getElementById('yearFilter'),
    personFilter: document.getElementById('personFilter'),
    cityFilter: document.getElementById('cityFilter'),
    eventFilter: document.getElementById('eventFilter'),
    clearFilters: document.getElementById('clearFilters'),
    quickViewGrid: document.getElementById('quickViewGrid'),
    timelineView: document.getElementById('timelineView'),
    postTitle: document.getElementById('postTitle'),
    postDate: document.getElementById('postDate'),
    postTags: document.getElementById('postTags'),
    postContent: document.getElementById('postContent'),
    bookmarkBtn: document.getElementById('bookmarkBtn'),
    bookmarksList: document.getElementById('bookmarksList'),
    viewOriginal: document.getElementById('viewOriginal'),
    postCount: document.getElementById('postCount'),
    peopleCount: document.getElementById('peopleCount'),
    cityCount: document.getElementById('cityCount'),
    openLatest: document.getElementById('openLatest'),
    bookmarkFilter: document.getElementById('bookmarkFilter'),
    clearFiltersTop: document.getElementById('clearFiltersTop'),
    homeView: document.getElementById('homeView'),
    detailView: document.getElementById('postDetail'),
    homeBtn: document.getElementById('homeBtn'),
    homeBtnBottom: document.getElementById('homeBtnBottom'),
    mapBackBtn: document.getElementById('mapBackBtn'),
    mapBackBtnBottom: document.getElementById('mapBackBtnBottom'),
    slideshow: document.getElementById('slideshow'),
    slideshowImage: document.getElementById('slideshowImage'),
    slideshowCaption: document.getElementById('slideshowCaption'),
    slideDots: document.getElementById('slideDots'),
    prevSlide: document.getElementById('prevSlide'),
    nextSlide: document.getElementById('nextSlide'),
    toast: document.getElementById('toast'),
    loadMore: document.getElementById('loadMore'),
    backTop: document.getElementById('backTop'),
    backTopDetail: document.getElementById('backTopDetail'),
  };

  const missing = Object.entries(els)
    .filter(([, el]) => !el)
    .map(([key]) => key);

  if (missing.length) {
    console.error(`Memory Explorer init halted. Missing DOM nodes: ${missing.join(', ')}`);
    return;
  }

  init();
});

async function init() {
  parseQueryParams();
  loadBookmarks();
  bindEvents();
  await loadPosts();
  hydrateFilters();
  applyFilters();
  maybeOpenFromQuery();
}

function bindEvents() {
  const on = (el, evt, handler) => el?.addEventListener?.(evt, handler);

  on(els.searchInput, 'input', (e) => {
    state.filter.search = e.target.value.toLowerCase();
    applyFilters();
  });

  on(els.randomBtn, 'click', openRandomPost);
  on(els.homeBtn, 'click', showHome);

  if (els.timelineToggle && els.timelineView && els.quickViewGrid) {
    on(els.timelineToggle, 'change', (e) => {
      state.timelineMode = e.target.checked;
      renderTimeline();
      els.timelineView.classList.toggle('hidden', !state.timelineMode);
      els.quickViewGrid.classList.toggle('hidden', state.timelineMode);
    });
  }

  on(els.yearFilter, 'change', (e) => {
    state.filter.year = e.target.value;
    applyFilters();
  });

  on(els.cityFilter, 'change', (e) => {
    state.filter.city = e.target.value;
    applyFilters();
  });

  on(els.eventFilter, 'change', (e) => {
    state.filter.event = e.target.value;
    applyFilters();
  });

  on(els.personFilter, 'change', () => {
    const selected = Array.from(els.personFilter.selectedOptions || []).map((o) => o.value);
    state.filter.persons = selected;
    applyFilters();
  });

  on(els.clearFilters, 'click', () => {
    resetFilters();
    applyFilters();
  });

  on(els.bookmarkBtn, 'click', toggleBookmark);
  on(els.homeBtnBottom, 'click', showHome);

  on(els.viewOriginal, 'click', () => {
    if (state.activePost?.url) window.open(state.activePost.url, '_blank');
  });

  on(els.mapBackBtn, 'click', () => {
    const { lat, lon, zoom } = state.mapReturn || {};
    if (lat && lon && zoom) {
      window.location.href = `./map.html?lat=${lat}&lon=${lon}&zoom=${zoom}`;
    } else {
      window.location.href = './map.html';
    }
  });

  if (els.mapBackBtnBottom && els.mapBackBtn) {
    on(els.mapBackBtnBottom, 'click', () => els.mapBackBtn.click());
  }

  on(els.backTop, 'click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  on(els.backTopDetail, 'click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  on(els.loadMore, 'click', () => {
    state.quickViewLimit += 40;
    renderQuickView();
  });

  on(els.openLatest, 'click', () => {
    if (state.filtered.length) openPost(state.filtered[0], true);
  });

  on(els.bookmarkFilter, 'click', () => {
    state.filter.favoritesOnly = !state.filter.favoritesOnly;
    els.bookmarkFilter.textContent = state.filter.favoritesOnly
      ? 'Showing favorites'
      : 'Show favorites';
    applyFilters();
  });

  on(els.clearFiltersTop, 'click', () => {
    resetFilters();
    applyFilters();
  });

  on(els.prevSlide, 'click', () => showSlide(state.slideIndex - 1));
  on(els.nextSlide, 'click', () => showSlide(state.slideIndex + 1));
}

async function loadPosts() {
  try {
    const sources = ['./posts_full.json', '../posts_full.json', '/posts_full.json'];
    let data = null;
    for (const src of sources) {
      try {
        const res = await fetch(src);
        if (res.ok) {
          data = await res.json();
          break;
        }
      } catch (e) {
        /* try next path */
      }
    }
    if (!data) throw new Error('posts_full.json not reachable');
    state.posts = data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    state.filtered = [...state.posts];
    els.postCount.textContent = state.posts.length.toLocaleString();
    els.peopleCount.textContent = countUnique(state.posts.flatMap((p) => p.people || []));
    els.cityCount.textContent = countUnique(state.posts.map((p) => p.location_city).filter(Boolean));
  } catch (err) {
    console.error(err);
    showToast('Failed to load posts_full.json');
  }
}

function hydrateFilters() {
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

  fillSelect(els.yearFilter, ['all', ...Array.from(years).sort((a, b) => b.localeCompare(a))], 'Year');
  const topPeople = Array.from(people.entries()).sort((a, b) => b[1] - a[1]).map((p) => p[0]);
  fillSelect(els.personFilter, topPeople, null, true);
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
  state.quickViewLimit = 60;
  const { search, year, persons, city, event, favoritesOnly } = state.filter;
  state.filtered = state.posts.filter((post) => {
    const matchesSearch = !search || buildSearchString(post).includes(search);
    const matchesYear = year === 'all' || (post.date || '').startsWith(year);
    const matchesCity = city === 'all' || post.location_city === city;
    const matchesEvent = event === 'all' || (post.events || []).includes(event);
    const matchesPersons = !persons.length || persons.every((p) => (post.people || []).includes(p));
    const matchesFavorite = !favoritesOnly || state.bookmarks.has(post.url);
    return matchesSearch && matchesYear && matchesCity && matchesEvent && matchesPersons && matchesFavorite;
  });

  renderQuickView();
  renderTimeline();
  if (!state.filtered.length) {
    els.quickViewGrid.innerHTML = '<div class="card" style="padding:16px;">No posts found for those filters.</div>';
    els.timelineView.innerHTML = '';
    if (state.view === 'detail') showHome(false);
  } else if (state.view === 'detail' && !state.filtered.includes(state.activePost)) {
    state.activePost = state.filtered[0];
    renderPost();
  }
}

function renderQuickView() {
  if (state.timelineMode) return;
  els.quickViewGrid.innerHTML = '';
  const items = state.filtered.slice(0, state.quickViewLimit);
  items.forEach((post) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.addEventListener('click', () => openPost(post, true));
    const img = document.createElement('img');
    img.className = 'card-image';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = findFirstImage(post) || gradientPlaceholder(post.title);
    img.alt = post.title;
    const body = document.createElement('div');
    body.className = 'card-body';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = post.title;
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = `${post.date || 'Unknown'} · ${post.location_city || 'Somewhere'}`;
    const tags = document.createElement('div');
    tags.className = 'tag-row';
    (post.people || []).slice(0, 3).forEach((p) => {
      const tag = document.createElement('span');
      tag.className = 'tag person';
      tag.textContent = p;
      tags.appendChild(tag);
    });
    (post.events || []).slice(0, 2).forEach((e) => {
      const tag = document.createElement('span');
      tag.className = 'tag event';
      tag.textContent = e;
      tags.appendChild(tag);
    });
    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(tags);
    card.appendChild(img);
    card.appendChild(body);
    els.quickViewGrid.appendChild(card);
  });
  toggleLoadMore();
}

function renderTimeline() {
  if (!state.timelineMode) return;
  const groups = new Map();
  state.filtered.forEach((post) => {
    const key = post.date || 'Unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(post);
  });
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
  els.timelineView.innerHTML = '';

  sortedKeys.forEach((key) => {
    const group = document.createElement('div');
    group.className = 'timeline-group';
    const badge = document.createElement('div');
    badge.className = 'timeline-badge';
    const title = document.createElement('div');
    title.className = 'timeline-title';
    title.textContent = key;
    const row = document.createElement('div');
    row.className = 'timeline-row';
    groups.get(key).slice(0, 8).forEach((post) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.addEventListener('click', () => openPost(post, true));
      const img = document.createElement('img');
      img.className = 'card-image';
      img.loading = 'lazy';
      img.src = findFirstImage(post) || gradientPlaceholder(post.title);
      const body = document.createElement('div');
      body.className = 'card-body';
      body.innerHTML = `<div class="card-title">${post.title}</div><div class="card-meta">${post.location_city || ''}</div>`;
      card.appendChild(img);
      card.appendChild(body);
      row.appendChild(card);
    });
    group.appendChild(badge);
    group.appendChild(title);
    group.appendChild(row);
    els.timelineView.appendChild(group);
  });
}

function openPost(post, smooth = false) {
  state.activePost = post;
  renderPost();
  showDetail(smooth);
  return post;
}

function showDetail(smooth = false) {
  state.lastHomeScroll = window.scrollY;
  state.view = 'detail';
  els.homeView.classList.add('hidden');
  els.detailView.classList.remove('hidden');
  updateMapBackButton();
  if (smooth) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0 });
  }
}

function showHome(restore = true) {
  state.view = 'home';
  els.detailView.classList.add('hidden');
  els.homeView.classList.remove('hidden');
  els.mapBackBtn.classList.add('hidden');
  els.mapBackBtnBottom.classList.add('hidden');
  stopSlideshow();
  const target = restore ? state.lastHomeScroll || 0 : 0;
  window.scrollTo({ top: target, behavior: 'smooth' });
}

function renderPost() {
  const post = state.activePost;
  if (!post) return;
  els.postTitle.textContent = post.title;
  const locationText = `${post.location_city || ''} ${post.location_country || ''}`.trim();
  els.postDate.textContent = [post.date || '', locationText].filter(Boolean).join(' - ');
  els.postTags.innerHTML = '';
  (post.people || []).slice(0, 5).forEach((p) => {
    const tag = document.createElement('span');
    tag.className = 'tag person';
    tag.textContent = p;
    els.postTags.appendChild(tag);
  });
  (post.events || []).forEach((e) => {
    const tag = document.createElement('span');
    tag.className = 'tag event';
    tag.textContent = e;
    els.postTags.appendChild(tag);
  });

  els.postContent.innerHTML = '';
  post.content_blocks.forEach((block) => {
    if (block.type === 'text') {
      const div = document.createElement('div');
      div.className = 'text-block';
      div.textContent = block.content;
      els.postContent.appendChild(div);
    } else if (block.type === 'image') {
      const figure = document.createElement('figure');
      figure.className = 'image-block';
      const img = document.createElement('img');
      img.src = block.url;
      img.loading = 'lazy';
      img.alt = post.title;
      const shadow = document.createElement('div');
      shadow.className = 'shadow';
      figure.appendChild(img);
      figure.appendChild(shadow);
      els.postContent.appendChild(figure);
    }
  });

  updateBookmarkButton();
  updateMapBackButton();
  state.slideData = buildSlides(post);
  state.slideIndex = 0;
  buildDots();
  showSlide(0, true);
  els.slideshow.classList.toggle('hidden', !state.slideData.length);
}

function buildSlides(post) {
  const slides = [];
  let lastText = '';
  post.content_blocks.forEach((block) => {
    if (block.type === 'text') lastText = block.content;
    if (block.type === 'image') {
      slides.push({ url: block.url, caption: lastText || post.title });
    }
  });
  return slides;
}

function buildDots() {
  els.slideDots.innerHTML = '';
  state.slideData.forEach((_, idx) => {
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.addEventListener('click', () => showSlide(idx));
    els.slideDots.appendChild(dot);
  });
}

function showSlide(index, silent = false) {
  if (!state.slideData.length) {
    els.slideshow.classList.add('hidden');
    return;
  }
  const safeIndex = ((index % state.slideData.length) + state.slideData.length) % state.slideData.length;
  state.slideIndex = safeIndex;
  const slide = state.slideData[safeIndex];
  els.slideshowImage.src = slide.url;
  els.slideshowCaption.textContent = slide.caption;
  Array.from(els.slideDots.children).forEach((dot, idx) => {
    dot.classList.toggle('active', idx === safeIndex);
  });
  els.slideshow.classList.remove('hidden');
}

function openRandomPost(animate = false) {
  if (!state.filtered.length) return null;
  const post = state.filtered[Math.floor(Math.random() * state.filtered.length)];
  openPost(post, true);
  if (animate) {
    const detail = document.getElementById('postDetail');
    detail.classList.add('surprise');
    setTimeout(() => detail.classList.remove('surprise'), 1500);
  }
  return post;
}

function gradientPlaceholder(text = '') {
  const hue = Math.abs(hashCode(text)) % 360;
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'>
      <defs>
        <linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'>
          <stop offset='0%' stop-color='hsl(${hue},70%,55%)'/>
          <stop offset='100%' stop-color='hsl(${(hue + 40) % 360},70%,50%)'/>
        </linearGradient>
      </defs>
      <rect width='400' height='300' fill='url(%23g)'/>
    </svg>`
  )}`;
}

function parseQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  if (from === 'map') {
    const lat = params.get('lat');
    const lon = params.get('lon');
    const zoom = params.get('zoom');
    state.mapReturn = {
      lat: lat ? parseFloat(lat) : null,
      lon: lon ? parseFloat(lon) : null,
      zoom: zoom ? parseInt(zoom, 10) : null,
    };
  }
  const postParam = params.get('post');
  if (postParam) {
    state.pendingPostId = decodeURIComponent(postParam);
  }
}

function maybeOpenFromQuery() {
  if (!state.pendingPostId || !state.posts.length) return;
  const post = state.posts.find((p) => p.url === state.pendingPostId);
  if (post) {
    openPost(post, false);
  }
}

function findFirstImage(post) {
  const block = post.content_blocks.find((b) => b.type === 'image');
  return block?.url || '';
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
  state.filter = { search: '', year: 'all', persons: [], city: 'all', event: 'all', favoritesOnly: false };
  els.searchInput.value = '';
  els.yearFilter.value = 'all';
  els.cityFilter.value = 'all';
  els.eventFilter.value = 'all';
  Array.from(els.personFilter.options).forEach((opt) => (opt.selected = false));
  state.timelineMode = false;
  els.timelineToggle.checked = false;
  els.quickViewGrid.classList.remove('hidden');
  els.timelineView.classList.add('hidden');
  els.bookmarkFilter.textContent = 'Show favorites';
}

function loadBookmarks() {
  const raw = localStorage.getItem('memoryExplorer.bookmarks');
  if (raw) {
    try {
      state.bookmarks = new Set(JSON.parse(raw));
    } catch {
      state.bookmarks = new Set();
    }
  }
  renderBookmarks();
}

function persistBookmarks() {
  localStorage.setItem('memoryExplorer.bookmarks', JSON.stringify(Array.from(state.bookmarks)));
}

function toggleBookmark() {
  if (!state.activePost) return;
  const url = state.activePost.url;
  if (state.bookmarks.has(url)) {
    state.bookmarks.delete(url);
    showToast('Removed from favorites');
  } else {
    state.bookmarks.add(url);
    showToast('Saved to favorites');
  }
  persistBookmarks();
  updateBookmarkButton();
  renderBookmarks();
}

function renderBookmarks() {
  if (!state.bookmarks.size) {
    els.bookmarksList.textContent = 'No favorites yet';
    els.bookmarksList.classList.add('empty');
    return;
  }
  els.bookmarksList.classList.remove('empty');
  els.bookmarksList.innerHTML = '';
  const bookmarkedPosts = state.posts.filter((p) => state.bookmarks.has(p.url));
  bookmarkedPosts.slice(0, 15).forEach((post) => {
    const item = document.createElement('div');
    item.className = 'bookmark';
    item.innerHTML = `<div class="title">${post.title}</div><div class="meta">${post.date || ''} · ${
      post.location_city || ''
    }</div>`;
    item.addEventListener('click', () => openPost(post, true));
    els.bookmarksList.appendChild(item);
  });
}

function updateBookmarkButton() {
  if (!state.activePost) return;
  const isBookmarked = state.bookmarks.has(state.activePost.url);
  els.bookmarkBtn.textContent = isBookmarked ? 'Bookmarked' : 'Bookmark';
  els.bookmarkBtn.classList.toggle('primary', isBookmarked);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  requestAnimationFrame(() => {
    els.toast.classList.add('show');
  });
  setTimeout(() => {
    els.toast.classList.remove('show');
    setTimeout(() => els.toast.classList.add('hidden'), 260);
  }, 1800);
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function countUnique(arr) {
  return new Set(arr).size;
}

function updateMapBackButton() {
  if (state.mapReturn && state.view === 'detail') {
    els.mapBackBtn.classList.remove('hidden');
    els.mapBackBtnBottom.classList.remove('hidden');
  } else {
    els.mapBackBtn.classList.add('hidden');
    els.mapBackBtnBottom.classList.add('hidden');
  }
}

function toggleLoadMore() {
  if (state.filtered.length > state.quickViewLimit) {
    els.loadMore.classList.remove('hidden');
  } else {
    els.loadMore.classList.add('hidden');
  }
}

const SECRETS_PATH = './secrets.json';

const state = {
  posts: [],
  yearPosts: [],
  year: null,
  openAIKey: '',
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  els.recapYear = document.getElementById('recapYear');
  els.imageCount = document.getElementById('imageCount');
  els.useArchive = document.getElementById('useArchive');
  els.generateRecap = document.getElementById('generateRecap');
  els.clearRecap = document.getElementById('clearRecap');
  els.recapStatus = document.getElementById('recapStatus');
  els.recapHint = document.getElementById('recapHint');
  els.yearPostCount = document.getElementById('yearPostCount');
  els.yearImageCount = document.getElementById('yearImageCount');
  els.yearPeopleCount = document.getElementById('yearPeopleCount');
  els.recapOutput = document.getElementById('recapOutput');
  els.recapEmpty = document.getElementById('recapEmpty');
  els.recapDate = document.getElementById('recapDate');
  els.recapTitle = document.getElementById('recapTitle');
  els.recapTags = document.getElementById('recapTags');
  els.recapContent = document.getElementById('recapContent');

  init();
});

async function init() {
  loadOpenAIKey();
  bindEvents();
  await loadPosts();
  hydrateYears();
  updateYearContext();
}

function bindEvents() {
  els.recapYear.addEventListener('change', updateYearContext);
  els.generateRecap.addEventListener('click', generateRecap);
  els.clearRecap.addEventListener('click', clearRecap);
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
  } catch (err) {
    console.error(err);
    setStatus('Failed to load posts_full.json', true);
  }
}

function hydrateYears() {
  const years = new Set();
  state.posts.forEach((post) => {
    const [year] = (post.date || '').split('-');
    if (year) years.add(year);
  });
  const sorted = Array.from(years).sort((a, b) => b.localeCompare(a));
  els.recapYear.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select year';
  els.recapYear.appendChild(placeholder);
  sorted.forEach((year) => {
    const opt = document.createElement('option');
    opt.value = year;
    opt.textContent = year;
    els.recapYear.appendChild(opt);
  });
}

function updateYearContext() {
  const year = els.recapYear.value;
  state.year = year;
  state.yearPosts = year
    ? state.posts.filter((post) => (post.date || '').startsWith(year))
    : [];

  const imageCandidates = buildImageCandidates(state.yearPosts);
  const people = new Set();
  state.yearPosts.forEach((post) => (post.people || []).forEach((p) => people.add(p)));

  els.yearPostCount.textContent = state.yearPosts.length.toLocaleString();
  els.yearImageCount.textContent = imageCandidates.length.toLocaleString();
  els.yearPeopleCount.textContent = people.size.toLocaleString();

  if (!year) {
    els.recapHint.textContent = 'Select a year to begin.';
    return;
  }

  els.recapHint.textContent = state.yearPosts.length
    ? `Loaded ${state.yearPosts.length} posts for ${year}.`
    : `No posts found for ${year}.`;
}

function setStatus(message, isError = false) {
  if (!els.recapStatus) return;
  els.recapStatus.textContent = message || '';
  els.recapStatus.classList.toggle('error', isError);
}

function setLoading(isLoading) {
  els.generateRecap.disabled = isLoading;
  els.generateRecap.textContent = isLoading ? 'Generating...' : 'Generate recap';
}

function clearRecap() {
  els.recapContent.innerHTML = '';
  els.recapOutput.classList.add('hidden');
  els.recapEmpty.classList.remove('hidden');
  els.recapTitle.textContent = 'Yearly Recap';
  els.recapDate.textContent = '';
  els.recapTags.innerHTML = '';
  setStatus('');
}

function loadOpenAIKey() {
  if (state.openAIKey) return;
  fetch(SECRETS_PATH)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const key = data?.openai_api_key || data?.openaiKey || '';
      if (key) {
        state.openAIKey = key;
        localStorage.setItem('memoryExplorer.openaiKey', key);
      }
    })
    .catch(() => {
      /* ignore */
    });
}

function getOpenAIKey() {
  return (
    state.openAIKey ||
    window.OPENAI_API_KEY ||
    localStorage.getItem('memoryExplorer.openaiKey') ||
    ''
  );
}

function buildImageCandidates(posts) {
  const seen = new Set();
  const items = [];
  const sortedPosts = [...posts].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  sortedPosts.forEach((post) => {
    let lastText = '';
    (post.content_blocks || []).forEach((block) => {
      if (block.type === 'text') lastText = block.content || '';
      if (block.type === 'image' && block.url && !seen.has(block.url)) {
        seen.add(block.url);
        items.push({
          url: block.url,
          hint: lastText || post.title || 'Family photo',
          title: post.title,
          date: post.date,
        });
      }
    });
  });
  return items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function pickEvenly(items, count) {
  if (items.length <= count) return items;
  if (count <= 1) return [items[0]];
  const step = (items.length - 1) / (count - 1);
  const picked = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.round(i * step);
    picked.push(items[idx]);
  }
  return picked;
}

function clampNumber(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function buildStyleSamples(posts, maxChars) {
  let text = '';
  for (const post of posts) {
    for (const block of post.content_blocks || []) {
      if (block.type !== 'text') continue;
      const snippet = block.content?.trim();
      if (!snippet) continue;
      if (text.length + snippet.length + 2 > maxChars) return text.trim();
      text += `${snippet}\n`;
    }
  }
  return text.trim();
}

function buildPostSummary(posts, maxChars) {
  const lines = [];
  let total = 0;
  let truncated = false;
  for (const post of posts) {
    const people = (post.people || []).slice(0, 6).join(', ');
    const events = (post.events || []).slice(0, 4).join(', ');
    const place = [post.location_city, post.location_country].filter(Boolean).join(', ');
    const meta = [
      post.title || 'Untitled',
      place ? `Location: ${place}` : null,
      people ? `People: ${people}` : null,
      events ? `Events: ${events}` : null,
    ]
      .filter(Boolean)
      .join(' | ');
    const line = `- ${post.date || 'Unknown date'} | ${meta}`.trim();
    if (total + line.length + 1 > maxChars) {
      truncated = true;
      break;
    }
    lines.push(line);
    total += line.length + 1;
  }
  return { text: lines.join('\n'), truncated };
}

function buildTagRow(posts) {
  const peopleCount = new Map();
  const eventCount = new Map();
  posts.forEach((post) => {
    (post.people || []).forEach((p) => peopleCount.set(p, (peopleCount.get(p) || 0) + 1));
    (post.events || []).forEach((e) => eventCount.set(e, (eventCount.get(e) || 0) + 1));
  });
  const topPeople = Array.from(peopleCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([p]) => ({ type: 'person', label: p }));
  const topEvents = Array.from(eventCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => ({ type: 'event', label: e }));
  return [...topPeople, ...topEvents];
}

async function generateRecap() {
  const year = state.year;
  if (!year) {
    setStatus('Pick a year to generate a recap.', true);
    return;
  }
  if (!state.yearPosts.length) {
    setStatus('No posts found for that year.', true);
    return;
  }
  const key = getOpenAIKey();
  if (!key) {
    setStatus('Add your OpenAI API key in secrets.json or localStorage as memoryExplorer.openaiKey.', true);
    return;
  }

  const images = buildImageCandidates(state.yearPosts);
  if (!images.length) {
    setStatus('No photos found for that year.', true);
    return;
  }

  const imageTarget = clampNumber(els.imageCount.value, 3, 20, 8);
  const pickedImages = pickEvenly(images, Math.min(images.length, imageTarget));
  const imagePayload = pickedImages.map((img, idx) => ({
    id: `img${idx + 1}`,
    url: img.url,
    hint: img.hint,
    source: `${img.date || 'Unknown date'} | ${img.title || 'Untitled'}`,
  }));

  const useArchive = els.useArchive.checked;
  const yearSummary = buildPostSummary(state.yearPosts, 18000);
  const archiveSummary = useArchive ? buildPostSummary(state.posts, 26000) : null;
  const styleSamples = buildStyleSamples(state.yearPosts, 1200);

  setLoading(true);
  setStatus('Generating recap...');

  try {
    const recap = await callOpenAIForRecap({
      key,
      year,
      imagePayload,
      yearSummary,
      archiveSummary,
      styleSamples,
      expectedBlocks: pickedImages.length * 2,
    });
    renderRecap(recap, { year, images: imagePayload, posts: state.yearPosts });
    setStatus('Yearly recap ready.');
  } catch (err) {
    console.error(err);
    setStatus('Recap failed. Showing a simple fallback.', true);
    const fallback = buildFallbackRecap({ year, images: pickedImages });
    renderRecap(fallback, { year, images: imagePayload, posts: state.yearPosts });
  }

  setLoading(false);
}

async function callOpenAIForRecap({
  key,
  year,
  imagePayload,
  yearSummary,
  archiveSummary,
  styleSamples,
  expectedBlocks
}) {
  // Make image ids easy to reference (and stable)
  // If your imagePayload already includes unique ids, keep them.
  // Otherwise, add them here once.
  const images = (imagePayload || []).map((img, idx) => ({
    id: img.id ?? `img_${idx + 1}`,
    ...img,
  }));

  const system = `
You are a ghostwriter + editor for a family blog yearly recap.
Write warm, grounded prose with strong narrative flow, but keep it simple and matter-of-fact.
Do NOT copy sentences from the source posts or style samples. Do NOT reuse any phrase longer than 6 words from the sources.
Never invent names, places, dates, or events not supported by the provided content.
Return VALID JSON only that matches the requested schema exactly.
`.trim();

  // IMPORTANT: This is where we fix the behavior.
  // - Make it a "story of the year" with transitions
  // - Still enforce that each text block matches the image that follows
  // - Require visual grounding from the image metadata so alignment is strong
  const userPayload = {
    year,
    expectedBlocks,
    schema: {
      blocks: [
        // exactly expectedBlocks items
        // alternating types: text, image, text, image...
        // image uses id from images[]
        // text references next image_id
      ]
    },
    instructions: `
Create a YEAR-IN-REVIEW that reads like one cohesive story, not a list of captions.
Aim for a clear beginning, middle, and closing reflection so the year feels like a journey.
Use plain language in the same casual tone as the blog posts; avoid poetic or embellished phrases.
Prefer short, factual sentences that sound like a personal recap rather than a polished essay.
Output exactly ${expectedBlocks} blocks alternating:
  1) text block
  2) image block
  ... repeating until done.

Hard rules:
- Each image may be used at most once.
- Every TEXT block MUST be written to pair with the IMAGE block that immediately follows it.
- Every TEXT block must include "image_id" field pointing to the next image's id.
- No quotes from the posts or style samples. Paraphrase everything. No phrase > 6 words matching the sources.
- Do not invent facts. If something is unclear, stay general.

Narrative flow rules (this is the key change):
- The recap must feel like a continuous story across the whole year.
- Each text block must:
  (a) open with a short transition that connects from the previous moment (even in block 1, set the tone),
  (b) describe what’s happening in the paired photo (grounded in the image metadata),
  (c) add 1–2 sentences of context tying it into the broader year (themes, seasons, milestones),
  (d) end with a gentle “bridge” line that tees up the next moment.

Image matching rules:
- Choose images in chronological order across the year. Cover early/mid/late and different themes when possible.
- The text must clearly match the chosen image: mention the people/place/activity/tone implied by that image’s metadata.
- If an image has a date/location/caption, use those facts (paraphrased) to anchor the text.

Output JSON format (STRICT):
{
  "year": ${JSON.stringify(year)},
  "blocks": [
    {
      "type": "text",
      "image_id": "img_1",
      "content": "..."
    },
    {
      "type": "image",
      "image_id": "img_1"
    }
    // ... continue alternating until exactly ${expectedBlocks} blocks total
  ]
}

Notes:
- "image_id" in a text block MUST equal the "image_id" of the image block that follows.
- Do not include any extra keys. Do not include markdown.
`.trim(),
    style_samples: styleSamples,
    // If your yearSummary is big / raw, you’ll get more copying.
    // Ideally yearSummary.text is already “notes”; if not, consider truncating or pre-processing.
    year_posts: yearSummary?.text ?? "",
    archive_context: archiveSummary?.text || null,
    images
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        // Keeping your JSON-in-JSON approach, but with much better instructions.
        { role: "user", content: JSON.stringify(userPayload) }
      ],
      // Slightly lower temp improves faithfulness + reduces “copying”
      temperature: 0.7,
      // Optional, but helps avoid rambling and keeps block sizes sane
      max_tokens: 2500,
      // Optional knobs that often help reduce repetitive phrasing
      presence_penalty: 0.4,
      frequency_penalty: 0.3
    })
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI response missing content");

  const parsed = JSON.parse(content);
  const normalized = normalizeRecap(parsed, { expectedBlocks, images });
  if (normalized.warnings.length) {
    console.warn('Recap normalization warnings:', normalized.warnings);
  }
  return normalized.recap;
}

function normalizeRecap(parsed, { expectedBlocks, images }) {
  const warnings = [];
  const inputBlocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
  if (!Array.isArray(parsed?.blocks)) warnings.push('Missing blocks array; rebuilding from images.');

  const imageIds = new Set(images.map((img) => img.id));
  const normalized = [];

  inputBlocks.forEach((block) => {
    if (!block || !block.type) return;
    if (block.type === 'text') {
      const content = (block.content || block.text || '').trim();
      if (!content) return;
      normalized.push({
        type: 'text',
        image_id: block.image_id || null,
        content,
      });
    } else if (block.type === 'image') {
      if (block.image_id && imageIds.has(block.image_id)) {
        normalized.push({ type: 'image', image_id: block.image_id });
      }
    }
  });

  const textBlocks = normalized.filter((b) => b.type === 'text');
  const imagePool = images.map((img) => img.id);

  const targetPairs = Math.min(Math.floor(expectedBlocks / 2), imagePool.length);
  const blocks = [];
  for (let i = 0; i < targetPairs; i += 1) {
    const imageId = imagePool[i];
    const textBlock = textBlocks[i];
    const fallback =
      images.find((img) => img.id === imageId)?.hint || 'A favorite moment from the year.';
    blocks.push({
      type: 'text',
      image_id: imageId,
      content: (textBlock?.content || fallback).trim(),
    });
    blocks.push({ type: 'image', image_id: imageId });
  }

  if (blocks.length !== expectedBlocks) {
    warnings.push(`Normalized to ${blocks.length} blocks (expected ${expectedBlocks}).`);
  }

  return {
    recap: {
      ...parsed,
      blocks,
    },
    warnings,
  };
}

function renderRecap(recap, { year, images, posts }) {
  const imageMap = new Map(images.map((img) => [img.id, img.url]));
  const blocks = Array.isArray(recap?.blocks) ? recap.blocks : [];

  els.recapTitle.textContent = recap?.title || `Yearly Recap ${year}`;
  els.recapDate.textContent = `Year ${year}`;
  els.recapTags.innerHTML = '';
  buildTagRow(posts).forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = `tag ${tag.type}`;
    chip.textContent = tag.label;
    els.recapTags.appendChild(chip);
  });

  els.recapContent.innerHTML = '';
  let added = 0;
  blocks.forEach((block) => {
    const text = block.content || block.text;
    if (block.type === 'text' && text) {
      const div = document.createElement('div');
      div.className = 'text-block';
      div.textContent = text.trim();
      els.recapContent.appendChild(div);
      added += 1;
      return;
    }
    if (block.type === 'image') {
      const url = block.url || imageMap.get(block.image_id);
      if (!url) return;
      const figure = document.createElement('figure');
      figure.className = 'image-block';
      const img = document.createElement('img');
      img.src = url;
      img.loading = 'lazy';
      img.alt = block.caption || block.alt || recap?.title || 'Recap photo';
      const shadow = document.createElement('div');
      shadow.className = 'shadow';
      figure.appendChild(img);
      figure.appendChild(shadow);
      els.recapContent.appendChild(figure);
      added += 1;
    }
  });

  if (!added && images.length) {
    const fallback = buildFallbackRecap({ year, images });
    renderRecap(fallback, { year, images, posts });
    return;
  }

  els.recapEmpty.classList.add('hidden');
  els.recapOutput.classList.remove('hidden');
}

function buildFallbackRecap({ year, images }) {
  const blocks = [];
  images.forEach((img) => {
    const text = img.hint || 'A favorite moment from the year.';
    blocks.push({ type: 'text', content: text });
    blocks.push({ type: 'image', url: img.url, caption: text });
  });
  return {
    title: `Yearly Recap ${year}`,
    blocks,
  };
}

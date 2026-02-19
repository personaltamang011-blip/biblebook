// script.js - Mobile-first Book Reader with books-index.json + lazy loading
const INDEX_FILE = "books-index.json";
const booksGrid = document.getElementById("booksGrid");
const booksListSmall = document.getElementById("booksListSmall");
const titleEl = document.getElementById("title");
const backBtn = document.getElementById("backBtn");
const menuBtn = document.getElementById("menuBtn");
const drawer = document.getElementById("drawer");
const overlay = document.getElementById("overlay");
const searchInput = document.getElementById("searchInput");
const main = document.getElementById("main");

let booksIndex = [];               // array from books-index.json
let bookCache = {};                // loaded book data keyed by book.id
let currentBookId = null;
let currentChapter = null;

// --- helpers ---
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function q(sel) { return document.querySelector(sel); }
function setTitle(txt) { titleEl.textContent = txt; }

// --- UI state helpers ---
function showDrawer(show = true) {
  drawer.classList.toggle("hidden", !show);
  overlay.classList.toggle("hidden", !show);
}
overlay.addEventListener("click", () => showDrawer(false));
menuBtn.addEventListener("click", () => showDrawer(true));
backBtn.addEventListener("click", () => {
  // if verse view open, go back to chapters; if chapters open, go back to books
  if (currentChapter !== null) {
    openBook(currentBookId, { showChaptersOnly: true });
  } else {
    showBooks();
  }
});

// --- load index and render books ---
async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}

async function loadIndex() {
  try {
    booksIndex = await fetchJson(INDEX_FILE);
    renderBooksGrid(booksIndex);
    renderBooksSmallList(booksIndex);
    handleDeepLink(); // if url has hash like #book=1&chapter=2
  } catch (err) {
    booksGrid.innerHTML = `<div class="item">Error loading index: ${err.message}</div>`;
  }
}

function renderBooksGrid(list) {
  booksGrid.innerHTML = "";
  list.forEach(b => {
    const card = el("div", "book-card");
    const title = el("div", "book-title", `${b.id}. ${b.name}`);
    const sub = el("div", "book-sub", `Tap to open`);
    card.appendChild(title);
    card.appendChild(sub);
    card.addEventListener("click", () => openBook(b.id));
    booksGrid.appendChild(card);
  });
}

// small list in drawer
function renderBooksSmallList(list) {
  booksListSmall.innerHTML = "";
  list.forEach(b => {
    const it = el("div", "item", `${b.id}. ${b.name}`);
    it.addEventListener("click", () => { showDrawer(false); openBook(b.id); });
    booksListSmall.appendChild(it);
  });
}

// --- open a book (single-touch) ---
async function openBook(bookId, options = {}) {
  currentBookId = Number(bookId);
  setTitle("Loading...");

  // mark back button visible (we are not on list)
  backBtn.classList.remove("hidden");

  try {
    // load from cache if present
    let book = bookCache[currentBookId];
    if (!book) {
      const meta = booksIndex.find(b => b.id === Number(bookId));
      if (!meta) throw new Error("Book meta not found");
      book = await fetchJson(meta.file);
      bookCache[currentBookId] = book;
      // optionally persist small cache in localStorage:
      // localStorage.setItem(`book_${book.id}`, JSON.stringify(book));
    }

    // render chapters view (default)
    renderChaptersView(book);

    // if options.showChaptersOnly => just show chapters; else check deep link or open chapter 1 by default?
    if (options.chapter) {
      openChapter(book.id, Number(options.chapter));
    } else if (options.showChaptersOnly) {
      // do nothing
    } else {
      // single-touch behavior: open first chapter automatically for faster reading like a bible app
      // If you prefer to show chapters instead, comment out the next line.
      openChapter(book.id, book.chapters[0]?.number ?? 1);
    }
  } catch (err) {
    setTitle("Books");
    alert("Failed to open book: " + err.message);
    showBooks();
  }
}

function showBooks() {
  // Reset UI to home
  currentBookId = null;
  currentChapter = null;
  setTitle("Books");
  backBtn.classList.add("hidden");
  main.className = "page books-page";
  // show grid (already in DOM)
}

// --- Chapters view rendering ---
function renderChaptersView(book) {
  main.className = "page chapters-page";
  setTitle(book.name);
  // create header & chapters container
  const container = el("div", "panel");
  const heading = el("div", "", "");
  heading.innerHTML = `<h2 style="margin:0">${book.name}</h2><div style="color:var(--muted);font-size:13px">${book.chapters.length} chapters</div>`;
  container.appendChild(heading);

  const chaptersWrap = el("div", "chapters-list");
  book.chapters.forEach(ch => {
    const btn = el("button", "chapter-btn", ch.number);
    btn.addEventListener("click", () => openChapter(book.id, ch.number));
    btn.dataset.chapter = ch.number;
    chaptersWrap.appendChild(btn);
  });

  // replace main content
  main.innerHTML = "";
  main.appendChild(container);
  main.appendChild(chaptersWrap);
}

// --- Open Chapter: display verses ---
function openChapter(bookId, chapterNumber) {
  const book = bookCache[bookId];
  if (!book) return;
  currentChapter = Number(chapterNumber);
  setTitle(`${book.name} — ${currentChapter}`);
  main.className = "page verses-page";

  const ch = book.chapters.find(c => c.number === Number(chapterNumber));
  if (!ch) {
    main.innerHTML = `<div style="padding:16px">Chapter not found.</div>`;
    return;
  }

  // header: back to chapters quick button
  const header = el("div", "chap-header");
  header.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong>Chapter ${ch.number}</strong><small style="color:var(--muted)">${ch.verses.length} verses</small></div>`;

  // verses container
  const versesWrap = el("div", "verses-wrap");
  ch.verses.forEach((t, idx) => {
    const v = el("div", "verse");
    v.innerHTML = `<div class="num">${idx+1}</div><div class="text">${escapeHtml(t)}</div>`;
    versesWrap.appendChild(v);
  });

  main.innerHTML = "";
  main.appendChild(header);
  main.appendChild(versesWrap);

  // update URL hash for deep linking
  updateHash({ book: bookId, chapter: chapterNumber });
}

// --- search (basic) ---
searchInput.addEventListener("input", (e) => {
  const q = (e.target.value || "").trim().toLowerCase();
  if (!q) {
    renderBooksGrid(booksIndex);
    return;
  }
  // simple search: match name or verses (if loaded)
  const filtered = booksIndex.filter(b => {
    if (b.name.toLowerCase().includes(q)) return true;
    const cached = bookCache[b.id];
    if (cached && cached.chapters.some(ch => ch.verses.some(v => v.toLowerCase().includes(q)))) return true;
    return false;
  });
  renderBooksGrid(filtered);
});

// --- deep link logic: parse and update hash ---
function parseHash() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return {};
  const pairs = hash.split("&").map(p => p.split("="));
  const result = {};
  pairs.forEach(([k,v]) => { if (k) result[k] = decodeURIComponent(v); });
  return result;
}
function updateHash(params) {
  const parts = [];
  if (params.book) parts.push(`book=${params.book}`);
  if (params.chapter) parts.push(`chapter=${params.chapter}`);
  const h = parts.join("&");
  history.replaceState(null, "", h ? `#${h}` : " ");
}
async function handleDeepLink() {
  const h = parseHash();
  if (h.book) {
    await openBook(h.book, { chapter: h.chapter });
  }
}

// small escape for verse text
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c])); }

// --- init ---
loadInitial();

async function loadInitial() {
  await loadIndex();
  showBooks();
}

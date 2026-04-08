import { useState, useEffect, useRef } from "react";

// ── Firebase config placeholder (user fills this in) ──────────────────────────
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Google Books search ────────────────────────────────────────────────────────
async function searchGoogleBooks(query) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8`
    );
    if (!res.ok) throw new Error("Error de red");
    const data = await res.json();
    if (!data.items) return [];
    return data.items.map((item) => {
      const info = item.volumeInfo;
      return {
        googleId: item.id,
        title: info.title || "Sin título",
        author: (info.authors || ["Autor desconocido"]).join(", "),
        genre: (info.categories || ["Sin categoría"])[0],
        cover: info.imageLinks?.thumbnail?.replace("http://", "https://") || null,
        description: info.description || "",
        year: info.publishedDate?.slice(0, 4) || "",
        pages: info.pageCount || null,
      };
    });
  } catch (e) {
    console.error("Google Books error:", e);
    return [];
  }
}

async function searchByISBN(isbn) {
  return searchGoogleBooks(`isbn:${isbn}`);
}

// ── Genre color map ────────────────────────────────────────────────────────────
const genreColors = {
  "Fiction": "#C8A96E",
  "Ficción": "#C8A96E",
  "Novela": "#C8A96E",
  "Fantasy": "#7B9E87",
  "Fantasía": "#7B9E87",
  "Science Fiction": "#6B8CAE",
  "Ciencia ficción": "#6B8CAE",
  "Mystery": "#9B7B9E",
  "Misterio": "#9B7B9E",
  "Romance": "#C47B8A",
  "History": "#B8936A",
  "Historia": "#B8936A",
  "Biography": "#8A9E7B",
  "Biografía": "#8A9E7B",
  "Self-Help": "#9E8A6B",
  "Autoayuda": "#9E8A6B",
  "Children": "#C4A35A",
  "Infantil": "#C4A35A",
  "Sin categoría": "#888",
};
function genreColor(genre) {
  for (const key of Object.keys(genreColors)) {
    if (genre?.toLowerCase().includes(key.toLowerCase())) return genreColors[key];
  }
  return "#888";
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("library"); // library | add | bookshelves | search
  const [books, setBooks] = useState([]);
  const [bookshelves, setBookshelves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load from Firebase
  useEffect(() => {
    async function load() {
      try {
        const bSnap = await getDocs(collection(db, "books"));
        setBooks(bSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const shSnap = await getDocs(collection(db, "bookshelves"));
        setBookshelves(shSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        showToast("Error conectando con Firebase. Verifica tu configuración.", "error");
      }
      setLoading(false);
    }
    load();
  }, []);

  const addBook = async (book) => {
    const docRef = await addDoc(collection(db, "books"), book);
    setBooks((prev) => [...prev, { id: docRef.id, ...book }]);
    showToast(`"${book.title}" agregado a tu biblioteca 📚`);
  };

  const deleteBook = async (id) => {
    await deleteDoc(doc(db, "books", id));
    setBooks((prev) => prev.filter((b) => b.id !== id));
    showToast("Libro eliminado");
  };

  const addBookshelf = async (shelf) => {
    const docRef = await addDoc(collection(db, "bookshelves"), shelf);
    setBookshelves((prev) => [...prev, { id: docRef.id, ...shelf }]);
    showToast(`Librero "${shelf.name}" creado 🗄️`);
  };

  const updateBookshelf = async (id, data) => {
    await updateDoc(doc(db, "bookshelves", id), data);
    setBookshelves((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
  };

  const assignBookToShelf = async (bookId, shelfId) => {
    await updateDoc(doc(db, "books", bookId), { shelfId });
    setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, shelfId } : b)));
    showToast("Libro asignado al librero ✓");
  };

  if (loading) return <Loader />;

  return (
    <div className="app">
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <Header view={view} setView={setView} bookCount={books.length} />
      <main className="main">
        {view === "library" && (
          <LibraryView books={books} bookshelves={bookshelves} deleteBook={deleteBook} assignBookToShelf={assignBookToShelf} />
        )}
        {view === "add" && <AddBookView addBook={addBook} setView={setView} />}
        {view === "bookshelves" && (
          <BookshelvesView
            bookshelves={bookshelves}
            books={books}
            addBookshelf={addBookshelf}
            updateBookshelf={updateBookshelf}
          />
        )}
        {view === "search" && <SearchView books={books} bookshelves={bookshelves} />}
      </main>
    </div>
  );
}

// ── Loader ─────────────────────────────────────────────────────────────────────
function Loader() {
  return (
    <div className="loader-screen">
      <div className="loader-spine" />
      <p>Cargando tu biblioteca…</p>
    </div>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({ msg, type }) {
  return <div className={`toast toast-${type}`}>{msg}</div>;
}

// ── Header ─────────────────────────────────────────────────────────────────────
function Header({ view, setView, bookCount }) {
  const tabs = [
    { id: "library", label: "Biblioteca", icon: "📚" },
    { id: "search", label: "Buscar", icon: "🔍" },
    { id: "bookshelves", label: "Libreros", icon: "🗄️" },
    { id: "add", label: "Agregar", icon: "＋" },
  ];
  return (
    <header className="header">
      <div className="header-top">
        <div className="header-brand">
          <span className="brand-icon">📖</span>
          <div>
            <h1 className="brand-title">Mi Biblioteca</h1>
            <span className="brand-sub">{bookCount} libro{bookCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>
      <nav className="nav">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`nav-btn ${view === t.id ? "active" : ""}`}
            onClick={() => setView(t.id)}
          >
            <span className="nav-icon">{t.icon}</span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}

// ── Library View ───────────────────────────────────────────────────────────────
function LibraryView({ books, bookshelves, deleteBook, assignBookToShelf }) {
  const [activeGenre, setActiveGenre] = useState("Todos");
  const genres = ["Todos", ...Array.from(new Set(books.map((b) => b.genre || "Sin categoría")))];
  const filtered = activeGenre === "Todos" ? books : books.filter((b) => (b.genre || "Sin categoría") === activeGenre);

  const grouped = filtered.reduce((acc, book) => {
    const g = book.genre || "Sin categoría";
    if (!acc[g]) acc[g] = [];
    acc[g].push(book);
    return acc;
  }, {});

  return (
    <div className="library-view">
      <div className="genre-pills">
        {genres.map((g) => (
          <button
            key={g}
            className={`genre-pill ${activeGenre === g ? "active" : ""}`}
            style={activeGenre === g ? { background: genreColor(g), borderColor: genreColor(g) } : {}}
            onClick={() => setActiveGenre(g)}
          >
            {g}
          </button>
        ))}
      </div>
      {Object.keys(grouped).length === 0 && (
        <div className="empty-state">
          <p className="empty-icon">📭</p>
          <p>Tu biblioteca está vacía</p>
          <p className="empty-sub">Agrega tu primer libro desde la pestaña ＋</p>
        </div>
      )}
      {Object.entries(grouped).map(([genre, gBooks]) => (
        <section key={genre} className="genre-section">
          <div className="genre-header" style={{ borderColor: genreColor(genre) }}>
            <span className="genre-dot" style={{ background: genreColor(genre) }} />
            <h2 className="genre-title">{genre}</h2>
            <span className="genre-count">{gBooks.length}</span>
          </div>
          <div className="books-grid">
            {gBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                bookshelves={bookshelves}
                deleteBook={deleteBook}
                assignBookToShelf={assignBookToShelf}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Book Card ──────────────────────────────────────────────────────────────────
function BookCard({ book, bookshelves, deleteBook, assignBookToShelf }) {
  const [expanded, setExpanded] = useState(false);
  const shelf = bookshelves.find((s) => s.id === book.shelfId);

  return (
    <div className="book-card" onClick={() => setExpanded((e) => !e)}>
      <div className="book-cover-wrap">
        {book.cover ? (
          <img src={book.cover} alt={book.title} className="book-cover" />
        ) : (
          <div className="book-cover-placeholder" style={{ background: genreColor(book.genre) }}>
            <span>{book.title?.slice(0, 2).toUpperCase()}</span>
          </div>
        )}
        <div className="book-spine" style={{ background: genreColor(book.genre) }} />
      </div>
      <div className="book-info">
        <p className="book-title">{book.title}</p>
        <p className="book-author">{book.author}</p>
        {shelf && <p className="book-shelf-tag">📍 {shelf.name}</p>}
      </div>
      {expanded && (
        <div className="book-expanded" onClick={(e) => e.stopPropagation()}>
          {book.description && <p className="book-desc">{book.description.slice(0, 180)}…</p>}
          <div className="book-meta">
            {book.year && <span>📅 {book.year}</span>}
            {book.pages && <span>📄 {book.pages} págs</span>}
          </div>
          <div className="book-actions">
            <select
              className="shelf-select"
              value={book.shelfId || ""}
              onChange={(e) => assignBookToShelf(book.id, e.target.value)}
            >
              <option value="">Sin librero</option>
              {bookshelves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn-delete" onClick={() => deleteBook(book.id)}>
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Book View ──────────────────────────────────────────────────────────────
function AddBookView({ addBook, setView }) {
  const [mode, setMode] = useState("search"); // search | scan
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [added, setAdded] = useState(new Set());
  const [scanError, setScanError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);

  // Cleanup camera on unmount or mode change
  useEffect(() => {
    return () => stopCamera();
  }, []);

  const stopCamera = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startScanner = async () => {
    setScanError(null);
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        scanFrame();
      }
    } catch (e) {
      setScanError("No se pudo acceder a la cámara. Usa la búsqueda manual.");
      setScanning(false);
    }
  };

  const scanFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    // Use BarcodeDetector API (available in Chrome/Safari on phones)
    if ("BarcodeDetector" in window) {
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "isbn"] });
      detector.detect(canvas).then(async (barcodes) => {
        if (barcodes.length > 0) {
          const isbn = barcodes[0].rawValue;
          stopCamera();
          setScanning(false);
          setSearching(true);
          const found = await searchByISBN(isbn);
          setResults(found);
          setSearching(false);
          if (found.length === 0) setScanError(`ISBN ${isbn} no encontrado. Intenta buscar manualmente.`);
        } else {
          animFrameRef.current = requestAnimationFrame(scanFrame);
        }
      }).catch(() => {
        animFrameRef.current = requestAnimationFrame(scanFrame);
      });
    } else {
      stopCamera();
      setScanning(false);
      setScanError("Tu navegador no soporta el escáner. Usa Chrome en tu teléfono, o busca manualmente.");
    }
  };

  const switchMode = (m) => {
    stopCamera();
    setScanning(false);
    setScanError(null);
    setResults([]);
    setMode(m);
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    const res = await searchGoogleBooks(query);
    setResults(res);
    setSearching(false);
    if (res.length === 0) setScanError("No se encontraron resultados. Intenta con otro término.");
    else setScanError(null);
  };

  const handleAdd = async (book) => {
    await addBook(book);
    setAdded((prev) => new Set([...prev, book.googleId]));
  };

  return (
    <div className="add-view">
      <h2 className="section-title">Agregar libro</h2>

      {/* Mode tabs */}
      <div className="mode-tabs">
        <button className={`mode-tab ${mode === "scan" ? "active" : ""}`} onClick={() => switchMode("scan")}>
          📷 Escanear código
        </button>
        <button className={`mode-tab ${mode === "search" ? "active" : ""}`} onClick={() => switchMode("search")}>
          🔍 Buscar título
        </button>
      </div>

      {/* Scanner mode */}
      {mode === "scan" && (
        <div className="scanner-wrap">
          {!scanning && !searching && (
            <button className="btn-scan-start" onClick={startScanner}>
              📷 Abrir cámara
            </button>
          )}
          {scanning && (
            <div className="scanner-view">
              <video ref={videoRef} className="scanner-video" playsInline muted />
              <div className="scanner-overlay">
                <div className="scanner-frame" />
                <p className="scanner-hint">Apunta al código de barras del libro</p>
              </div>
              <button className="btn-cancel-scan" onClick={() => { stopCamera(); setScanning(false); }}>
                Cancelar
              </button>
            </div>
          )}
          {searching && <p className="scanning-msg">🔍 Buscando libro…</p>}
          {scanError && <p className="scan-error">{scanError}</p>}
        </div>
      )}

      {/* Search mode */}
      {mode === "search" && (
        <div className="search-bar">
          <input
            className="search-input"
            placeholder="Ej: Cien años de soledad"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            autoFocus
          />
          <button className="btn-search" onClick={search} disabled={searching}>
            {searching ? "…" : "Buscar"}
          </button>
        </div>
      )}

      {scanError && mode === "search" && <p className="scan-error">{scanError}</p>}

      {/* Results */}
      <div className="results-list">
        {results.map((book) => (
          <div key={book.googleId} className="result-item">
            {book.cover ? (
              <img src={book.cover} alt={book.title} className="result-cover" />
            ) : (
              <div className="result-cover-ph" style={{ background: genreColor(book.genre) }}>
                {book.title?.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="result-info">
              <p className="result-title">{book.title}</p>
              <p className="result-author">{book.author}</p>
              <p className="result-genre" style={{ color: genreColor(book.genre) }}>
                {book.genre}
              </p>
            </div>
            <button
              className={`btn-add ${added.has(book.googleId) ? "added" : ""}`}
              onClick={() => handleAdd(book)}
              disabled={added.has(book.googleId)}
            >
              {added.has(book.googleId) ? "✓" : "＋"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bookshelves View ───────────────────────────────────────────────────────────
function BookshelvesView({ bookshelves, books, addBookshelf, updateBookshelf }) {
  const [newName, setNewName] = useState("");
  const [uploading, setUploading] = useState(null);
  const fileRefs = useRef({});

  const create = async () => {
    if (!newName.trim()) return;
    await addBookshelf({ name: newName.trim(), photo: null });
    setNewName("");
  };

  const handlePhoto = async (shelfId, file) => {
    setUploading(shelfId);
    // Compress image to ~800px wide before storing as base64 in Firestore
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      const maxW = 800;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.7);
      URL.revokeObjectURL(objectUrl);
      await updateBookshelf(shelfId, { photo: base64 });
      setUploading(null);
    };
    img.src = objectUrl;
  };

  return (
    <div className="shelves-view">
      <h2 className="section-title">Mis libreros</h2>
      <div className="new-shelf-bar">
        <input
          className="search-input"
          placeholder="Nombre del librero (ej: Sala, Recámara)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <button className="btn-search" onClick={create}>Crear</button>
      </div>
      {bookshelves.length === 0 && (
        <div className="empty-state">
          <p className="empty-icon">🗄️</p>
          <p>Aún no tienes libreros</p>
          <p className="empty-sub">Crea uno arriba para empezar a organizar</p>
        </div>
      )}
      <div className="shelves-grid">
        {bookshelves.map((shelf) => {
          const shelfBooks = books.filter((b) => b.shelfId === shelf.id);
          return (
            <div key={shelf.id} className="shelf-card">
              <div className="shelf-photo-wrap">
                {shelf.photo ? (
                  <img src={shelf.photo} alt={shelf.name} className="shelf-photo" />
                ) : (
                  <div className="shelf-photo-ph">
                    <span>🗄️</span>
                    <span>Sin foto</span>
                  </div>
                )}
                <button
                  className="shelf-photo-btn"
                  onClick={() => fileRefs.current[shelf.id]?.click()}
                >
                  {uploading === shelf.id ? "Subiendo…" : "📷 Foto"}
                </button>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  ref={(el) => (fileRefs.current[shelf.id] = el)}
                  onChange={(e) => e.target.files[0] && handlePhoto(shelf.id, e.target.files[0])}
                />
              </div>
              <div className="shelf-info">
                <h3 className="shelf-name">{shelf.name}</h3>
                <p className="shelf-count">{shelfBooks.length} libro{shelfBooks.length !== 1 ? "s" : ""}</p>
                <div className="shelf-books-preview">
                  {shelfBooks.slice(0, 5).map((b) => (
                    <div
                      key={b.id}
                      className="mini-spine"
                      style={{ background: genreColor(b.genre) }}
                      title={b.title}
                    />
                  ))}
                  {shelfBooks.length > 5 && (
                    <span className="mini-more">+{shelfBooks.length - 5}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Search View ────────────────────────────────────────────────────────────────
function SearchView({ books, bookshelves }) {
  const [q, setQ] = useState("");
  const results = q.trim()
    ? books.filter(
        (b) =>
          b.title?.toLowerCase().includes(q.toLowerCase()) ||
          b.author?.toLowerCase().includes(q.toLowerCase()) ||
          b.genre?.toLowerCase().includes(q.toLowerCase())
      )
    : [];

  return (
    <div className="search-view">
      <h2 className="section-title">¿Dónde está mi libro?</h2>
      <p className="section-sub">Busca por título, autor o género</p>
      <input
        className="search-input big"
        placeholder="Buscar…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {q && results.length === 0 && (
        <p className="empty-sub" style={{ textAlign: "center", marginTop: "2rem" }}>
          No encontramos ese libro en tu biblioteca
        </p>
      )}
      <div className="results-list" style={{ marginTop: "1rem" }}>
        {results.map((book) => {
          const shelf = bookshelves.find((s) => s.id === book.shelfId);
          return (
            <div key={book.id} className="result-item">
              {book.cover ? (
                <img src={book.cover} alt={book.title} className="result-cover" />
              ) : (
                <div className="result-cover-ph" style={{ background: genreColor(book.genre) }}>
                  {book.title?.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="result-info">
                <p className="result-title">{book.title}</p>
                <p className="result-author">{book.author}</p>
                <p className="result-genre" style={{ color: genreColor(book.genre) }}>
                  {book.genre}
                </p>
              </div>
              <div className="book-location">
                {shelf ? (
                  <>
                    <span className="location-icon">📍</span>
                    <span className="location-label">{shelf.name}</span>
                  </>
                ) : (
                  <span className="location-none">Sin librero</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

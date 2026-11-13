import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { LabPage } from "./pages/LabPage";
import "./styles.css";

function App() {
  return (
    <BrowserRouter>
      <header className="topbar">
        <Link to="/" className="logo">
          lipkus<span>.dev</span>
        </Link>
        <nav>
          <Link to="/">Головна</Link>
          <a href="/api/docs/">API</a>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/labs/:slug" element={<LabPage />} />
        <Route
          path="*"
          element={
            <main className="page">
              <h1>404</h1>
              <Link to="/">← На головну</Link>
            </main>
          }
        />
      </Routes>
      <footer className="footer">© {new Date().getFullYear()} Ліпкус Даниїл · Django REST Framework + React</footer>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { Link } from "react-router-dom";
import { api } from "../api";
import { useFetch } from "../useFetch";

const SKILLS = ["Python", "Django REST Framework", "TypeScript", "React", "C / C++", "SQL", "Git", "Linux"];

export function Home() {
  const reports = useFetch(api.reports, []);
  const projects = useFetch(api.projects, []);

  return (
    <main className="page home">
      <section className="hero">
        <p className="eyebrow">Портфоліо</p>
        <h1>
          Привіт, я <span className="accent">Даниїл</span>.
        </h1>
        <p className="lead">
          Студент IT. Тут мої проєкти та звіти з лабораторних — не файликами, а через REST API, з інтерактивними
          моделями алгоритмів.
        </p>
        <ul className="chips">
          {SKILLS.map((s) => (
            <li key={s} className="chip static">
              {s}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-title">Звіти з лабораторних</h2>
        {reports.loading && <p className="muted">Завантаження…</p>}
        {reports.error && <p className="error-box">API недоступне: {reports.error}</p>}
        <div className="grid">
          {reports.data?.map((r) => (
            <Link key={r.slug} to={`/labs/${r.slug}`} className="card link-card">
              <p className="eyebrow">
                {r.kind_display} №{r.number} · {r.discipline}
              </p>
              <h3>{r.topic}</h3>
              <p className="muted small">Інтерактивні блок-схеми · варіант 8 →</p>
            </Link>
          ))}
          {reports.data?.length === 0 && <p className="muted">Поки що порожньо.</p>}
        </div>
      </section>

      <section>
        <h2 className="section-title">Проєкти</h2>
        <div className="grid">
          <article className="card">
            <h3>Цей сайт</h3>
            <p>
              Django REST Framework + React. Одна JSON-модель блок-схеми рендериться і в ASCII для API, і в анімований
              SVG з власним інтерпретатором виразів.
            </p>
            <ul className="chips">
              {["Django", "DRF", "React", "TypeScript", "SVG"].map((t) => (
                <li key={t} className="chip static">
                  {t}
                </li>
              ))}
            </ul>
          </article>
          {projects.data?.map((p) => (
            <article key={p.id} className="card">
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <ul className="chips">
                {p.tech.map((t) => (
                  <li key={t} className="chip static">
                    {t}
                  </li>
                ))}
              </ul>
              <p className="links">
                {p.url && <a href={p.url}>Сайт</a>}
                {p.repo_url && <a href={p.repo_url}>Код</a>}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

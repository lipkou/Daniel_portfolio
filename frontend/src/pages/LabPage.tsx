import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, hasModel } from "../api";
import { FlowchartPlayer } from "../flow/FlowchartPlayer";
import { useFetch } from "../useFetch";

function CopyCurl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const cmd = `curl ${url}`;
  return (
    <div className="curl">
      <code>{cmd}</code>
      <button
        className="btn small"
        onClick={() => {
          navigator.clipboard?.writeText(cmd).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Скопійовано ✓" : "Копіювати"}
      </button>
    </div>
  );
}

export function LabPage() {
  const { slug = "" } = useParams();
  const { data: r, error, loading } = useFetch(() => api.report(slug), [slug]);

  if (loading) return <main className="page"><p className="muted">Завантаження…</p></main>;
  if (error || !r)
    return (
      <main className="page">
        <p className="error-box">Не вдалося завантажити звіт: {error}</p>
        <Link to="/">← На головну</Link>
      </main>
    );

  return (
    <main className="page lab">
      <nav className="crumbs">
        <Link to="/">Головна</Link> <span>/</span> <span>Звіти</span> <span>/</span>
        <span>№{r.number}</span>
      </nav>

      <header className="lab-head">
        <p className="eyebrow">
          {r.kind_display} №{r.number} · {r.discipline} · варіант {r.student.variant}
        </p>
        <h1>{r.topic}</h1>
        <p className="lead">{r.goal}</p>
        <p className="meta">
          {r.student.name}, група {r.student.group} · перевіряє {r.student.teacher}
        </p>
      </header>

      <section className="card how">
        <h2>Як це працює</h2>
        <ul>
          <li>
            <strong>Анімація й обчислення</strong> блок-схем виконуються прямо в браузері на <strong>JavaScript</strong>{" "}
            (TypeScript): власний інтерпретатор блок-схем і парсер виразів, без <code>eval</code>.
          </li>
          <li>
            <strong>Текстовий звіт</strong> з ASCII-блок-схемами, який отримує викладач через API, генерує бекенд на{" "}
            <strong>Python</strong> (Django REST Framework) з тієї ж JSON-моделі.
          </li>
          <li>
            <strong>Код на C++</strong> — це програми, які вимагає методичка; вони наведені для звіту і в браузері не
            запускаються.
          </li>
        </ul>
      </section>

      <section className="card learned">
        <h2>Коротко: чого навчились</h2>
        <ul>
          {r.theory
            .split("\n")
            .map((l) => l.replace(/^•\s*/, "").trim())
            .filter(Boolean)
            .map((l) => (
              <li key={l}>{l}</li>
            ))}
        </ul>
      </section>

      {r.tasks.map((t) => (
        <section key={t.order} className="task" id={`task-${t.order}`}>
          <div className="task-head">
            <span className="task-num">{t.order}</span>
            <div>
              <h2>{t.title}</h2>
              <pre className="statement">{t.statement}</pre>
              {hasModel(t) && t.model.note && <p className="note">{t.model.note}</p>}
            </div>
          </div>
          {hasModel(t) && <FlowchartPlayer model={t.model} id={`${r.slug}-${t.order}`} />}
          {t.code && (
            <details className="code-block">
              <summary>
                Код програми ({t.language === "cpp" ? "C++" : t.language || "код"}) — для звіту, у браузері не
                виконується; модель вище працює на JS
              </summary>
              <pre>
                <code>{t.code}</code>
              </pre>
              {t.output && (
                <>
                  <p className="code-caption">Очікуваний результат виконання:</p>
                  <pre className="code-output">{t.output}</pre>
                </>
              )}
            </details>
          )}
        </section>
      ))}

      <section className="card">
        <h2>Висновок</h2>
        <p>{r.conclusion}</p>
      </section>

      <section className="card api">
        <h2>Цей самий звіт через API</h2>
        <p className="muted">Текстова версія з ASCII-блок-схемами — саме її отримує викладач:</p>
        <CopyCurl url={new URL(r.text_url, window.location.origin).href} />
        <p className="muted small">
          JSON: <a href={r.url}>{new URL(r.url, window.location.origin).pathname}</a> · Документація:{" "}
          <a href="/api/docs/">/api/docs/</a>
        </p>
      </section>
    </main>
  );
}

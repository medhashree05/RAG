import { useState, useRef, useCallback } from "react";
import "./App.css";

const API = "http://0.0.0.0:10000";

/* ── Helpers ────────────────────────────────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function priorityClass(p = "") {
  const pl = p.toLowerCase();
  if (pl === "high") return "high";
  if (pl === "low")  return "low";
  return "mid";
}

async function apiFetch(path) {
  let res, data;
  try {
    res  = await fetch(`${API}${path}`);
    data = await res.json();
  } catch {
    throw new Error("Network error — is the server running?");
  }
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
}

/* ── Loader ─────────────────────────────────────────────────────────────── */
function Loader() {
  return (
    <div className="loader">
      <div className="loader-dots">
        <span /><span /><span />
      </div>
      Analysing…
    </div>
  );
}

/* ── Toast ──────────────────────────────────────────────────────────────── */
function Toast({ message, type }) {
  return (
    <div className={`toast ${message ? "show" : ""} ${type}`}>
      {message}
    </div>
  );
}

/* ── Pill ───────────────────────────────────────────────────────────────── */
function Pill({ text, variant }) {
  return <span className={`pill pill-${variant}`}>{text}</span>;
}

/* ── Role Card ──────────────────────────────────────────────────────────── */
function RoleCard({ role }) {
  const score      = role.match_score || 0;
  const badgeClass = score >= 80 ? "match-high" : score >= 60 ? "match-mid" : "match-low";
  const companies  = role.example_companies || [];
  return (
    <div className="role-card">
      <div className="role-card-header">
        <div className="role-title">{role.role}</div>
        <span className={`match-badge ${badgeClass}`}>{score}%</span>
      </div>
      <div className="role-reason">{role.reason || ""}</div>
      {companies.length > 0 && (
        <div className="role-companies">
          {companies.map(c => <span key={c} className="company-chip">{c}</span>)}
        </div>
      )}
    </div>
  );
}

/* ── Score Bar ──────────────────────────────────────────────────────────── */
function ScoreBar({ score }) {
  const pct = score ? Math.min(parseInt(score) * 10, 100) : 0;
  return (
    <div className="score-row">
      <div className="score-num">{score}</div>
      <div className="score-bar-wrap">
        <div className="score-label">Overall Resume Score</div>
        <div className="score-bar">
          {/* width starts at 0, CSS transition animates to pct on mount */}
          <div
            className="score-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Improvement List ───────────────────────────────────────────────────── */
function ImprovementList({ items }) {
  return (
    <div className="improvement-list">
      {items.map((imp, i) => (
        <div key={i} className={`improvement-item improvement-item--${i}`}>
          <span className={`imp-priority pri-${priorityClass(imp.priority || "Mid")}`}>
            {imp.priority || "Tip"}
          </span>
          <div>
            <div className="imp-area">{imp.area || ""}</div>
            <div className="imp-suggestion">{imp.suggestion}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Markdown Renderer ──────────────────────────────────────────────────── */
// Handles markdown Gemini returns: headings, bold, italic, lists, line breaks.
function renderMarkdown(text = "") {
  const lines = text.split("\n");
  const elements = [];
  let listBuffer = [];
  let listType   = null; // "ol" | "ul"
  let key = 0;

  function flushList() {
    if (!listBuffer.length) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    elements.push(
      <Tag key={key++} className={`md-${listType}`}>
        {listBuffer.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
        ))}
      </Tag>
    );
    listBuffer = [];
    listType   = null;
  }

  function inlineFormat(str) {
    return str
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,     "<em>$1</em>")
      .replace(/`(.+?)`/g,       "<code>$1</code>");
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    const h3 = line.match(/^###\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h1 = line.match(/^#\s+(.*)/);
    if (h3 || h2 || h1) {
      flushList();
      const match = h3 || h2 || h1;
      const Tag   = h3 ? "h3" : h2 ? "h2" : "h1";
      elements.push(
        <Tag key={key++} className="md-heading"
          dangerouslySetInnerHTML={{ __html: inlineFormat(match[1]) }} />
      );
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(olMatch[1]);
      continue;
    }

    const ulMatch = line.match(/^[-*•]\s+(.*)/);
    if (ulMatch) {
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(ulMatch[1]);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    flushList();
    elements.push(
      <p key={key++} className="md-p"
        dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
    );
  }

  flushList();
  return <div className="md-body">{elements}</div>;
}

/* ── Error Card ─────────────────────────────────────────────────────────── */
function ErrorCard({ message }) {
  return (
    <div className="summary-card error-card">
      <p className="error-text">⚠ {message}</p>
    </div>
  );
}

/* ── Full Analysis Panel ────────────────────────────────────────────────── */
function AnalyzePanel() {
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState(null);

  async function run() {
    setLoading(true); setError(null); setData(null);
    try {
      const d = await apiFetch("/analyze");
      setData(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>Full Analysis</h2>
        <button className="btn-run" onClick={run} disabled={loading}>
          {loading ? "Running…" : "Run Analysis"}
        </button>
      </div>
      <div className="result-body">
        {loading && <Loader />}
        {error   && <ErrorCard message={error} />}
        {data && (
          <>
            {data.summary && (
              <div className="summary-card">
                <div className="result-section-title">Professional Summary</div>
                <p>{data.summary}</p>
              </div>
            )}
            {data.skills_identified?.length > 0 && (
              <div className="result-section">
                <div className="result-section-title">Skills Identified</div>
                <div className="pill-group">
                  {data.skills_identified.map(s => <Pill key={s} text={s} variant="tech" />)}
                </div>
              </div>
            )}
            {data.missing_skills?.length > 0 && (
              <div className="result-section">
                <div className="result-section-title">Missing Skills</div>
                <div className="pill-group">
                  {data.missing_skills.map(s => <Pill key={s} text={s} variant="missing" />)}
                </div>
              </div>
            )}
            {data.job_role_suggestions?.length > 0 && (
              <div className="result-section">
                <div className="result-section-title">Job Role Matches</div>
                <div className="roles-grid">
                  {data.job_role_suggestions.map((r, i) => <RoleCard key={i} role={r} />)}
                </div>
              </div>
            )}
            {data.improvements?.length > 0 && (
              <div className="result-section">
                <div className="result-section-title">Improvement Plan</div>
                <ImprovementList items={data.improvements} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ── Skills Panel ───────────────────────────────────────────────────────── */
function SkillsPanel() {
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState(null);

  async function run() {
    setLoading(true); setError(null); setData(null);
    try {
      setData(await apiFetch("/skills"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>Skills</h2>
        <button className="btn-run" onClick={run} disabled={loading}>
          {loading ? "Running…" : "Extract Skills"}
        </button>
      </div>
      <div className="result-body">
        {loading && <Loader />}
        {error   && <ErrorCard message={error} />}
        {data && (
          <>
            {data.technical_skills?.length > 0 && (
              <div className="result-section">
                <div className="result-section-title">Technical Skills</div>
                <div className="pill-group">
                  {data.technical_skills.map(s => <Pill key={s} text={s} variant="tech" />)}
                </div>
              </div>
            )}
            {data.soft_skills?.length > 0 && (
              <div className="result-section">
                <div className="result-section-title">Soft Skills</div>
                <div className="pill-group">
                  {data.soft_skills.map(s => <Pill key={s} text={s} variant="soft" />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ── Roles Panel ────────────────────────────────────────────────────────── */
function RolesPanel() {
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState(null);

  async function run() {
    setLoading(true); setError(null); setData(null);
    try {
      setData(await apiFetch("/job-roles"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>Job Roles</h2>
        <button className="btn-run" onClick={run} disabled={loading}>
          {loading ? "Running…" : "Match Roles"}
        </button>
      </div>
      <div className="result-body">
        {loading && <Loader />}
        {error   && <ErrorCard message={error} />}
        {data && (
          <div className="roles-grid">
            {(data.job_role_suggestions || []).map((r, i) => <RoleCard key={i} role={r} />)}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Improvements Panel ─────────────────────────────────────────────────── */
function ImprovementsPanel() {
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState(null);

  async function run() {
    setLoading(true); setError(null); setData(null);
    try {
      setData(await apiFetch("/improvements"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>Improvements</h2>
        <button className="btn-run" onClick={run} disabled={loading}>
          {loading ? "Running…" : "Get Suggestions"}
        </button>
      </div>
      <div className="result-body">
        {loading && <Loader />}
        {error   && <ErrorCard message={error} />}
        {data?.improvements?.length > 0 && (
          <ImprovementList items={data.improvements} />
        )}
      </div>
    </>
  );
}

/* ── Ask Panel ──────────────────────────────────────────────────────────── */
const SUGGESTIONS = [
  { label: "Rate my resume",          q: "Rate my resume overall" },
  { label: "Top strengths",           q: "What are my top strengths?" },
  { label: "Biggest gaps",            q: "What are my biggest skill gaps?" },
  { label: "Best-fit role",           q: "What role suits me best?" },
];

function AskPanel() {
  const [query,   setQuery]   = useState("");
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState(null);

  async function run(q) {
    const question = (q || query).trim();
    if (!question) return;
    setLoading(true); setError(null); setData(null);
    try {
      const params = new URLSearchParams({ query: question });
      setData(await apiFetch(`/ask?${params}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>Ask Anything</h2>
      </div>
      <div className="ask-suggestions">
        <span className="suggest-label">Try:</span>
        {SUGGESTIONS.map(s => (
          <button
            key={s.q}
            className="suggest-chip"
            onClick={() => { setQuery(s.q); run(s.q); }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="ask-input-row">
        <input
          className="ask-input"
          placeholder="Ask anything about your resume…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && run()}
        />
        <button className="btn-ask" onClick={() => run()} disabled={loading}>
          {loading ? "…" : "Ask"}
        </button>
      </div>
      <div className="result-body">
        {loading && <Loader />}
        {error   && <ErrorCard message={error} />}
        {data    && <AskResult data={data} />}
      </div>
    </>
  );
}

function AskResult({ data: d }) {
  const hasAnalysis = d.score !== undefined || d.verdict;
  const score = d.score ? parseInt(d.score) : null;

  if (hasAnalysis) {
    return (
      <div className="ask-answer-card">
        {score && <ScoreBar score={d.score} />}
        {d.verdict && <div className="ask-verdict">{d.verdict}</div>}
        {d.answer  && (
          <div className="ask-answer-text">
            {renderMarkdown(d.answer)}
          </div>
        )}
        {d.strengths?.length > 0 && (
          <div className="result-section result-section--strengths">
            <div className="result-section-title">Strengths</div>
            <div className="pill-group">
              {d.strengths.map(s => <Pill key={s} text={s} variant="soft" />)}
            </div>
          </div>
        )}
        {d.weaknesses?.length > 0 && (
          <div className="result-section result-section--weaknesses">
            <div className="result-section-title">Weaknesses</div>
            <div className="pill-group">
              {d.weaknesses.map(w => <Pill key={w} text={w} variant="missing" />)}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ask-answer-card">
      <div className="ask-answer-text">
        {renderMarkdown(d.answer || JSON.stringify(d))}
      </div>
    </div>
  );
}

/* ── Tab config ─────────────────────────────────────────────────────────── */
const TABS = [
  { id: "analyze",      label: "Analysis",     icon: "◈", Panel: AnalyzePanel },
  { id: "skills",       label: "Skills",        icon: "◇", Panel: SkillsPanel },
  { id: "roles",        label: "Job Roles",     icon: "◉", Panel: RolesPanel },
  { id: "improvements", label: "Improvements",  icon: "◎", Panel: ImprovementsPanel },
  { id: "ask",          label: "Ask",           icon: "◌", Panel: AskPanel },
];

/* ── Upload Section ─────────────────────────────────────────────────────── */
function UploadSection({ onUploaded }) {
  const [isDragging,  setIsDragging]  = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [uploading,   setUploading]   = useState(false);
  const fileInputRef = useRef(null);

  const animateProgress = useCallback((from, to, duration) => {
    return new Promise(resolve => {
      const start = performance.now();
      function step(now) {
        const t = Math.min((now - start) / duration, 1);
        setProgress(from + (to - from) * t);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }, []);

  async function handleFile(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      onUploaded(null, "Only PDF files are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onUploaded(null, "File too large. Max 10MB.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setProgressMsg("");
    await animateProgress(0, 30, 400);

    const formData = new FormData();
    formData.append("file", file);

    try {
      animateProgress(30, 80, 800);
      let res, data;
      try {
        res  = await fetch(`${API}/upload`, { method: "POST", body: formData });
        data = await res.json();
      } catch {
        throw new Error("Network error — is the server running?");
      }
      if (!res.ok) throw new Error(data.detail || "Upload failed");

      await animateProgress(80, 100, 300);
      await sleep(350);
      setProgressMsg(`✓ ${data.pages} pages · ${data.chunks} chunks indexed`);
      await sleep(700);
      onUploaded(file.name, null);
    } catch (err) {
      setUploading(false);
      setProgress(0);
      onUploaded(null, err.message);
    }
  }

  function onDragOver(e)  { e.preventDefault(); setIsDragging(true); }
  function onDragLeave()  { setIsDragging(false); }
  function onDrop(e)      { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }
  function onFileChange() { if (fileInputRef.current.files[0]) handleFile(fileInputRef.current.files[0]); }

  return (
    <section className="upload-section" id="uploadSection">
      <div className="upload-copy">
        <h1 className="headline">
          Analyse your<br /><em>résumé</em><br />with AI
        </h1>
        <p className="subline">
          Upload your PDF and get instant feedback on skills, job matches,
          and actionable improvements.
        </p>
      </div>

      <div>
        <div
          className={`drop-zone ${isDragging ? "drag-over" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="drop-inner">
            <div className="drop-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path d="M24 4L24 32M24 4L16 12M24 4L32 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 36V40C8 42.2 9.8 44 12 44H36C38.2 44 40 42.2 40 40V36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="drop-label">Drop your résumé here</div>
            <div className="drop-sub">
              or{" "}
              <button className="inline-link" onClick={() => fileInputRef.current?.click()}>
                browse files
              </button>
            </div>
            <div className="drop-format">PDF · MAX 10MB</div>
          </div>
          <div className="drop-overlay">Drop to upload</div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={onFileChange}
        />

        {uploading && (
          <div className="upload-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            {progressMsg && <span>{progressMsg}</span>}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Results Section ────────────────────────────────────────────────────── */
function ResultsSection() {
  const [activeTab, setActiveTab] = useState("analyze");
  const ActivePanel = TABS.find(t => t.id === activeTab)?.Panel;

  return (
    <section className="results-section" id="resultsSection">
      <nav className="tab-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tab-panel active">
        {ActivePanel && <ActivePanel />}
      </div>
    </section>
  );
}

/* ── App ────────────────────────────────────────────────────────────────── */
export default function App() {
  const [resumeLoaded, setResumeLoaded] = useState(false);
  const [resumeName,   setResumeName]   = useState("");
  const [toast,        setToast]        = useState({ message: "", type: "" });

  function showToast(message, type = "") {
    setToast({ message, type });
    setTimeout(() => setToast({ message: "", type: "" }), 3200);
  }

  function handleUploaded(name, error) {
    if (error) {
      showToast(error, "error");
      return;
    }
    setResumeName(name);
    setResumeLoaded(true);
    showToast("Resume uploaded successfully!", "success");
  }

  async function handleReset() {
    if (!window.confirm("Clear the uploaded resume and start over?")) return;
    try { await fetch(`${API}/reset`, { method: "DELETE" }); } catch (_) {}
    setResumeLoaded(false);
    setResumeName("");
    showToast("Resume cleared.");
  }

  return (
    <>
      <div className="noise" />

      <header className="header">
        <div className="header-inner">
          <a className="logo" href="/">
            <div className="logo-mark">R</div>
            <span className="logo-text">Résumé<em>AI</em></span>
          </a>
          <div className="header-status">
            <div className={`status-dot ${resumeLoaded ? "active" : ""}`} />
            <span>{resumeLoaded ? resumeName : "No resume loaded"}</span>
            {resumeLoaded && (
              <button className="btn-ghost" onClick={handleReset}>
                Clear
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        {!resumeLoaded
          ? <UploadSection onUploaded={handleUploaded} />
          : <ResultsSection />
        }
      </main>

      <Toast message={toast.message} type={toast.type} />
    </>
  );
}
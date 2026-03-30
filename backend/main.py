from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
import google.generativeai as genai
import pickle
import json
import re
from dotenv import load_dotenv
import os

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY not set in environment variables.")

genai.configure(api_key=api_key)
gemini = genai.GenerativeModel("gemini-2.5-flash")

# ── App Setup ────────────────────────────────────────────────────────────────
app = FastAPI(title="Resume Analyzer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Lazy Embedding Model ─────────────────────────────────────────────────────
# NOT loaded at startup — only when first request needs it
_embed_model = None

def get_embed_model() -> SentenceTransformer:
    global _embed_model
    if _embed_model is None:
        print("⏳ Loading SentenceTransformer model...")
        _embed_model = SentenceTransformer("all-MiniLM-L6-v2")
        print("✅ SentenceTransformer model loaded.")
    return _embed_model


# ── In-Memory State ──────────────────────────────────────────────────────────
resume_chunks: list[str] = []
resume_index: faiss.Index | None = None
raw_resume_text: str = ""

FAISS_PATH = "resume_index.bin"
CHUNKS_PATH = "resume_chunks.pkl"
RAW_TEXT_PATH = "resume_raw.txt"


# ── Restore persisted state on startup (non-blocking) ───────────────────────
@app.on_event("startup")
async def startup_event():
    global resume_chunks, resume_index, raw_resume_text
    print("🚀 App startup — uvicorn is up.")
    if all(os.path.exists(p) for p in [FAISS_PATH, CHUNKS_PATH, RAW_TEXT_PATH]):
        try:
            resume_index = faiss.read_index(FAISS_PATH)
            with open(CHUNKS_PATH, "rb") as f:
                resume_chunks = pickle.load(f)
            with open(RAW_TEXT_PATH, "r", encoding="utf-8") as f:
                raw_resume_text = f.read()
            print("✅ Restored existing resume index from disk.")
        except Exception as e:
            print(f"⚠️  Could not restore resume index: {e}")


# ── Helpers ──────────────────────────────────────────────────────────────────
def chunk_text(text: str, chunk_size: int = 400, overlap: int = 50) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


def retrieve_context(query: str, k: int = 5) -> str:
    if resume_index is None or not resume_chunks:
        raise HTTPException(status_code=400, detail="No resume uploaded. Call /upload first.")
    query_vec = get_embed_model().encode([query])
    _, indices = resume_index.search(np.array(query_vec), k=k)
    return "\n".join([resume_chunks[i] for i in indices[0] if i < len(resume_chunks)])


def build_index(chunks: list[str]) -> faiss.Index:
    embeddings = get_embed_model().encode(chunks)
    idx = faiss.IndexFlatL2(embeddings.shape[1])
    idx.add(np.array(embeddings))
    return idx


def parse_json_response(text: str) -> dict:
    clean = re.sub(r"```(?:json)?|```", "", text).strip()
    return json.loads(clean)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "resume_loaded": resume_index is not None,
        "chunks": len(resume_chunks),
    }


@app.post("/upload", summary="Upload a resume PDF")
async def upload_resume(file: UploadFile = File(...)):
    global resume_chunks, resume_index, raw_resume_text

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    reader = PdfReader(file.file)
    pages = [page.extract_text() or "" for page in reader.pages]
    raw_resume_text = "\n".join(pages).strip()

    if not raw_resume_text:
        raise HTTPException(status_code=422, detail="Could not extract text from PDF.")

    resume_chunks = chunk_text(raw_resume_text)
    resume_index = build_index(resume_chunks)  # model loads here on first call

    faiss.write_index(resume_index, FAISS_PATH)
    with open(CHUNKS_PATH, "wb") as f:
        pickle.dump(resume_chunks, f)
    with open(RAW_TEXT_PATH, "w", encoding="utf-8") as f:
        f.write(raw_resume_text)

    return {
        "message": "Resume uploaded and indexed successfully.",
        "pages": len(reader.pages),
        "chunks": len(resume_chunks),
    }


@app.get("/analyze", summary="Full resume analysis")
def analyze_resume():
    if not raw_resume_text:
        raise HTTPException(status_code=400, detail="No resume uploaded. Call /upload first.")

    context = retrieve_context(
        "skills experience education projects certifications achievements", k=8
    )

    prompt = f"""
You are an expert career coach and technical recruiter with 15+ years of experience.

Analyze the resume below and return a JSON object with EXACTLY these keys:

{{
  "summary": "A concise 3-5 sentence professional summary of the candidate.",
  "skills_identified": ["skill1", "skill2", ...],
  "missing_skills": ["skill_a", "skill_b", ...],
  "job_role_suggestions": [
    {{"role": "Role Title", "match_score": 85, "reason": "brief reason"}},
    ...
  ],
  "improvements": [
    {{"area": "short area name", "suggestion": "actionable recommendation"}},
    ...
  ]
}}

Rules:
- Return ONLY valid JSON, no markdown, no preamble.
- skills_identified: list every hard and soft skill you can find.
- missing_skills: list 5-8 in-demand skills relevant to the candidate's domain that are absent.
- job_role_suggestions: suggest 4-6 roles with a match_score 0-100.
- improvements: give 5-7 specific, actionable improvements.

Resume:
\"\"\"
{context}
\"\"\"
"""
    raw = gemini.generate_content(prompt).text
    try:
        return parse_json_response(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"Could not parse Gemini response: {raw[:300]}")


@app.get("/summary", summary="Candidate professional summary")
def get_summary():
    context = retrieve_context("professional background experience education objective", k=5)
    prompt = f"""
You are a senior recruiter. Write a concise 3-5 sentence professional summary
for the candidate described in the resume excerpt below.

Return ONLY a JSON object: {{"summary": "..."}}

Resume excerpt:
\"\"\"
{context}
\"\"\"
"""
    raw = gemini.generate_content(prompt).text
    return parse_json_response(raw)


@app.get("/skills", summary="Extract identified skills")
def get_skills():
    context = retrieve_context("skills technologies tools frameworks programming languages", k=6)
    prompt = f"""
Extract every skill (technical and soft) from the resume below.

Return ONLY a JSON object:
{{
  "technical_skills": ["Python", "FastAPI", ...],
  "soft_skills": ["Communication", "Leadership", ...]
}}

Resume excerpt:
\"\"\"
{context}
\"\"\"
"""
    raw = gemini.generate_content(prompt).text
    return parse_json_response(raw)


@app.get("/missing-skills", summary="Identify skill gaps")
def get_missing_skills(job_role: str = ""):
    context = retrieve_context("skills experience technologies tools", k=6)
    role_hint = f"for a {job_role} role" if job_role else "based on current industry demand"
    prompt = f"""
You are a technical recruiter. Identify 6-10 important skills that are MISSING
from the resume {role_hint}.

Return ONLY a JSON object:
{{
  "missing_skills": [
    {{"skill": "Docker", "importance": "High", "reason": "Container skills are essential for deployment"}},
    ...
  ]
}}

Resume excerpt:
\"\"\"
{context}
\"\"\"
"""
    raw = gemini.generate_content(prompt).text
    return parse_json_response(raw)


@app.get("/job-roles", summary="Suggest matching job roles")
def get_job_roles():
    context = retrieve_context("experience skills projects education achievements", k=8)
    prompt = f"""
Based on the resume below, suggest the 5 most suitable job roles for this candidate.

Return ONLY a JSON object:
{{
  "job_role_suggestions": [
    {{
      "role": "Backend Engineer",
      "match_score": 88,
      "reason": "Strong Python and API development experience",
      "example_companies": ["Stripe", "Twilio", "GitHub"]
    }},
    ...
  ]
}}

Resume excerpt:
\"\"\"
{context}
\"\"\"
"""
    raw = gemini.generate_content(prompt).text
    return parse_json_response(raw)


@app.get("/improvements", summary="Resume improvement suggestions")
def get_improvements():
    context = retrieve_context("resume format structure experience projects achievements", k=8)
    prompt = f"""
You are a professional resume coach. Review the resume excerpt and provide
7 specific, actionable improvements the candidate should make.

Return ONLY a JSON object:
{{
  "improvements": [
    {{
      "area": "Quantify Achievements",
      "priority": "High",
      "suggestion": "Add measurable results to each bullet point, e.g. 'Reduced API latency by 40%'."
    }},
    ...
  ]
}}

Resume excerpt:
\"\"\"
{context}
\"\"\"
"""
    raw = gemini.generate_content(prompt).text
    return parse_json_response(raw)


def is_analytical_query(query: str) -> bool:
    analytical_keywords = [
        "rate", "rating", "score", "evaluate", "evaluation",
        "review", "feedback", "how strong", "how good", "how weak",
        "what do you think", "assess", "assessment", "grade",
        "critique", "opinion", "overall", "out of 10", "/10",
        "rank", "benchmark", "compare",
    ]
    return any(kw in query.lower() for kw in analytical_keywords)


@app.get("/ask", summary="Ask a custom question about the resume")
def ask_question(query: str):
    if not raw_resume_text:
        raise HTTPException(status_code=400, detail="No resume uploaded. Call /upload first.")

    if is_analytical_query(query):
        prompt = f"""
You are an expert career coach and senior technical recruiter with 15+ years of experience.
The user has asked you to evaluate their resume with the following request:

"{query}"

Use the full resume below to give a thorough, expert response.
Be specific — reference actual content from the resume (projects, skills, experience, education).
Do NOT say the resume "doesn't mention a score" — you are the expert providing the evaluation.

Structure your response as JSON:
{{
  "score": "<X/10 or N/A if not applicable>",
  "verdict": "<one sentence overall verdict>",
  "answer": "<detailed, well-structured answer to the user's question>",
  "strengths": ["strength1", "strength2", ...],
  "weaknesses": ["weakness1", "weakness2", ...]
}}

Full Resume:
\"\"\"
{raw_resume_text}
\"\"\"
"""
        raw = gemini.generate_content(prompt).text
        try:
            return parse_json_response(raw)
        except json.JSONDecodeError:
            return {"answer": raw}

    else:
        context = retrieve_context(query, k=6)
        prompt = f"""
You are a helpful career advisor. The user is asking a specific question about a resume.
Answer clearly and professionally using the resume excerpt below.
If the answer is genuinely not present in the resume, say so briefly and suggest
what section the candidate should add to address it.

Resume excerpt:
\"\"\"
{context}
\"\"\"

Question: {query}
"""
        response = gemini.generate_content(prompt)
        return {"answer": response.text}


@app.delete("/reset", summary="Clear uploaded resume data")
def reset():
    global resume_chunks, resume_index, raw_resume_text
    resume_chunks = []
    resume_index = None
    raw_resume_text = ""
    for path in [FAISS_PATH, CHUNKS_PATH, RAW_TEXT_PATH]:
        if os.path.exists(path):
            os.remove(path)
    return {"message": "Resume data cleared successfully."}
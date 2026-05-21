# Resume Analyzer & Job Recommendation System

## Overview

The Resume Analyzer & Job Recommendation System is an AI-powered full-stack application that uses Retrieval-Augmented Generation (RAG), embeddings, and semantic search to analyze resumes and generate structured career insights.

The system extracts resume content, converts it into semantic embeddings, performs similarity-based retrieval using FAISS, and uses LLM-powered prompt engineering to generate:
- resume summaries
- skill extraction
- missing skill analysis
- career recommendations
- targeted job roles

---

# Features

## Resume Analysis
- Resume summarization
- Skill extraction
- Experience analysis
- Missing skill identification
- Career improvement suggestions

## Job Recommendations
- Role recommendations based on resume content
- Domain-specific suggestions
- Skill-gap analysis

## RAG-Based Retrieval
- Semantic chunk retrieval
- Context-aware prompting
- Efficient retrieval pipelines

## AI-Powered Structured Outputs
- JSON-based responses
- Consistent frontend integration
- Structured recommendations and insights

## Full-Stack Architecture
- React frontend
- FastAPI backend
- Real-time analysis workflows

---

# Tech Stack

## Frontend
- React.js
- JavaScript

## Backend
- FastAPI
- Python

## AI / NLP
- SentenceTransformers
- Gemini API
- FAISS
- Embeddings
- RAG (Retrieval-Augmented Generation)

---

# System Architecture

```text
Resume Upload
      ↓
PDF/Text Extraction
      ↓
Chunking
      ↓
Embedding Generation
      ↓
FAISS Vector Index
      ↓
Semantic Retrieval
      ↓
Prompt Construction
      ↓
Gemini LLM Response
      ↓
Structured JSON Output
      ↓
Frontend Visualization
```

---

# RAG Workflow

```text
User uploads resume
        ↓
Resume split into chunks
        ↓
Chunks converted into embeddings
        ↓
FAISS stores embedding vectors
        ↓
Query embedding generated
        ↓
Top-k relevant chunks retrieved
        ↓
Retrieved context sent to Gemini
        ↓
Structured analysis generated
```

---

# Key Engineering Concepts

## Embeddings
Used SentenceTransformers to generate semantic vector representations of resume text for similarity-based retrieval.

## Semantic Search
Implemented embedding-based semantic retrieval instead of keyword matching to improve contextual relevance.

## FAISS Vector Search
Used FAISS for efficient nearest-neighbor similarity search across embedding vectors.

## Retrieval-Augmented Generation (RAG)
Retrieved only relevant resume chunks before sending context to the LLM to improve response quality and reduce unnecessary token usage.

## Structured Prompt Engineering
Designed prompts to enforce structured JSON outputs for reliable frontend rendering and consistent responses.

---

# Major Challenges Solved

## Large Resume Context Handling
Instead of sending the full resume directly to the LLM, the system retrieves only the most relevant chunks using semantic similarity search.

## Reducing Hallucinations
RAG-based contextual retrieval improves grounding and reduces irrelevant or hallucinated responses.

## Structured Output Generation
Implemented prompt constraints to generate machine-readable JSON outputs for frontend integration.

## Efficient Retrieval
Used FAISS indexing and persistent vector storage to avoid recomputing embeddings repeatedly.

---

# Features Implemented

- Resume upload and parsing
- Embedding generation
- Chunk-based semantic retrieval
- Vector indexing using FAISS
- AI-generated career insights
- Structured JSON outputs
- Real-time frontend interaction
- Persistent index storage

---

# Installation

## Clone Repository

```bash
git clone <repo-url>
cd resume-analyzer-rag
```

---

# Install Dependencies

```bash
pip install -r requirements.txt
```

---

# Environment Variables

Create a `.env` file:

```env
GEMINI_API_KEY=
```

---

# Run Backend

```bash
uvicorn main:app --reload
```

---

# Run Frontend

```bash
npm install
npm run dev
```

---

# Future Improvements

- Multi-resume benchmarking
- Hybrid search (semantic + keyword)
- Vector database migration
- Resume ATS scoring
- Personalized learning roadmap generation
- Job-market trend analysis
- Streaming LLM responses
- Multi-language support

---

# Key Learning Outcomes

- Retrieval-Augmented Generation (RAG)
- Embedding-based semantic search
- Vector similarity search using FAISS
- Prompt engineering
- LLM orchestration
- Full-stack AI system design
- Context-aware retrieval pipelines
- Structured AI outputs

---

# Project Highlights

- Real RAG implementation
- Embedding-based retrieval system
- FAISS semantic vector search
- AI-powered structured analysis
- Full-stack architecture
- Scalable retrieval pipeline
- Prompt-engineered JSON outputs

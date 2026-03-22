from fastapi import FastAPI, UploadFile, File
from pypdf import PdfReader
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
import google.generativeai as genai
import pickle
from dotenv import load_dotenv
import os


if os.path.exists("faiss_index.bin") and os.path.exists("chunks.pkl"):
    
    index = faiss.read_index("faiss_index.bin")

    with open("chunks.pkl", "rb") as f:
        all_chunks = pickle.load(f)

    print("✅ Loaded existing FAISS index")


model = genai.GenerativeModel("gemini-2.5-flash")

app = FastAPI()

embed_model = SentenceTransformer("all-MiniLM-L6-v2")

all_chunks = []
index = None

documents = []
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=api_key)
chat_history =[]
chat_history = chat_history[-10:]
@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    
    reader = PdfReader(file.file)
    text=""

    for page in reader.pages:
        text += page.extract_text()

    documents.extend(chunk_text(text))

    return{"message": " File uploaded successfully"}


def chunk_text(text,chunk_size=300):
    chunks = []
    for i in range(0,len(text),chunk_size):
        chunks.append(text[i:i+chunk_size])
    return chunks

@app.post("/process")
def process_docs():

    global index, all_chunks

    all_chunks = []

    for doc in documents:
        all_chunks.extend(chunk_text(doc))

    embeddings = embed_model.encode(all_chunks)

    dimension = embeddings.shape[1]
    index = faiss.IndexFlatL2(dimension)
    index.add(np.array(embeddings))
    faiss.write_index(index, "faiss_index.bin")

    with open("chunks.pkl", "wb") as f:
        pickle.dump(all_chunks, f)
    if not all_chunks:
        return {"error": "No documents available"}
    return {"message": "Documents processed"}

@app.get("/ask_rag")
def ask_rag(query: str):

    query_embedding = embed_model.encode([query])

    distances, indices = index.search(query_embedding, k=3)

    context = "\n".join([all_chunks[i] for i in indices[0]])

    prompt = f"""
    You are an intelligent assistant.

    Answer ONLY using the context below.

    Context:
    {context}

    Question: {query}
    """

    response = model.generate_content(prompt)

    return {
        "answer": response.text
    }

@app.get("/chat")
def chat(query: str):

    global chat_history

  
    query_embedding = embed_model.encode([query])

   
    distances, indices = index.search(query_embedding, k=3)
    context = "\n".join([all_chunks[i] for i in indices[0]])

 
    history_text = "\n".join(chat_history)

   
    prompt = f"""
    You are a professional AI assistant.

Rules:
- Answer clearly
- Use context if relevant
- Use conversation history

Conversation:
{history_text}

Context:
{context}

Question: {query}
    """

    response = model.generate_content(prompt)
 
    
    chat_history.append(f"User: {query}")
    chat_history.append(f"AI: {response.text}")

    return {
        "answer": response.text
    }


@app.post("/clear")
def clear_chat():
    global chat_history
    chat_history = []
    return {"message": "Chat cleared"}
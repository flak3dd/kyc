import os
import json
from pathlib import Path
from mem0 import Memory

# We configure Mem0 to use our local Spark AI Agent on port 8080
config = {
    "llm": {
        "provider": "openai",
        "config": {
            "model": "qwen-abliterated",
            "api_key": "local_spark_key",
            "openai_base_url": "http://127.0.0.1:8000/v1"
        }
    },
    "embedder": {
        "provider": "huggingface",
        "config": {
            "model": "BAAI/bge-small-en-v1.5"
        }
    },
    "vector_store": {
        "provider": "chroma",
        "config": {
            "collection_name": "kyc_memory",
            "path": str(Path("../datasets/mempalace_db").absolute())
        }
    }
}

def ingest_memories():
    facts_file = Path("../datasets/processed/kyc_facts.jsonl")
    if not facts_file.exists():
        print(f"Error: {facts_file} not found. Run extract_kyc_metadata.py first.")
        return
        
    print("Initializing Memory Palace...")
    try:
        m = Memory.from_config(config)
    except Exception as e:
        print(f"Failed to initialize mem0ai: {e}")
        return
        
    print(f"Reading facts from {facts_file}...")
    
    with open(facts_file, "r", encoding="utf-8") as f:
        for line in f:
            try:
                record = json.loads(line)
                fact = record.get("fact")
                source = record.get("source_image")
                
                if fact:
                    # Add to the specific agent persona
                    print(f"Memorizing: {fact}")
                    m.add(fact, user_id="agent_kyc_expert", metadata={"source": source})
            except Exception as e:
                print(f"Error ingesting line: {e}")
                
    print("Memory ingestion complete!")

if __name__ == "__main__":
    ingest_memories()

import os
import chromadb
from pathlib import Path

# Path to the persistent database
DB_PATH = Path("../datasets/mempalace_db")

def init_db():
    print(f"Initializing Memory Palace database at: {DB_PATH.absolute()}")
    DB_PATH.mkdir(parents=True, exist_ok=True)
    
    # Initialize ChromaDB Persistent Client
    client = chromadb.PersistentClient(path=str(DB_PATH.absolute()))
    
    # Ensure the core collection exists
    try:
        collection = client.get_or_create_collection(
            name="kyc_memory",
            metadata={"description": "Persistent memory for KYC generation rules"}
        )
        print(f"Collection 'kyc_memory' is ready. Currently has {collection.count()} memories.")
    except Exception as e:
        print(f"Failed to initialize ChromaDB collection: {e}")

if __name__ == "__main__":
    init_db()

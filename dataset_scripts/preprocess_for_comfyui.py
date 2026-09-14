import os
import shutil
from pathlib import Path
from huggingface_hub import snapshot_download

PROCESSED_DIR = Path("../datasets/processed")
DIRS = {
    "id_cards": PROCESSED_DIR / "id_cards",
    "selfies": PROCESSED_DIR / "selfies",
    "spoofing": PROCESSED_DIR / "spoofing_samples"
}

def setup_directories():
    for d in DIRS.values():
        d.mkdir(parents=True, exist_ok=True)

def process_dataset_snapshot(repo_id, category, limit=5):
    print(f"Downloading {category} from HuggingFace ({repo_id})...")
    try:
        # Download only image files to save massive bandwidth
        repo_path = snapshot_download(
            repo_id, 
            repo_type="dataset", 
            allow_patterns=["*.jpg", "*.jpeg", "*.png", "*.webp"]
        )
        
        count = 0
        for root, _, files in os.walk(repo_path):
            for file in files:
                if file.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                    if count >= limit:
                        return
                    src = os.path.join(root, file)
                    dst = DIRS[category] / f"sample_{count}{Path(file).suffix}"
                    shutil.copy2(src, dst)
                    print(f"Saved {dst}")
                    count += 1
                    
        if count == 0:
            print(f"Warning: No raw images found in {repo_id}. (They might be packed in parquet files).")
            
    except Exception as e:
        print(f"Failed to process {repo_id}: {e}")
        print("Note: If this dataset is gated/private, run `huggingface-cli login` in your terminal first to authenticate.")

if __name__ == "__main__":
    setup_directories()
    
    # 1. ID Cards (Passports)
    process_dataset_snapshot("ud-biometrics/synthetic-printed-australian-passports", "id_cards", limit=5)
    
    # 2. Selfies
    process_dataset_snapshot("ud-biometrics/Selfie-and-ID-Dataset", "selfies", limit=5)
    
    # 3. Spoofing Samples
    process_dataset_snapshot("ud-biometrics/phone-and-webcam-dataset", "spoofing", limit=5)
    
    print("Preprocessing complete. Ready for ComfyUI.")

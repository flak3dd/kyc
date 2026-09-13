import requests
from huggingface_hub.file_download import build_hf_headers
from mlcroissant import Dataset

def fetch_anti_spoofing_dataset():
    """
    Fetches the Anti-Spoofing Real Videos Dataset from HuggingFace using mlcroissant.
    Requires authentication via `hf auth login` before running.
    """
    headers = build_hf_headers()  # handles authentication
    url = "https://huggingface.co/api/datasets/ud-biometrics/Anti-Spoofing-Real-Videos/croissant"
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    jsonld = response.json()
    
    ds = Dataset(jsonld=jsonld)
    records = ds.records("default")
    return records

if __name__ == "__main__":
    print("Fetching dataset... Make sure you have logged in via hf auth login.")
    records = fetch_anti_spoofing_dataset()
    print("Successfully loaded dataset records.")
    # You can iterate or process the records here

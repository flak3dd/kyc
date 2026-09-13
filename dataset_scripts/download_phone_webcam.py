import requests
from huggingface_hub.file_download import build_hf_headers
from mlcroissant import Dataset

def fetch_phone_webcam_dataset():
    """
    Fetches the Phone and Webcam Dataset from HuggingFace using mlcroissant.
    Requires authentication via `hf auth login` before running.
    """
    headers = build_hf_headers()  # handles authentication
    url = "https://huggingface.co/api/datasets/ud-biometrics/phone-and-webcam-dataset/croissant"
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    jsonld = response.json()
    
    ds = Dataset(jsonld=jsonld)
    records = ds.records("default")
    return records

if __name__ == "__main__":
    print("Fetching dataset... Make sure you have logged in via hf auth login.")
    records = fetch_phone_webcam_dataset()
    print("Successfully loaded dataset records.")
    # You can iterate or process the records here

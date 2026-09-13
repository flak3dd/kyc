from mlcroissant import Dataset

def fetch_kyc_document_extraction_vlm_dataset():
    """
    Fetches the KYC Document Extraction VLM Dataset from HuggingFace using mlcroissant.
    """
    url = "https://huggingface.co/api/datasets/Jwalit/kyc-document-extraction-vlm/croissant"
    ds = Dataset(jsonld=url)
    records = ds.records("default")
    return records

if __name__ == "__main__":
    print("Fetching dataset...")
    records = fetch_kyc_document_extraction_vlm_dataset()
    print("Successfully loaded dataset records.")
    # You can iterate or process the records here

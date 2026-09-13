import os
import io
import pandas as pd
from typing import Iterator
from pyspark.sql import SparkSession
from pyspark.sql.functions import col
from pyspark.sql.types import StructType, StructField, StringType
from mlcroissant import Dataset

# Default VLM model
MODEL_NAME = "Qwen/Qwen-VL" 

def vllm_inference_udf(iterator: Iterator[pd.DataFrame]) -> Iterator[pd.DataFrame]:
    """
    Pandas UDF that initializes a vLLM engine per worker and runs batch inference.
    Each partition is processed by a single engine instance.
    """
    # Import inside the executor to avoid serializing the engine
    from vllm import LLM, SamplingParams
    
    # Initialize vLLM engine. Requires GPU on the worker node.
    # tensor_parallel_size can be adjusted based on GPU count per worker.
    try:
        llm = LLM(model=MODEL_NAME, trust_remote_code=True)
    except Exception as e:
        print(f"Failed to initialize vLLM (Ensure GPUs are available): {e}")
        llm = None
        
    sampling_params = SamplingParams(temperature=0.2, max_tokens=256)

    for pdf in iterator:
        results = []
        for index, row in pdf.iterrows():
            image_url = row['image_url']
            prompt = row['prompt']
            
            if llm is None:
                results.append(f"Error: vLLM engine not initialized. Input: {image_url}")
                continue
                
            try:
                # Format for Qwen-VL or LLaVA depending on the model chosen
                # Using a generic prompt structure for the VLM
                messages = [
                    {"role": "user", "content": f"Picture 1: <img>{image_url}</img>\n{prompt}"}
                ]
                
                # Execute inference
                outputs = llm.generate([messages], sampling_params)
                result_text = outputs[0].outputs[0].text
                results.append(result_text)
            except Exception as e:
                results.append(f"Inference error: {e}")
                
        pdf['vlm_output'] = results
        yield pdf

def run_pipeline():
    # Initialize Spark Session
    spark = SparkSession.builder \
        .appName("KYC_VLM_Batch_Inference") \
        .config("spark.executor.resource.gpu.amount", "1") \
        .config("spark.task.resource.gpu.amount", "1") \
        .getOrCreate()
        
    print("Spark Session initialized.")
    
    # Example: Loading a dataset via mlcroissant
    url = "https://huggingface.co/api/datasets/Jwalit/kyc-document-extraction-vlm/croissant"
    print(f"Fetching dataset records from: {url}")
    ds = Dataset(jsonld=url)
    records = ds.records("default")
    
    # Convert records to a list of dicts for Spark DataFrame creation
    # Real datasets would need more robust parsing to extract the image URL and the target prompt
    data = []
    count = 0
    for record in records:
        if count >= 20: # Limit for testing
            break
            
        # Mock extraction of URL and prompt
        image_url = ""
        for k, v in record.items():
            if isinstance(v, str) and (v.startswith("http") or v.endswith(".jpg")):
                image_url = v
                break
                
        if image_url:
            data.append({
                "record_id": str(count),
                "image_url": image_url,
                "prompt": "Extract all text fields from this KYC document."
            })
            count += 1
            
    if not data:
        print("No valid records found.")
        spark.stop()
        return
        
    # Define schema and create DataFrame
    schema = StructType([
        StructField("record_id", StringType(), True),
        StructField("image_url", StringType(), True),
        StructField("prompt", StringType(), True)
    ])
    
    df = spark.createDataFrame(data, schema)
    print(f"Created Spark DataFrame with {df.count()} rows.")
    
    # Repartition to ensure parallelism (e.g., matching the number of GPU executors)
    num_partitions = 2 
    df = df.repartition(num_partitions)
    
    # Apply the VLM inference Pandas UDF
    # mapInPandas requires the output schema
    out_schema = StructType([
        StructField("record_id", StringType(), True),
        StructField("image_url", StringType(), True),
        StructField("prompt", StringType(), True),
        StructField("vlm_output", StringType(), True)
    ])
    
    print("Executing distributed VLM inference...")
    result_df = df.mapInPandas(vllm_inference_udf, schema=out_schema)
    
    # Show results and write to disk
    result_df.show(truncate=False)
    
    output_path = "../datasets/processed/vlm_results.parquet"
    print(f"Writing results to {output_path}")
    result_df.write.mode("overwrite").parquet(output_path)
    
    spark.stop()

if __name__ == "__main__":
    run_pipeline()

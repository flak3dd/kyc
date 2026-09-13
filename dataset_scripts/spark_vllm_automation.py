import json, requests, os, glob, subprocess
from pyspark.sql import SparkSession
from pyspark.sql.functions import udf, col

# vLLM endpoint
VLLM_URL = os.getenv("VLLM_URL", "http://localhost:8000/v1/chat/completions")

def llm_infer(text: str) -> str:
    try:
        resp = requests.post(VLLM_URL, json={
            "model": "llama3.2:70b",
            "messages": [{"role": "user", "content": text}],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        })
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return f'{{"error": "{str(e)}"}}'

llm_udf = udf(llm_infer, "string")

# Spark session (headless)
spark = SparkSession.builder \
    .appName("Spark-vLLM-Automation") \
    .config("spark.memory.fraction", "0.8") \
    .config("spark.executor.memory", "80g") \
    .getOrCreate()

# Load dataset_scripts → apply vLLM UDF
# Make sure you have parquet files in this directory before running
input_path = "/Users/adminuser/rork-ikycu-1/dataset_scripts/*.parquet"
output_path = "/Users/adminuser/rork-ikycu-1/dataset_scripts/llm_results/"

print(f"Reading parquet from {input_path}")
try:
    df = spark.read.parquet(input_path)
    # Ensure the parquet file actually has a 'text_column'. 
    # Adjust this column name based on your actual data schema.
    if "text_column" in df.columns:
        df = df.withColumn("llm_output", llm_udf(col("text_column")))
        df.write.mode("overwrite").parquet(output_path)
        print(f"Successfully processed and wrote results to {output_path}")
    else:
        print(f"Error: 'text_column' not found in parquet files. Available columns: {df.columns}")
except Exception as e:
    print(f"Error reading or processing parquet files: {e}")

spark.stop()

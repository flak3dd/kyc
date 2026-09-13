#!/bin/bash
# run_spark_job.sh
# Wrapper script to submit the PySpark job with vLLM

# Ensure dependencies are installed
# pip install -r requirements.txt

# Environment variables needed for vLLM and Ray
export RAY_DISABLE_MEMORY_MONITOR=1

# Submit the Spark job in local mode
# We specify executor memory and driver memory to accommodate the VLM
# Note: For vLLM to work, the machine running this must have a compatible GPU.
spark \
    --master local[*] \
    --driver-memory 8g \
    --executor-memory 16g \
    --conf spark.executor.resource.gpu.amount=1 \
    --conf spark.task.resource.gpu.amount=1 \
    spark_vllm_pipeline.py

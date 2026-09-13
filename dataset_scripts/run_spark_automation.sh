#!/bin/bash
# run_spark_automation.sh
# Wrapper to run the headless Spark vLLM automation

export SPARK_WORKER_MEMORY="80g"
export OMP_NUM_THREADS=8
export HEADLESS=1

echo "Submitting headless Spark job..."

nohup spark \
    --master local[*] \
    spark_vllm_automation.py \
    > spark_job.log 2>&1 &

echo "Spark job submitted in background. Check spark_job.log for output."

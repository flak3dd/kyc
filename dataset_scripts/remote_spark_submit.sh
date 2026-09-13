#!/bin/bash
# remote_spark_submit.sh
# Template for submitting the job to a remote Spark cluster (e.g. AWS EMR, Databricks)

# Ensure the dependencies archive exists
if [ ! -f "spark_dependencies.zip" ]; then
    echo "Error: spark_dependencies.zip not found. Run ./package_for_remote.sh first."
    exit 1
fi

echo "Submitting job to remote Spark cluster..."

# Replace SPARK_MASTER_URL with your actual cluster master URL (e.g. yarn, spark://master:7077)
export SPARK_MASTER_URL="yarn"

spark-submit \
    --master $SPARK_MASTER_URL \
    --deploy-mode cluster \
    --py-files spark_dependencies.zip \
    --executor-memory 80g \
    --executor-cores 8 \
    --conf spark.yarn.maxAppAttempts=1 \
    spark_vllm_automation.py

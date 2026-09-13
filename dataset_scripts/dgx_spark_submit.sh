#!/bin/bash
# dgx_spark_submit.sh
# Submission script optimized for an NVIDIA DGX Spark Cluster

# Ensure the dependencies archive exists
if [ ! -f "spark_dependencies.zip" ]; then
    echo "Error: spark_dependencies.zip not found. Run ./package_for_remote.sh first."
    exit 1
fi

echo "Submitting MemPalace pipeline to DGX Spark cluster..."

# Set this to your DGX Spark Master URL
export DGX_SPARK_MASTER="spark://192.168.4.50:7077"

# DGX Systems have massive RAM and GPUs (e.g., 8x A100/H100). 
# Adjust executor-memory and gpu.amount based on your specific DGX model and cluster availability.
spark-submit \
    --master $DGX_SPARK_MASTER \
    --deploy-mode cluster \
    --py-files spark_dependencies.zip \
    --driver-memory 64g \
    --executor-memory 256g \
    --executor-cores 32 \
    --conf spark.executor.resource.gpu.amount=8 \
    --conf spark.task.resource.gpu.amount=1 \
    --conf spark.dynamicAllocation.enabled=true \
    --conf spark.dynamicAllocation.minExecutors=1 \
    --conf spark.dynamicAllocation.maxExecutors=4 \
    spark_vllm_automation.py

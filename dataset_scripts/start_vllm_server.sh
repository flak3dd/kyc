#!/bin/bash
# start_vllm_server.sh
# Starts the vLLM API server with the parameters specified in the template.

# Model can be lmsys/vicuna-7b-v1.5 or llama3.2:70b depending on availability
MODEL="lmsys/vicuna-7b-v1.5"

# Environment variables for headless/stable execution
export OMP_NUM_THREADS=8
export HEADLESS=1

echo "Starting vLLM server on port 8000..."

nohup vllm serve $MODEL \
  --dtype auto \
  --gpu-memory-utilization 0.85 \
  --max-num-batched-tokens 4096 \
  --max-num-seqs 256 \
  --tensor-parallel-size 1 \
  > vllm_server.log 2>&1 &

echo "vLLM server started in background. Check vllm_server.log for output."
echo "You can now run spark_vllm_automation.py"

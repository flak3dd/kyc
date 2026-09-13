#!/bin/bash
# run_kyc_agent.sh
# Wrapper script to run the stateful MemPalace KYC Agent

if [ -z "$1" ]; then
    echo "Usage: ./run_kyc_agent.sh \"<your prompt here>\""
    echo "Example: ./run_kyc_agent.sh \"Generate an Australian passport spoofed with a cracked screen\""
    exit 1
fi

export SPARK_LOCAL_PORT="8000"
export SPARK_API_KEY="local_spark_key"
export OPENAI_API_KEY="local_spark_key"
export OPENAI_BASE_URL="http://127.0.0.1:8000/v1"

echo "Running Stateful KYC Agent..."
python3 kyc_mempalace_agent.py "$1"

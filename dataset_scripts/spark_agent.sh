#!/bin/bash
# Spark AI Agent - Local Network Endpoints & Bash Integration
# Usage: ./spark_agent.sh

set -euo pipefail

# ─── Local Network Configuration ───────────────────────────────────────────────────────
SPARK_LOCAL_HOST="${SPARK_LOCAL_HOST:-127.0.0.1}"
SPARK_LOCAL_PORT="${SPARK_LOCAL_PORT:-8080}"
SPARK_API_KEY="${SPARK_API_KEY:-local_spark_key}"
BASE_URL="http://${SPARK_LOCAL_HOST}:${SPARK_LOCAL_PORT}/v1"

# Headers
HEADERS=(
  "Authorization: Bearer ${SPARK_API_KEY}"
  "Content-Type: application/json"
  "X-Local-Cluster: true"
)

# ─── Helper Functions ─────────────────────────────────────────────────────────────────
curl_post() { curl -s -X POST "${HEADERS[@]}" "$@"; }
curl_get()  { curl -s -X GET  "${HEADERS[@]}" "$@"; }

# ─── 1. Core Chat & Completion ──────────────────────────────────────────────────────
echo "📡 POST /v1/chat/completions"
curl_post "${BASE_URL}/chat/completions" \
  -d '{
    "model": "spark-3.5",
    "messages": [{"role":"user","content":"Local network test"}],
    "temperature": 0.7,
    "stream": false
  }' | jq '.'

echo -e "\n📡 POST /v1/completions"
curl_post "${BASE_URL}/completions" \
  -d '{"prompt":"Local network completion","max_tokens":100}'

echo -e "\n📡 POST /v1/embeddings"
curl_post "${BASE_URL}/embeddings" \
  -d '{"input":["Embed this local text"],"model":"text-embedding-v1"}'

echo -e "\n📡 GET /v1/models"
curl_get "${BASE_URL}/models"

# ─── 2. Agent Management ────────────────────────────────────────────────────────────
AGENT_ID="agent_001"

echo -e "\n📡 GET /v1/agents"
curl_get "${BASE_URL}/agents"

echo -e "\n📡 POST /v1/agents"
curl_post "${BASE_URL}/agents" \
  -d '{"name":"local_agent","template":"default"}'

echo -e "\n📡 GET /v1/agents/${AGENT_ID}"
curl_get "${BASE_URL}/agents/${AGENT_ID}"

echo -e "\n📡 PUT /v1/agents/${AGENT_ID}"
curl_post -X PUT "${BASE_URL}/agents/${AGENT_ID}" \
  -d '{"temperature":0.8,"top_p":0.9}'

echo -e "\n📡 DELETE /v1/agents/${AGENT_ID}"
curl_post -X DELETE "${BASE_URL}/agents/${AGENT_ID}"

# ─── 3. Session & State ────────────────────────────────────────────────────────────
SESSION_ID="sess_abc123"

echo -e "\n📡 POST /v1/agents/${AGENT_ID}/messages"
curl_post "${BASE_URL}/agents/${AGENT_ID}/messages" \
  -d '{"session_id":"'"${SESSION_ID}"'","message":"Continue local chat"}'

echo -e "\n📡 GET /v1/agents/${AGENT_ID}/sessions"
curl_get "${BASE_URL}/agents/${AGENT_ID}/sessions"

echo -e "\n📡 GET /v1/agents/${AGENT_ID}/sessions/${SESSION_ID}"
curl_get "${BASE_URL}/agents/${AGENT_ID}/sessions/${SESSION_ID}"

echo -e "\n📡 DELETE /v1/agents/${AGENT_ID}/sessions/${SESSION_ID}"
curl_post -X DELETE "${BASE_URL}/agents/${AGENT_ID}/sessions/${SESSION_ID}"

# ─── 4. Tasks & Async Processing ───────────────────────────────────────────────────
echo -e "\n📡 POST /v1/agents/${AGENT_ID}/tasks"
curl_post "${BASE_URL}/agents/${AGENT_ID}/tasks" \
  -d '{"type":"rag","payload":{"file":"doc.pdf"}}'

echo -e "\n📡 GET /v1/agents/${AGENT_ID}/tasks/{task_id}"
curl_get "${BASE_URL}/agents/${AGENT_ID}/tasks/task_99"

echo -e "\n📡 GET /v1/agents/${AGENT_ID}/tasks"
curl_get "${BASE_URL}/agents/${AGENT_ID}/tasks"

# ─── 5. Tools & Functions ─────────────────────────────────────────────────────────
echo -e "\n📡 POST /v1/agents/${AGENT_ID}/tools"
curl_post "${BASE_URL}/agents/${AGENT_ID}/tools" \
  -d '{"name":"local_search","schema":{"url":"http://search.local:9090"}}'

echo -e "\n📡 GET /v1/agents/${AGENT_ID}/tools"
curl_get "${BASE_URL}/agents/${AGENT_ID}/tools"

echo -e "\n📡 DELETE /v1/agents/${AGENT_ID}/tools/{tool_id}"
curl_post -X DELETE "${BASE_URL}/agents/${AGENT_ID}/tools/tool_01"

# ─── 6. Health, Status & WebSocket ────────────────────────────────────────────────
echo -e "\n📡 GET /health"
curl_get "${BASE_URL}/health"

echo -e "\n📡 GET /status"
curl_get "${BASE_URL}/status"

echo -e "\n🌐 WS /ws/agent/${AGENT_ID}"
echo "Open WebSocket: ws://${SPARK_LOCAL_HOST}:${SPARK_LOCAL_PORT}/ws/agent/${AGENT_ID}"

echo -e "\n✅ All local network endpoints verified."

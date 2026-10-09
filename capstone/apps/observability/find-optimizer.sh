#!/bin/bash
# Asks ECS where the optimizer task is right now and writes its address into the
# file Prometheus reads. Repeats every 30 seconds. CLUSTER, SERVICE and REGION
# come from the systemd service that runs this script.
while true; do
  TASK=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" --region "$REGION" --query 'taskArns[0]' --output text)
  if [ "$TASK" != "None" ]; then
    IP=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK" --region "$REGION" --query 'tasks[0].attachments[0].details[?name==`privateIPv4Address`].value' --output text)
    echo "[{\"targets\": [\"$IP:8000\"], \"labels\": {\"box\": \"optimizer\"}}]" > /opt/theo/observability/targets/optimizer.json
  fi
  sleep 30
done

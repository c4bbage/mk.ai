#!/usr/bin/env bash
# Sync the jspace framework to h202 and (optionally) set up its isolated env.
#
#   scripts/deploy_h202.sh            # rsync only
#   scripts/deploy_h202.sh --setup    # rsync + create/refresh the conda env
#
# Uses a DEDICATED conda env `jspace` so it never disturbs the production
# glm5 / glm51 serving envs.
set -euo pipefail

HOST="${JSPACE_HOST:-h202}"
REMOTE_DIR="${JSPACE_REMOTE_DIR:-/data/jspace}"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ">> syncing $LOCAL_DIR -> $HOST:$REMOTE_DIR"
ssh "$HOST" "mkdir -p $REMOTE_DIR"
rsync -az --delete \
  --exclude '.git' --exclude 'docs' --exclude 'node_modules' \
  --exclude 'data/lens' --exclude '__pycache__' --exclude '*.pyc' \
  --exclude '.venv' \
  "$LOCAL_DIR/" "$HOST:$REMOTE_DIR/"
echo ">> synced."

if [[ "${1:-}" == "--setup" ]]; then
  echo ">> setting up remote env (conda env: jspace)"
  ssh "$HOST" "bash $REMOTE_DIR/scripts/setup_env.sh"
fi

echo ">> done. Next:"
echo "   ssh $HOST"
echo "   conda activate jspace && cd $REMOTE_DIR"
echo "   jspace list-models"
echo "   jspace probe qwen3-0.6b"

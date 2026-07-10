#!/usr/bin/env bash
# Create an ISOLATED conda env `jspace` and install the framework.
# Idempotent; never touches the production glm5 / glm51 envs.
set -euo pipefail

REMOTE_DIR="${JSPACE_REMOTE_DIR:-/data/jspace}"
ENV_NAME="${JSPACE_ENV:-jspace}"
PY_VER="${JSPACE_PY:-3.11}"

source "$(conda info --base)/etc/profile.d/conda.sh"

if ! conda env list | grep -qE "^${ENV_NAME}\s"; then
  echo ">> creating conda env ${ENV_NAME} (python ${PY_VER})"
  conda create -y -n "$ENV_NAME" "python=${PY_VER}"
fi
conda activate "$ENV_NAME"

echo ">> installing PyTorch (CUDA 12.x wheels)"
pip install --quiet --upgrade pip
# Match the cluster's CUDA (H20 / driver 570 -> cu124 wheels work).
pip install --quiet torch --index-url https://download.pytorch.org/whl/cu124 || \
  pip install --quiet torch   # fall back to default index if the cluster mirrors it

echo ">> installing vendored jlens + jspace (editable)"
pip install --quiet -e "$REMOTE_DIR/vendor/jlens"
pip install --quiet -e "$REMOTE_DIR"

echo ">> versions:"
python -c "import torch, transformers, jlens, jspace; \
print('torch', torch.__version__, 'cuda', torch.cuda.is_available(), torch.cuda.device_count()); \
print('transformers', transformers.__version__); print('jspace', jspace.__version__)"
echo ">> env ${ENV_NAME} ready."

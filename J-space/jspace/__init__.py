"""J-space — a model-agnostic Jacobian-lens observability framework.

Fit and apply the average input-output Jacobian ("J-lens") of any HuggingFace
decoder on Linux/CUDA, to read out what an internal activation is disposed to
make the model say — the "J-space" / global-workspace view from Anthropic's
*Verbalizable Representations Form a Global Workspace in Language Models*.

Core is the vendored Anthropic `jlens` (Apache-2.0); this package adds a
config-driven model registry, differentiable loading (incl. dequant paths for
fp8 serving checkpoints), torch interventions, a live serving UI, and remote
(SSH) orchestration for cluster GPUs.
"""

from __future__ import annotations

from .registry import ModelSpec, available, get, resolve_layers
from .loader import load_model
from .fit_runner import readout, run_fit, lens_path
from . import download

__all__ = [
    "ModelSpec",
    "available",
    "get",
    "resolve_layers",
    "load_model",
    "run_fit",
    "readout",
    "lens_path",
    "download",
]

__version__ = "0.1.0"

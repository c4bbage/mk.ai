"""Fit orchestration: registry spec -> loaded model -> fitted lens on disk.

Thin layer over :func:`jlens.fit`. Resolves the spec's layer/corpus/hparam
defaults, runs the fit with resumable checkpointing, and writes the lens to a
predictable path (``data/lens/<model>.lens.pt``).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Sequence

import jlens
from jlens.lens import JacobianLens

from . import corpus as corpus_mod
from .loader import load_model
from .registry import ModelSpec, resolve_layers

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("JSPACE_DATA_DIR", _REPO_ROOT / "data"))


def lens_path(model_name: str) -> Path:
    return DATA_DIR / "lens" / f"{model_name}.lens.pt"


def checkpoint_path(model_name: str) -> Path:
    return DATA_DIR / "lens" / f"{model_name}.ckpt.pt"


def run_fit(
    spec: ModelSpec,
    *,
    n_prompts: int | None = None,
    source_layers: str | list[int] | None = None,
    max_seq_len: int | None = None,
    dim_batch: int | None = None,
    device_map=None,
    dtype: str | None = None,
    compile: bool = False,
    out_path: str | os.PathLike | None = None,
    resume: bool = True,
) -> JacobianLens:
    """Fit a Jacobian lens for ``spec`` and save it. Returns the lens."""
    model = load_model(spec, device_map=device_map, dtype=dtype, compile=compile)

    layers = resolve_layers(
        source_layers if source_layers is not None else spec.source_layers,
        model.n_layers,
    )
    n = n_prompts if n_prompts is not None else spec.n_prompts
    prompts = corpus_mod.load_prompts(
        spec.corpus or "wikitext", n=n, min_chars=max(2 * spec.skip_first, 400)
    )

    ckpt = checkpoint_path(spec.name)
    ckpt.parent.mkdir(parents=True, exist_ok=True)
    logger.info(
        "fitting %s: %d prompts, %d source layers %s, target=%s",
        spec.name, len(prompts), len(layers),
        f"[{layers[0]}..{layers[-1]}]" if layers else "[]", spec.target_layer,
    )

    lens = jlens.fit(
        model,
        prompts,
        source_layers=layers,
        target_layer=spec.target_layer,
        dim_batch=dim_batch if dim_batch is not None else spec.dim_batch,
        max_seq_len=max_seq_len if max_seq_len is not None else spec.max_seq_len,
        skip_first=spec.skip_first,
        checkpoint_path=str(ckpt),
        resume=resume,
    )

    out = Path(out_path) if out_path else lens_path(spec.name)
    out.parent.mkdir(parents=True, exist_ok=True)
    lens.save(str(out))
    logger.info("saved lens -> %s  (%r)", out, lens)
    return lens


def decode_topk(model, logits, k: int = 8) -> list[tuple[str, float]]:
    """Top-k decoded (token_str, logit) from a ``[vocab]`` logits vector."""
    top = logits.topk(k)
    return [
        (model.tokenizer.decode([int(t)]), float(s))
        for t, s in zip(top.indices.tolist(), top.values.tolist())
    ]


def readout(
    lens: JacobianLens,
    model,
    prompt: str,
    *,
    layers: Sequence[int] | None = None,
    positions: Sequence[int] | None = None,
    k: int = 8,
) -> dict:
    """Human-readable lens readout: {layer: {position: [(tok, logit), ...]}}."""
    lens_logits, model_logits, input_ids = lens.apply(
        model, prompt, layers=layers, positions=positions
    )
    tokens = [model.tokenizer.decode([int(t)]) for t in input_ids[0].tolist()]
    result = {"tokens": tokens, "layers": {}}
    for layer, logits in sorted(lens_logits.items()):
        per_pos = {}
        pos_list = list(positions) if positions is not None else list(range(logits.shape[0]))
        for i, p in enumerate(pos_list):
            per_pos[p] = decode_topk(model, logits[i], k)
        result["layers"][layer] = per_pos
    return result

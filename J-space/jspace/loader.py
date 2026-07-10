"""Load a registered model as a grad-capable :class:`jlens.LensModel`.

The Jacobian fit differentiates *through the residual stack*, so weights must
be loaded in a real floating dtype (bf16/fp16/fp32) — an fp8/AWQ *serving*
checkpoint cannot be used directly. :func:`load_model` enforces that and wraps
the result with the jlens HF adapter (auto-detecting the layout, or applying a
registry override).
"""

from __future__ import annotations

import logging
from typing import Any

import torch

import jlens
from jlens.hf import Layout

from .registry import ModelSpec

logger = logging.getLogger(__name__)

_DTYPES = {
    "bfloat16": torch.bfloat16,
    "bf16": torch.bfloat16,
    "float16": torch.float16,
    "fp16": torch.float16,
    "half": torch.float16,
    "float32": torch.float32,
    "fp32": torch.float32,
}

# Checkpoint quantizations that use integer-weight layers (AWQ int4, GPTQ
# int4/int8) and embed custom QuantLinear modules that do NOT support autograd.
# These genuinely need a separate bf16 copy for fitting.
#
# fp8 / w4afp8 / mxfp4 are NOT here: transformers auto-dequantizes them to the
# requested ``torch_dtype`` (bf16) on load, and the resulting in-memory weights
# are fully differentiable. The on-disk fp8 format is just storage.
_NON_DIFFERENTIABLE = {"awq", "gptq"}

# Quantizations that are auto-dequantized on load. We log a memory warning
# because the in-memory footprint is ~2× the on-disk size (bf16 vs fp8).
_AUTO_DEQUANT = {"fp8", "w4afp8", "mxfp4"}


def _layout_or_none(spec: ModelSpec) -> Layout | None:
    ls = spec.layout
    if ls.is_empty():
        return None
    # jlens.Layout requires a path; fall back to the common default.
    return Layout(
        path=ls.path or "model",
        layers=ls.layers or "layers",
        norm=ls.norm or "norm",
        embed=ls.embed or "embed_tokens",
        lm_head=ls.lm_head or "lm_head",
    )


def load_model(
    spec: ModelSpec,
    *,
    device_map: Any | None = None,
    dtype: str | None = None,
    compile: bool = False,
) -> "jlens.HFLensModel":
    """Load ``spec`` into a grad-capable HF model and wrap it for the lens.

    Args:
        spec: The registered model.
        device_map: Override the spec's device map (e.g. ``{"": 0}`` to pin to
            one GPU, or ``"auto"`` to shard).
        dtype: Override the spec's fit dtype.
        compile: Wrap each block in ``torch.compile`` (faster backward after a
            one-time cost; do not combine with sharded ``device_map="auto"``).
    """
    import transformers

    grad_path = spec.resolved_grad_path()
    if spec.checkpoint_quant in _NON_DIFFERENTIABLE and spec.grad_weights_path is None:
        raise ValueError(
            f"{spec.name}: checkpoint at {spec.hf_path!r} is {spec.checkpoint_quant} "
            "(uses integer-weight layers that don't support autograd). The Jacobian fit "
            "needs backward passes. Set `grad_weights_path` to a bf16/fp16 copy of the "
            "weights, or point `hf_path` at the un-quantized checkpoint."
        )

    if spec.checkpoint_quant in _AUTO_DEQUANT:
        logger.warning(
            f"{spec.name}: checkpoint is {spec.checkpoint_quant} (auto-dequantized to "
            f"{dtype or spec.dtype} on load). In-memory footprint is ~2× the on-disk size. "
            "Ensure sufficient GPU memory for the fit."
        )

    torch_dtype = _DTYPES[(dtype or spec.dtype).lower()]
    dmap = device_map if device_map is not None else spec.device_map

    logger.info(
        "loading %s from %s (dtype=%s, device_map=%s)",
        spec.name, grad_path, torch_dtype, dmap,
    )
    kwargs: dict[str, Any] = dict(
        torch_dtype=torch_dtype,
        device_map=dmap,
        trust_remote_code=spec.trust_remote_code,
        low_cpu_mem_usage=True,
    )
    if spec.attn_implementation:
        kwargs["attn_implementation"] = spec.attn_implementation
    if spec.max_memory:
        # accelerate wants int GPU indices as keys ("cpu"/"disk" stay strings).
        kwargs["max_memory"] = {
            (int(k) if str(k).lstrip("-").isdigit() else k): v
            for k, v in spec.max_memory.items()
        }

    hf_model = transformers.AutoModelForCausalLM.from_pretrained(grad_path, **kwargs)
    tokenizer = transformers.AutoTokenizer.from_pretrained(
        spec.tokenizer_path or grad_path, trust_remote_code=spec.trust_remote_code
    )

    model = jlens.from_hf(
        hf_model,
        tokenizer,
        layout=_layout_or_none(spec),
        compile=compile,
    )
    logger.info("loaded %r", model)
    return model

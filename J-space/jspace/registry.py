"""Model registry: config-driven model definitions.

A :class:`ModelSpec` is everything the framework needs to observe one model:
where the weights live, how to load them *differentiably* (the Jacobian fit
needs backward passes, so quantized inference checkpoints must be loaded in a
grad-capable dtype), where the residual stack sits inside the HF module tree,
and sensible default fit hyper-parameters.

Specs are plain YAML under ``configs/models/*.yaml`` so a new model is a new
file, never a code change. Load one with :func:`get` / :func:`load_spec`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

import yaml

# Repo root: .../J-space . configs/ lives next to this package.
_REPO_ROOT = Path(__file__).resolve().parent.parent
_CONFIG_DIR = Path(os.environ.get("JSPACE_CONFIG_DIR", _REPO_ROOT / "configs" / "models"))


@dataclass(frozen=True)
class LayoutSpec:
    """Optional override for where the residual stack lives in the HF tree.

    Left as ``None`` fields, :func:`jspace.loader.load_model` lets jlens
    auto-detect (works for Llama/Qwen/Mistral/Gemma/GLM-style ``model.layers``).
    Set these only for unusual layouts.
    """

    path: str | None = None
    layers: str | None = None
    norm: str | None = None
    embed: str | None = None
    lm_head: str | None = None

    def is_empty(self) -> bool:
        return all(v is None for v in (self.path, self.layers, self.norm, self.embed, self.lm_head))


@dataclass(frozen=True)
class ModelSpec:
    """Everything needed to load + fit + serve one model."""

    name: str
    hf_path: str                       # local dir or HF repo id
    revision: str | None = None
    # --- loading ---
    dtype: str = "bfloat16"            # grad-capable dtype used for FITTING
    device_map: Any = "auto"           # "auto" | "cuda" | {"": 0} | explicit dict
    trust_remote_code: bool = True
    attn_implementation: str | None = "eager"  # eager is the safe autograd path
    max_memory: dict[str, str] | None = None   # per-device cap for device_map=auto
    # Inference-checkpoint quantization. Fitting always loads a grad-capable
    # dtype; this field documents what the on-disk checkpoint is and whether a
    # differentiable bf16 copy is required (fp8/awq/gptq -> yes).
    checkpoint_quant: str = "none"     # none|fp8|w4afp8|mxfp4|awq|gptq
    # If the differentiable weights live somewhere other than hf_path (e.g. a
    # bf16 upcast of an fp8 serving checkpoint), point here.
    grad_weights_path: str | None = None
    # Load the tokenizer from here instead of hf_path (e.g. a fine-tune whose
    # tokenizer_config is malformed; point at a clean same-family tokenizer).
    tokenizer_path: str | None = None
    # --- topology / layout ---
    layout: LayoutSpec = field(default_factory=LayoutSpec)
    # --- fit defaults ---
    source_layers: str | list[int] = "workspace"  # see resolve_layers()
    target_layer: int | None = None
    dim_batch: int = 8
    max_seq_len: int = 128
    skip_first: int = 16
    n_prompts: int = 100
    corpus: str | None = None          # path to a .txt corpus, or "wikitext"
    # --- serving ---
    serve_layers: str | list[int] | None = None  # defaults to source_layers
    notes: str = ""

    def resolved_grad_path(self) -> str:
        return self.grad_weights_path or self.hf_path

    def with_overrides(self, **kw: Any) -> "ModelSpec":
        return replace(self, **{k: v for k, v in kw.items() if v is not None})


def resolve_layers(spec_value: str | list[int], n_layers: int) -> list[int]:
    """Turn a layer spec into concrete indices.

    Accepts:
      - explicit list ``[40, 45, 50]``
      - ``"all"``                      -> every layer below the last
      - ``"workspace"``                -> middle band ~[0.25, 0.75) of depth
                                          (the paper's "workspace-like" range)
      - ``"late"``                     -> last third
      - ``"early"``                    -> first third
      - ``"a:b"`` or ``"a:b:step"``    -> Python-style range
      - ``"everyN"`` e.g. ``"every4"`` -> evenly spaced stride-N
    """
    if isinstance(spec_value, list):
        return sorted({int(x) % n_layers for x in spec_value})
    s = str(spec_value).strip().lower()
    if s == "all":
        return list(range(n_layers - 1))
    if s == "workspace":
        lo, hi = int(0.25 * n_layers), int(0.75 * n_layers)
        return list(range(lo, hi))
    if s == "late":
        return list(range(2 * n_layers // 3, n_layers - 1))
    if s == "early":
        return list(range(1, n_layers // 3))
    if s.startswith("every"):
        step = int(s[len("every"):])
        return list(range(0, n_layers - 1, step))
    if ":" in s:
        parts = [int(p) if p else None for p in s.split(":")]
        start = parts[0] or 0
        stop = parts[1] if len(parts) > 1 and parts[1] is not None else n_layers - 1
        step = parts[2] if len(parts) > 2 and parts[2] is not None else 1
        return list(range(start, stop, step))
    raise ValueError(f"unrecognised layer spec {spec_value!r}")


def _spec_from_dict(d: dict[str, Any]) -> ModelSpec:
    d = dict(d)
    layout = LayoutSpec(**(d.pop("layout", None) or {}))
    known = {f for f in ModelSpec.__dataclass_fields__ if f != "layout"}
    unknown = set(d) - known
    if unknown:
        raise ValueError(f"unknown keys in model spec {d.get('name')!r}: {sorted(unknown)}")
    return ModelSpec(layout=layout, **d)


def load_spec(path: str | os.PathLike) -> ModelSpec:
    with open(path) as f:
        return _spec_from_dict(yaml.safe_load(f))


def available() -> list[str]:
    """Registry keys discovered under the config dir."""
    if not _CONFIG_DIR.is_dir():
        return []
    return sorted(p.stem for p in _CONFIG_DIR.glob("*.yaml"))


def get(name: str) -> ModelSpec:
    """Load a registered model spec by key (filename stem under configs/models)."""
    path = _CONFIG_DIR / f"{name}.yaml"
    if not path.is_file():
        raise KeyError(
            f"no model spec {name!r} in {_CONFIG_DIR} (have: {available()})"
        )
    spec = load_spec(path)
    if spec.name != name:
        # Keep the filename authoritative so `jspace fit <name>` always resolves.
        spec = replace(spec, name=name)
    return spec

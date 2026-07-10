"""J-space interventions: the *write* operations on the workspace.

For a vocabulary token ``t`` the J-lens vector at layer ``l`` is::

    v_t = J_l^T @ W_U[t]          (so  V = W_U @ J_l  has rows v_t)

``<v_t, h>`` approximates ``<W_U[t], J_l h>`` = how much residual ``h`` at
layer ``l`` disposes the model to say ``t``. Adding ``v_t`` steers the model
toward ``t``; the swap/ablate variants mirror the paper's experiments.

An :class:`InterventionHook` applies any of these to a block's output at chosen
positions during a real forward/generate pass.
"""

from __future__ import annotations

import functools
from collections.abc import Callable, Sequence

import torch

from jlens.lens import JacobianLens
from jlens.protocol import LensModel


def get_unembedding_matrix(model: LensModel) -> torch.Tensor:
    """Dense unembedding ``W_U`` of shape ``[vocab, d_model]`` (fp32, cached)."""
    cached = getattr(model, "_jspace_W_U", None)
    if cached is not None:
        return cached
    lm_head = model._lm_head  # type: ignore[attr-defined]
    W = lm_head.weight.detach().float()  # [vocab, d_model]
    model._jspace_W_U = W  # type: ignore[attr-defined]
    return W


@functools.lru_cache(maxsize=16)
def _j_lens_vectors_cached(lens_id: int, model_id: int, layer: int) -> torch.Tensor:
    raise RuntimeError("use j_lens_vectors")  # pragma: no cover


def j_lens_vectors(lens: JacobianLens, model: LensModel, layer: int) -> torch.Tensor:
    """All J-lens vectors ``V = W_U @ J_l`` -> ``[vocab, d_model]`` (fp32)."""
    key = (id(lens), id(model), layer)
    cache = getattr(model, "_jspace_V_cache", None)
    if cache is None:
        cache = {}
        model._jspace_V_cache = cache  # type: ignore[attr-defined]
    if key in cache:
        return cache[key]
    if layer not in lens.jacobians:
        raise KeyError(f"layer {layer} not fitted (have {lens.source_layers})")
    W_U = get_unembedding_matrix(model)                       # [vocab, D]
    J = lens.jacobians[layer].to(W_U.device, torch.float32)   # [D, D]
    V = W_U @ J                                               # [vocab, D]
    cache[key] = V
    return V


def j_lens_vector(lens: JacobianLens, model: LensModel, layer: int, token_id: int) -> torch.Tensor:
    return j_lens_vectors(lens, model, layer)[token_id]


def j_lens_vector_for_text(lens: JacobianLens, model: LensModel, layer: int, text: str) -> torch.Tensor:
    ids = model.tokenizer.encode(text, add_special_tokens=False)
    if not ids:
        raise ValueError(f"{text!r} encodes to no tokens")
    return j_lens_vector(lens, model, layer, ids[0])


# --- pure activation ops -------------------------------------------------

def steer(h: torch.Tensor, v_t: torch.Tensor, alpha: float) -> torch.Tensor:
    """``h += alpha * v_t``. alpha>0 promotes token t, alpha<0 suppresses it."""
    return h + alpha * v_t.to(h.dtype)


def patch_swap(h: torch.Tensor, v_s: torch.Tensor, v_t: torch.Tensor, alpha: float = 1.0) -> torch.Tensor:
    """Exchange the ``s`` component of ``h`` for an equal ``t`` component.

    Reads lens coordinates ``c = V^+ h`` (V=[v_s, v_t]), swaps the two, writes
    back — leaving the component orthogonal to span{v_s, v_t} untouched.
    """
    V = torch.stack([v_s, v_t], dim=0).to(h.dtype)   # [2, D]
    VVt = V @ V.T                                     # [2, 2]
    c = torch.linalg.solve(VVt, V @ h)                # [2]
    c_swapped = torch.stack([alpha * c[1], alpha * c[0]])
    return h + (c_swapped - c) @ V


def ablate_topk(
    h: torch.Tensor, lens: JacobianLens, model: LensModel, layer: int, k: int = 16
) -> torch.Tensor:
    """Remove the top-``k`` J-space component of ``h`` by greedy matching pursuit."""
    V = j_lens_vectors(lens, model, layer).to(h.device)   # [vocab, D]
    V_norm = V.norm(dim=-1) + 1e-8
    residual = h.float().clone()
    accumulated = torch.zeros_like(residual)
    chosen: list[int] = []
    for _ in range(k):
        scores = (V @ residual) / V_norm                  # [vocab]
        if chosen:
            scores[torch.tensor(chosen, device=scores.device)] = -1e9
        best = int(scores.argmax())
        chosen.append(best)
        v = V[best]
        coef = (v @ residual) / (v @ v)
        component = coef * v
        accumulated += component
        residual -= component
    return (h.float() - accumulated).to(h.dtype)


# --- live application during a forward/generate pass ---------------------

class InterventionHook:
    """Apply ``fn(h) -> h`` to a block's output at chosen positions.

    ``block`` is one residual block (``model.layers[layer]``). ``positions`` are
    sequence indices (Python indexing) to modify; ``None`` modifies all.
    """

    def __init__(
        self,
        block: torch.nn.Module,
        fn: Callable[[torch.Tensor], torch.Tensor],
        *,
        positions: Sequence[int] | None = None,
        once: bool = True,
    ) -> None:
        self._block = block
        self._fn = fn
        self._positions = positions
        self._once = once
        self._fired = False
        self._handle = None

    def _hook(self, module, inputs, output):
        if self._once and self._fired:
            return output
        is_tuple = not torch.is_tensor(output)
        h = output[0] if is_tuple else output           # [B, S, D]
        seq = h.shape[1]
        pos = range(seq) if self._positions is None else [p % seq for p in self._positions]
        h = h.clone()
        for p in pos:
            h[:, p, :] = self._fn(h[:, p, :].squeeze(0)).to(h.dtype)
        self._fired = True
        if is_tuple:
            return (h, *output[1:])
        return h

    def __enter__(self):
        self._handle = self._block.register_forward_hook(self._hook)
        return self

    def __exit__(self, *exc):
        if self._handle is not None:
            self._handle.remove()
            self._handle = None

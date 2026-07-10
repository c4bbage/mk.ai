"""FastAPI backend: live J-space slice grid, readout, generation, interventions.

Loads one model + its fitted lens once at startup and exposes:

  GET  /                 -> the web UI (self-contained HTML)
  GET  /api/meta         -> model/lens metadata (layers, d_model, ...)
  POST /api/slice        -> position x layer top-1 grid + tokens for a prompt
  POST /api/readout      -> top-k lens tokens at (layer, position)
  POST /api/generate     -> baseline generation
  POST /api/intervene    -> baseline vs intervened generation (steer/swap/ablate)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from .. import registry
from ..fit_runner import decode_topk, lens_path
from ..interventions import (
    InterventionHook,
    ablate_topk,
    j_lens_vector_for_text,
    patch_swap,
    steer,
)
from ..loader import load_model

logger = logging.getLogger(__name__)
_WEB = Path(__file__).resolve().parent / "web" / "index.html"


class _State:
    model = None
    lens = None
    spec = None
    serve_layers: list[int] = []


STATE = _State()


# --- request models ---
class SliceReq(BaseModel):
    prompt: str
    max_seq_len: int = 256


class ReadoutReq(BaseModel):
    prompt: str
    layer: int
    position: int
    k: int = 10
    max_seq_len: int = 256


class GenerateReq(BaseModel):
    prompt: str
    max_tokens: int = 64
    temperature: float = 0.0


class InterveneReq(BaseModel):
    prompt: str
    layer: int
    position: int = -1
    mode: str = "steer"          # steer | swap | ablate
    token: str = ""              # concept to inject / suppress / swap-from
    token2: str = ""             # swap-to (swap mode)
    alpha: float = 8.0
    k: int = 16                  # ablate: top-k J-space dirs to remove
    max_tokens: int = 48


@torch.no_grad()
def _generate(prompt: str, max_tokens: int, temperature: float = 0.0) -> str:
    model = STATE.model
    input_ids = model.encode(prompt, max_length=1024)
    out = model._hf_model.generate(  # type: ignore[attr-defined]
        input_ids,
        max_new_tokens=max_tokens,
        do_sample=temperature > 0,
        temperature=max(temperature, 1e-5),
        pad_token_id=getattr(model.tokenizer, "eos_token_id", None),
    )
    return model.tokenizer.decode(out[0, input_ids.shape[1]:], skip_special_tokens=True)


def build_app(
    *,
    model_name: str,
    lens_path: str | None = None,
    device_map: Any = None,
    dtype: str | None = None,
) -> FastAPI:
    from jlens.lens import JacobianLens

    spec = registry.get(model_name)
    model = load_model(spec, device_map=device_map, dtype=dtype)
    from ..fit_runner import lens_path as _default_lens_path

    lp = lens_path or str(_default_lens_path(model_name))
    lens = JacobianLens.from_pretrained(lp)

    serve_spec = spec.serve_layers if spec.serve_layers is not None else spec.source_layers
    serve_layers = [l for l in registry.resolve_layers(serve_spec, model.n_layers)
                    if l in lens.source_layers]

    STATE.model, STATE.lens, STATE.spec, STATE.serve_layers = model, lens, spec, serve_layers
    logger.info("serving %s with %d lens layers", model_name, len(serve_layers))

    app = FastAPI(title=f"J-space · {model_name}")

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return _WEB.read_text(encoding="utf-8")

    @app.get("/api/meta")
    def meta() -> dict:
        return {
            "model": model_name,
            "hf_path": spec.hf_path,
            "n_layers": model.n_layers,
            "d_model": model.d_model,
            "lens_layers": serve_layers,
            "n_prompts": lens.n_prompts,
            "notes": spec.notes,
        }

    @app.post("/api/slice")
    def slice_grid(req: SliceReq) -> dict:
        lens_logits, model_logits, input_ids = lens.apply(
            model, req.prompt, layers=serve_layers, positions=None,
            max_seq_len=req.max_seq_len,
        )
        tokens = [model.tokenizer.decode([int(t)]) for t in input_ids[0].tolist()]
        grid = []  # rows = layers (ascending), each row: top-1 token per position
        for layer in serve_layers:
            logits = lens_logits[layer]          # [seq, vocab]
            top1 = logits.argmax(dim=-1).tolist()
            row = [model.tokenizer.decode([tid]) for tid in top1]
            grid.append({"layer": layer, "tokens": row})
        # model output row
        out_top1 = model_logits.argmax(dim=-1).tolist()
        grid.append({
            "layer": model.n_layers - 1,
            "tokens": [model.tokenizer.decode([tid]) for tid in out_top1],
            "is_model": True,
        })
        return {"tokens": tokens, "grid": grid}

    @app.post("/api/readout")
    def readout(req: ReadoutReq) -> dict:
        if req.layer not in lens.source_layers:
            raise HTTPException(400, f"layer {req.layer} not fitted")
        lens_logits, _, _ = lens.apply(
            model, req.prompt, layers=[req.layer], positions=[req.position],
            max_seq_len=req.max_seq_len,
        )
        toks = decode_topk(model, lens_logits[req.layer][0], req.k)
        return {"layer": req.layer, "position": req.position,
                "topk": [{"token": t, "logit": s} for t, s in toks]}

    @app.post("/api/generate")
    def generate(req: GenerateReq) -> dict:
        return {"text": _generate(req.prompt, req.max_tokens, req.temperature)}

    @app.post("/api/intervene")
    def intervene(req: InterveneReq) -> dict:
        if req.layer not in lens.source_layers:
            raise HTTPException(400, f"layer {req.layer} not fitted")
        baseline = _generate(req.prompt, req.max_tokens)

        block = model.layers[req.layer]
        if req.mode == "steer":
            v = j_lens_vector_for_text(lens, model, req.layer, req.token)
            fn = lambda h: steer(h, v.to(h.device), req.alpha)
        elif req.mode == "swap":
            v_s = j_lens_vector_for_text(lens, model, req.layer, req.token)
            v_t = j_lens_vector_for_text(lens, model, req.layer, req.token2)
            fn = lambda h: patch_swap(h, v_s.to(h.device), v_t.to(h.device), req.alpha)
        elif req.mode == "ablate":
            fn = lambda h: ablate_topk(h, lens, model, req.layer, k=req.k)
        else:
            raise HTTPException(400, f"unknown mode {req.mode!r}")

        with InterventionHook(block, fn, positions=[req.position], once=False):
            intervened = _generate(req.prompt, req.max_tokens)
        return {"baseline": baseline, "intervened": intervened,
                "mode": req.mode, "layer": req.layer, "alpha": req.alpha}

    return app

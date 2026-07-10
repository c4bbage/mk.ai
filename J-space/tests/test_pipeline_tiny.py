"""End-to-end pipeline validation on a tiny CPU model (no weights download).

Exercises the real code paths of jspace on top of the vendored jlens:
  1. fit a Jacobian lens on a synthetic residual stack,
  2. read it out (jspace.fit_runner.readout),
  3. the J-space interventions (vectors, steer, swap, ablate, live hook).

The model mirrors jlens.HFLensModel's public surface (`layers`, `_lm_head`,
`_hf_model`, `n_layers`, `d_model`, `encode`, `forward`, `unembed`) so the
intervention utilities that reach for those attributes work unchanged.

Run: python -m pytest tests/test_pipeline_tiny.py -q   (or just execute it).
"""

from __future__ import annotations

from types import SimpleNamespace

import torch
from torch import nn

import jlens
from jspace.fit_runner import readout
from jspace import interventions as itv


class _ResidualBlock(nn.Module):
    def __init__(self, d_model: int) -> None:
        super().__init__()
        self.linear = nn.Linear(d_model, d_model, bias=False)
        with torch.no_grad():
            self.linear.weight.mul_(0.1)

    def forward(self, hidden, *args, **kwargs):
        return hidden + self.linear(hidden)


class _ByteTokenizer:
    bos_token_id = 0
    eos_token_id = 31

    def __call__(self, text, *, return_tensors="pt", truncation=True, max_length=128):
        ids = [self.bos_token_id] + [1 + (b % 30) for b in text.encode()][: max_length - 1]
        return SimpleNamespace(input_ids=torch.tensor([ids]))

    def encode(self, text, add_special_tokens=False):
        return [1 + (b % 30) for b in text.encode()]

    def decode(self, ids, **_kw):
        return "".join(chr(96 + int(i)) for i in ids)


class TinyLensModel:
    """Mirrors jlens.HFLensModel's surface for a CPU-only smoke test."""

    def __init__(self, n_layers=6, d_model=16, vocab=32, seed=0):
        torch.manual_seed(seed)
        self.n_layers = n_layers
        self.d_model = d_model
        self.tokenizer = _ByteTokenizer()
        self._embed = nn.Embedding(vocab, d_model)
        self.layers = nn.ModuleList([_ResidualBlock(d_model) for _ in range(n_layers)])
        self._norm = nn.LayerNorm(d_model)
        self._lm_head = nn.Linear(d_model, vocab, bias=False)
        self.layout = "tiny"
        for p in self._params():
            p.requires_grad_(False)

    def _params(self):
        yield from self._embed.parameters()
        for b in self.layers:
            yield from b.parameters()
        yield from self._norm.parameters()
        yield from self._lm_head.parameters()

    @property
    def input_device(self):
        return self._embed.weight.device

    def encode(self, text, *, max_length=128):
        return self.tokenizer(text, max_length=max_length).input_ids

    def forward(self, input_ids):
        h = self._embed(input_ids)
        for block in self.layers:
            h = block(h)
        return SimpleNamespace(last_hidden_state=h)

    def unembed(self, residual):
        return self._lm_head(self._norm(residual.float()))


PROMPTS = [
    "the quick brown fox jumps over the lazy dog again and again today",
    "a global workspace broadcasts information across specialised modules widely",
    "jacobian lenses read out what a residual is disposed to make a model say",
]


def test_pipeline():
    model = TinyLensModel()

    # 1. fit
    layers = [1, 2, 3, 4]
    lens = jlens.fit(model, PROMPTS, source_layers=layers, dim_batch=4,
                     max_seq_len=64, skip_first=2, checkpoint_path=None)
    assert lens.source_layers == layers
    assert all(lens.jacobians[l].shape == (model.d_model, model.d_model) for l in layers)

    # Late-layer J should be close to identity-ish (diag dominant) for this
    # near-identity stack; just assert it's finite and non-trivial.
    for l in layers:
        J = lens.jacobians[l]
        assert torch.isfinite(J).all()
        assert J.norm() > 0

    # 2. readout
    out = readout(lens, model, PROMPTS[0], layers=[3], positions=[-2], k=5)
    assert out["layers"][3][-2], "expected top-k tokens at (L3, pos -2)"

    # 3. interventions
    V = itv.j_lens_vectors(lens, model, 3)
    assert V.shape == (model._lm_head.weight.shape[0], model.d_model)
    v = itv.j_lens_vector_for_text(lens, model, 3, "a")
    h = torch.randn(model.d_model)
    assert not torch.allclose(itv.steer(h, v, 5.0), h)

    v2 = itv.j_lens_vector(lens, model, 3, 5)
    swapped = itv.patch_swap(h, v, v2, alpha=1.0)
    assert swapped.shape == h.shape and torch.isfinite(swapped).all()

    ablated = itv.ablate_topk(h, lens, model, 3, k=4)
    assert ablated.shape == h.shape and torch.isfinite(ablated).all()

    # 4. live intervention hook changes the forward output at a position
    ids = model.encode(PROMPTS[0])
    with torch.no_grad():
        base = model.forward(ids).last_hidden_state.clone()
    hook = itv.InterventionHook(model.layers[3], lambda x: itv.steer(x, v, 50.0),
                                positions=[5], once=False)
    with torch.no_grad(), hook:
        changed = model.forward(ids).last_hidden_state
    assert not torch.allclose(base[:, 5], changed[:, 5]), "hook must alter position 5"
    # positions we didn't touch downstream-of-hook layer 3: position 0 at the
    # captured layer-3 output should differ only via the hook, so earlier
    # positions before propagation stay equal at the hooked layer's other slots.
    print("OK: fit + readout + interventions + hook all pass")


if __name__ == "__main__":
    test_pipeline()

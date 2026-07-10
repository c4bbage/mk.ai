# J-space — Jacobian-lens observability for Linux/CUDA LLMs

A **model-agnostic framework** for observing the internal "global workspace" of
open-weight decoder LLMs on Linux GPUs, using the **Jacobian lens** (J-lens)
from Anthropic's [*Verbalizable Representations Form a Global Workspace in
Language Models*](https://transformer-circuits.pub/2026/workspace/index.html).

Where the [Mac reference](https://github.com/WeZZard/jlens-qwen36) is MLX/Metal
and Qwen-only (and needs a hand-written GDN backward kernel), this framework
runs on **CUDA with PyTorch autograd** — so it needs *no custom kernels* and
targets **any HuggingFace decoder**: GLM-5.2, Qwen3 / Qwen3.6, and future models
are added by dropping a YAML file into `configs/models/`.

## What the Jacobian lens does

For a residual-stream activation `h_l` at layer `l`, the lens transports it into
the final-layer basis with the **average input→output Jacobian** and decodes it
with the model's own unembedding:

```
lens_l(h) = unembed( J_l · h ),     J_l = E_corpus[ ∂h_final / ∂h_l ]
```

`J_l` is estimated once (a "fit") by backprop over a text corpus. Applying it
reveals what an activation is *disposed to make the model say* — often a concept
the model is privately computing that never appears in the prompt or output
(the boot-shaped-country → `Italy` → `euro` example; a bug detected before it's
described). The reportable directions form the **J-space** — the paper's
LLM analog of a conscious global workspace.

**Interventions** write to that space: `steer` (inject/suppress a concept),
`swap` (exchange concept s for t), `ablate` (remove the top-k J-space component)
— each via the J-lens vector `v_t = J_lᵀ · W_U[t]`.

## Architecture

```
jspace/
  registry.py       # ModelSpec + configs/models/*.yaml  (add a model = add a file)
  loader.py         # differentiable HF load (+ fp8/quant guard) -> jlens.LensModel
  corpus.py         # prompt corpus loading (file / dir / wikitext)
  fit_runner.py     # fit orchestration (resumable) + readout helper
  interventions.py  # J-lens vectors, steer / swap / ablate, live forward hook
  serve/app.py      # FastAPI: slice grid, readout, generate, intervene
  serve/web/        # self-contained slice-vis UI (no build step)
  cli.py            # `jspace list-models | probe | fit | readout | serve`
vendor/jlens/       # Anthropic reference core (Apache-2.0), vendored unchanged
configs/models/     # glm-5.2-fp8, qwen3.6-27b, qwen3-32b, qwen3-8b, qwen3-4b, qwen3-0.6b
scripts/            # deploy_h202.sh, setup_env.sh  (isolated conda env)
tests/              # tiny CPU end-to-end pipeline test
docs/               # the papers + both reference implementations
```

The heavy math (the VJP estimator, `JacobianLens`, HF layout auto-detection) is
the vendored Anthropic `jlens`. `jspace` is the operations layer around it:
registry, loading, interventions, serving, and remote orchestration.

## Install (local / dev)

```bash
uv venv --python 3.12 .venv && source .venv/bin/activate
uv pip install torch numpy pyyaml               # CPU is enough for the tiny test
uv pip install -e vendor/jlens -e .
python -m tests.test_pipeline_tiny              # fit+readout+interventions on a toy model
```

## Deploy + run on a Linux GPU box (h202)

```bash
scripts/deploy_h202.sh --setup      # rsync + create isolated conda env `jspace`
ssh h202
conda activate jspace && cd /data/jspace
jspace list-models
jspace probe   qwen3-0.6b           # loads the model, checks layout/layers
jspace fit     qwen3-0.6b --n-prompts 60 --corpus /data/corpus_real.txt
jspace readout qwen3-0.6b "Fact: The currency used in the country shaped like a boot is the" --position -2
jspace serve   qwen3-0.6b --host 0.0.0.0 --port 8765
# then locally:  ssh -N -L 8765:127.0.0.1:8765 h202   and open http://127.0.0.1:8765
```

## Download pre-fitted lenses (skip the fit!)

[Neuronpedia](https://neuronpedia.org) has pre-computed Jacobian lenses for **38 open
models** at [neuronpedia/jacobian-lens](https://huggingface.co/neuronpedia/jacobian-lens).
Each was fitted on Salesforce/wikitext with Anthropic's companion code.

```bash
jspace download --list                    # show all 38 available models
jspace download qwen3-4b                  # download one lens (~459 MB)
jspace download qwen3-8b qwen3.5-4b       # download multiple

# Use directly — no fit needed:
jspace readout qwen3-4b "The capital of France is" --position -2 --download
jspace serve   qwen3-4b --download
```

Supported families: Gemma 2/3/4, GPT-OSS-20B, GPT-2, Llama 3.1/3.3, OLMo-3,
Pythia, Qwen 2.5/3/3.5/3.6. See `jspace download --list` for the full catalog.

The interactive [CKA explorer](https://eliebak.com/viz/jspace-open) visualizes
cross-model workspace geometry from the same fits.

Fitting a lens needs **backward passes** through the model. That means:

1. **Not the serving process.** vLLM/SGLang are inference-only — the lens loads
   its *own* grad-capable HF copy of the weights.
2. **fp8/w4afp8 checkpoints** are auto-dequantized to bf16 on load and support
   autograd — no separate copy needed. The in-memory footprint is ~2× the
   on-disk fp8 size, so watch GPU memory. **AWQ/GPTQ** (int-weight quants) are
   not differentiable and still need a bf16 copy via `grad_weights_path`.
3. **GPU memory.** Fitting needs free VRAM:
   - `qwen3-0.6b` / `qwen3-4b` (~1–8 GB) fit a single GPU — **use to validate**.
   - `qwen3-8b` / `qwen3.6-27b` / `qwen3-32b` need one or more freed cards.
   - **GLM-5.2** (~355B MoE, ~700 GB in bf16 memory) needs a dedicated
     multi-GPU allocation. See `configs/models/glm-5.2-fp8.yaml`.

Cost scales as `~ceil(d_model / dim_batch)` backward passes per prompt per fit.
Start with a sparse layer subset (`--source-layers every4`) and ~100 prompts.

## Add a new model (the extensibility story)

Drop a file in `configs/models/<name>.yaml`:

```yaml
name: my-model
hf_path: org/my-model          # HF repo id or local /data path
dtype: bfloat16
device_map: auto               # or {"": 0} to pin one GPU
checkpoint_quant: none         # fp8|w4afp8|awq|gptq -> also set grad_weights_path
source_layers: workspace       # all | workspace | late | early | "16:48" | every4 | [20,30,40]
corpus: /data/corpus_real.txt
```

`jspace probe my-model` verifies the layout auto-detects (Llama/Qwen/Mistral/
Gemma/GLM-style `model.layers` are covered) and the layers resolve. Unusual
layouts: set the `layout:` block. No code change is ever required.

## Attribution

Core math vendored from Anthropic's `jlens` (Apache-2.0) — see `NOTICE`.
Multi-model goal inspired by the Mac/MLX `jlens-qwen36`. Licensed Apache-2.0.

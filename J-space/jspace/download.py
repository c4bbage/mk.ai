"""Download pre-fitted Jacobian lenses from the Neuronpedia Hub collection.

The `neuronpedia/jacobian-lens <https://huggingface.co/neuronpedia/jacobian-lens>`_
repo hosts pre-computed Jacobian lenses for 38 open models, fitted by Neuronpedia
using Anthropic's jlens companion code on Salesforce/wikitext. Each model has a
``jlens/Salesforce-wikitext/<Model>_jacobian_lens.pt`` file (~400 MB–1 GB each).

Usage::

    jspace download qwen3-4b              # download lens for Qwen3-4B
    jspace download qwen3-8b qwen3.5-4b   # download multiple
    jspace download --list                # show all available models
    jspace download --all                 # download everything (big!)
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Sequence

logger = logging.getLogger(__name__)

HF_REPO = "neuronpedia/jacobian-lens"
_CORPUS_DIR = "Salesforce-wikitext"

_REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("JSPACE_DATA_DIR", _REPO_ROOT / "data"))

# Mapping from our jspace model slug -> (hf_directory, pt_filename).
# The HF repo has: {slug}/jlens/Salesforce-wikitext/{ModelName}_jacobian_lens.pt
# We only need slug + filename; the jlens/Salesforce-wikitext prefix is constant.
_PRECOMPUTED: dict[str, str] = {
    "gemma-2-27b": "Gemma-2-27B_jacobian_lens.pt",
    "gemma-2-2b": "Gemma-2-2B_jacobian_lens.pt",
    "gemma-2-2b-it": "Gemma-2-2B-IT_jacobian_lens.pt",
    "gemma-2-9b": "Gemma-2-9B_jacobian_lens.pt",
    "gemma-2-9b-it": "Gemma-2-9B-IT_jacobian_lens.pt",
    "gemma-3-1b": "Gemma-3-1B_jacobian_lens.pt",
    "gemma-3-1b-it": "Gemma-3-1B-IT_jacobian_lens.pt",
    "gemma-3-4b": "Gemma-3-4B_jacobian_lens.pt",
    "gemma-3-4b-it": "Gemma-3-4B-IT_jacobian_lens.pt",
    "gemma-3-12b": "Gemma-3-12B_jacobian_lens.pt",
    "gemma-3-12b-it": "Gemma-3-12B-IT_jacobian_lens.pt",
    "gemma-3-27b": "Gemma-3-27B_jacobian_lens.pt",
    "gemma-3-27b-it": "Gemma-3-27B-IT_jacobian_lens.pt",
    "gemma-3-270m": "Gemma-3-270M_jacobian_lens.pt",
    "gemma-3-270m-it": "Gemma-3-270M-IT_jacobian_lens.pt",
    "gemma-4-31b": "Gemma-4-31B_jacobian_lens.pt",
    "gemma-4-e2b": "Gemma-4-E2B_jacobian_lens.pt",
    "gemma-4-e4b": "Gemma-4-E4B_jacobian_lens.pt",
    "gpt-oss-20b": "GPT-OSS-20B_jacobian_lens.pt",
    "gpt2-small": "GPT2-Small_jacobian_lens.pt",
    "llama3.1-8b": "Llama-3.1-8B_jacobian_lens.pt",
    "llama3.1-8b-it": "Llama-3.1-8B-IT_jacobian_lens.pt",
    "llama3.3-70b-it": "Llama-3.3-70B-IT_jacobian_lens.pt",
    "olmo-3-1025-7b": "OLMo-3-1025-7B_jacobian_lens.pt",
    "olmo-3-1125-32b": "OLMo-3-1125-32B_jacobian_lens.pt",
    "pythia-70m-deduped": "Pythia-70M-Deduped_jacobian_lens.pt",
    "qwen2.5-7b-it": "Qwen2.5-7B-IT_jacobian_lens.pt",
    "qwen3-1.7b": "Qwen3-1.7B_jacobian_lens.pt",
    "qwen3-4b": "Qwen3-4B_jacobian_lens.pt",
    "qwen3-8b": "Qwen3-8B_jacobian_lens.pt",
    "qwen3-14b": "Qwen3-14B_jacobian_lens.pt",
    "qwen3-32b": "Qwen3-32B_jacobian_lens.pt",
    "qwen3.5-0.8b": "Qwen3.5-0.8B_jacobian_lens.pt",
    "qwen3.5-2b-pt": "Qwen3.5-2B-PT_jacobian_lens.pt",
    "qwen3.5-4b": "Qwen3.5-4B_jacobian_lens.pt",
    "qwen3.5-9b-pt": "Qwen3.5-9B-PT_jacobian_lens.pt",
    "qwen3.5-27b": "Qwen3.5-27B_jacobian_lens.pt",
    "qwen3.6-27b": "Qwen3.6-27B_jacobian_lens.pt",
}


def available() -> list[str]:
    """All model slugs that have pre-computed lenses on the Hub."""
    return sorted(_PRECOMPUTED)


def hub_path(slug: str) -> str:
    """The ``filename`` argument for :meth:`JacobianLens.from_pretrained`."""
    if slug not in _PRECOMPUTED:
        raise KeyError(
            f"no pre-computed lens for {slug!r}. Available: {available()}"
        )
    return f"{slug}/jlens/{_CORPUS_DIR}/{_PRECOMPUTED[slug]}"


def local_path(slug: str) -> Path:
    """Where we save a downloaded lens locally."""
    return DATA_DIR / "lens" / f"{slug}.lens.pt"


def download(slug: str, *, force: bool = False) -> Path:
    """Download the pre-fitted lens for ``slug`` to the local data dir.

    Returns the local path to the ``.lens.pt`` file.
    """
    out = local_path(slug)
    if out.exists() and not force:
        logger.info("lens for %s already cached at %s", slug, out)
        return out

    from huggingface_hub import hf_hub_download

    logger.info("downloading pre-fitted lens for %s from %s", slug, HF_REPO)
    hf_path = hf_hub_download(
        repo_id=HF_REPO,
        filename=hub_path(slug),
        repo_type="model",
    )

    out.parent.mkdir(parents=True, exist_ok=True)
    # Symlink into our data dir so readout/serve can find it by convention.
    if out.exists() or out.is_symlink():
        out.unlink()
    out.symlink_to(hf_path)
    logger.info("downloaded %s -> %s", slug, out)
    return out


def download_many(slugs: Sequence[str], *, force: bool = False) -> dict[str, Path]:
    """Download lenses for multiple models."""
    results = {}
    for slug in slugs:
        try:
            results[slug] = download(slug, force=force)
        except Exception as e:
            logger.error("failed to download %s: %s", slug, e)
    return results

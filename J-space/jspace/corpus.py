"""Prompt corpus loading for fitting.

The lens is an *expectation* over a generic text corpus. Quality saturates
fast (~100 prompts is usable; the paper uses 1000). We take prompts from:
  - a local ``.txt`` file (one document per line, or blank-line-separated),
  - the string ``"wikitext"`` (via jlens.examples, needs `datasets`),
  - or a directory of ``.txt`` files.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


def _split_documents(text: str) -> list[str]:
    # Prefer blank-line-separated documents; fall back to one-per-line.
    blocks = [b.strip() for b in text.split("\n\n") if b.strip()]
    if len(blocks) > 1:
        return blocks
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def load_prompts(source: str, *, n: int = 100, min_chars: int = 400) -> list[str]:
    """Return up to ``n`` prompts of at least ``min_chars`` characters.

    Args:
        source: A file path, a directory of ``.txt`` files, or ``"wikitext"``.
        n: Max number of prompts.
        min_chars: Drop documents shorter than this (too few valid positions).
    """
    if source == "wikitext":
        from jlens.examples import load_wikitext_prompts

        return load_wikitext_prompts(n, min_chars=min_chars)

    path = Path(source)
    if not path.exists():
        raise FileNotFoundError(f"corpus source not found: {source}")

    docs: list[str] = []
    if path.is_dir():
        for f in sorted(path.glob("*.txt")):
            docs.extend(_split_documents(f.read_text(encoding="utf-8", errors="ignore")))
    else:
        docs = _split_documents(path.read_text(encoding="utf-8", errors="ignore"))

    prompts = [d for d in docs if len(d) >= min_chars]
    if not prompts:
        # Corpus is short lines; concatenate into chunks so positions exist.
        joined = " ".join(docs)
        step = max(min_chars * 2, 1000)
        prompts = [joined[i : i + step] for i in range(0, len(joined), step)]
        prompts = [p for p in prompts if len(p) >= min_chars]

    logger.info("loaded %d prompts from %s (using %d)", len(prompts), source, min(n, len(prompts)))
    return prompts[:n]

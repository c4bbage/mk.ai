"""jspace CLI: list-models, download, probe, fit, readout, serve.

    jspace list-models
    jspace download <model> [...]        # download pre-fitted lens from Neuronpedia Hub
    jspace download --list               # show all 38 available pre-fitted models
    jspace probe <model>                 # load + check layout/layers, no fit
    jspace fit <model> [--n-prompts N] [--source-layers workspace] [--device-map auto]
    jspace readout <model> "<prompt>" [--layers 20,30,40] [--position -2]
    jspace serve <model> [--host 127.0.0.1] [--port 8765]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

from . import registry


def _add_common(p: argparse.ArgumentParser) -> None:
    p.add_argument("--device-map", default=None, help='"auto" | "cuda" | \'{"":0}\'')
    p.add_argument("--dtype", default=None, help="bfloat16|float16|float32")


def _parse_device_map(s: str | None):
    if s is None:
        return None
    s = s.strip()
    if s.startswith("{"):
        return json.loads(s)
    return s


def cmd_list_models(args) -> int:
    names = registry.available()
    if not names:
        print("no models registered (configs/models/*.yaml)")
        return 0
    for name in names:
        spec = registry.get(name)
        print(f"{name:24s} {spec.hf_path}")
        if spec.notes:
            print(f"{'':24s}   {spec.notes}")
    return 0


def cmd_download(args) -> int:
    from . import download as dl

    if args.list:
        print("Pre-fitted lenses available from neuronpedia/jacobian-lens:")
        for slug in dl.available():
            marker = " ✓" if dl.local_path(slug).exists() else ""
            print(f"  {slug:24s}{marker}")
        print(f"\nDownload with: jspace download <model> [<model> ...]")
        return 0

    if not args.models:
        print("usage: jspace download <model> [<model> ...] | --list")
        return 1

    paths = dl.download_many(args.models, force=args.force)
    if paths:
        print(f"downloaded {len(paths)} lens(es):")
        for slug, path in paths.items():
            print(f"  {slug:24s} -> {path}")
    else:
        print("no lenses downloaded")
    return 0 if paths else 1


def cmd_probe(args) -> int:
    from .loader import load_model

    spec = registry.get(args.model)
    model = load_model(spec, device_map=_parse_device_map(args.device_map), dtype=args.dtype)
    layers = registry.resolve_layers(spec.source_layers, model.n_layers)
    print(f"{spec.name}: n_layers={model.n_layers} d_model={model.d_model}")
    print(f"  layout: {model.layout}")
    print(f"  source_layers -> {layers[0]}..{layers[-1]} ({len(layers)} layers)")
    print("  OK: model is grad-capable and layout resolved.")
    return 0


def cmd_fit(args) -> int:
    from .fit_runner import run_fit

    spec = registry.get(args.model)
    run_fit(
        spec,
        n_prompts=args.n_prompts,
        source_layers=args.source_layers,
        max_seq_len=args.max_seq_len,
        dim_batch=args.dim_batch,
        device_map=_parse_device_map(args.device_map),
        dtype=args.dtype,
        compile=args.compile,
        resume=not args.no_resume,
    )
    return 0


def cmd_readout(args) -> int:
    from .fit_runner import lens_path, readout
    from .loader import load_model
    from . import download
    from jlens.lens import JacobianLens

    spec = registry.get(args.model)
    model = load_model(spec, device_map=_parse_device_map(args.device_map), dtype=args.dtype)

    lp = args.lens or str(lens_path(spec.name))
    if not args.lens and args.download and spec.name in download.available():
        lp = str(download.download(spec.name))

    lens = JacobianLens.from_pretrained(lp)
    layers = [int(x) for x in args.layers.split(",")] if args.layers else None
    positions = [int(x) for x in args.position.split(",")] if args.position else None
    out = readout(lens, model, args.prompt, layers=layers, positions=positions, k=args.k)
    print("tokens:", "".join(out["tokens"]))
    for layer, per_pos in out["layers"].items():
        for pos, toks in per_pos.items():
            words = "  ".join(f"{t.strip()!r}" for t, _ in toks)
            print(f"  L{layer:<3d} pos{pos:<4d}: {words}")
    return 0


def cmd_serve(args) -> int:
    import uvicorn

    from .serve.app import build_app
    from . import download

    spec = registry.get(args.model)
    lp = args.lens
    if not lp and args.download and spec.name in download.available():
        lp = str(download.download(spec.name))

    app = build_app(
        model_name=args.model,
        lens_path=lp,
        device_map=_parse_device_map(args.device_map),
        dtype=args.dtype,
    )
    uvicorn.run(app, host=args.host, port=args.port)
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    parser = argparse.ArgumentParser(prog="jspace", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list-models").set_defaults(func=cmd_list_models)

    p = sub.add_parser("download", help="Download pre-fitted lens from Neuronpedia Hub")
    p.add_argument("models", nargs="*", help="model slug(s) to download")
    p.add_argument("--list", action="store_true", help="list all available models")
    p.add_argument("--force", action="store_true", help="re-download even if cached")
    p.set_defaults(func=cmd_download)

    p = sub.add_parser("probe"); p.add_argument("model"); _add_common(p)
    p.set_defaults(func=cmd_probe)

    p = sub.add_parser("fit"); p.add_argument("model"); _add_common(p)
    p.add_argument("--n-prompts", type=int, default=None)
    p.add_argument("--source-layers", default=None)
    p.add_argument("--max-seq-len", type=int, default=None)
    p.add_argument("--dim-batch", type=int, default=None)
    p.add_argument("--compile", action="store_true")
    p.add_argument("--no-resume", action="store_true")
    p.set_defaults(func=cmd_fit)

    p = sub.add_parser("readout"); p.add_argument("model"); p.add_argument("prompt")
    _add_common(p)
    p.add_argument("--lens", default=None)
    p.add_argument("--layers", default=None, help="comma-separated layer indices")
    p.add_argument("--position", default=None, help="comma-separated positions (e.g. -2)")
    p.add_argument("-k", type=int, default=8)
    p.add_argument("--download", action="store_true",
                   help="download pre-fitted lens from Hub if not found locally")
    p.set_defaults(func=cmd_readout)

    p = sub.add_parser("serve"); p.add_argument("model"); _add_common(p)
    p.add_argument("--lens", default=None)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--download", action="store_true",
                   help="download pre-fitted lens from Hub if not found locally")
    p.set_defaults(func=cmd_serve)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

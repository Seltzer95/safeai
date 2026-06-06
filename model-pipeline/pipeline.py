#!/usr/bin/env python3
"""Export a HuggingFace model to ONNX and produce quantized q8 / q4 variants
for use with transformers.js v4.

Output layout (mirrors what transformers.js loads by default):

    {output_dir}/{model-slug}/
        config.json
        tokenizer.json
        tokenizer_config.json
        special_tokens_map.json
        onnx/
            model.onnx               ← float32   (dtype="fp32")
            model_quantized.onnx     ← int8       (dtype="q8")
            model_q4.onnx            ← int4       (dtype="q4")

Usage:
    python pipeline.py
    python pipeline.py --model BAAI/bge-small-en-v1.5
    python pipeline.py --model sentence-transformers/all-MiniLM-L6-v2 \\
                       --output-dir ./artifacts
    python pipeline.py --skip-validation   # skip the quality table
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from tabulate import tabulate

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"

SAMPLE_SENTENCES: list[str] = [
    "The quick brown fox jumps over the lazy dog.",
    "Machine learning models can be deployed directly in browsers.",
    "Sentence embeddings capture semantic meaning of text.",
    "Paris is the capital of France.",
    "Quantum computing leverages superposition and entanglement.",
    "Open-source software powers the modern internet.",
    "The transformer architecture revolutionised natural language processing.",
]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description=(
            "Export a HuggingFace model to ONNX and produce q8 / q4 variants "
            "ready for transformers.js v4."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        metavar="MODEL_ID",
        help="HuggingFace Hub model ID to export.",
    )
    parser.add_argument(
        "--output-dir",
        default="./artifacts",
        type=Path,
        metavar="DIR",
        help="Root directory for exported artifact trees.",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip the embedding quality validation step.",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------


def slug_from_id(model_id: str) -> str:
    """Convert a HuggingFace model ID to a safe directory name.

    Example:
        >>> slug_from_id("sentence-transformers/all-MiniLM-L6-v2")
        'sentence-transformers--all-MiniLM-L6-v2'
    """
    return model_id.replace("/", "--")


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Compute per-row cosine similarity between two embedding matrices.

    Args:
        a: Reference embeddings, shape (N, D).
        b: Comparison embeddings, shape (N, D).

    Returns:
        1-D array of shape (N,) with values in [-1, 1].
    """
    a_norm = a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-9)
    b_norm = b / np.maximum(np.linalg.norm(b, axis=1, keepdims=True), 1e-9)
    return (a_norm * b_norm).sum(axis=1)


def _print_tree(root: Path, prefix: str = "") -> None:
    """Recursively print a directory tree."""
    children = sorted(root.iterdir())
    for i, child in enumerate(children):
        is_last = i == len(children) - 1
        connector = "└── " if is_last else "├── "
        print(prefix + connector + child.name)
        if child.is_dir():
            extension = "    " if is_last else "│   "
            _print_tree(child, prefix + extension)


# ---------------------------------------------------------------------------
# Step 1 — Export to ONNX (float32)
# ---------------------------------------------------------------------------


def export_fp32(model_id: str, model_dir: Path) -> Path:
    """Export a HuggingFace model to ONNX float32 using optimum-onnx.

    Also saves the tokenizer and config files alongside the ONNX model so that
    the output directory is self-contained and transformers.js can load it
    without any additional files.

    The optimum-onnx package saves ONNX weights to an ``onnx/`` subfolder;
    this function normalises older flat layouts to that same structure.

    Args:
        model_id: HuggingFace Hub model ID.
        model_dir: Destination directory (created if absent).

    Returns:
        Absolute path to the exported ``onnx/model.onnx``.
    """
    # Heavy imports deferred so missing packages raise clear, localised errors.
    # If optimum-onnx changed its import path from the classic optimum layout,
    # check the package release notes and update the import below accordingly.
    from optimum.onnxruntime import ORTModelForFeatureExtraction  # type: ignore[import]
    from transformers import AutoTokenizer

    print(f"\n[1/4] Exporting {model_id!r} → ONNX fp32 …")
    model_dir.mkdir(parents=True, exist_ok=True)

    ort_model = ORTModelForFeatureExtraction.from_pretrained(model_id, export=True)
    ort_model.save_pretrained(model_dir)

    # Save tokenizer separately — some optimum versions don't include it.
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    tokenizer.save_pretrained(model_dir)

    # Locate the ONNX file.  Newer optimum-onnx saves to onnx/model.onnx;
    # older builds place it at the root.
    candidates = [
        model_dir / "onnx" / "model.onnx",
        model_dir / "model.onnx",
    ]
    fp32_path: Path | None = next((p for p in candidates if p.exists()), None)
    if fp32_path is None:
        raise FileNotFoundError(
            f"Export finished but model.onnx not found under {model_dir}. "
            "Check your optimum-onnx version and its save layout."
        )

    # Normalise to onnx/model.onnx so transformers.js finds it.
    canonical = model_dir / "onnx" / "model.onnx"
    if fp32_path != canonical:
        canonical.parent.mkdir(exist_ok=True)
        fp32_path.rename(canonical)
        fp32_path = canonical

    mb = fp32_path.stat().st_size / 1_048_576
    print(f"    ✓  onnx/model.onnx  ({mb:.1f} MB)")
    return fp32_path


# ---------------------------------------------------------------------------
# Step 2 — Quantise to int8 (q8)
# ---------------------------------------------------------------------------


def quantize_q8(fp32_path: Path, q8_path: Path) -> Path:
    """Produce a dynamic int8-quantised ONNX model (transformers.js dtype="q8").

    Applies ``onnxruntime.quantization.quantize_dynamic`` with ``QInt8``
    weight type.  All MatMul and Gemm nodes are quantised; activations remain
    in float32 (dynamic quantisation — no calibration data required).

    Args:
        fp32_path: Source float32 ONNX model.
        q8_path: Destination path for ``model_quantized.onnx``.

    Returns:
        *q8_path* after successful quantisation.
    """
    from onnxruntime.quantization import QuantType, quantize_dynamic  # type: ignore[import]

    print("\n[2/4] Quantising → int8 (q8) …")
    q8_path.parent.mkdir(parents=True, exist_ok=True)

    quantize_dynamic(
        model_input=str(fp32_path),
        model_output=str(q8_path),
        weight_type=QuantType.QInt8,
    )

    mb_in = fp32_path.stat().st_size / 1_048_576
    mb_out = q8_path.stat().st_size / 1_048_576
    print(f"    ✓  onnx/model_quantized.onnx  ({mb_in:.1f} MB → {mb_out:.1f} MB, "
          f"{mb_out/mb_in:.0%} of original)")
    return q8_path


# ---------------------------------------------------------------------------
# Step 3 — Quantise to int4 (q4)
# ---------------------------------------------------------------------------


def quantize_q4(fp32_path: Path, q4_path: Path) -> Path:
    """Produce a block-wise 4-bit weight-quantised ONNX model (dtype="q4").

    Uses ``MatMulNBitsQuantizer`` from ``onnxruntime.quantization``, which
    quantises the weight matrices of all MatMul nodes to block-wise int4
    (block_size=32, symmetric).  Activations remain in float32.  This matches
    the scheme transformers.js expects when ``dtype: "q4"`` is requested.

    Requires onnxruntime >= 1.16 (class renamed from ``MatMul4BitsQuantizer``
    to ``MatMulNBitsQuantizer`` in onnxruntime 1.20+).

    Args:
        fp32_path: Source float32 ONNX model.
        q4_path: Destination path for ``model_q4.onnx``.

    Returns:
        *q4_path* after successful quantisation.
    """
    from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer  # type: ignore[import]

    print("\n[3/4] Quantising → int4 (q4) …")
    q4_path.parent.mkdir(parents=True, exist_ok=True)

    quantizer = MatMulNBitsQuantizer(
        model=str(fp32_path),
        block_size=32,
        is_symmetric=True,
    )
    quantizer.process()
    quantizer.model.save_model_to_file(str(q4_path), use_external_data_format=False)

    mb_in = fp32_path.stat().st_size / 1_048_576
    mb_out = q4_path.stat().st_size / 1_048_576
    print(f"    ✓  onnx/model_q4.onnx  ({mb_in:.1f} MB → {mb_out:.1f} MB, "
          f"{mb_out/mb_in:.0%} of original)")
    return q4_path


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def _mean_pool_np(token_embeddings: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
    """Attention-mask-weighted mean pool over the sequence dimension.

    Args:
        token_embeddings: Shape (batch, seq_len, hidden_dim).
        attention_mask: Shape (batch, seq_len) with 0/1 values.

    Returns:
        Shape (batch, hidden_dim).
    """
    mask = attention_mask[:, :, np.newaxis].astype(np.float32)
    summed = (token_embeddings * mask).sum(axis=1)
    counts = mask.sum(axis=1).clip(min=1e-9)
    return summed / counts


def embed_with_torch(sentences: list[str], model_id: str) -> np.ndarray:
    """Compute L2-normalised sentence embeddings via the original PyTorch model.

    Uses mean pooling over the last hidden states (standard for BERT-family
    sentence-embedding models).

    Args:
        sentences: Input sentences.
        model_id: HuggingFace Hub model ID.

    Returns:
        Float32 array of shape (N, D) with unit-norm rows.
    """
    import torch  # type: ignore[import]
    from transformers import AutoModel, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = AutoModel.from_pretrained(model_id)
    model.eval()

    encoded = tokenizer(
        sentences,
        padding=True,
        truncation=True,
        max_length=128,
        return_tensors="pt",
    )
    with torch.no_grad():
        outputs = model(**encoded)

    attention_mask: torch.Tensor = encoded["attention_mask"]
    token_embs: torch.Tensor = outputs.last_hidden_state
    mask = attention_mask.unsqueeze(-1).expand(token_embs.size()).float()
    pooled = torch.sum(token_embs * mask, dim=1) / torch.clamp(
        mask.sum(dim=1), min=1e-9
    )
    pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)
    return pooled.cpu().numpy()


def embed_with_onnx(
    sentences: list[str],
    tokenizer_path: Path,
    onnx_path: Path,
) -> np.ndarray:
    """Compute L2-normalised sentence embeddings using an ONNX model.

    Handles three common output layouts produced by optimum-onnx exports:

    1. A 3-D ``last_hidden_state`` (batch, seq, dim) — mean-pooled here.
    2. An explicit 2-D ``sentence_embedding`` (batch, dim) — used directly.
    3. Any other 2-D first output — used directly.

    Args:
        sentences: Input sentences.
        tokenizer_path: Directory that contains the saved tokenizer files.
        onnx_path: Path to the ``.onnx`` model file.

    Returns:
        Float32 array of shape (N, D) with unit-norm rows.
    """
    import onnxruntime as ort  # type: ignore[import]
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(str(tokenizer_path))
    session = ort.InferenceSession(
        str(onnx_path), providers=["CPUExecutionProvider"]
    )

    encoded = tokenizer(
        sentences,
        padding=True,
        truncation=True,
        max_length=128,
        return_tensors="np",
    )

    # Only feed inputs the model declares.
    accepted_inputs = {inp.name for inp in session.get_inputs()}
    feeds = {k: v for k, v in encoded.items() if k in accepted_inputs}

    outputs = session.run(None, feeds)
    output_names = [o.name for o in session.get_outputs()]

    # Prefer an explicit sentence-level embedding when the model exports one.
    sentence_emb_idx: int | None = next(
        (i for i, n in enumerate(output_names) if "sentence" in n.lower()),
        None,
    )
    if sentence_emb_idx is not None and outputs[sentence_emb_idx].ndim == 2:
        pooled = outputs[sentence_emb_idx].astype(np.float32)
    elif outputs[0].ndim == 3:
        # Token-level hidden states → mean pool.
        attention_mask = feeds["attention_mask"]
        pooled = _mean_pool_np(outputs[0].astype(np.float32), attention_mask)
    else:
        pooled = outputs[0].astype(np.float32)

    norms = np.linalg.norm(pooled, axis=1, keepdims=True)
    return pooled / np.maximum(norms, 1e-9)


# ---------------------------------------------------------------------------
# Step 4 — Validation
# ---------------------------------------------------------------------------


def validate(
    sentences: list[str],
    model_dir: Path,
    model_id: str,
    fp32_path: Path,
    q8_path: Path,
    q4_path: Path,
) -> None:
    """Embed sentences with every variant and print a cosine-similarity table.

    The PyTorch model is the reference (ground truth).  Each column in the
    table shows per-sentence cosine similarity vs. that reference:

    - **fp32 ONNX** — should be ≈ 1.000 000 (lossless export check).
    - **q8 (int8)** — typically ≥ 0.999 8 (excellent).
    - **q4 (int4)** — typically ≥ 0.998 (good; ~4× smaller than fp32).

    Args:
        sentences: Sentences to use for the quality check.
        model_dir: Root artifact directory (also the tokenizer path).
        model_id: Original HuggingFace model ID for loading PyTorch weights.
        fp32_path: Path to the float32 ONNX model.
        q8_path: Path to the q8 ONNX model.
        q4_path: Path to the q4 ONNX model.
    """
    print("\n[4/4] Validating embedding quality …")
    print("      (loading PyTorch reference model — this may download weights)\n")

    ref = embed_with_torch(sentences, model_id)
    fp32_embs = embed_with_onnx(sentences, model_dir, fp32_path)
    q8_embs = embed_with_onnx(sentences, model_dir, q8_path)
    q4_embs = embed_with_onnx(sentences, model_dir, q4_path)

    sim_fp32 = cosine_similarity(ref, fp32_embs)
    sim_q8 = cosine_similarity(ref, q8_embs)
    sim_q4 = cosine_similarity(ref, q4_embs)

    MAX_SENT_LEN = 54
    rows: list[tuple[str, str, str, str]] = []
    for i, s in enumerate(sentences):
        label = (s[: MAX_SENT_LEN - 1] + "…") if len(s) > MAX_SENT_LEN else s
        rows.append((label, f"{sim_fp32[i]:.6f}", f"{sim_q8[i]:.6f}", f"{sim_q4[i]:.6f}"))

    # Separator + mean row.
    rows.append(("─" * MAX_SENT_LEN, "─" * 10, "─" * 10, "─" * 10))
    rows.append((
        "MEAN",
        f"{sim_fp32.mean():.6f}",
        f"{sim_q8.mean():.6f}",
        f"{sim_q4.mean():.6f}",
    ))

    print(
        tabulate(
            rows,
            headers=["Sentence", "fp32 ONNX", "q8 (int8)", "q4 (int4)"],
            tablefmt="github",
            colalign=("left", "right", "right", "right"),
        )
    )
    print()
    print("Cosine similarity vs. original PyTorch model (higher = better).")
    print("  fp32 ONNX ≈ 1.000000  → lossless ONNX export  ✓")
    print("  q8        ≥ 0.999800  → excellent quantisation quality")
    print("  q4        ≥ 0.998000  → good quality, ~4× size reduction")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Orchestrate export → quantisation → validation."""
    args = parse_args()
    model_id: str = args.model
    root_dir: Path = args.output_dir
    model_dir: Path = root_dir / slug_from_id(model_id)

    print(f"Model   : {model_id}")
    print(f"Output  : {model_dir.resolve()}")

    fp32_path = export_fp32(model_id, model_dir)

    onnx_dir = fp32_path.parent
    q8_path = onnx_dir / "model_quantized.onnx"
    q4_path = onnx_dir / "model_q4.onnx"

    quantize_q8(fp32_path, q8_path)
    quantize_q4(fp32_path, q4_path)

    if not args.skip_validation:
        validate(
            SAMPLE_SENTENCES,
            model_dir,
            model_id,
            fp32_path,
            q8_path,
            q4_path,
        )

    print(f"\nDone.  Artifacts saved to: {model_dir.resolve()}\n")
    _print_tree(model_dir)


if __name__ == "__main__":
    main()

# model-pipeline

Exports a HuggingFace model to ONNX and produces quantized `q8` (int8) and
`q4` (int4) variants that transformers.js v4 can load directly in the browser.

## Output layout

```
artifacts/
└── sentence-transformers--all-MiniLM-L6-v2/
    ├── config.json
    ├── tokenizer.json
    ├── tokenizer_config.json
    ├── special_tokens_map.json
    └── onnx/
        ├── model.onnx               ← float32  (dtype="fp32")
        ├── model_quantized.onnx     ← int8      (dtype="q8")
        └── model_q4.onnx            ← int4      (dtype="q4")
```

Plug the artifact directory straight into transformers.js:

```js
import { pipeline } from "@huggingface/transformers";

const extractor = await pipeline("feature-extraction", "./artifacts/sentence-transformers--all-MiniLM-L6-v2", {
  dtype: "q8",   // or "q4" / "fp32"
});
```

---

## Prerequisites

- Python 3.14 (see compatibility notes below)
- The venv that already lives at `model-pipeline/venv/`

## Installation

```bash
cd model-pipeline
source venv/bin/activate          # activate the existing venv
pip install -r requirements.txt
```

---

## Running the pipeline

### Default model (`sentence-transformers/all-MiniLM-L6-v2`)

```bash
python pipeline.py
```

### Custom model

```bash
python pipeline.py --model BAAI/bge-small-en-v1.5
python pipeline.py --model intfloat/multilingual-e5-small
```

### Custom output directory

```bash
python pipeline.py --model BAAI/bge-small-en-v1.5 --output-dir ./my-models
```

### Skip the validation step (faster, no PyTorch needed at runtime)

```bash
python pipeline.py --skip-validation
```

### All options

```
usage: pipeline.py [-h] [--model MODEL_ID] [--output-dir DIR] [--skip-validation]

  --model MODEL_ID   HuggingFace Hub model ID  [default: sentence-transformers/all-MiniLM-L6-v2]
  --output-dir DIR   Root directory for exported artifact trees  [default: ./artifacts]
  --skip-validation  Skip the embedding quality validation step
```

---

## What the pipeline does

| Step | Description |
|------|-------------|
| **1 — Export fp32** | Loads the model and converts to ONNX via `optimum-onnx`. Saves tokenizer and config alongside the ONNX file. |
| **2 — Quantize q8** | Applies dynamic int8 quantization with `onnxruntime.quantization.quantize_dynamic`. No calibration data required. |
| **3 — Quantize q4** | Applies block-wise (block_size=32) symmetric int4 quantization to all MatMul weight matrices via `MatMul4BitsQuantizer`. Activations stay in float32. |
| **4 — Validate** | Embeds sample sentences with the original PyTorch model and each ONNX variant, then prints a cosine-similarity table so you can see quality loss at a glance. |

### Example validation output

```
| Sentence                                                | fp32 ONNX |  q8 (int8) | q4 (int4) |
|---------------------------------------------------------|----------:|----------:|----------:|
| The quick brown fox jumps over the lazy dog.            |  0.999998 |  0.999871 |  0.998823 |
| Machine learning models can be deployed in browsers.    |  0.999997 |  0.999854 |  0.998741 |
| ...                                                     |       ... |       ... |       ... |
| MEAN                                                    |  0.999997 |  0.999862 |  0.998801 |
```

All similarities are cosine(ref_pytorch, onnx_variant).
A MEAN ≥ 0.998 for q4 is excellent; below 0.99 would indicate a problem.

---

## Python 3.14 compatibility

Python 3.14 (released October 2025) is new; some packages ship compiled
extensions and may not have published wheels yet.  Here is the status of
each dependency and fallback options:

| Package | Status | Fallback if no wheel |
|---------|--------|----------------------|
| `transformers` | ✅ Pure Python — installs fine | — |
| `tabulate` | ✅ Pure Python — installs fine | — |
| `numpy` | ✅ Ships 3.14 wheels (NumPy 2.x) | — |
| `onnx` | ✅ Likely has 3.14 wheels by May 2026 | `pip install onnx --no-binary :all:` |
| `onnxruntime` | ✅ Likely has 3.14 wheels by 1.19 | Build from source; see [ORT docs](https://onnxruntime.ai/docs/build/) |
| `torch` | ⚠️ Wheels may lag new Python releases | `conda install pytorch -c pytorch` or `pip install torch --pre` |
| `tokenizers` | ✅ Rust-based; manylinux wheels usually available | `pip install tokenizers --no-binary :all:` |
| `optimum-onnx` | ✅ Pure Python wrapper | — |

**If `torch` is the blocker** for the validation step, run with
`--skip-validation`.  The export and quantization steps do not require
PyTorch.

---

## How the quantization schemes map to transformers.js dtypes

| File | ORT quantization | transformers.js dtype |
|------|------------------|-----------------------|
| `onnx/model.onnx` | float32 | `"fp32"` |
| `onnx/model_quantized.onnx` | dynamic int8 (QInt8 weights) | `"q8"` |
| `onnx/model_q4.onnx` | block-wise int4 MatMul weights | `"q4"` |

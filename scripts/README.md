# Genre Tagging Scripts

## Setup

### 1. Install ML dependencies

Standard dependencies from `requirements.txt`:
```bash
pip install -r requirements.txt
```

**PyTorch must be installed separately** with CUDA support (the version from PyPI does not include CUDA kernels):
```bash
# For CUDA 12.4 (torch 2.6+, required by transformers 5.x)
pip install "torch>=2.6" --index-url https://download.pytorch.org/whl/cu124

# For CUDA 12.1 (torch 2.5 max -- NOT compatible with transformers 5.x)
# pip install torch --index-url https://download.pytorch.org/whl/cu121
```

Verify GPU is detected:
```bash
python -c "import torch; print(torch.cuda.get_device_name(0))"
```

---

## Workflow

### Step 1 — Tag all questions (full run, ~2000 questions)
```bash
python scripts/tag_questions_gpu.py
```
Output: `data/tagged_questions.json`

Models are auto-downloaded from Hugging Face on first run (~2.4 GB total):
- `facebook/nllb-200-distilled-600M` (~1.2 GB, translation)
- `facebook/bart-large-mnli` (~1.2 GB, classification)

### Step 2 — Test on a small subset first
```bash
python scripts/tag_questions_gpu.py --max-items 50 --output data/tagged_test.json
```

### Step 3 — Resume an interrupted run
```bash
python scripts/tag_questions_gpu.py --resume
```

### Step 4 — Inspect results
```bash
# Genre distribution summary
python scripts/inspect_tagging_sample.py --summary

# 10 random tagged questions
python scripts/inspect_tagging_sample.py

# Filter by genre
python scripts/inspect_tagging_sample.py --genre history --n 20

# Find uncertain/borderline classifications
python scripts/inspect_tagging_sample.py --uncertain --threshold 0.4
```

---

## Tuning

If classification quality is poor, try:
- Lower `--min-score` (e.g. `0.15`) to allow more tags through
- Increase `--top-k 4` for more labels per question
- Edit label descriptions in `scripts/genre_taxonomy.json` to be more specific
- Rerun on a subset and compare with `--summary`

---

## Output Schema

`tagged_questions.json` adds these fields to every question:

```json
{
  "genre_tags": [
    { "label": "history",   "score": 0.82 },
    { "label": "geography", "score": 0.31 }
  ],
  "primary_genre": "history",
  "genre_model_meta": {
    "translation_model": "facebook/nllb-200-distilled-600M",
    "classification_model": "facebook/bart-large-mnli",
    "top_k": 3,
    "min_score": 0.25,
    "tagged_at": "2026-02-27T...",
    "gpu": "NVIDIA GeForce RTX ..."
  }
}
```

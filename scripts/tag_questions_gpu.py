"""
tag_questions_gpu.py
--------------------
Classifies Georgian quiz questions into English genre tags using a two-stage GPU pipeline:
  Stage 1 — Translation: facebook/nllb-200-distilled-600M (Georgian -> English)
  Stage 2 — Classification: facebook/bart-large-mnli (zero-shot multi-label)

Usage examples:
    # Full run
    python scripts/tag_questions_gpu.py

    # Test on first 50 questions only
    python scripts/tag_questions_gpu.py --max-items 50

    # Custom paths / thresholds
    python scripts/tag_questions_gpu.py \\
        --input data/questions.json \\
        --output data/tagged_questions.json \\
        --top-k 3 --min-score 0.25

    # Resume interrupted run (skips already tagged IDs)
    python scripts/tag_questions_gpu.py --resume

    # Questions-only mode (skip translation, classify Georgian text directly)
    python scripts/tag_questions_gpu.py --no-translate
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

from tqdm import tqdm

# ── Argument parsing ──────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="GPU-based genre tagging for Georgian quiz questions.")
    p.add_argument("--input",  default=os.path.join("data", "questions.json"),
                   help="Path to source questions.json (default: data/questions.json)")
    p.add_argument("--output", default=os.path.join("data", "tagged_questions.json"),
                   help="Path to write tagged output (default: data/tagged_questions.json)")
    p.add_argument("--taxonomy", default=os.path.join("scripts", "genre_taxonomy.json"),
                   help="Path to genre_taxonomy.json")
    p.add_argument("--batch-size-translate", type=int, default=8,
                   help="Batch size for NLLB translation (lower = less VRAM, default: 8)")
    p.add_argument("--batch-size-classify",  type=int, default=4,
                   help="Batch size for BART-MNLI classification (default: 4)")
    p.add_argument("--top-k",    type=int,   default=3,    help="Max genre labels to keep per question (default: 3)")
    p.add_argument("--min-score",type=float, default=0.25, help="Min confidence threshold to include a label (default: 0.25)")
    p.add_argument("--max-items",type=int,   default=None, help="Limit processing to first N questions (for testing)")
    p.add_argument("--checkpoint-every", type=int, default=100,
                   help="Write checkpoint to output file every N questions (default: 100)")
    p.add_argument("--resume",  action="store_true",
                   help="Skip question IDs already present in the output file")
    p.add_argument("--no-translate", action="store_true",
                   help="Skip translation and classify Georgian text directly (faster but less accurate)")
    p.add_argument("--max-tokens", type=int, default=400,
                   help="Max token length fed to classifier per question (default: 400)")
    return p.parse_args()


# ── Helpers ───────────────────────────────────────────────────────────────────

def build_input_text(q: dict) -> str:
    """Concatenate question + answer + comment into a single classification string."""
    parts = [q.get("question") or ""]
    if q.get("answer"):
        parts.append(q["answer"])
    if q.get("comment"):
        parts.append(q["comment"])
    return " ".join(p.strip() for p in parts if p.strip())


def load_existing_ids(output_path: str) -> set:
    """Return set of question_ids already written to output (for --resume)."""
    if not os.path.exists(output_path):
        return set()
    try:
        with open(output_path, encoding="utf-8") as f:
            data = json.load(f)
        return {item["question_id"] for item in data if "primary_genre" in item}
    except Exception:
        return set()


def write_output(output_path: str, results: list) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


# ── Main pipeline ─────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    # Force UTF-8 stdout on Windows so emoji/Georgian chars don't crash
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    # ── CUDA check ──
    import torch
    if not torch.cuda.is_available():
        print(
            "ERROR: CUDA is not available. This script requires an NVIDIA GPU.\n"
            "   Ensure you have PyTorch installed with CUDA support:\n"
            "       pip install torch --index-url https://download.pytorch.org/whl/cu121\n"
            "   and that your NVIDIA drivers are up to date.",
            file=sys.stderr,
        )
        sys.exit(1)

    device = 0  # first GPU
    gpu_name = torch.cuda.get_device_name(device)
    print(f"[OK] GPU detected: {gpu_name}", flush=True)

    # ── Load taxonomy ──
    with open(args.taxonomy, encoding="utf-8") as f:
        taxonomy = json.load(f)
    genre_labels = [entry["id"] for entry in taxonomy["labels"]]
    print(f"   Taxonomy: {len(genre_labels)} labels: {', '.join(genre_labels)}", flush=True)

    # ── Load questions ──
    print(f"\n[>>] Loading questions from {args.input} ...", flush=True)
    with open(args.input, encoding="utf-8") as f:
        questions = json.load(f)

    if args.max_items:
        questions = questions[: args.max_items]
        print(f"   [!] --max-items {args.max_items}: processing only first {len(questions)} questions.", flush=True)

    # ── Resume support ──
    existing_tagged: dict = {}
    if args.resume and os.path.exists(args.output):
        with open(args.output, encoding="utf-8") as f:
            prev = json.load(f)
        existing_tagged = {item["question_id"]: item for item in prev}
        already_done = sum(1 for item in prev if "primary_genre" in item)
        print(f"   --resume: found {already_done} already-tagged questions, will skip them.", flush=True)

    to_process = [q for q in questions if q["question_id"] not in existing_tagged]
    print(f"   {len(questions)} total | {len(to_process)} to process", flush=True)

    if not to_process:
        print("[i] Nothing to do -- all questions already tagged.", flush=True)
        sys.exit(0)

    # ── Load models ──
    from transformers import pipeline as hf_pipeline

    model_meta = {
        "classification_model": "facebook/bart-large-mnli",
        "top_k": args.top_k,
        "min_score": args.min_score,
        "tagged_at": datetime.now(timezone.utc).isoformat(),
        "gpu": gpu_name,
    }

    if not args.no_translate:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        NLLB_MODEL = "facebook/nllb-200-distilled-600M"
        model_meta["translation_model"] = NLLB_MODEL

        print(f"\n[>>] Loading translation model ({NLLB_MODEL}) ...", flush=True)
        print("     (first run downloads ~1.2 GB -- this may take a minute)", flush=True)
        nllb_tokenizer = AutoTokenizer.from_pretrained(NLLB_MODEL)
        nllb_model = AutoModelForSeq2SeqLM.from_pretrained(NLLB_MODEL).to(f"cuda:{device}")
        nllb_model.eval()
        print("   Translation model ready.", flush=True)
    else:
        model_meta["translation_model"] = "none (--no-translate)"
        print("\n[!] --no-translate: classifying Georgian text directly.", flush=True)

    print(f"\n[>>] Loading classifier (facebook/bart-large-mnli) ...", flush=True)
    print("     (first run downloads ~1.2 GB -- this may take a minute)", flush=True)
    classifier = hf_pipeline(
        "zero-shot-classification",
        model="facebook/bart-large-mnli",
        device=device,
    )
    print("   Classifier ready.\n", flush=True)

    # ── Translation helper ──
    def translate_batch(texts: list[str]) -> list[str]:
        """Translate a batch of Georgian strings to English using NLLB."""
        import torch
        inputs = nllb_tokenizer(
            texts,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=512,
        ).to(f"cuda:{device}")

        forced_bos = nllb_tokenizer.convert_tokens_to_ids("eng_Latn")
        with torch.no_grad():
            output_ids = nllb_model.generate(
                **inputs,
                forced_bos_token_id=forced_bos,
                max_new_tokens=512,
                num_beams=4,
            )
        return nllb_tokenizer.batch_decode(output_ids, skip_special_tokens=True)

    # ── Build all classification texts (with optional translation) ──
    print("[..] Building classification texts ...", flush=True)
    raw_texts = [build_input_text(q) for q in to_process]

    if args.no_translate:
        clf_texts = raw_texts
    else:
        clf_texts = []
        batches = list(chunked(raw_texts, args.batch_size_translate))
        with tqdm(total=len(raw_texts), desc="Translating", unit="q",
                  dynamic_ncols=True, colour="cyan") as pbar:
            for batch in batches:
                translated = translate_batch(batch)
                clf_texts.extend(translated)
                pbar.update(len(batch))

    # Truncate to max_tokens characters (rough guard; tokenizer handles exact truncation)
    clf_texts = [t[: args.max_tokens * 4] for t in clf_texts]

    # ── Classification ──
    print(
        f"\n[CL] Classifying {len(clf_texts)} questions in batches of {args.batch_size_classify} ...",
        flush=True,
    )

    results_map: dict = dict(existing_tagged)  # start with already-tagged if resuming
    t0 = time.time()
    processed = 0

    batches = list(chunked(list(zip(to_process, clf_texts)), args.batch_size_classify))
    with tqdm(total=len(to_process), desc="Classifying", unit="q",
              dynamic_ncols=True, colour="green") as pbar:
        for batch_i, batch in enumerate(batches, 1):
            batch_questions, batch_texts = zip(*batch)

            raw_results = classifier(
                list(batch_texts),
                candidate_labels=genre_labels,
                multi_label=True,
            )

            # classifier returns a single dict for batch-size-1, list otherwise
            if isinstance(raw_results, dict):
                raw_results = [raw_results]

            for q, clf_result in zip(batch_questions, raw_results):
                paired = sorted(
                    zip(clf_result["labels"], clf_result["scores"]),
                    key=lambda x: x[1],
                    reverse=True,
                )

                top_tags = [
                    {"label": label, "score": round(score, 4)}
                    for label, score in paired[: args.top_k]
                    if score >= args.min_score
                ]

                # Always keep at least the best label even if below threshold
                if not top_tags:
                    best_label, best_score = paired[0]
                    top_tags = [{"label": best_label, "score": round(best_score, 4)}]

                tagged = {**q, "genre_tags": top_tags, "primary_genre": top_tags[0]["label"], "genre_model_meta": model_meta}
                results_map[q["question_id"]] = tagged

            processed += len(batch)
            pbar.update(len(batch))
            pbar.set_postfix({"last": batch_questions[-1]["question_id"]})

            # Checkpoint
            if processed % args.checkpoint_every == 0:
                ordered = [results_map[q["question_id"]] for q in questions if q["question_id"] in results_map]
                write_output(args.output, ordered)
                tqdm.write(f"   [saved] Checkpoint: {processed} tagged so far -> {args.output}")

    # ── Final write ──
    ordered = [results_map[q["question_id"]] for q in questions if q["question_id"] in results_map]
    write_output(args.output, ordered)

    total_time = time.time() - t0
    print(
        f"\n[DONE] {len(ordered)} questions tagged in {total_time:.1f}s "
        f"({total_time / max(len(to_process), 1):.2f}s/question)",
        flush=True,
    )
    print(f"   Output: {args.output}", flush=True)


if __name__ == "__main__":
    main()

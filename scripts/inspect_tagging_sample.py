"""
inspect_tagging_sample.py
--------------------------
Quick QA utility. Prints a random or filtered sample from tagged_questions.json
so you can eyeball classification quality.

Usage:
    # 10 random questions
    python scripts/inspect_tagging_sample.py

    # 20 random questions
    python scripts/inspect_tagging_sample.py --n 20

    # Only questions tagged as a specific genre
    python scripts/inspect_tagging_sample.py --genre history

    # Show full question + answer text (not truncated)
    python scripts/inspect_tagging_sample.py --full

    # Summary: count per genre
    python scripts/inspect_tagging_sample.py --summary

    # Questions where the top score is low (borderline / uncertain)
    python scripts/inspect_tagging_sample.py --uncertain --threshold 0.4

    # Custom input path
    python scripts/inspect_tagging_sample.py --input data/tagged_questions.json
"""

import argparse
import json
import os
import random
import sys


TRUNCATE = 160  # chars shown per field unless --full


def parse_args():
    p = argparse.ArgumentParser(description="Inspect a sample of tagged questions.")
    p.add_argument("--input",  default=os.path.join("data", "tagged_questions.json"))
    p.add_argument("--n",      type=int, default=10, help="Number of questions to show (default: 10)")
    p.add_argument("--genre",  default=None,
                   help="Filter to a specific primary_genre (e.g. history, music)")
    p.add_argument("--full",   action="store_true", help="Show full text without truncation")
    p.add_argument("--summary",action="store_true", help="Print genre counts and exit")
    p.add_argument("--uncertain", action="store_true",
                   help="Show questions with low top-label confidence")
    p.add_argument("--threshold", type=float, default=0.4,
                   help="Confidence cutoff for --uncertain mode (default: 0.4)")
    p.add_argument("--seed",   type=int, default=None, help="Random seed for reproducibility")
    return p.parse_args()


def trunc(text, full=False):
    if text is None:
        return "(none)"
    text = str(text)
    if full or len(text) <= TRUNCATE:
        return text
    return text[:TRUNCATE] + " …"


def print_separator():
    print("─" * 72)


def main():
    args = parse_args()

    if not os.path.exists(args.input):
        print(f"❌ File not found: {args.input}", file=sys.stderr)
        print("   Run tag_questions_gpu.py first.", file=sys.stderr)
        sys.exit(1)

    with open(args.input, encoding="utf-8") as f:
        data = json.load(f)

    tagged = [q for q in data if "primary_genre" in q]
    untagged = len(data) - len(tagged)

    print(f"📄 {args.input}: {len(data)} questions total, {len(tagged)} tagged, {untagged} untagged.\n")

    # ── Summary mode ──
    if args.summary:
        from collections import Counter
        primary_counts = Counter(q["primary_genre"] for q in tagged)
        all_label_counts = Counter(
            tag["label"]
            for q in tagged
            for tag in q.get("genre_tags", [])
        )
        avg_score = (
            sum(q["genre_tags"][0]["score"] for q in tagged if q.get("genre_tags"))
            / max(len(tagged), 1)
        )

        print("── Primary genre distribution ──────────────────────────────────")
        for label, count in sorted(primary_counts.items(), key=lambda x: -x[1]):
            bar = "█" * (count * 40 // max(primary_counts.values(), default=1))
            print(f"  {label:<22} {count:>5}  {bar}")

        print("\n── All-label appearances (including non-primary) ───────────────")
        for label, count in sorted(all_label_counts.items(), key=lambda x: -x[1]):
            print(f"  {label:<22} {count:>5}")

        print(f"\n   Average top-label confidence: {avg_score:.3f}")
        return

    # ── Build pool ──
    pool = tagged

    if args.genre:
        pool = [q for q in pool if q.get("primary_genre") == args.genre]
        if not pool:
            print(f"❌ No questions with primary_genre='{args.genre}'.")
            print(f"   Available genres: {sorted({q['primary_genre'] for q in tagged})}")
            sys.exit(1)

    if args.uncertain:
        pool = [
            q for q in pool
            if q.get("genre_tags") and q["genre_tags"][0]["score"] < args.threshold
        ]
        if not pool:
            print(f"ℹ️  No questions with top score < {args.threshold}.")
            return

    if args.seed is not None:
        random.seed(args.seed)

    sample = random.sample(pool, min(args.n, len(pool)))

    # ── Print sample ──
    for i, q in enumerate(sample, 1):
        print_separator()
        tags_str = ", ".join(
            f"{t['label']} ({t['score']:.2f})" for t in q.get("genre_tags", [])
        )
        print(f"[{i}/{len(sample)}]  ID: {q['question_id']}  |  {tags_str}")
        print(f"  Q: {trunc(q.get('question'), args.full)}")
        print(f"  A: {trunc(q.get('answer'), args.full)}")
        if q.get("comment"):
            print(f"  C: {trunc(q['comment'], args.full)}")

    print_separator()
    print(f"\n✅ Showed {len(sample)} of {len(pool)} matching questions.")


if __name__ == "__main__":
    main()

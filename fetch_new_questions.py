import os
import time

import pandas as pd
import requests
from bs4 import BeautifulSoup

DATA_DIR = "data"
HTML_DIR = os.path.join(DATA_DIR, "html")
IMAGE_DIR = os.path.join(DATA_DIR, "images")
CSV_PATH = os.path.join(DATA_DIR, "moazrovne_dataset.csv")

# Use HTTP: HTTPS certificate verification fails on some systems.
BASE_Q_URL = "http://moazrovne.net/q/"

os.makedirs(HTML_DIR, exist_ok=True)
os.makedirs(IMAGE_DIR, exist_ok=True)

REQUEST_TIMEOUT = 10

try:
    if os.path.exists(CSV_PATH) and os.path.getsize(CSV_PATH) > 0:
        df = pd.read_csv(CSV_PATH, encoding="utf-8")
        df["question_id"] = pd.to_numeric(df["question_id"], errors="coerce")
        max_qid = int(df["question_id"].max())
        print(f"✅ Loaded existing dataset. Last question ID: {max_qid}", flush=True)
    else:
        raise ValueError("CSV is empty or missing")
except Exception as e:
    print(f"⚠️ Starting fresh: {e}", flush=True)
    df = pd.DataFrame()
    max_qid = 0

last_print_time = time.time()
new_data = []

missing_streak = 0
MAX_MISSING = 40
BUFFER_ID = 3000

qid = max_qid + 1

while True:
    if qid % 50 == 0:
        now = time.time()
        elapsed = now - last_print_time
        print(f"⏳ Progress: Scraping questions {qid}... (last 50 took {elapsed:.2f}s)", flush=True)
        last_print_time = now

    html_path = os.path.join(HTML_DIR, f"q_{qid}.html")

    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            html_content = f.read()
    else:
        url = BASE_Q_URL + str(qid)
        try:
            r = requests.get(url, timeout=REQUEST_TIMEOUT)
            html_content = r.text
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(html_content)
            time.sleep(0.1)
        except Exception as e:
            print(f"❌ Failed to fetch qid {qid}: {e}", flush=True)
            qid += 1
            continue

    soup = BeautifulSoup(html_content, "html.parser")

    error_header = soup.select_one("div.content > h1")
    if error_header and error_header.get_text(strip=True) == "404":
        if qid > BUFFER_ID:
            missing_streak += 1
            if missing_streak >= MAX_MISSING:
                print(
                    f"⛔ Stopped after {MAX_MISSING} consecutive missing questions past ID {BUFFER_ID}.",
                    flush=True,
                )
                break
        qid += 1
        continue

    missing_streak = 0

    question_tag = soup.select_one("p.question_question")
    author_tag = soup.select_one("p.question_top .right")
    author = author_tag.text.strip("© ").strip() if author_tag else ""

    has_image = 0
    image_tag = soup.select_one("p.question_question img, a.shadowbox")

    if image_tag:
        if image_tag.name == "a" and "href" in image_tag.attrs:
            image_url = image_tag["href"].strip()
        elif image_tag.name == "img" and "src" in image_tag.attrs:
            image_url = image_tag["src"].strip()
        else:
            image_url = ""

        if image_url:
            image_filename = f"qid_{qid}.jpg"
            image_path = os.path.join(IMAGE_DIR, image_filename)

            if os.path.exists(image_path):
                has_image = 1
            else:
                try:
                    img_data = requests.get(image_url, timeout=REQUEST_TIMEOUT).content
                    with open(image_path, "wb") as f:
                        f.write(img_data)
                    has_image = 1
                    time.sleep(0.1)
                except Exception as e:
                    print(f"⚠️ Failed to download image for qid {qid}: {e}", flush=True)

    answer = ""
    comment = ""
    source = ""
    packet = ""

    for span in soup.select("div.answer_body > span.clearfix"):
        label = span.select_one("span.left")
        value = span.select_one("span.right_nofloat")
        if not label or not value:
            continue

        label_text = label.text.strip()
        value_text = value.get_text(strip=True)

        if label_text == "პასუხი:":
            answer = value_text
        elif label_text == "კომენტარი:":
            comment = value_text
        elif label_text == "წყარო:":
            parts = []
            for elem in value.contents:
                if getattr(elem, "name", None) == "a" and "href" in elem.attrs:
                    parts.append(elem["href"].strip())
                elif isinstance(elem, str):
                    parts.append(elem.strip())
                elif getattr(elem, "name", None) == "li":
                    parts.append(elem.get_text(strip=True))
            source = " ".join(filter(None, parts))
        elif label_text == "პაკეტი:":
            packet = value_text

    new_data.append(
        {
            "question_id": qid,
            "question": question_tag.get_text(strip=True) if question_tag else "",
            "answer": answer,
            "comment": comment,
            "source": source,
            "packet": packet,
            "image": has_image,
            "author": author,
        }
    )

    qid += 1

if new_data:
    df_new = pd.DataFrame(new_data)
    df = pd.concat([df, df_new], ignore_index=True)
    df = df.drop_duplicates(subset="question_id", keep="first").sort_values(by="question_id")
    df.to_csv(CSV_PATH, index=False, encoding="utf-8", quoting=1)
    print(f"✅ Saved {len(df_new)} new questions. Total now: {len(df)}", flush=True)
else:
    print("ℹ️ No new questions found in this run.", flush=True)

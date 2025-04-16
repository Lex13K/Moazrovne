import os
import requests
from bs4 import BeautifulSoup
import pandas as pd

DATA_DIR = "data"
HTML_DIR = os.path.join(DATA_DIR, "html")
CSV_PATH = os.path.join(DATA_DIR, "moazrovne_dataset.csv")
BASE_Q_URL = "http://moazrovne.net/q/"

os.makedirs(HTML_DIR, exist_ok=True)

# Load existing data
if os.path.exists(CSV_PATH):
    df = pd.read_csv(CSV_PATH, encoding="utf-8")
    df["question_id"] = pd.to_numeric(df["question_id"], errors="coerce")
    max_qid = df["question_id"].max()
else:
    df = pd.DataFrame()
    max_qid = 0

new_data = []

for qid in range(int(max_qid) + 1, int(max_qid) + 1000):
    url = BASE_Q_URL + str(qid)
    r = requests.get(url)
    soup = BeautifulSoup(r.text, "html.parser")
    error_header = soup.select_one("div.content > h1")
    if error_header and error_header.get_text(strip=True) == "404":
        print(f"⛔ Reached 404 at question {qid}. Stopping.")
        break

    html_path = os.path.join(HTML_DIR, f"q_{qid}.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(r.text)

    soup = BeautifulSoup(r.text, "html.parser")
    question = soup.select_one("p.question_question")
    author_tag = soup.select_one("p.question_top .right")
    image_tag = soup.select_one("p.question_question a.shadowbox")
    image_url = image_tag["href"].strip() if image_tag and "href" in image_tag.attrs else ""
    author = author_tag.text.strip("© ").strip() if author_tag else ""

    answer = comment = source = packet = ""

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
                if elem.name == "a" and "href" in elem.attrs:
                    parts.append(elem["href"].strip())
                elif isinstance(elem, str):
                    parts.append(elem.strip())
                elif elem.name == "li":
                    parts.append(elem.get_text(strip=True))
            source = " ".join(filter(None, parts))
        elif label_text == "პაკეტი:":
            packet = value_text

    new_data.append({
        "question_id": qid,
        "question": question.get_text(strip=True) if question else "",
        "answer": answer,
        "comment": comment,
        "source": source,
        "packet": packet,
        "image_url": image_url,
        "author": author
    })

if new_data:
    df_new = pd.DataFrame(new_data)
    df = pd.concat([df, df_new], ignore_index=True)
    df = df.drop_duplicates(subset="question_id", keep="first").sort_values(by="question_id")
    df.to_csv(CSV_PATH, index=False, encoding="utf-8", quoting=1)

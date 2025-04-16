import os
import requests
from bs4 import BeautifulSoup
import pandas as pd
import time

# Folder to store HTML pages
os.makedirs("moazrovne_html", exist_ok=True)

all_data = []

# Loop through pages 1 to 140
for page_num in range(1, 141):
    html_path = f"moazrovne_html/page_{page_num}.html"

    # ✅ Skip download if file already exists
    if os.path.exists(html_path):
        print(f"⚠️ Skipping download for page {page_num} (already exists)")
        with open(html_path, "r", encoding="utf-8") as f:
            page_content = f.read()
    else:
        # 🌐 Download the page
        url = f"http://moazrovne.net/chgk/{page_num}"
        response = requests.get(url)
        if response.status_code == 200:
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(response.text)
            page_content = response.text
            print(f"✅ Downloaded and saved page {page_num}")
        else:
            print(f"❌ Failed to download page {page_num}")
            continue
        time.sleep(1)  # Be polite to the server

    # 🧠 Parse HTML
    soup = BeautifulSoup(page_content, "html.parser")

    for li in soup.select("li.q"):
        # ✅ Question text
        q_text = li.select_one("p.question_question")
        question = q_text.get_text(strip=True) if q_text else ""

        # ✅ Question ID
        qid_tag = li.select_one("p.question_top .left a")
        question_id = ""
        if qid_tag and "href" in qid_tag.attrs:
            question_id = qid_tag["href"].split("/")[-1]

        # ✅ Author
        author_tag = li.select_one("p.question_top .right")
        author = author_tag.text.strip("© ").strip() if author_tag else ""

        # ✅ Image URL (if any)
        image_tag = li.select_one("p.question_question a.shadowbox")
        image_url = image_tag["href"].strip() if image_tag and "href" in image_tag.attrs else ""

        # Default fields
        answer = comment = source = packet = ""

        for span in li.select("div.answer_body > span.clearfix"):
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
                # Grab all links and text in source field
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

        all_data.append({
            "question_id": question_id,
            "question": question,
            "answer": answer,
            "comment": comment,
            "source": source,
            "packet": packet,
            "image_url": image_url,
            "author": author
        })

# 💾 Save to CSV
df = pd.DataFrame(all_data)
df["question_id"] = pd.to_numeric(df["question_id"], errors="coerce")
df = df.sort_values(by="question_id", ascending=True)
df.to_csv("moazrovne_dataset.csv", index=False, encoding="utf-8", quoting=1)
print("🎉 Done! Saved", len(df), "questions to moazrovne_dataset.csv")

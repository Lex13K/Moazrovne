import pandas as pd
df = pd.read_csv("data/moazrovne_dataset.csv")
df.to_json("web/src/questions.json", orient="records", force_ascii=False)

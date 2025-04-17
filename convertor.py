import pandas as pd

df = pd.read_csv("data/moazrovne_dataset.csv")
df.to_json("data/moazrovne_dataset.json", orient="records", indent=2, force_ascii=False)
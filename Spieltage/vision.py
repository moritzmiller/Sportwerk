import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
import sqlite3

conn = sqlite3.connect('niners.db')

query = "SELECT * FROM niners"

df = pd.read_sql_query(query, conn)

conn.close()

sns.set_theme()

sns.relplot(data=df, x="homegoals", y="awaygoals", hue="winner", col="place")

plt.show()
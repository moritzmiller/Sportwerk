import numpy as np
import pandas as pd

import matplotlib as mpl
import matplotlib.pyplot as plt

import seaborn as sns


df = pd.read_csv("NBA Shot Locations 1997 - 2020.csv")

shots = df[(df["Player Name"] == "Jaren Jackson Jr.") & (df["Game Date"])].copy()

conditions_made = [
    (df["Shot Made Flag"] == 1) & (df["Shot Type"] == "2PT Field Goal"),
    (df["Shot Made Flag"] == 1) & (df["Shot Type"] == "3PT Field Goal"),
]

choices = [2,3]

df['Points_Scored'] = np.select(conditions_made, choices, default=0)

points_made = df['Points_Scored'].sum()

print(f"Punkte: {points_made}")



shots_made = df[(df["Shot Made Flag"] == 1)]["Shot Made Flag"].sum()

print(shots_made)


shots_missed = (df["Shot Made Flag"] == 0).sum()

print(f"Shots missed: {shots_missed}")


shot_attempted = shots_made + shots_missed

print(f"Shots attempted: {shot_attempted}")


made_shots_per = shots_made / shot_attempted

print(made_shots_per)

sns.set_theme()

g = sns.relplot(
    data=shots,
    x="X Location",
    y="Y Location",
    col="Shot Made Flag",
    size="Minutes Remaining",
    sizes=(200, 20),
)

for ax in g.axes.flat:
    ax.set_aspect('equal', 'box')

sns.distplot(
    data=shots,

)

plt.show()
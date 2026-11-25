import collections
import json
import os
import re

import matplotlib
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import simplemma
from bertopic import BERTopic
from bertopic.representation import MaximalMarginalRelevance
from matplotlib.lines import Line2D
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, CountVectorizer, TfidfVectorizer
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import Normalizer

matplotlib.use("Agg")

# newer pandas dropped this argument, which BERTopic still passes
_to_datetime = pd.to_datetime
pd.to_datetime = lambda *a, **k: _to_datetime(*a, **{x: y for x, y in k.items() if x != "infer_datetime_format"})

DATA, OUT = "data/", "output/"
os.makedirs(OUT, exist_ok=True)

HIV_XLSX = DATA + "HIV_rHIV_3yr_treatment_attitudes.xlsx"
AIDS_XLSX = DATA + "HIV_hivaids_subreddit_full.xlsx"
HIV_COMMENTS = DATA + "rHIV_comments.json"
CRAWL = {
    "HIV": [DATA + "crawl/HIV_nov22_nov23.json", DATA + "crawl/HIV_nov21_nov22.json"],
    "hivaids": [DATA + "crawl/hivaids_nov22_nov23.json", DATA + "crawl/hivaids_nov21_nov22.json"],
}
SUBS = [("HIV", "r/HIV"), ("hivaids", "r/hivaids")]
K = 10

# treatment-term filter, applied identically to every post and comment
TREATMENT = re.compile(
    r"(treatment|\btreat(ed|ing)?\b|medicat|\bmeds?\b|pills?\b|\bprep\b|\bpep\b|\bart\b|antiretrovir|\barvs?\b|"
    r"biktarvy|descovy|truvada|genvoya|stribild|dovato|triumeq|odefsey|symtuza|cabenuva|apretude|cabotegravir|"
    r"rilpivirine|dolutegravir|tenofovir|lenacapavir|yeztugo|sunlenca|\binject|doctor|\bdr\.?\b|clinic|nurse|"
    r"pharmac|prescri|side.?effects?|viral load|undetectable|\bu\s?=\s?u\b|cd4|adheren|insurance|refill|"
    r"infectious disease|\bID doc|specialist|provider|hospital|appointment|regimen|ryan white|\badap\b|doxy)",
    re.I,
)
BOILERPLATE = re.compile(
    r"welcome u|subreddit rules|belong community|users interpret|questions concerning|"
    r"report this post|mods know|keep this community"
)
ENGLISH_WORDS = set("the and to of a in is it that i my you for with on was have this be are not but so me if can do at as just from or they what has will would there when about how".split())
STOP = set(ENGLISH_STOP_WORDS) | {"don", "ve", "ll", "th", "didn", "doesn", "isn", "wasn", "won", "gen", "im", "ive", "dont"}


# Data loading and cleaning

def load(sub):
    if sub == "HIV":
        posts = pd.read_excel(HIV_XLSX, sheet_name="Posts_all_3yr")[["created_utc", "title", "text"]]
        raw = pd.DataFrame(json.load(open(HIV_COMMENTS)), columns=["id", "post", "parent", "utc", "author", "text", "score", "link"])
        comments = pd.DataFrame({"created_utc": pd.to_datetime(raw.utc, unit="s"), "text": raw.text})
    else:
        text_col = "text (truncated to 600 chars)"
        posts = pd.read_excel(AIDS_XLSX, sheet_name="Posts").rename(columns={text_col: "text"})[["created_utc", "title", "text"]]
        comments = pd.read_excel(AIDS_XLSX, sheet_name="Comments").rename(columns={text_col: "text"})[["created_utc", "text"]]

    # earlier years, crawled separately
    extra_posts, extra_comments = [], []
    for path in CRAWL[sub]:
        d = json.load(open(path))
        extra_posts += [[pd.to_datetime(r[1], unit="s"), r[3], r[4]] for r in d["p"]]
        extra_comments += [[pd.to_datetime(r[3], unit="s"), r[5]] for r in d["c"]]
    posts = pd.concat([posts, pd.DataFrame(extra_posts, columns=["created_utc", "title", "text"])], ignore_index=True)
    comments = pd.concat([comments, pd.DataFrame(extra_comments, columns=["created_utc", "text"])], ignore_index=True)

    posts["text"] = posts.text.fillna("").astype(str)
    posts["title"] = posts.title.fillna("").astype(str)
    posts = posts[~posts.text.isin(["[removed]", "[deleted]"])]
    posts = pd.DataFrame({"created_utc": pd.to_datetime(posts.created_utc), "doc": posts.title + " " + posts.text, "kind": "post"})
    comments = comments[~comments.text.astype(str).isin(["[removed]", "[deleted]"])]
    comments = pd.DataFrame({"created_utc": pd.to_datetime(comments.created_utc), "doc": comments.text.astype(str), "kind": "comment"})

    df = pd.concat([posts.drop_duplicates(["created_utc", "doc"]), comments.drop_duplicates(["created_utc", "doc"])], ignore_index=True)
    return df[df.doc.map(lambda x: bool(TREATMENT.search(x)))]


def clean(s):
    s = re.sub(r"http\S+", "", str(s)).lower()
    s = " ".join(w for w in s.split() if w[0] != "@")
    return " ".join(re.sub("[^a-zA-Z]+", " ", s).split())


def is_english(doc):
    words = doc.split()
    return len(words) > 0 and sum(w in ENGLISH_WORDS for w in words) / len(words) > 0.15


def preprocess(docs, min_df=5, max_df=0.40):
    tokens = [[simplemma.lemmatize(w, "en") for w in d.split() if len(w) > 2] for d in docs]
    tokens = [[w for w in t if w not in STOP and len(w) > 2] for t in tokens]
    counts = collections.Counter(w for t in tokens for w in set(t))
    keep = {w for w, c in counts.items() if min_df <= c <= max_df * len(tokens)}
    return [" ".join(w for w in t if w in keep) for t in tokens]


# Topic model

def fit(sub):
    df = load(sub)
    df["raw"] = df.doc.map(clean)
    df = df[~df.raw.str.contains(BOILERPLATE)].drop_duplicates("raw")
    df = df[(df.raw.str.split().str.len() >= 5) & df.raw.map(is_english)]
    df["doc"] = preprocess(df.raw.to_list())
    df = df[df.doc.str.split().str.len() >= 3]

    # weekly message counts, used by Figure A
    week = df.created_utc.dt.to_period("W-SUN").dt.start_time
    df.assign(wk=week).groupby(["wk", "kind"]).size().unstack(fill_value=0).reset_index().to_csv(f"{OUT}{sub}_weekly_counts.csv", index=False)

    docs, timestamps = df.doc.to_list(), df.created_utc.to_list()
    embedder = make_pipeline(
        TfidfVectorizer(stop_words="english", min_df=3, sublinear_tf=True),
        TruncatedSVD(100, random_state=0),
        Normalizer(copy=False),
    )
    embeddings = embedder.fit_transform(docs)
    model = BERTopic(
        top_n_words=10,
        embedding_model=embedder,
        vectorizer_model=CountVectorizer(stop_words="english", min_df=1, ngram_range=(1, 2), max_features=30000),
        hdbscan_model=KMeans(n_clusters=K, random_state=0, n_init=10),
        representation_model=MaximalMarginalRelevance(diversity=0.5, top_n_words=10),
        verbose=False,
    )
    model.fit_transform(docs, embeddings=embeddings)
    over_time = model.topics_over_time(docs, timestamps, global_tuning=True, evolution_tuning=True, nr_bins=20)

    info = model.get_topic_info()
    info["Top10"] = [", ".join(w for w, _ in model.get_topic(t)[:10]) for t in info.Topic]
    info.to_csv(f"{OUT}{sub}_topic_info.csv", index=False)
    over_time.to_csv(f"{OUT}{sub}_topics_over_time.csv", index=False)


for sub, _ in SUBS:
    fit(sub)


# Shared figure settings

INK, INK2, RULE = "#1c1c1c", "#5a5a5a", "#d9d9d6"
GAP = (pd.Timestamp("2024-01-01"), pd.Timestamp("2025-03-01"))  # no r/HIV posts in the archive
plt.rcParams.update({
    "font.family": "STIXGeneral", "mathtext.fontset": "stix", "text.color": INK, "axes.labelcolor": INK2,
    "xtick.color": INK2, "ytick.color": INK2, "axes.edgecolor": INK2, "svg.fonttype": "path", "pdf.fonttype": 42,
})


def save(fig, name):
    for ext, kw in (("png", {"dpi": 300}), ("pdf", {}), ("svg", {})):
        fig.savefig(f"{OUT}{name}.{ext}", facecolor="white", **kw)
    plt.close(fig)


# Figure A: posts and comments per week

POST, COMMENT = "#c4602f", "#4b2a6b"
fig, axes = plt.subplots(1, 2, figsize=(14, 5.2), facecolor="white")
for ax, (sub, label) in zip(axes, SUBS):
    counts = pd.read_csv(f"{OUT}{sub}_weekly_counts.csv", parse_dates=["wk"])
    weeks = pd.date_range(counts.wk.min(), counts.wk.max(), freq="7D")
    m = counts.set_index("wk").reindex(weeks, fill_value=0).rename_axis("wk").reset_index()
    m["t"] = m.wk + pd.Timedelta(days=3.5)
    m = m[(m.wk >= "2021-11-01") & (m.wk < m.wk.max())]  # drop the first stub week and the partial last week

    if sub == "HIV":
        ax.axvspan(*GAP, facecolor="none", edgecolor="#bdbdb8", hatch="////", lw=0, alpha=0.7, zorder=0)
    ax.plot(m.t, m.comment, color=COMMENT, lw=1.1)
    ax.plot(m.t, m.post, color=POST, lw=1.1)
    ax.fill_between(m.t, m.comment, color=COMMENT, alpha=0.10, lw=0)
    ax.fill_between(m.t, m.post, color=POST, alpha=0.14, lw=0)
    ax.set_ylim(0, m.comment.max() * 1.1)
    ax.set_xlim(pd.Timestamp("2021-10-15"), pd.Timestamp("2026-11-30"))
    ax.grid(axis="y", color=RULE, lw=0.6, ls=(0, (1, 3)))
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.tick_params(axis="y", length=0, labelsize=10)
    ax.tick_params(axis="x", length=3, labelsize=10.5)
    ax.xaxis.set_major_locator(mdates.YearLocator(1))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    ax.set_title(label, fontsize=16, fontweight="bold", pad=34)
    ax.legend(
        [Line2D([0], [0], color=COMMENT, lw=2.4), Line2D([0], [0], color=POST, lw=2.4)],
        [f"Comments (total {int(counts.comment.sum()):,})", f"Posts (total {int(counts.post.sum()):,})"],
        loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=2, frameon=False, fontsize=12, handlelength=1.8, columnspacing=2.2,
    )
axes[0].set_ylabel("Messages per week", fontsize=11, style="italic")
fig.suptitle("Posts and Comments over Time", fontsize=19, fontweight="bold", y=0.985)
fig.tight_layout(rect=(0, 0, 1, 0.93), w_pad=3)
save(fig, "figure_a")


# Figure B: relative topic share over time

fig, axes = plt.subplots(1, 2, figsize=(22, 7.4), facecolor="white")
for ax, (sub, label) in zip(axes, SUBS):
    over_time = pd.read_csv(f"{OUT}{sub}_topics_over_time.csv", parse_dates=["Timestamp"])
    over_time = over_time[over_time.Topic != -1]
    info = pd.read_csv(f"{OUT}{sub}_topic_info.csv")
    info = info[info.Topic != -1].sort_values("Count", ascending=False)
    order = info.Topic.tolist()  # largest topic at the bottom

    counts = over_time.pivot_table(index="Timestamp", columns="Topic", values="Frequency", aggfunc="sum", fill_value=0)[order]
    share = counts.div(counts.sum(axis=1), axis=0) * 100
    plasma = matplotlib.colormaps["plasma"]
    colors = [matplotlib.colors.to_hex(0.62 * np.array(plasma(x)[:3]) + 0.38) for x in np.linspace(0, 1, len(order))]  # plasma blended toward white

    ax.stackplot(share.index, share.T.values, colors=colors, edgecolor="white", linewidth=0.8, zorder=2)
    if sub == "HIV":
        ax.axvspan(*GAP, facecolor="none", edgecolor="white", hatch="////", lw=0, alpha=0.75, zorder=6)
    ax.set_ylim(0, 100)
    ax.set_xlim(share.index.min(), share.index.max())
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter())
    ax.tick_params(labelsize=10.5)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.xaxis.set_major_locator(mdates.YearLocator(1))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    ax.set_title(label, fontsize=15, fontweight="bold", pad=10)

    # label positions: start at each band's midpoint at the right edge, then push apart so text does not overlap
    last = share.iloc[-1].values
    mids = last.cumsum() - last / 2
    pos = mids.copy()
    min_gap = 7.2
    for i in range(1, len(pos)):
        pos[i] = max(pos[i], pos[i - 1] + min_gap)
    if pos[-1] > 96.5:
        pos -= pos[-1] - 96.5
    for i in range(len(pos) - 2, -1, -1):
        pos[i] = min(pos[i], pos[i + 1] - min_gap)

    # elbow leader lines: horizontal, vertical, horizontal; vertical runs are staggered so they do not cross
    shift = pos - mids
    up = sorted([i for i in range(len(pos)) if shift[i] > 0.3], key=lambda i: -pos[i])
    down = sorted([i for i in range(len(pos)) if shift[i] < -0.3], key=lambda i: pos[i])
    rank = {i: r for r, i in enumerate(up)} | {i: r for r, i in enumerate(down)}
    day = pd.Timedelta(days=1)
    x_edge = share.index.max()
    x_text = x_edge + (34 + 15 * max(len(up), len(down), 1) + 25) * day
    for i, (topic, y_mid, y_label) in enumerate(zip(order, mids, pos)):
        words = [w.strip() for w in info.loc[info.Topic == topic, "Top10"].iloc[0].split(",")][:8]
        text = f"Topic {topic}: " + ", ".join(words[:4]) + ",\n" + " " * 11 + ", ".join(words[4:8])
        if i in rank:
            x_bend = x_edge + (34 + 15 * rank[i]) * day
            xs, ys = [x_edge, x_bend, x_bend, x_text - 8 * day], [y_mid, y_mid, y_label, y_label]
        else:
            xs, ys = [x_edge, x_text - 8 * day], [y_mid, y_mid]
        ax.plot(xs, ys, color="#9a9a96", lw=0.6, solid_joinstyle="miter", clip_on=False, zorder=3)
        ax.text(x_text, y_label, text, fontsize=9.6, va="center", ha="left", color=INK, linespacing=1.15, clip_on=False)

axes[0].set_ylabel("Share of messages in time bin", fontsize=11, style="italic")
fig.suptitle("Relative Topic Share over Time", fontsize=19, fontweight="bold", y=0.985)
fig.subplots_adjust(left=0.045, right=0.76, wspace=0.78, top=0.88, bottom=0.07)
save(fig, "figure_b")

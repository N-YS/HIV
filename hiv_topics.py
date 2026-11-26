"""
Treatment discussions in r/HIV and r/hivaids, October 2021 to November 2026: the complete analysis in one script.

    python hiv_topics.py all              # every stage below, in order
    python hiv_topics.py prep separate    # or any stages, by name

Stages (each reads what the earlier ones wrote to output/, figures go to figures/analysis/):

    prep        load both subreddits, filter to treatment-related messages, clean, pooled vocabulary filter
    separate    analysis 1: one BERTopic-style model per subreddit (K = 10), Figures A and B
    ksel        choose the number of topics for the joint model (K = 3..20: coherence, separability, stability)
    joint       analysis 2: one model for both communities (K = 10), topic shares, overlap, bootstrap intervals
    keywords    most common words per subreddit, before 2024 vs from March 2025, word rates over time
    sentiment   VADER sentiment by quarter and before/after table (the words positive/negative are removed first)
    users       users who write in both subreddits: overlap, switching, pie counts
    spotlight   per-user tables (activity per month, topic mix per half year) for the three spotlighted users
    final       formal black-and-white versions of the website figures (reads docs/js/data*.js)

Expects data/ with the raw spreadsheets and crawl JSON, as before.
Requires: pandas, numpy, scikit-learn, bertopic, umap-learn, simplemma, gensim, wordfreq, vaderSentiment,
matplotlib, openpyxl.
"""
import collections
import json
import os
import re
import sys

import matplotlib
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import scipy.sparse as sp
import simplemma
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

DATA, OUT, FIG = "data/", "output/", "figures/analysis/"
for d in (OUT, FIG):
    os.makedirs(d, exist_ok=True)

HIV_XLSX = DATA + "HIV_rHIV_3yr_treatment_attitudes.xlsx"
AIDS_XLSX = DATA + "HIV_hivaids_subreddit_full.xlsx"
HIV_COMMENTS = DATA + "rHIV_comments.json"
CRAWL = {
    "HIV": [DATA + "crawl/HIV_nov22_nov23.json", DATA + "crawl/HIV_nov21_nov22.json"],
    "hivaids": [DATA + "crawl/hivaids_nov22_nov23.json", DATA + "crawl/hivaids_nov21_nov22.json"],
}
SUBS = [("HIV", "r/HIV"), ("hivaids", "r/hivaids")]
K = 10
RESTRICTED = (pd.Timestamp("2024-01-01"), pd.Timestamp("2025-03-01"))  # r/HIV restricted, no posts archived
SPOTLIGHT = ["Mrtrad", "TinyCatLady1978", "MasterMind19991"]

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


# ----------------------------------------------------------------------------------------------
# Data loading and cleaning
# ----------------------------------------------------------------------------------------------

def load(sub):
    """Posts and comments of one subreddit that mention a treatment term, with author, kind and time."""
    if sub == "HIV":
        posts = pd.read_excel(HIV_XLSX, sheet_name="Posts_all_3yr")[["created_utc", "author", "title", "text"]]
        raw = pd.DataFrame(json.load(open(HIV_COMMENTS)), columns=["id", "post", "parent", "utc", "author", "text", "score", "link"])
        comments = pd.DataFrame({"created_utc": pd.to_datetime(raw.utc, unit="s"), "author": raw.author, "text": raw.text})
    else:
        text_col = "text (truncated to 600 chars)"
        posts = pd.read_excel(AIDS_XLSX, sheet_name="Posts").rename(columns={text_col: "text"})[["created_utc", "author", "title", "text"]]
        comments = pd.read_excel(AIDS_XLSX, sheet_name="Comments").rename(columns={text_col: "text"})[["created_utc", "author", "text"]]

    # earlier years, crawled separately
    extra_posts, extra_comments = [], []
    for path in CRAWL[sub]:
        d = json.load(open(path))
        extra_posts += [[pd.to_datetime(r[1], unit="s"), r[2], r[3], r[4]] for r in d["p"]]
        extra_comments += [[pd.to_datetime(r[3], unit="s"), r[4], r[5]] for r in d["c"]]
    posts = pd.concat([posts, pd.DataFrame(extra_posts, columns=["created_utc", "author", "title", "text"])], ignore_index=True)
    comments = pd.concat([comments, pd.DataFrame(extra_comments, columns=["created_utc", "author", "text"])], ignore_index=True)

    posts["text"] = posts.text.fillna("").astype(str)
    posts["title"] = posts.title.fillna("").astype(str)
    posts = posts[~posts.text.isin(["[removed]", "[deleted]"])]
    posts = pd.DataFrame({"created_utc": pd.to_datetime(posts.created_utc), "author": posts.author, "doc": posts.title + " " + posts.text, "kind": "post"})
    comments = comments[~comments.text.astype(str).isin(["[removed]", "[deleted]"])]
    comments = pd.DataFrame({"created_utc": pd.to_datetime(comments.created_utc), "author": comments.author, "doc": comments.text.astype(str), "kind": "comment"})

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


def cleaned(sub):
    """One subreddit, cleaned: no boilerplate, duplicates, very short or non-English messages. Column raw = cleaned text."""
    df = load(sub)
    df["raw"] = df.doc.map(clean)
    df = df[~df.raw.str.contains(BOILERPLATE)].drop_duplicates("raw")
    df = df[(df.raw.str.split().str.len() >= 5) & df.raw.map(is_english)]
    df["sub"] = sub
    return df


def per_sub_corpus(sub):
    """Cleaned messages with the vocabulary filter fitted on this subreddit alone (analysis 1 and the keyword stage)."""
    df = cleaned(sub)
    df["doc"] = preprocess(df.raw.to_list())
    return df[df.doc.str.split().str.len() >= 3]


def read(name):
    return pd.read_pickle(OUT + name)


def embedder():
    return make_pipeline(TfidfVectorizer(stop_words="english", min_df=3, sublinear_tf=True), TruncatedSVD(100, random_state=0), Normalizer(copy=False))


def top10(model, topic):
    return ", ".join(w for w, _ in model.get_topic(topic)[:10])


# ----------------------------------------------------------------------------------------------
# Shared figure settings
# ----------------------------------------------------------------------------------------------

INK, INK2, RULE = "#1c1c1c", "#5a5a5a", "#d9d9d6"
HIVC, AIDC = "#c4602f", "#4b2a6b"
plt.rcParams.update({
    "font.family": "STIXGeneral", "mathtext.fontset": "stix", "text.color": INK, "axes.labelcolor": INK2,
    "xtick.color": INK2, "ytick.color": INK2, "axes.edgecolor": INK2, "svg.fonttype": "path", "pdf.fonttype": 42,
})


def save(fig, name):
    for ext, kw in (("png", {"dpi": 300}), ("pdf", {}), ("svg", {})):
        fig.savefig(f"{FIG}{name}.{ext}", facecolor="white", **kw)
    plt.close(fig)


def gap(ax, edge="#bdbdb8"):
    ax.axvspan(*RESTRICTED, facecolor="none", edgecolor=edge, hatch="////", lw=0, alpha=0.7, zorder=0)


def years_axis(ax, lo="2021-10-15", hi="2026-10-20"):
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.grid(axis="y", color=RULE, lw=0.6, ls=(0, (1, 3)))
    ax.tick_params(axis="y", length=0, labelsize=10)
    ax.tick_params(axis="x", length=3, labelsize=10.5)
    ax.xaxis.set_major_locator(mdates.YearLocator(1))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    ax.set_xlim(pd.Timestamp(lo), pd.Timestamp(hi))


def spread(ys, gap_min, hi):
    """Push direct labels apart so that they do not overlap."""
    order = np.argsort(ys)
    pos = np.array(ys, float)[order]
    for i in range(1, len(pos)):
        pos[i] = max(pos[i], pos[i - 1] + gap_min)
    if pos[-1] > hi:
        pos -= pos[-1] - hi
    for i in range(len(pos) - 2, -1, -1):
        pos[i] = min(pos[i], pos[i + 1] - gap_min)
    out = np.empty_like(pos)
    out[order] = pos
    return out


# ----------------------------------------------------------------------------------------------
# Stage: prep
# ----------------------------------------------------------------------------------------------

def stage_prep():
    frames = [cleaned(sub) for sub, _ in SUBS]
    df = pd.concat(frames, ignore_index=True)
    # one shared vocabulary filter on the pooled corpus, drop messages left with under 3 words
    df["doc"] = preprocess(df.raw.to_list())
    df = df[df.doc.str.split().str.len() >= 3].reset_index(drop=True)
    print(df.groupby(["sub", "kind"]).size())
    df.to_pickle(OUT + "combined.pkl")


# ----------------------------------------------------------------------------------------------
# Stage: separate (analysis 1)
# ----------------------------------------------------------------------------------------------

def stage_separate():
    from bertopic import BERTopic
    from bertopic.representation import MaximalMarginalRelevance

    for sub, _ in SUBS:
        df = per_sub_corpus(sub)
        week = df.created_utc.dt.to_period("W-SUN").dt.start_time
        df.assign(wk=week).groupby(["wk", "kind"]).size().unstack(fill_value=0).reset_index().to_csv(f"{OUT}{sub}_weekly_counts.csv", index=False)
        docs, timestamps = df.doc.to_list(), df.created_utc.to_list()
        emb = embedder()
        embeddings = emb.fit_transform(docs)
        model = BERTopic(
            top_n_words=10, embedding_model=emb,
            vectorizer_model=CountVectorizer(stop_words="english", min_df=1, ngram_range=(1, 2), max_features=30000),
            hdbscan_model=KMeans(n_clusters=K, random_state=0, n_init=10),
            representation_model=MaximalMarginalRelevance(diversity=0.5, top_n_words=10), verbose=False,
        )
        model.fit_transform(docs, embeddings=embeddings)
        over_time = model.topics_over_time(docs, timestamps, global_tuning=True, evolution_tuning=True, nr_bins=20)
        info = model.get_topic_info()
        info["Top10"] = [top10(model, t) for t in info.Topic]
        info.to_csv(f"{OUT}{sub}_topic_info.csv", index=False)
        over_time.to_csv(f"{OUT}{sub}_topics_over_time.csv", index=False)

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
            gap(ax)
        ax.plot(m.t, m.comment, color=COMMENT, lw=1.1)
        ax.plot(m.t, m.post, color=POST, lw=1.1)
        ax.fill_between(m.t, m.comment, color=COMMENT, alpha=0.10, lw=0)
        ax.fill_between(m.t, m.post, color=POST, alpha=0.14, lw=0)
        ax.set_ylim(0, m.comment.max() * 1.1)
        years_axis(ax, hi="2026-11-30")
        ax.set_title(label, fontsize=16, fontweight="bold", pad=34)
        ax.legend([Line2D([0], [0], color=COMMENT, lw=2.4), Line2D([0], [0], color=POST, lw=2.4)],
                  [f"Comments (total {int(counts.comment.sum()):,})", f"Posts (total {int(counts.post.sum()):,})"],
                  loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=2, frameon=False, fontsize=12)
    axes[0].set_ylabel("Messages per week", fontsize=11, style="italic")
    fig.suptitle("Posts and Comments over Time", fontsize=19, fontweight="bold", y=0.985)
    fig.tight_layout(rect=(0, 0, 1, 0.93), w_pad=3)
    save(fig, "figure_a")

    # Figure B: relative topic share over time, each topic labelled with its keywords
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
        colors = [matplotlib.colors.to_hex(0.62 * np.array(plasma(x)[:3]) + 0.38) for x in np.linspace(0, 1, len(order))]
        ax.stackplot(share.index, share.T.values, colors=colors, edgecolor="white", linewidth=0.8, zorder=2)
        if sub == "HIV":
            ax.axvspan(*RESTRICTED, facecolor="none", edgecolor="white", hatch="////", lw=0, alpha=0.75, zorder=6)
        ax.set_ylim(0, 100)
        ax.set_xlim(share.index.min(), share.index.max())
        ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter())
        ax.tick_params(labelsize=10.5)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
        ax.xaxis.set_major_locator(mdates.YearLocator(1))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
        ax.set_title(label, fontsize=15, fontweight="bold", pad=10)
        last = share.iloc[-1].values
        mids = last.cumsum() - last / 2
        pos = spread(mids, 7.2, 96.5)
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


# ----------------------------------------------------------------------------------------------
# Stage: ksel (number of topics for the joint model)
# ----------------------------------------------------------------------------------------------

def stage_ksel():
    from gensim.corpora import Dictionary
    from gensim.models.coherencemodel import CoherenceModel
    from sklearn.metrics import adjusted_rand_score, calinski_harabasz_score, davies_bouldin_score, silhouette_score

    df = read("combined.pkl")
    n = df.groupby("sub").size().min()  # equal number of messages from each subreddit
    bal = pd.concat([g.sample(n, random_state=0) for _, g in df.groupby("sub")])
    bal.index.name = "row"
    bal.reset_index().to_pickle(OUT + "balanced.pkl")
    docs = bal.doc.to_list()
    N = len(docs)
    emb = embedder().fit_transform(docs)
    rng = np.random.RandomState(0)
    idx = rng.choice(N, 5000, replace=False)
    cidx = rng.choice(N, 15000, replace=False)
    texts = [docs[i].split() for i in cidx]
    dic = Dictionary(texts)
    uni = CountVectorizer(min_df=3)
    X = uni.fit_transform(docs)
    vocab = np.array(uni.get_feature_names_out())
    rows = []
    for k in range(3, 21):
        labs = [KMeans(n_clusters=k, random_state=s, n_init=5).fit_predict(emb) for s in (0, 1, 2)]
        lab = labs[0]
        M = sp.csr_matrix(np.vstack([np.asarray(X[lab == j].sum(0)).ravel() for j in range(k)]))
        tf = sp.csr_matrix(M.multiply(1 / M.sum(1)))
        idf = np.log(1 + M.sum() / np.asarray(M.sum(0)).ravel())
        sc = np.asarray(tf.multiply(idf).todense())
        tops = [list(vocab[np.argsort(-r)[:10]]) for r in sc]
        coh = CoherenceModel(topics=tops, texts=texts, dictionary=dic, coherence="c_npmi").get_coherence()
        rows.append(dict(
            k=k, silhouette=silhouette_score(emb[idx], lab[idx]), davies_bouldin=davies_bouldin_score(emb[idx], lab[idx]),
            calinski_harabasz=calinski_harabasz_score(emb, lab), npmi_coherence=coh,
            topic_diversity=len({w for t in tops for w in t}) / (10 * k),
            stability_ari=np.mean([adjusted_rand_score(labs[i], labs[j]) for i in range(3) for j in range(i + 1, 3)]),
            min_cluster_share=np.bincount(lab).min() / N,
        ))
        print(rows[-1], flush=True)
    sel = pd.DataFrame(rows)
    rk = pd.DataFrame({"s": sel.silhouette.rank(), "d": (-sel.davies_bouldin).rank(), "c": sel.npmi_coherence.rank(),
                       "t": sel.topic_diversity.rank(), "a": sel.stability_ari.rank()})
    sel["mean_rank"] = rk.mean(1)
    sel.to_csv(OUT + "combined_k_selection_3to20.csv", index=False)
    print(sel.round(3).to_string())


# ----------------------------------------------------------------------------------------------
# Stage: joint (analysis 2): one model for both communities
# ----------------------------------------------------------------------------------------------

def overlap_tables(a, info, tag):
    """Topic shares per subreddit, overlap (the smaller share summed over topics), bootstrap intervals, quarterly series."""
    T = sorted(info[info.Topic != -1].Topic)
    subs = ["HIV", "hivaids"]

    def shares(d):
        c = d.topic.value_counts().reindex(T, fill_value=0).astype(float)
        return c / c.sum()

    ov = pd.DataFrame({s: shares(a[a["sub"] == s]) for s in subs})
    ov["equal_weight"] = ov[subs].mean(axis=1)
    ov["min"] = ov[subs].min(axis=1)
    ov["log2_ratio"] = np.log2(ov.HIV / ov.hivaids)
    rng = np.random.RandomState(0)
    B = 500
    g = {s: a[a["sub"] == s].topic.values for s in subs}
    boots = []
    for _ in range(B):
        p = [pd.Series(rng.choice(g[s], len(g[s]))).value_counts().reindex(T, fill_value=0) for s in subs]
        p = [x / x.sum() for x in p]
        mn = np.minimum(p[0], p[1])
        boots.append(np.r_[mn.values, mn.sum(), (p[0] - p[1]).values])
    boots = np.array(boots)
    n = len(T)
    ov["min_lo"], ov["min_hi"] = np.percentile(boots[:, :n], [2.5, 97.5], axis=0)
    ov["diff"] = ov.HIV - ov.hivaids
    ov["diff_lo"], ov["diff_hi"] = np.percentile(boots[:, n + 1:], [2.5, 97.5], axis=0)
    total = ov["min"].sum()
    lo, hi = np.percentile(boots[:, n], [2.5, 97.5])
    m = (ov.HIV + ov.hivaids) / 2
    jsd = 0.5 * (ov.HIV * np.log2(ov.HIV / m)).sum() + 0.5 * (ov.hivaids * np.log2(ov.hivaids / m)).sum()
    print(f"overlap {total:.3f} [{lo:.3f},{hi:.3f}]   Jensen-Shannon divergence (bits) {jsd:.3f}")
    ov["Top10"] = info.set_index("Topic").Top10
    ov.to_csv(OUT + f"overlap_{tag}.csv")

    # quarterly shares within each subreddit, and quarterly overlap
    a = a.assign(q=a.created_utc.dt.to_period("Q").dt.start_time)
    cnt = a.groupby(["q", "sub", "topic"]).size().unstack("topic", fill_value=0).reindex(columns=T, fill_value=0)
    tot = cnt.sum(axis=1)
    rows = [dict(q=q, sub=s, n=int(tot[(q, s)]), **{f"t{t}": r[t] / tot[(q, s)] for t in T}) for (q, s), r in cnt.iterrows()]
    ts = pd.DataFrame(rows)
    ts.to_csv(OUT + f"shares_time_{tag}.csv", index=False)
    cols = [f"t{t}" for t in T]
    ovt = []
    for q, d in ts.groupby("q"):
        if set(d["sub"]) == set(subs):
            x = d.set_index("sub")
            ovt.append(dict(q=q, n_HIV=int(x.loc["HIV", "n"]), n_hivaids=int(x.loc["hivaids", "n"]),
                            overlap=np.minimum(x.loc["HIV", cols].values.astype(float), x.loc["hivaids", cols].values.astype(float)).sum()))
    pd.DataFrame(ovt).to_csv(OUT + f"overlap_time_{tag}.csv", index=False)
    return ov, ts, pd.DataFrame(ovt)


def stage_joint():
    from bertopic import BERTopic
    from bertopic.representation import MaximalMarginalRelevance
    from umap import UMAP

    df, bal = read("combined.pkl"), read("balanced.pkl")
    emb = embedder()
    e_train = emb.fit_transform(bal.doc.to_list())
    model = BERTopic(
        top_n_words=10, embedding_model=emb,
        umap_model=UMAP(n_neighbors=15, n_components=5, min_dist=0.0, metric="cosine", random_state=0),
        vectorizer_model=CountVectorizer(stop_words="english", min_df=1, ngram_range=(1, 2), max_features=30000),
        hdbscan_model=KMeans(n_clusters=K, random_state=0, n_init=10),
        representation_model=MaximalMarginalRelevance(diversity=0.5, top_n_words=10), verbose=False,
    )
    model.fit_transform(bal.doc.to_list(), embeddings=e_train)  # trained on the equal-sized sample
    topics, _ = model.transform(df.doc.to_list(), embeddings=emb.transform(df.doc.to_list()))  # applied to every message
    out = df[["created_utc", "sub", "kind", "raw"]].copy()
    out["topic"] = topics
    out.to_pickle(OUT + "assign_k10.pkl")
    info = model.get_topic_info()
    info["Top10"] = [top10(model, t) for t in info.Topic]
    info.to_csv(OUT + "topic_info_k10.csv", index=False)
    print(info[["Topic", "Count", "Top10"]].to_string(max_colwidth=110))

    ov, ts, ovt = overlap_tables(out, info, "k10")
    lab = {t: ", ".join(info.set_index("Topic").Top10[t].split(", ")[:4]) for t in ov.index}  # topics are named by their keywords
    MINN = 100

    # topic shares over time, one panel per topic
    order = ov.sort_values("equal_weight", ascending=False).index.tolist()
    fig, axes = plt.subplots(3, 4, figsize=(17, 10.5), facecolor="white", sharex=True)
    for ax, t in zip(axes.flat, order):
        gap(ax)
        for s, c, name in (("hivaids", AIDC, "r/hivaids"), ("HIV", HIVC, "r/HIV")):
            d = ts[ts["sub"] == s].copy()
            d.loc[d.n < MINN, f"t{t}"] = np.nan
            ax.plot(d.q + pd.Timedelta(days=45), d[f"t{t}"] * 100, color=c, lw=1.7, marker="o", ms=3, label=name)
        ax.set_title(lab[t], fontsize=11, fontweight="bold", loc="left")
        ax.set_ylim(0, None)
        years_axis(ax, "2021-10-15", "2026-11-30")
        ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(decimals=0))
    for ax in list(axes.flat)[len(order):]:
        ax.axis("off")
    h, l = axes.flat[0].get_legend_handles_labels()
    axes.flat[-1].legend(h, l, loc="center", frameon=False, fontsize=13)
    fig.suptitle("Shared Topics over Time", fontsize=19, fontweight="bold", y=0.985)
    fig.tight_layout(rect=(0, 0, 1, 0.95), h_pad=2.2)
    save(fig, "joint_topics_over_time")

    # overlap per topic, and overlap over time
    ov["ratio"] = ov["min"] / ov[["HIV", "hivaids"]].max(axis=1)
    o = ov.sort_values("ratio")
    fig, ax = plt.subplots(figsize=(12, 6.6), facecolor="white")
    for i, (t, r) in enumerate(o.iterrows()):
        ax.plot([r.HIV * 100, r.hivaids * 100], [i, i], color="#9a9a96", lw=2, zorder=1)
        ax.scatter(r.HIV * 100, i, color=HIVC, s=80, zorder=2)
        ax.scatter(r.hivaids * 100, i, color=AIDC, s=80, zorder=2)
        ax.text(max(r.HIV, r.hivaids) * 100 + 0.8, i, f"{r.ratio * 100:.0f}% overlap", va="center", fontsize=10, color=INK2)
    ax.set_yticks(range(len(o)))
    ax.set_yticklabels([lab[t] for t in o.index], fontsize=11)
    ax.xaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(decimals=0))
    ax.set_xlabel("Share of the subreddit's messages", fontsize=11, style="italic")
    ax.legend(handles=[Line2D([], [], marker="o", ls="", color=HIVC, label="r/HIV"), Line2D([], [], marker="o", ls="", color=AIDC, label="r/hivaids")], frameon=False, loc="lower right")
    fig.tight_layout()
    save(fig, "joint_topic_overlap")
    fig, ax = plt.subplots(figsize=(11.5, 5.2), facecolor="white")
    gap(ax)
    ovt["x"] = ovt.q + pd.Timedelta(days=45)
    low = ovt.n_HIV < MINN
    ax.plot(ovt.x, ovt.overlap * 100, color="#2b3a55", lw=1.8)
    ax.scatter(ovt.x[~low], ovt.overlap[~low] * 100, color="#2b3a55", s=34, zorder=3)
    ax.scatter(ovt.x[low], ovt.overlap[low] * 100, facecolor="white", edgecolor="#2b3a55", s=34, zorder=3)
    ax.axhline(ov["min"].sum() * 100, color="#9a9a96", lw=0.9, ls=(0, (4, 3)))
    ax.set_ylim(0, 100)
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(decimals=0))
    years_axis(ax, "2021-10-15", "2026-11-30")
    ax.set_ylabel("Topic-share overlap between subreddits", fontsize=11, style="italic")
    fig.text(0.01, 0.01, "Hollow points: fewer than 100 r/HIV messages in the quarter.", fontsize=9.5, color=INK2)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    save(fig, "joint_overlap_over_time")


# ----------------------------------------------------------------------------------------------
# Stage: keywords
# ----------------------------------------------------------------------------------------------

def stage_keywords():
    from wordfreq import zipf_frequency

    corp = {sub: per_sub_corpus(sub) for sub, _ in SUBS}
    docs_by = {sub: corp[sub].doc.to_list() for sub in corp}
    docs_by["combined"] = docs_by["HIV"] + docs_by["hivaids"]

    # ten most common words per corpus, dropping very common English words (Zipf frequency 5.5 or more)
    rows = []
    for name, docs in docs_by.items():
        tot = collections.Counter(w for d in docs for w in d.split())
        dfc = collections.Counter(w for d in docs for w in set(d.split()))
        n = sum(tot.values())
        kept = [(w, c) for w, c in tot.most_common() if zipf_frequency(w, "en") < 5.5]
        for r, (w, c) in enumerate(kept[:10], 1):
            rows.append(dict(corpus=name, rank=r, word=w, count=c, per_1000_words=round(1000 * c / n, 2), docs=dfc[w],
                             share_docs=round(100 * dfc[w] / len(docs), 1), zipf=zipf_frequency(w, "en")))
    tw = pd.DataFrame(rows)
    tw.to_csv(OUT + "top_words.csv", index=False)

    # the same, before 2024 and from March 2025
    rows = []
    for sub, df in corp.items():
        t = pd.to_datetime(df.created_utc)
        for per, m in (("before 2024", t < "2024-01-01"), ("from Mar 2025", t >= "2025-03-01")):
            docs = df.doc[m].to_list()
            tot = collections.Counter(w for d in docs for w in d.split())
            n = sum(tot.values())
            kept = [(w, c) for w, c in tot.most_common() if zipf_frequency(w, "en") < 5.5 and w not in ("hiv", "doctor")]
            for r, (w, c) in enumerate(kept[:10], 1):
                rows.append(dict(sub=sub, period=per, rank=r, word=w, count=c, per_1000_words=round(1000 * c / n, 1), n_msgs=len(docs)))
    pd.DataFrame(rows).to_csv(OUT + "top_words_periods.csv", index=False)

    # monthly counts of each subreddit's own top words (words in both top-10 lists are left out)
    DROP = {"hiv", "doctor"}
    lists = {s: [w for w in tw[tw.corpus == s].sort_values("rank").word if w not in DROP] for s in ("HIV", "hivaids")}
    both = set(lists["HIV"]) & set(lists["hivaids"])
    top = {s: [w for w in lists[s] if w not in both][:5] for s in lists}
    json.dump(top, open(OUT + "word_lists.json", "w"))
    words = sorted(set(top["HIV"]) | set(top["hivaids"]))
    frames = []
    for sub, df in corp.items():
        df = df.assign(month=pd.to_datetime(df.created_utc).dt.to_period("M").dt.start_time)
        for w in words:
            df[w] = df.doc.map(lambda d: d.split().count(w))
        g = df.groupby("month")[words].sum()
        g["n_msgs"] = df.groupby("month").size()
        g["sub"] = sub
        frames.append(g.reset_index())
    mon = pd.concat(frames)
    mon.to_csv(OUT + "word_counts_monthly.csv", index=False)

    # figures: top words over time, per subreddit and together
    d = mon[(mon.month >= "2021-11-01") & (mon.month < "2026-11-01")]
    HIVP = ["#7a2e12", "#c4602f", "#dd9a63", "#b5483a", "#8f6a4a"]
    AIDP = ["#2b3a55", "#4b2a6b", "#6c8eab", "#7b5a7e", "#3f7f7a"]

    def lines(ax, sub, pal):
        g = d[d["sub"] == sub].set_index("month").reindex(pd.date_range("2021-11-01", "2026-10-01", freq="MS"), fill_value=0)
        ends = []
        for w, c in zip(top[sub], pal):
            ax.plot(g.index + pd.Timedelta(days=14), g[w], color=c, lw=1.7)
            ends.append(g[w].iloc[-3:].mean())
        return g, ends

    def label(ax, ends, ws, cols, ymax):
        pos = spread(ends, ymax * 0.07, ymax * 0.97)
        x = pd.Timestamp("2026-11-08")
        for w, e, p, c in zip(ws, ends, pos, cols):
            ax.plot([pd.Timestamp("2026-10-15"), x], [e, p], color="#9a9a96", lw=0.6, clip_on=False)
            ax.text(x + pd.Timedelta(days=6), p, w, va="center", ha="left", fontsize=12, color=c, fontweight="bold", clip_on=False)

    for k, (sub, pal) in enumerate((("HIV", HIVP), ("hivaids", AIDP)), 1):
        fig, ax = plt.subplots(figsize=(11, 5.4), facecolor="white")
        if sub == "HIV":
            gap(ax)
        g, ends = lines(ax, sub, pal)
        ymax = max(g[w].max() for w in top[sub]) * 1.08
        ax.set_ylim(0, ymax)
        years_axis(ax)
        label(ax, ends, top[sub], pal, ymax)
        ax.set_ylabel("Mentions per month", fontsize=11, style="italic")
        ax.set_title(f"Most Common Words in r/{sub} over Time", fontsize=17, fontweight="bold", loc="left", pad=12)
        fig.subplots_adjust(left=0.07, right=0.84, top=0.88, bottom=0.11)
        save(fig, f"top_words_{sub}")

    # relative frequency of selected words in r/HIV, per quarter
    W = ["pep", "symptom", "month", "result", "risk"]
    df = corp["HIV"].copy()
    df["q"] = pd.to_datetime(df.created_utc).dt.to_period("Q").dt.start_time
    df["tok"] = df.doc.str.split().str.len()
    for w in W:
        df[w] = df.doc.map(lambda s: s.split().count(w))
    g = df.groupby("q")[W + ["tok"]].sum()
    g["n_msgs"] = df.groupby("q").size()
    for w in W:
        g[w + "_per1000"] = 1000 * g[w] / g.tok
    g.to_csv(OUT + "rHIV_word_rates_quarterly.csv")
    g = g[(g.index >= "2021-10-01") & (g.index < "2026-11-01")].reindex(pd.date_range("2021-10-01", "2026-10-01", freq="QS"))
    ok = g.n_msgs.fillna(0) >= 100
    COL = ["#7a2e12", "#b5483a", "#8f6a4a", "#2b3a55", "#6c8eab"]
    fig, ax = plt.subplots(figsize=(11, 5.6), facecolor="white")
    gap(ax)
    ends = []
    for w, c in zip(W, COL):
        y = g[w + "_per1000"].where(ok)
        ax.plot(g.index + pd.Timedelta(days=45), y, color=c, lw=1.8, marker="o", ms=3.5)
        ends.append(y.dropna().iloc[-3:].mean())
    years_axis(ax)
    ymax = np.nanmax([g[w + "_per1000"].where(ok).max() for w in W]) * 1.08
    ax.set_ylim(0, ymax)
    label(ax, ends, W, COL, ymax)
    ax.set_ylabel("Mentions per 1,000 words", fontsize=11, style="italic")
    ax.set_title("Relative Frequency of Selected Words in r/HIV", fontsize=17, fontweight="bold", loc="left", pad=12)
    fig.subplots_adjust(left=0.07, right=0.86, top=0.88, bottom=0.11)
    save(fig, "rHIV_word_rates")


# ----------------------------------------------------------------------------------------------
# Stage: sentiment
# ----------------------------------------------------------------------------------------------

def stage_sentiment():
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

    c = read("combined.pkl")
    sia = SentimentIntensityAnalyzer()
    # "positive" and "negative" are deleted first: in these communities they are test results, not moods
    c["s"] = c.raw.map(lambda t: sia.polarity_scores(re.sub(r"\b(positives?|negatives?)\b", " ", t))["compound"])
    c.to_pickle(OUT + "sentiment_nopn.pkl")
    c["q"] = c.created_utc.dt.to_period("Q").dt.start_time
    rows = []
    for key, d in (("all", c), ("post", c[c.kind == "post"])):
        for sub in ("HIV", "hivaids"):
            g = d[d["sub"] == sub].groupby("q").s.agg(["mean", "std", "count"])
            for q, r in g.iterrows():
                rows.append(dict(which=key, sub=sub, q=q, mean=r["mean"], ci95=1.96 * r["std"] / np.sqrt(r["count"]), n=int(r["count"])))
    q = pd.DataFrame(rows)
    q.to_csv(OUT + "sentiment_quarterly.csv", index=False)

    # before 2024 against from March 2025, mean with 95% margin of error
    tab = {}
    for sub in ("HIV", "hivaids"):
        for key, d in (("all", c), ("post", c[c.kind == "post"])):
            for per, m in (("before", d.created_utc < "2024-01-01"), ("after", d.created_utc >= "2025-03-01")):
                x = d[(d["sub"] == sub) & m].s
                tab[f"{sub}|{key}|{per}"] = dict(n=int(len(x)), m=round(float(x.mean()), 3), ci=round(float(1.96 * x.std() / np.sqrt(len(x))), 3))
    json.dump(tab, open(OUT + "sent_table.json", "w"), indent=1)
    print(json.dumps(tab, indent=1))

    fig, axs = plt.subplots(1, 2, figsize=(13, 4.8), sharey=True)
    for ax, (title, key) in zip(axs, (("Posts and comments", "all"), ("Posts only", "post"))):
        gap(ax)
        for sub, col in (("HIV", HIVC), ("hivaids", AIDC)):
            g = q[(q.which == key) & (q["sub"] == sub)].set_index("q")
            ok = g.n >= 30
            ax.plot(g.index[ok], g["mean"][ok], color=col, lw=2, label=f"r/{sub}")
            ax.fill_between(g.index[ok], (g["mean"] - g.ci95)[ok], (g["mean"] + g.ci95)[ok], color=col, alpha=0.2, lw=0)
            ax.scatter(g.index[~ok], g["mean"][~ok], s=18, facecolors="none", edgecolors=col)
        ax.axhline(0, color="#aaa", lw=0.6)
        ax.set_title(title, fontsize=11)
        years_axis(ax)
    axs[0].set_ylabel("Mean VADER compound score (quarterly)")
    axs[0].legend(frameon=False, loc="upper right")
    fig.tight_layout()
    save(fig, "sentiment")


# ----------------------------------------------------------------------------------------------
# Stage: users (people who write in both subreddits)
# ----------------------------------------------------------------------------------------------

def authors_table():
    """Messages with author and joint-model topic, without bots, moderators and deleted accounts.

    The author-level analyses use each subreddit's own cleaned corpus (vocabulary filter fitted per subreddit);
    topics come from the joint model's assignment of the same messages."""
    a = pd.concat([per_sub_corpus(sub) for sub, _ in SUBS], ignore_index=True)
    bad = a.author.isna() | a.author.isin(["[deleted]", "AutoModerator"]) | a.author.str.contains("ModTeam|bot$|^bot|_bot", case=False, na=False)
    print("dropped bot/deleted-author rows:", int(bad.sum()))
    a = a[~bad][["created_utc", "sub", "kind", "author", "raw"]].copy()
    a["author"] = a.author.astype(str)
    topics = read("assign_k10.pkl")[["created_utc", "sub", "kind", "raw", "topic"]]
    return a.merge(topics, on=["created_utc", "sub", "kind", "raw"], how="left")


def stage_users():
    a = authors_table()
    a["m"] = a.created_utc.dt.to_period("M").dt.start_time
    S = {s: set(a[a["sub"] == s].author) for s in ("HIV", "hivaids")}
    both = S["HIV"] & S["hivaids"]
    print("authors: r/HIV", len(S["HIV"]), "r/hivaids", len(S["hivaids"]), "both", len(both), "either", len(S["HIV"] | S["hivaids"]))

    # who also writes in the other subreddit, and how (posts only, comments only, both)
    pies = {}
    for s, o in (("HIV", "hivaids"), ("hivaids", "HIV")):
        ct = a[a["sub"] == o].groupby(["author", "kind"]).size().unstack(fill_value=0).reindex(columns=["post", "comment"], fill_value=0)
        users = pd.Series(sorted(S[s]))
        p = users.map(lambda u: u in ct.index and ct.loc[u, "post"] > 0)
        c = users.map(lambda u: u in ct.index and ct.loc[u, "comment"] > 0)
        pies[s] = dict(n=len(users), none=int((~p & ~c).sum()), post=int((p & ~c).sum()), comment=int((~p & c).sum()), both=int((p & c).sum()))
    json.dump(pies, open(OUT + "user_overlap_pies.json", "w"), indent=1)
    print(pies)

    # share of each subreddit's monthly users who are active in the other that month
    mm = []
    for m, g in a.groupby("m"):
        h = set(g[g["sub"] == "HIV"].author)
        k = set(g[g["sub"] == "hivaids"].author)
        c = h & k
        mm.append(dict(m=m, n_HIV=len(h), n_hivaids=len(k), same_month_both=len(c),
                       pct_of_HIV=100 * len(c) / max(len(h), 1), pct_of_hivaids=100 * len(c) / max(len(k), 1)))
    mm = pd.DataFrame(mm)
    mm.to_csv(OUT + "users_overlap_monthly.csv", index=False)

    # users who switch subreddit exactly once, and back-and-forth users
    a = a.sort_values("created_utc")
    sw = []
    for u, g in a[a.author.isin(both)].groupby("author"):
        s = g["sub"].values
        ch = int((s[1:] != s[:-1]).sum())
        sw.append(dict(author=u, n=len(g), changes=ch, clean_switch=int(ch == 1), first_sub=s[0], last_sub=s[-1],
                       switch_t=g.created_utc.values[np.argmax(s != s[0])] if ch else pd.NaT))
    sw = pd.DataFrame(sw)
    sw.to_csv(OUT + "users_shared_switching.csv", index=False)
    print("one-way switchers:", int(sw.clean_switch.sum()), "back-and-forth:", int((sw.changes > 1).sum()))

    # messages per month by the users in both subreddits
    g = a[a.author.isin(both)]
    idx = pd.date_range("2021-11-01", "2026-11-01", freq="MS")
    joint = pd.DataFrame({f"{kind}_{s}": g[(g["sub"] == s) & (g.kind == kind)].groupby("m").size().reindex(idx, fill_value=0)
                          for kind in ("post", "comment") for s in ("HIV", "hivaids")})
    joint.to_csv(OUT + "joint_users_monthly.csv")

    # figures
    mm = mm[(mm.m >= "2021-11-01") & (mm.m < "2026-11-01")]
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(11.5, 8.6), facecolor="white", gridspec_kw=dict(height_ratios=[1.15, 1]))
    gap(a1)
    t = mm.m + pd.Timedelta(days=14)
    for col, nc, c, lab in (("pct_of_hivaids", "n_hivaids", AIDC, "Share of r/hivaids users also active in r/HIV that month"),
                            ("pct_of_HIV", "n_HIV", HIVC, "Share of r/HIV users also active in r/hivaids that month")):
        a1.plot(t, mm[col].where(mm[nc] >= 30), color=c, lw=1.8, marker="o", ms=3, label=lab)
    a1.set_ylim(0, 40)
    a1.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(decimals=0))
    a1.legend(frameon=False, loc="upper left", fontsize=11)
    a1.set_title("Users Active in Both Subreddits", fontsize=17, fontweight="bold", loc="left", pad=12)
    gap(a2)
    one = sw[sw.clean_switch == 1].copy()
    one["q"] = pd.to_datetime(one.switch_t).dt.to_period("Q").dt.start_time
    qs = pd.date_range("2021-10-01", "2026-10-01", freq="QS")
    x = qs + pd.Timedelta(days=45)
    h2a = one[one.first_sub == "HIV"].groupby("q").size().reindex(qs, fill_value=0)
    a2h = one[one.first_sub == "hivaids"].groupby("q").size().reindex(qs, fill_value=0)
    a2.bar(x, h2a.values, width=55, color=AIDC, label="Moved from r/HIV to r/hivaids")
    a2.bar(x, -a2h.values, width=55, color=HIVC, label="Moved from r/hivaids to r/HIV")
    a2.axhline(0, color=INK2, lw=0.8)
    a2.set_ylabel("Users who switched (one-way)", fontsize=11, style="italic")
    a2.legend(frameon=False, loc="upper left", fontsize=11)
    a2.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, p: f"{abs(int(v))}"))
    for ax in (a1, a2):
        years_axis(ax, "2021-10-15", "2026-11-15")
    fig.tight_layout(h_pad=2.5)
    save(fig, "shared_users")

    fig, axs = plt.subplots(1, 3, figsize=(15, 4.6))
    for ax, (title, kinds) in zip(axs, (("Posts and comments", ("post", "comment")), ("Posts", ("post",)), ("Comments", ("comment",)))):
        gap(ax)
        for s, col in (("HIV", HIVC), ("hivaids", AIDC)):
            ax.plot(joint.index, sum(joint[f"{k}_{s}"] for k in kinds), color=col, lw=2, label=f"r/{s}")
        ax.set_title(title, fontsize=11)
        ax.set_ylim(bottom=0)
        years_axis(ax)
    axs[0].set_ylabel("Messages per month by users in both subreddits")
    axs[0].legend(frameon=False, loc="upper right")
    fig.tight_layout()
    save(fig, "joint_users_monthly")


# ----------------------------------------------------------------------------------------------
# Stage: spotlight (three individual users)
# ----------------------------------------------------------------------------------------------

def stage_spotlight():
    a = authors_table()
    info = pd.read_csv(OUT + "topic_info_k10.csv")
    info = info[info.Topic != -1].set_index("Topic")
    a["m"] = a.created_utc.dt.to_period("M").dt.start_time
    a["half"] = a.created_utc.dt.year.astype(str) + "H" + np.where(a.created_utc.dt.month <= 6, "1", "2")
    months = pd.date_range("2021-11-01", "2026-11-01", freq="MS")
    halves = sorted(a.half.unique())
    out = {}
    for u in SPOTLIGHT:
        d = a[a.author == u]
        rec = dict(alias=u, n=len(d), first=d.created_utc.min().strftime("%b %Y"), last=d.created_utc.max().strftime("%b %Y"), monthly={}, tot={})
        for s in ("HIV", "hivaids"):
            x = d[d["sub"] == s]
            rec["monthly"][s] = {k: x[x.kind == kind].groupby("m").size().reindex(months, fill_value=0).tolist() for k, kind in (("c", "comment"), ("p", "post"))}
            rec["tot"][s] = dict(c=int((x.kind == "comment").sum()), p=int((x.kind == "post").sum()))
        rec["halves"] = halves
        rec["topics"] = {name: [[int(((sub["half"] == h) & (sub.topic == t)).sum()) for t in info.index] for h in halves]
                         for name, sub in (("all", d), ("HIV", d[d["sub"] == "HIV"]), ("hivaids", d[d["sub"] == "hivaids"]))}
        out[u] = rec
        print(u, rec["n"], rec["tot"])
    json.dump(out, open(OUT + "spotlight_users.json", "w"))


# ----------------------------------------------------------------------------------------------
# Stage: final (formal versions of the website figures)
# ----------------------------------------------------------------------------------------------

def stage_final():
    """Black-and-white figures in the site palette. They read the data files the website draws from (docs/js/data*.js)."""
    from matplotlib.patches import Patch

    SITE = "docs/js/"

    def site(f):
        s = open(SITE + f).read()
        m = re.match(r"\s*window\.(\w+)\s*=\s*", s)
        return json.loads(s[m.end():].rstrip().rstrip(";"))

    D1, D2, S, D3 = site("data.js"), site("data2.js"), site("sentdata.js"), site("data3.js")
    os.makedirs("figures/final", exist_ok=True)
    INKS, HIV, AID, SHADE = "#3d1a26", "#4d5f2a", "#7a5a8a", "#B79BC4"
    TC = ["#5B7396", "#8FA9C9", "#B79BC4", "#9C5F86", "#C77B8F", "#E6A9A3", "#F1D98A", "#D9A93A", "#A9A24F", "#B6CFA6"]
    SUBN = {"HIV": "r/HIV", "hivaids": "r/hivaids"}
    plt.rcParams.update({
        "text.usetex": False, "font.family": "cmr10", "mathtext.fontset": "cm", "axes.formatter.use_mathtext": True, "axes.unicode_minus": False,
        "font.size": 9, "axes.labelsize": 9, "axes.titlesize": 9.5, "legend.fontsize": 7.5, "xtick.labelsize": 8, "ytick.labelsize": 8,
        "axes.edgecolor": INKS, "axes.labelcolor": INKS, "xtick.color": INKS, "ytick.color": INKS, "text.color": INKS, "axes.linewidth": 0.7,
        "xtick.direction": "in", "ytick.direction": "in", "xtick.major.size": 3, "ytick.major.size": 3, "figure.dpi": 200, "savefig.dpi": 200,
        "savefig.bbox": "tight", "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False, "axes.grid": False,
    })
    shade = lambda ax: ax.axvspan(2024.0, 2025.167, facecolor=SHADE, alpha=0.22, lw=0, hatch="////", edgecolor=SHADE)
    yrs = lambda ax, lo=2021.8, hi=2027.0: (ax.set_xlim(lo, hi), ax.set_xticks(range(2022, 2027)))
    out = lambda fig, name: (fig.savefig(f"figures/final/{name}.png"), plt.close(fig))
    KW = lambda s, n=3: ", ".join(s.split(", ")[:n])
    W = 6.8

    A = D1["A"]
    fig, axs = plt.subplots(2, 1, figsize=(W, 4.6), sharex=True)
    for ax, k in zip(axs, ["hiv", "hivaids"]):
        d = A[k]
        t = A["weekStart"] + np.arange(len(d["comments"])) * A["weekStep"]
        tp = A["weekStart"] + np.arange(len(d["posts"])) * A["weekStep"]
        c = HIV if k == "hiv" else AID
        shade(ax)
        ax.plot(t, d["comments"], color=c, lw=1.0, label="Comments")
        ax.plot(tp, d["posts"], color=c, lw=1.0, ls=(0, (3, 2)), label="Posts")
        ax.set_ylim(0, d["ylim"])
        ax.set_ylabel("Messages per week")
        ax.set_title("r/HIV" if k == "hiv" else "r/hivaids", loc="left", fontsize=9.5)
        ax.legend(loc="upper right", ncol=2)
        ax.text(2024.58, d["ylim"] * 0.93, "restricted", ha="center", fontsize=7.5, style="italic")
    yrs(axs[1]); axs[1].set_xlabel("Year"); fig.tight_layout(h_pad=1.0); out(fig, "fig1_messages_over_time")

    B = D1["B"]
    fig, axs = plt.subplots(2, 1, figsize=(W, 6.2), sharex=True)
    for ax, k in zip(axs, ["hiv", "hivaids"]):
        sh = np.array(B[k]["shares"]).T
        sh = sh / sh.sum(0) * 100
        ax.stackplot(np.array(B["years"]), sh, colors=TC, edgecolor=INKS, linewidth=0.3)
        shade(ax); ax.set_ylim(0, 100); ax.set_ylabel("Share of messages (%)"); ax.set_title("r/HIV" if k == "hiv" else "r/hivaids", loc="left")
        ax.legend(handles=[Patch(fc=TC[i], ec=INKS, lw=0.3, label=f'{i}: {KW(B[k]["kw"][i], 3)}') for i in range(len(TC))][::-1], loc="center left", bbox_to_anchor=(1.01, 0.5), fontsize=7)
        ax.set_xlim(B["xdomain"][0], B["xdomain"][1])
    yrs(axs[1], B["xdomain"][0], 2027); axs[1].set_xlabel("Year"); fig.tight_layout(h_pad=1.0); out(fig, "fig2_topics_separate_models")

    M = D2["months"]
    t = np.array([m["t"] for m in M])
    n = np.array([m["n"] for m in M], float)
    fig, ax = plt.subplots(figsize=(W, 3.3))
    shade(ax)
    cols = {"pep": "#8E2F4A", "symptom": "#5B7396", "undetectable": HIV, "treatment": "#D9A93A"}
    for w in D2["words"]:
        ax.plot(t, np.array([m[w] for m in M]) / n * 100, color=cols[w], lw=1.2, label=w)
    ax.set_ylabel("Share of messages mentioning word (%)"); yrs(ax); ax.set_xlabel("Year")
    ax.legend(ncol=4, loc="lower center", bbox_to_anchor=(0.5, 1.0)); ax.set_title("r/HIV", loc="left", pad=22); fig.tight_layout(); out(fig, "fig3_keyword_rates")

    fig, axs = plt.subplots(2, 2, figsize=(W, 5.4), sharex="row")
    for r, k in enumerate(["HIV", "hivaids"]):
        for c, per in enumerate(["before", "after"]):
            ax = axs[r, c]
            lst = D2["TW"][k][per]
            wds = [x[0] for x in lst][::-1]
            v = [x[1] for x in lst][::-1]
            ax.barh(wds, v, color=HIV if k == "HIV" else AID, edgecolor=INKS, lw=0.4, height=0.7)
            for i, x in enumerate(v):
                ax.text(x + 0.2, i, f"{x:.1f}", va="center", fontsize=7)
            ax.set_title(f"{SUBN[k]}, " + ("before 2024" if per == "before" else "from March 2025"), loc="left", fontsize=9)
            ax.set_xlim(0, max(x[1] for x in D2["TW"][k]["before"] + D2["TW"][k]["after"]) * 1.15)
            if r == 1:
                ax.set_xlabel("Rate per 100 messages")
    fig.tight_layout(h_pad=1.2); out(fig, "fig4_top_keywords")

    fig, axs = plt.subplots(1, 2, figsize=(W, 3.2), sharey=True)
    for ax, key, ttl in zip(axs, ["all", "post"], ["All messages", "Posts only"]):
        shade(ax); ax.axhline(0, color=INKS, lw=0.5)
        for k, c in (("HIV", HIV), ("hivaids", AID)):
            a_ = np.array(S[key][k])
            ok = a_[:, 3] >= 30
            ax.plot(a_[:, 0], a_[:, 1], color=c, lw=0.9, ls=":", zorder=1)
            ax.fill_between(a_[ok, 0], (a_[:, 1] - a_[:, 2])[ok], (a_[:, 1] + a_[:, 2])[ok], color=c, alpha=0.2, lw=0)
            ax.plot(a_[ok, 0], a_[ok, 1], "o", ms=3, color=c, label=SUBN[k]); ax.plot(a_[~ok, 0], a_[~ok, 1], "o", ms=3, mfc="white", mec=c, mew=0.8)
        ax.set_title(ttl, loc="left"); yrs(ax); ax.set_xlabel("Year")
    axs[0].set_ylabel("Mean sentiment (VADER compound)"); axs[0].legend(loc="lower right"); fig.tight_layout(); out(fig, "fig5_sentiment")

    sh = D2["shares"]
    fig, axs = plt.subplots(2, 1, figsize=(W, 6.2), sharex=True)
    for ax, k in zip(axs, ["HIV", "hivaids"]):
        t = np.array([x["t"] for x in sh[k]])
        y = np.array([x["s"] for x in sh[k]]).T
        y = y / y.sum(0) * 100
        ax.stackplot(t, y, colors=TC, edgecolor=INKS, linewidth=0.3); shade(ax); ax.set_ylim(0, 100); ax.set_ylabel("Share of messages (%)"); ax.set_title(SUBN[k], loc="left")
        ax.set_xlim(2021.875, t.max())
        ax.legend(handles=[Patch(fc=TC[i], ec=INKS, lw=0.3, label=f'{i}: {KW(D2["topics"][i]["kw"], 4)}') for i in range(10)][::-1], loc="center left", bbox_to_anchor=(1.01, 0.5), fontsize=7)
    yrs(axs[1]); axs[1].set_xlabel("Year"); fig.tight_layout(h_pad=1.0); out(fig, "fig6_joint_topic_model")

    T = D2["topics"]
    y = np.arange(10)[::-1]
    fig, ax = plt.subplots(figsize=(W, 4.2))
    ax.barh(y + 0.2, [t["hiv"] for t in T], height=0.38, color=HIV, edgecolor=INKS, lw=0.4, label="r/HIV")
    ax.barh(y - 0.2, [t["aids"] for t in T], height=0.38, color=AID, edgecolor=INKS, lw=0.4, label="r/hivaids")
    ax.set_yticks(y); ax.set_yticklabels([f'{i}: {KW(T[i]["kw"], 4)}' for i in range(10)], fontsize=7.5)
    ax.set_xlabel("Share of messages (%)"); ax.legend(loc="lower right"); fig.tight_layout(); out(fig, "fig7_topic_shares_comparison")

    P = D3["pies"]
    fig, axs = plt.subplots(1, 2, figsize=(W, 3.4))
    labs = ["Only here", "Also posts", "Also comments", "Does both"]
    cl = ["#E8E0CF", "#D9A93A", "#8FA9C9", "#B7586F"]
    keys = ["none", "post", "comment", "both"]
    for ax, k in zip(axs, ["HIV", "hivaids"]):
        ax.pie([P[k][q] for q in keys], colors=cl, startangle=90, counterclock=False, wedgeprops=dict(edgecolor=INKS, lw=0.6))
        ax.set_title(f'{SUBN[k]} users ($n$ = {P[k]["n"]:,})', fontsize=9)
    fig.legend(handles=[Patch(fc=c, ec=INKS, lw=0.5, label=f'{l} (r/HIV {P["HIV"][q]:,}; r/hivaids {P["hivaids"][q]:,})') for c, l, q in zip(cl, labs, keys)],
               loc="lower center", ncol=2, bbox_to_anchor=(0.5, -0.06), fontsize=7)
    fig.tight_layout(rect=(0, 0.12, 1, 1)); out(fig, "fig8_user_overlap_pies")

    fig, axs = plt.subplots(2, 1, figsize=(W, 4.8), sharex=True)
    t = np.array(D3["t"])
    for ax, kind, ttl in zip(axs, ["post", "comment"], ["Posts per month", "Comments per month"]):
        shade(ax)
        for k, c in (("HIV", HIV), ("hivaids", AID)):
            ax.plot(t, D3[kind][k], color=c, lw=1.1, label=SUBN[k])
        ax.set_ylabel(ttl); ax.set_ylim(0)
    axs[0].legend(loc="upper left", ncol=2); yrs(axs[1]); axs[1].set_xlabel("Year")
    axs[0].set_title("Messages by the 891 users who write in both subreddits", loc="left"); fig.tight_layout(h_pad=1.0); out(fig, "fig9_joint_users_monthly")


# ----------------------------------------------------------------------------------------------

STAGES = {"prep": stage_prep, "separate": stage_separate, "ksel": stage_ksel, "joint": stage_joint, "keywords": stage_keywords,
          "sentiment": stage_sentiment, "users": stage_users, "spotlight": stage_spotlight, "final": stage_final}

if __name__ == "__main__":
    wanted = sys.argv[1:] or ["all"]
    if wanted == ["all"]:
        wanted = list(STAGES)
    for name in wanted:
        if name not in STAGES:
            sys.exit(f"unknown stage {name!r}; choose from: all, " + ", ".join(STAGES))
        print(f"== {name}", flush=True)
        STAGES[name]()

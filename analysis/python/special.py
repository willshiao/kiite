import re
from tqdm import tqdm
import pandas as pd
import swifter
import seaborn as sns
import numpy as np
from wutils.general import save_pickle, load_pickle
from wutils.mat import MarkedMatrix
from scipy.spatial.distance import cdist
from sklearn.linear_model import LogisticRegression
from sklearn.cluster import MiniBatchKMeans
import wandb
import argparse
from sklearn.ensemble import RandomForestClassifier
import sys

import urllib.parse
def get_hostname(url):
    o = urllib.parse.urlsplit(url)
    return o.hostname

parser = argparse.ArgumentParser(description='Train distance-matrix models (and baseline)')
parser.add_argument('--max_iterations', type=int, default=1000)
parser.add_argument('--max_iterations_kmeans', type=int, default=500)
parser.add_argument('--n_jobs', type=int, default=32)
parser.add_argument('--n_estimators', type=int, default=800)
parser.add_argument('--solver', type=str, default='lbfgs')
parser.add_argument('--resume', type=bool, default=False)
args = parser.parse_args()

print('Loading CORD pickle...')
cord_df = load_pickle('./who_cord_df.pkl').dropna()
print('Loading good_df pickle...')
good_df = load_pickle('./clean_good_df.pkl').dropna()
print('Loading bad_df pickle...')
bad_df = load_pickle('./clean_bad_df.pkl').dropna()

resume_waterline = None
if args.resume:
    with open('resume_file.txt', 'r') as f:
        resume_waterline = int(f.read())

good_df['mean_embed_ft'] = good_df['ft_embeddings'].swifter.apply(lambda x: np.array([y for y in x if np.isfinite(y).all()]).mean(axis=0))
bad_df['mean_embed_ft'] = bad_df['ft_embeddings'].swifter.apply(lambda x: np.array([y for y in x if np.isfinite(y).all()]).mean(axis=0))
cord_df['mean_embed_ft'] = cord_df['ft_embeddings'].swifter.apply(lambda x: np.array([y for y in x if np.isfinite(y).all()]).mean(axis=0))

good_df['mean_embed_bert'] = good_df['sent_embeddings'].swifter.apply(lambda x: np.array(x).mean(axis=0))
bad_df['mean_embed_bert'] = bad_df['sent_embeddings'].swifter.apply(lambda x: np.array(x).mean(axis=0))
cord_df['mean_embed_bert'] = cord_df['sent_embeddings'].swifter.apply(lambda x: np.array(x).mean(axis=0))

is_AP = bad_df['cleanText'].swifter.apply(lambda x: '(AP)' in x)
print('Found AP articles: ', is_AP.sum())
clean_bad_df = bad_df[~is_AP]

last_step = 0

def inc_progress():
    global last_step
    with open('resume_file.txt', 'w') as f:
        f.write(str(last_step))
    last_step += 1

def already_done():
    global last_step
    if resume_waterline is None:
        return False
    if last_step < resume_waterline:
        print(f'Already done, skipping step #{last_step}')
        last_step += 1
        return True
    return False

def news_filter(text):
    keep_if = ['wuhan']
    text = text.lower()
    blacklist = ['u.s.', 'america', 'korea', 'china', 'mexico', 'australia', 'uk', 'u.k.', 'new york', 'los angeles', 'nfl', 'nba', 'mlb', 'epl']
    if any(x in text for x in keep_if):
        return True
    if any(x in text for x in blacklist):
        return False
    return True

def baseline_run(dset_name, method_name, embedding_type):
    if already_done():
        return True
    args.num_cord = 0
    args.dataset = dset_name
    args.model_type = method_name
    args.randomized_good = True
    args.embedding_type = embedding_type
    run = wandb.init(project="covid-news", reinit=True, config=args)

    if dset_name == 'news':
        s_good = good_df.dropna().sample(n=30000)
        s_bad = bad_df.dropna()
    elif 'news' in dset_name:
        # Assume it's news w/ no sports/countries
        s_good = good_df[good_df['cleanText'].swifter.apply(news_filter)]
        s_bad = bad_df[bad_df['cleanText'].swifter.apply(news_filter)]
        if dset_name == 'news_clean':
            pass
        elif dset_name in ('news_vaccine', 'news_transmission'):
            if dset_name == 'news_vaccine':
                KW = 'vaccine'
            elif dset_name == 'news_transmission':
                KW = 'transmission'
            else:
                print('INVALID DSET_NAME')
                sys.exit(5)
            s_good = s_good[s_good['cleanText'].swifter.apply(lambda x: KW in x.lower())]
            s_bad = s_bad[s_bad['cleanText'].swifter.apply(lambda x: KW in x.lower())]
        else:
            print('INVALID DSET_NAME')
            sys.exit(6)

    else:
        print('UNKNOWN DSET_NAME')
        sys.exit(3)

    if embedding_type == 'fasttext':
        mat_good = np.vstack(s_good['mean_embed_ft'])
        mat_bad = np.vstack(s_bad['mean_embed_ft'])
    elif embedding_type == 'bert':
        mat_good = np.vstack(s_good['mean_embed_bert'])
        mat_bad = np.vstack(s_bad['mean_embed_bert'])
    else:
        print('WRONG EMBEDDING TYPE')
        sys.exit(2)

    mm = MarkedMatrix((('real', mat_good), ('fake', mat_bad)))

    if method_name == 'random_forest':
        model = RandomForestClassifier(verbose=1, n_jobs=args.n_jobs, n_estimators=args.n_estimators)
    elif method_name == 'logistic_regression':
        model = LogisticRegression(max_iter=args.max_iterations, verbose=1, n_jobs=args.n_jobs, solver=args.solver)
    else:
        print('WRONG METHOD TYPE')
        sys.exit(1)
    
    acc, f1 = mm.single_split_classify(model)
    wandb.log({
        'accuracy': acc,
        'f1': f1
    })
    run.finish()
    inc_progress()

def cord_run(dset_name, method_name, embedding_type, num_cord):
    if already_done():
        return True
    args.num_cord = num_cord
    args.dataset = dset_name
    args.model_type = method_name
    args.randomized_good = True
    args.embedding_type = embedding_type
    run = wandb.init(project="covid-news", reinit=True, config=args)

    if dset_name == 'news':
        s_good = good_df.sample(n=30000)
        s_bad = bad_df
        s_cord = cord_df.sample(n=num_cord)
    elif 'news' in dset_name:
        # Assume it's news w/ no sports/countries
        s_good = good_df[good_df['cleanText'].swifter.apply(news_filter)]
        s_bad = bad_df[bad_df['cleanText'].swifter.apply(news_filter)]

        if dset_name == 'news_clean':
            s_cord = cord_df.sample(n=num_cord)
            pass
        elif dset_name in ('news_vaccine', 'news_transmission'):
            if dset_name == 'news_vaccine':
                KW = 'vaccine'
            elif dset_name == 'news_transmission':
                KW = 'transmission'
            else:
                print('INVALID DSET_NAME')
                sys.exit(5)
            s_good = s_good[s_good['cleanText'].swifter.apply(lambda x: KW in x.lower())]
            s_bad = s_bad[s_bad['cleanText'].swifter.apply(lambda x: KW in x.lower())]
            s_cord = cord_df[cord_df.title.swifter.apply(lambda x: KW in x.lower()) | cord_df.abstract.swifter.apply(lambda x: KW in x.lower())]
        else:
            print('INVALID DSET_NAME')
            sys.exit(6)
    else:
        print('UNKNOWN DSET_NAME')
        sys.exit(3)

    if embedding_type == 'fasttext':
        mat_good = np.vstack(s_good['mean_embed_ft'])
        mat_bad = np.vstack(s_bad['mean_embed_ft'])
        mat_cord = np.vstack(s_cord['mean_embed_ft'])
    elif embedding_type == 'bert':
        mat_good = np.vstack(s_good['mean_embed_bert'])
        mat_bad = np.vstack(s_bad['mean_embed_bert'])
        mat_cord = np.vstack(s_cord['mean_embed_bert'])
    else:
        print('WRONG EMBEDDING TYPE')
        sys.exit(2)

    print('Calculating distance matrices...')
    good2cord = cdist(mat_good, mat_cord, 'cosine')
    bad2cord = cdist(mat_bad, mat_cord, 'cosine')

    mm = MarkedMatrix((('real', good2cord), ('fake', bad2cord)))

    if method_name == 'random_forest':
        model = RandomForestClassifier(verbose=1, n_jobs=args.n_jobs, n_estimators=args.n_estimators)
    elif method_name == 'logistic_regression':
        model = LogisticRegression(max_iter=args.max_iterations, verbose=1, n_jobs=args.n_jobs, solver=args.solver)
    else:
        print('WRONG METHOD TYPE')
        sys.exit(1)
    
    acc, f1 = mm.single_split_classify(model)
    wandb.log({
        'accuracy': acc,
        'f1': f1
    })
    run.finish()
    inc_progress()

print('Training baselines')
# Train baselines
for k in range(3):
    baseline_run('news', 'logistic_regression', 'fasttext')
    baseline_run('news', 'random_forest', 'fasttext')


TARGET = list(range(50, 1001, 50)) + list(range(1000, 10001, 500))
for k in range(3):
    for num_cord in TARGET:
        cord_run('news', 'logistic_regression', 'fasttext', num_cord)
        cord_run('news', 'random_forest', 'fasttext', num_cord)

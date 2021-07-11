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

RESUME_FILENAME = 'mm_resume_file.txt'
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
print('Loading mm_df pickle...')
mm_df = load_pickle('./mm_df.pkl').dropna()

resume_waterline = None
if args.resume:
    with open(RESUME_FILENAME, 'r') as f:
        resume_waterline = int(f.read())

cord_df['mean_embed_ft'] = cord_df['ft_embeddings'].swifter.apply(lambda x: np.array([y for y in x if np.isfinite(y).all()]).mean(axis=0))
mm_df['mean_embed_ft'] = mm_df['ft_embeddings'].swifter.apply(lambda x: np.array([y for y in x if np.isfinite(y).all()]).mean(axis=0))

cord_df['mean_embed_bert'] = cord_df['sent_embeddings'].swifter.apply(lambda x: np.array(x).mean(axis=0))
mm_df['mean_embed_bert'] = mm_df['bert'].swifter.apply(lambda x: np.array(x).mean(axis=0))

true_mm_df = mm_df[mm_df['label'] == 'real']
false_mm_df = mm_df[mm_df['label'] == 'fake']

true_bert_mat = np.vstack(list(true_mm_df['mean_embed_bert']))
false_bert_mat = np.vstack(list(false_mm_df['mean_embed_bert']))

true_ft_mat = np.vstack(list(true_mm_df['mean_embed_ft']))
false_ft_mat = np.vstack(list(false_mm_df['mean_embed_ft']))

last_step = 0

def inc_progress():
    global last_step
    with open(RESUME_FILENAME, 'w') as f:
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

def baseline_run(dset_name, method_name, embedding_type):
    if already_done():
        return True
    args.num_cord = 0
    args.dataset = dset_name
    args.model_type = method_name
    args.randomized_good = True
    args.embedding_type = embedding_type
    run = wandb.init(project="covid-news", reinit=True, config=args)

    if dset_name != 'mm-covid-fixed':
        print('UNKNOWN DSET_NAME')
        sys.exit(3)

    if embedding_type == 'fasttext':
        mat_good = true_ft_mat
        mat_bad = false_ft_mat
    elif embedding_type == 'bert':
        mat_good = true_bert_mat
        mat_bad = false_bert_mat
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

    if dset_name != 'mm-covid-fixed':
        print('UNKNOWN DSET_NAME')
        sys.exit(3)

    s_cord = cord_df.sample(n=num_cord)
    if embedding_type == 'fasttext':
        mat_good = true_ft_mat
        mat_bad = false_ft_mat
        mat_cord = np.vstack(s_cord['mean_embed_ft'])
    elif embedding_type == 'bert':
        mat_good = true_bert_mat
        mat_bad = false_bert_mat
        mat_cord = np.vstack(s_cord['mean_embed_bert'])
    else:
        print('WRONG EMBEDDING TYPE')
        sys.exit(2)

    print('Calculating distance matrices...')
    good2cord = cdist(mat_good, mat_cord, 'cosine')
    bad2cord = cdist(mat_bad, mat_cord, 'cosine')

    mm = MarkedMatrix((('true', good2cord), ('false', bad2cord)))

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
    baseline_run('mm-covid-fixed', 'logistic_regression', 'bert')
    baseline_run('mm-covid-fixed', 'random_forest', 'bert')
    baseline_run('mm-covid-fixed', 'logistic_regression', 'fasttext')
    baseline_run('mm-covid-fixed', 'random_forest', 'fasttext')


TARGET = [10, 100, 1000, 5000, 10000]
for k in range(3):
    for num_cord in TARGET:
        cord_run('mm-covid-fixed', 'logistic_regression', 'bert', num_cord)
        cord_run('mm-covid-fixed', 'random_forest', 'bert', num_cord)
        cord_run('mm-covid-fixed', 'logistic_regression', 'fasttext', num_cord)
        cord_run('mm-covid-fixed', 'random_forest', 'fasttext', num_cord), num_cord

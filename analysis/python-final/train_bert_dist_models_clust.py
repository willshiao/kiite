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

import urllib.parse
def get_hostname(url):
    o = urllib.parse.urlsplit(url)
    return o.hostname

parser = argparse.ArgumentParser(description='Train distance-matrix models (and baseline)')
parser.add_argument('--max_iterations', type=int, default=1000)
parser.add_argument('--max_iterations_kmeans', type=int, default=300)
parser.add_argument('--n_jobs', type=int, default=32)
parser.add_argument('--solver', type=str, default='lbfgs')
args = parser.parse_args()

good_df = load_pickle('./clean_good_df.pkl')
cord_df = load_pickle('./newest_cord_df_ft.pkl')
bad_df = load_pickle('./clean_bad_df.pkl')

good_df['mean_embed'] = good_df['sent_embeddings'].swifter.apply(lambda x: np.array(x).mean(axis=0))
bad_df['mean_embed'] = bad_df['sent_embeddings'].swifter.apply(lambda x: np.array(x).mean(axis=0))
cord_df['mean_embed'] = cord_df['sent_embeddings'].swifter.apply(lambda x: np.array(x).mean(axis=0))

s_good = good_df.dropna().sample(n=30000)
s_bad = bad_df.dropna()
save_pickle(s_good, './good_sample.nosave.pkl')
save_pickle(s_bad, './bad_sample.nosave.pkl')

mat_good = np.array(list(s_good['mean_embed']))
mat_bad = np.array(list(s_bad['mean_embed']))
mat_cord = np.array(list(cord_df['mean_embed']))

# print('Training baselines')
# # Train baselines
# for k in range(3):
#     args.num_cord = 0
#     args.model_type = 'kmeans_logistic_regression'
#     run = wandb.init(project="covid-news", reinit=True, config=args)
#     # wandb.config.update(args, config=args)
#     mm = MarkedMatrix((('real', mat_good), ('fake', mat_bad)))
#     model = LogisticRegression(max_iter=args.max_iterations, verbose=1, n_jobs=args.n_jobs, solver=args.solver)
#     acc, f1 = mm.single_split_classify(model)
#     wandb.log({
#         'accuracy': acc,
#         'f1': f1
#     })
#     save_pickle(model, f'./models/lr_baseline_model_{k}.pkl')
#     run.finish()

print('Training dist models')
for k in range(3):
    for num_cord in [10, 100, 500, 1000, 2000, 3000, 4000, 5000, 10000]:
        # wandb.config.update(args)
        args.num_cord = num_cord
        args.embedding_type = 'bert'
        args.model_type = 'kmeans_logistic_regression'
        run = wandb.init(project="covid-news", reinit=True, config=args)
        # Set wandb configs
        # wandb.config.num_cord = num_cord

        # s_cord = cord_df.dropna().sample(n=num_cord)
        # mat_cord = np.array(list(s_cord['mean_embed']))

        print('Fitting MiniBatchKMeans on CORD')
        c_model = MiniBatchKMeans(n_clusters=num_cord, max_iter=args.max_iterations_kmeans, compute_labels=False)
        c_model.fit(mat_cord)
        print('Done fitting KMeans')
        ref_cord = c_model.cluster_centers_

        good2cord = cdist(mat_good, ref_cord, 'cosine')
        bad2cord = cdist(mat_bad, ref_cord, 'cosine')
        mm = MarkedMatrix((('real', good2cord), ('fake', bad2cord)))
        model = LogisticRegression(max_iter=args.max_iterations, verbose=1, n_jobs=args.n_jobs, solver=args.solver)
        acc, f1 = mm.single_split_classify(model)
        wandb.log({
            'accuracy': acc,
            'f1': f1
        })
        save_pickle(model, f'./models/lr_cord{num_cord}_model_{k}.pkl')
        run.finish()

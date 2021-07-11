from wutils.general import load_pickle, save_pickle
from wutils.mat import MarkedMatrix
import pandas as pd
import numpy as np
from scipy.spatial.distance import cdist
from collections import defaultdict
import random

print('Loading pickles')
bio_df_bert = load_pickle('pickles/bio_df_768_bert.pkl')
bio_df = load_pickle('pickles/biobert_encoded_cleaned_title_abstract_metadata_dataframe_2020_04_10.pkl')
bio_df['bert'] = bio_df_bert['bert']

bio_mat = np.array(list(bio_df['bert']))
fake_mat = load_pickle('pickles/nice_fake_mat.pkl')
real_mat = load_pickle('pickles/nice_real_mat.pkl')
print('Done loading pickles')

print('Calculating distance matrix')
fake2bio = cdist(fake_mat, bio_mat)
real2bio = cdist(real_mat, bio_mat)
print('Done calculating distance matrix')

mm = MarkedMatrix([
    ('fake', fake2bio),
    ('real', real2bio)
])
data_mat = np.vstack((fake_mat, real_mat))
label_mat = np.concatenate((np.ones(fake_mat.shape[0]), np.zeros(real_mat.shape[0])))

from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score
from sklearn.metrics import accuracy_score

models = {
    'Logistic Regression': LogisticRegression(max_iter=5000, verbose=1, n_jobs=32),
    'Linear SVM': LinearSVC(dual=False, verbose=1)
}
results = { k: defaultdict(list) for k, v in models.items() }

N_RUNS = 3

random.seed(42424242)

print('Starting model training')
for ratio in [0.1, 0.3, 0.5, 0.7, 0.9]:
    seed = random.randint(0, 2**32)

    X_small_train, X_small_test, y_small_train, y_small_test = train_test_split(data_mat, label_mat, train_size=ratio, random_state=SEED)
    X_small_dist_train, X_small_dist_test, y_small_dist_train, y_small_dist_test = train_test_split(dist_mat, label_mat, train_size=ratio, random_state=SEED)
    X_small_super_train, X_small_super_test, y_small_super_train, y_small_super_test = train_test_split(super_mat, label_mat, train_size=ratio, random_state=SEED)

    for modelName, model in models.items():
        for run_num in range(N_RUNS):
            # BERT only
            config_name = '{}_ratio-{}'.format('BERT-only', ratio)
            model.fit(X_small_train, y_small_train)
            pred_small = model.predict(X_small_test)
            results[modelName][config_name].append({
                'f1': f1_score(y_small_test, pred_small),
                'accuracy': accuracy_score(y_small_test, pred_small),
            })
            if run_num == 0:
                save_pickle(model, '{}_{}.pkl'.format(modelName, config_name))
            print(results)[modelName]

            # Distance only
            config_name = '{}_ratio-{}'.format('dist-only', ratio)
            model.fit(X_small_dist_train, y_small_dist_train)
            pred_small_dist = model.predict(X_small_dist_test)
            results[modelName][config_name].append({
                'f1': f1_score(y_small_dist_test, pred_small_dist),
                'accuracy': accuracy_score(y_small_dist_test, pred_small_dist),
            })
            if run_num == 0:
                save_pickle(model, '{}_{}.pkl'.format(modelName, config_name))
            print(results)[modelName]

            # combo
            config_name = '{}_ratio-{}'.format('dist-bert', ratio)
            model.fit(X_small_super_train, y_small_super_train)
            pred_small = lr_small_bert.predict(X_small_test)
            results[modelName][config_name].append({
                'f1': f1_score(y_small_test, pred_small),
                'accuracy': accuracy_score(y_small_test, pred_small)
            })
            if run_num == 0:
                save_pickle(model, '{}_{}.pkl'.format(modelName, config_name))
            print(results)[modelName]





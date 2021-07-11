import os
from tqdm import tqdm
from os import path
from newsplease import NewsPlease
import simdjson as sj
import json
import ujson
from collections import defaultdict
from multiprocessing import Pool
from hashlib import md5

def hash_str(text):
    return md5(bytes(text, 'utf8')).hexdigest()

# DATASET_DIR = '/media/will/SSD Storage 2/research/fake_news_covid/'
# DATASET_DIR = '/mnt/fusion/Research/fake_news_covid'
DATASET_DIR = '/mnt/fusion/Research/fake_news_covid'
DATASET_PATH = path.join(DATASET_DIR, 'apify/datasets/default')
SHORT_DIR = path.join(DATASET_DIR, 'short')

with open(path.join(DATASET_DIR, 'host_index.json'), 'rb') as f:
    host_index = sj.loads(f.read())

meta_hindex = defaultdict(list)
# with open('sites.txt', 'r') as f:
#     sites = [l.strip() for l in f.readlines()]
with open('english.txt', 'r') as f:
    eng_sites = [l.strip() for l in f.readlines()]
for k in host_index.keys():
    match = False
    for e in eng_sites:
        if e in k:
            meta_hindex[e].append(k)
            match = True
            break
    if not match:
        meta_hindex['other'].append(k)
# Don't care about other sites
del meta_hindex['other']

full_index = defaultdict(list)
for k, v in meta_hindex.items():
    for host in v:
        full_index[k].extend(host_index[host])

with open(path.join(DATASET_DIR, 'eng_coarse_host_index.json'), 'w') as f:
    json.dump(meta_hindex, f)
with open(path.join(DATASET_DIR, 'eng_full_host_index.json'), 'w') as f:
    json.dump(full_index, f)

with open('sites.txt', 'w') as f:
    for k in host_index.keys():
        f.write(k + '\n')

def clean_file(fn):
    try:
        with open(fn, 'rb') as f:
            pj = sj.ParsedJson(f.read())
        url = pj.items('.url')
        article = NewsPlease.from_html(pj.items('.html'), url=url)
        ret = article.get_serializable_dict()
        ret['raw_txt'] = pj.items('.text')
        ret['id'] = hash_str(ret['raw_txt'] + url)
        ret['url'] = url
        return ret
    except Exception as e:
        print('Error: ', e)
        return {}

for host, files in tqdm(full_index.items()):
    with open(path.join(SHORT_DIR, host.replace('.', '_') + '.json'), 'w') as f:
        with Pool(30) as pool:
            for val in tqdm(pool.imap(clean_file, files)):
                f.write(ujson.dumps(val, ensure_ascii=False))
                f.write('\n')

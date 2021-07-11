import os
from tqdm import tqdm
from os import path
from newsplease import NewsPlease
import simdjson as sj
import ujson
from collections import defaultdict
from multiprocessing import Pool
from hashlib import md5
import gzip
from newspaper import Article

def hash_str(text):
    return md5(bytes(text, 'utf8')).hexdigest()

DATASET_DIR = './data'

def clean_file(file_handle, output_handle):
    parser = sj.Parser()
    for line in tqdm(file_handle, total=139522):
        # print(line)
        doc = parser.parse(bytes(line, 'utf8'))
        url = doc['url']
        html = doc['html']
        article = Article(url)
        article.set_html(html)
        article.parse()
        if (len(article.text) < 100):
            print('WARNING: article text is short: ', article.text)
        output = {
            'authors': article.authors,
            'publishDate': article.publish_date,
            'text': article.text,
            'title': article.title,
            'url': url,
        }
        ujson.dump(output, output_handle)
        output_handle.write('\n')

# with open('data/agg.txt', 'w') as f:
#     clean_file(open('data/655b55ad-598e-4a34-95bc-ab37076df960', 'r', encoding='utf8'), f)

with gzip.open('data/processing_sitemap_crawl.txt.gz', 'wt') as out_file:
    with gzip.open('data/all_sitemap_crawls.txt.gz', 'rt', encoding='utf8') as in_file:
        clean_file(in_file, out_file)
#     try:
#         with open(fn, 'rb') as f:
#             pj = sj.ParsedJson(f.read())
#         url = pj.items('.url')
#         article = NewsPlease.from_html(pj.items('.html'), url=url)
#         ret = article.get_serializable_dict()
#         ret['raw_txt'] = pj.items('.text')
#         ret['id'] = hash_str(ret['raw_txt'] + url)
#         ret['url'] = url
#         return ret
#     except Exception as e:
#         print('Error: ', e)
#         return {}

# for host, files in tqdm(full_index.items()):
#     with open(path.join(SHORT_DIR, host.replace('.', '_') + '.json'), 'w') as f:
#         with Pool(30) as pool:
#             for val in tqdm(pool.imap(clean_file, files)):
#                 f.write(ujson.dumps(val, ensure_ascii=False))
#                 f.write('\n')

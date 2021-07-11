import os
from tqdm import tqdm
from os import path
from newsplease import NewsPlease
import simdjson as sj
import ujson
from collections import defaultdict
from multiprocessing import Pool, Queue, Event, TimeoutError, Process
import multiprocessing as mp
from hashlib import md5
import queue
import gzip
from newspaper import Article

def hash_str(text):
    return md5(bytes(text, 'utf8')).hexdigest()

DATASET_DIR = './data'

INPUT_FILE = '/media/will/SSD Storage 2/all_real.txt.gz'
OUTPUT_FILE = '/media/will/SSD Storage 2/processed_all_real.txt.gz'
NUM_LINES = 3000000

def process_info(in_queue, out_queue, input_done):
    while True:
        try:
            url, html = in_queue.get(True, 1)
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
                'html': article.html,
                'url': url
            }
            out_queue.put(ujson.dumps(output), True, 1)
        except (TimeoutError, queue.Empty):
            if input_done.wait(1):
                return 0

def write_output(out_fn, out_queue, input_done, output_done):
    with gzip.open(out_fn, 'wt') as out_file:
        while True:
            try:
                out_file.write(out_queue.get(True, 1))
                out_file.write('\n')
            except (TimeoutError, queue.Empty):
                if input_done.wait(1):
                    output_done.set()
                    return True

def clean_file(file_handle, output_fn):
    in_queue = Queue(1000)
    out_queue = Queue(1000)
    input_done = Event()
    output_done = Event()
    parser = sj.Parser()
    work_threads = []

    output_process = Process(target=write_output, args=(output_fn, out_queue, input_done, output_done))
    output_process.start()

    for _ in range(28):
        p = Process(target=process_info, args=(in_queue, out_queue, input_done))
        work_threads.append(p)
        p.start()


    for line in tqdm(file_handle, total=NUM_LINES):
        doc = parser.parse(bytes(line, 'utf8'))
        url = doc['url']
        html = doc['html']
        in_queue.put((url, html), True)
    input_done.set()
    output_done.wait()

    output_process.join()
    for p in work_threads:
        p.join()

# with open('data/agg.txt', 'w') as f:
#     clean_file(open('data/655b55ad-598e-4a34-95bc-ab37076df960', 'r', encoding='utf8'), f)

if __name__ == '__main__':
    with gzip.open(INPUT_FILE, 'rt', encoding='utf8') as in_file:
        clean_file(in_file, OUTPUT_FILE)
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

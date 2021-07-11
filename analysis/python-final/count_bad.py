import gzip
from tqdm import tqdm
import simdjson as sj

INPUT_FILE = 'data/processed_real_sample.txt.gz'
OUTPUT_FILE = 'data/processed_real_sample_clean.txt.gz'
BAD_OUTPUT_FILE = 'data/processing_sitemap_crawl_mt_bad.txt'
NUM_RECORDS = 37136

with gzip.open(INPUT_FILE, 'rt') as f:
    with gzip.open(OUTPUT_FILE, 'wt') as clean_out:
        with open(BAD_OUTPUT_FILE, 'wt') as bad_out:
            parser = sj.Parser()
            cnt = 0
            for line in tqdm(f, total=NUM_RECORDS):
                doc = parser.parse(bytes(line, 'utf8'))
                text = doc['text']
                if len(text) < 100:
                    bad_out.write(line)
                    cnt += 1
                else:
                    clean_out.write(line)

print (f'Got {cnt} bad lines!')

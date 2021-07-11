import re
import simdjson as sj
import gzip
from tqdm import tqdm

COVID_RES = [
    re.compile(r'(epidemic|pandemic|flu|covid)', re.IGNORECASE),
    re.compile(r'(?:corona)? ?virus', re.IGNORECASE)
]

INPUT_FILE = 'data/stage2_processed_real_sample_clean.txt.gz'
OUTPUT_FILE = 'data/stage3_processed_real_sample_clean.txt.gz'
NUM_RECORDS = 37136

with gzip.open(INPUT_FILE, 'rt') as input_file:
    with gzip.open(OUTPUT_FILE, 'wt') as output_file:
        parser = sj.Parser()
        cnt = 0
        for line in tqdm(input_file, total=NUM_RECORDS):
            doc = parser.parse(bytes(line, 'utf8'))
            text = doc['cleanText']
            if any(bool(x.search(text)) for x in COVID_RES):
                output_file.write(line)
            else:
                cnt += 1
        print(f'Filtered out {cnt} lines!')

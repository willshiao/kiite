import ujson
import re
from tqdm import tqdm
import sys
import lzma
import simdjson as sj
from hashlib import md5, blake2b
from collections import Counter
from sys import getsizeof, stderr
from itertools import chain
from collections import deque
import gzip

URL_REGEX = re.compile(r'https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)', re.IGNORECASE)
# INPUT_FILE = 'data/agg.txt'
INPUT_FILE = 'data/processed_real_sample_clean.txt.gz'
OUTPUT_FILE = 'data/stage2_processed_real_sample_clean.txt.gz'
BAD_STR_FILE = 'data/bad_strings.json'
BAD_STR_RES = []
NUM_RECORDS = 37136
SEEN_LINE_HASHES = set()
SEEN_HASH_COUNTER = Counter()

def total_size(o, handlers={}, verbose=False):
    """ Returns the approximate memory footprint an object and all of its contents.

    Automatically finds the contents of the following builtin containers and
    their subclasses:  tuple, list, deque, dict, set and frozenset.
    To search other containers, add handlers to iterate over their contents:

        handlers = {SomeContainerClass: iter,
                    OtherContainerClass: OtherContainerClass.get_elements}

    """
    dict_handler = lambda d: chain.from_iterable(d.items())
    all_handlers = {tuple: iter,
                    list: iter,
                    deque: iter,
                    dict: dict_handler,
                    set: iter,
                    frozenset: iter,
                   }
    all_handlers.update(handlers)     # user handlers take precedence
    seen = set()                      # track which object id's have already been seen
    default_size = getsizeof(0)       # estimate sizeof object without __sizeof__

    def sizeof(o):
        if id(o) in seen:       # do not double count the same object
            return 0
        seen.add(id(o))
        s = getsizeof(o, default_size)
        if verbose:
            print(s, type(o), repr(o), file=stderr)

        for typ, handler in all_handlers.items():
            if isinstance(o, typ):
                s += sum(map(sizeof, handler(o)))
                break
        return s
    return sizeof(o)

def hash_str(text):
    # return md5(bytes(text, 'utf8')).hexdigest()
    return blake2b(bytes(text, 'utf8')).hexdigest()

def replace_regexes(text):
    new_text = text
    for regex in BAD_STR_RES:
        # old_len = len(new_text)
        new_text = regex.sub('', new_text)
        # new_len = len(new_text)
        # if old_len != new_len:
            # print('Replaced text: ', regex)
    new_text = URL_REGEX.sub('', new_text)
    return new_text

def clean_text (text, filter_lines=False, filter_count=2):
    lines = text.split('\n')
    output = []

    for line in lines:
        if line.strip():
            hash_line = hash_str(line)
            # if hash_line not in SEEN_LINE_HASHES:
                # SEEN_LINE_HASHES.add(hash_line)
            if SEEN_HASH_COUNTER[hash_line] <= filter_count and filter_lines:
                output.append(line)
            elif not filter_lines:
                SEEN_HASH_COUNTER[hash_line] += 1
                # print('Filtered out line: ', line)
            # print(text)
    if filter_lines:
        return replace_regexes('\n'.join(output))
    return None

def main():
    with open(BAD_STR_FILE, 'r') as f:
        bad_strings = ujson.load(f)

    for bad_str in bad_strings:
        BAD_STR_RES.append(re.compile(re.escape(bad_str), re.IGNORECASE))
        new_str = bad_str.replace(' ', '')
        if new_str != bad_str:
            BAD_STR_RES.append(re.compile(re.escape(new_str), re.IGNORECASE))

    with gzip.open(INPUT_FILE, 'rt') as f:
        parser = sj.Parser()
        for line in tqdm(f, total=NUM_RECORDS):
            doc = parser.parse(bytes(line, 'utf8'))
            clean_text(doc['text'])
    with gzip.open(INPUT_FILE, 'rt') as f:
        with gzip.open(OUTPUT_FILE, 'wt') as out_file:
            parser = sj.Parser()
            for line in tqdm(f, total=NUM_RECORDS):
                doc = parser.parse(bytes(line, 'utf8'))
                output = {
                    'authors': doc['authors'],
                    'publishDate': doc['publishDate'],
                    'cleanText': clean_text(doc['text'], filter_lines=True),
                    'title': doc['title'],
                    'url': doc['url']
                }
                # ujson.dump(output, out_file)
                # out_file.write(ujson.dumps(output), 'utf8'))
                ujson.dump(output, out_file)
                out_file.write('\n')
    
    print(f'Memory Used: {total_size(SEEN_HASH_COUNTER) / 1024**2} MB')
    print(f'Memory Used (slim): {total_size(SEEN_LINE_HASHES) / 1024**2} MB')
    # Debugging lines
    # print([x[0] for x in SEEN_HASH_COUNTER.values() if x[0] >= 2])
    # print([freq for (x, freq) in SEEN_HASH_COUNTER.items() if freq[0] <= 3 and freq[0] > 1])

main()

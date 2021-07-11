#include <iostream>
#include <fstream>
#include <filesystem>
#include <unordered_map>
#include <map>
#include "ext/simdjson.h"

namespace fs = std::filesystem;
using namespace std;

string_view getHostname(string_view url) {
  size_t protoPos = url.find_first_of("//");
  string_view host = url.substr(protoPos + 2);
  size_t slashPos = host.find_first_of("/");
  host = host.substr(0, slashPos);
  return host;
}

int main(int argc, char **argv) {
  if (argc < 2) {
    cout << "Not enough arguments" << endl;
    exit(0);
  }
  ofstream ofs("urls.txt");
  string baseDir = argv[1];
  string dataDir = baseDir + "/apify/datasets/default";
  simdjson::dom::parser parser;
  unordered_map<string, int> um;

  cout << "Using " << baseDir << " as base directory" << endl;
  for (const auto & entry : fs::directory_iterator(dataDir)) {
    // std::cout << entry.path() << std::endl;
    try {
      simdjson::dom::element page = parser.load(entry.path());
      string_view url = page["url"];
      string_view host = getHostname(url);
      string hostStr { host };
      um[hostStr]++;
    } catch (exception &e) {
      cout << e.what() << " for " << entry.path() << endl;
    }
    // cout << host << "\n";
  }

  multimap<int, string> outputMap;
  cout << "Iterating: " << endl;
  for (const auto &p : um) {
    outputMap.insert({ p.second, p.first });
    // cout << p.first << ": " << p.second << endl;
  }

  for (auto it = outputMap.rbegin(); it != outputMap.rend(); ++it) {
    cout << it->first << ": " << it->second << endl;
  }
  ofs << std::flush;
}

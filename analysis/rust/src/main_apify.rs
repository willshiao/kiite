use std::env;
use std::process;
use std::fs;
use std::collections::HashMap;
use simd_json;
use url::{Url};
use serde_json::Value;

fn main() -> Result<(), std::io::Error> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        println!("Too few arguments");
        process::exit(1);
    }
    let base_dir: String = args[1].to_string();
    let data_dir: String = base_dir.clone() + "/apify/datasets/default";
    let index_loc: String = base_dir + "/host_index.json";
    let mut host_index: HashMap<String, Vec<String>> = HashMap::new();

    let mut cnt = 0;
    let mut error_cnt = 0;

    for entry in fs::read_dir(data_dir)? {
        cnt += 1;
        if cnt % 10000 == 0 {
            println!("Processed {} items", cnt);
        }
        let file_path = entry?.path();
        let mut data = fs::read(&file_path)?;
        if data.is_empty() {
            error_cnt += 1;
            println!("{} is empty.", file_path.to_str().unwrap());
            let entry = host_index.entry("empty".to_string()).or_insert_with(Vec::new);
            entry.push(file_path.to_str().unwrap().to_string());
            continue;
        }

        let v: Value = match simd_json::serde::from_slice(&mut data) {
            Err(e) => {
                println!("{} has invalid JSON: {:?}!", file_path.to_str().unwrap(), e);
                error_cnt += 1;
                continue;
            },
            Ok(v) => v
        };
        // println!("{:?}", v["url"]);
        let url: String = match &v["url"] {
            Value::String(s) => s.to_string(),
            _ => "".to_string()
        };
        let url = Url::parse(&url).unwrap();
        // Check if host exists in map
        let entry = host_index.entry(url.host_str().unwrap().to_string()).or_insert_with(Vec::new);
        entry.push(file_path.to_str().unwrap().to_string());
        // println!("{:?}", url.host());
    }
    let host_idx_json = serde_json::to_string(&host_index)?;
    match fs::write(&index_loc, &host_idx_json) {
        Err(e) => panic!("Failed to write host index: {:?}", e),
        Ok(_) => println!("Wrote host index successfully.")
    }
    println!("Done! Processed {}/{} files successfully.", cnt - error_cnt, cnt);

    Ok(())
}

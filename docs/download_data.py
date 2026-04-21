import os
import requests
import pandas as pd
from io import StringIO

BASE_URL = "https://data.cityofnewyork.us/resource"
DATA_DIR = os.path.expanduser("~/Desktop/FraudLens3D/data")
LIMIT = 5000

# ── Original 7 datasets ───────────────────────────────────────────────────────
DATASETS = [
    ("wvxf-dwi5", "housing_violations.csv",      None),
    ("43nn-pn8j", "restaurant_inspections.csv",   None),
    ("3h2n-5cm9", "construction_violations.csv",  None),
    ("erm2-nwe9", "service_requests_311.csv",
     "created_date between '2024-01-01T00:00:00' and '2025-12-31T23:59:59' ORDER BY created_date DESC"),
    ("ipu4-2q9a", "permit_issuance.csv",           None),
    ("yjxr-fw8i", "property_valuation.csv",        None),
    ("8m42-w767", "fire_incidents.csv",             None),
]

# ── 5 new commercial / enforcement datasets ───────────────────────────────────
NEW_DATASETS = [
    # Active business licenses — tobacco dealers + restaurants
    {
        "url": "https://data.cityofnewyork.us/resource/w7w3-xahh.json"
               "?$limit=5000"
               "&$where=industry=%27Tobacco%20Retail%20Dealer%27%20OR%20industry=%27Restaurant%27",
        "filename": "active_businesses.csv",
    },
    # ECB (Environmental Control Board) violations
    {
        "url": f"{BASE_URL}/y9uf-suid.json?$limit=3000",
        "filename": "ecb_violations.csv",
    },
    # OATH administrative hearings
    {
        "url": f"{BASE_URL}/jz4z-kudi.json?$limit=3000",
        "filename": "oath_hearings.csv",
    },
    # DCA consumer-affairs complaints
    {
        "url": f"{BASE_URL}/3rfa-3xsf.json?$limit=3000",
        "filename": "dca_complaints.csv",
    },
    # DOHMH rodent inspections
    {
        "url": f"{BASE_URL}/p937-wjvj.json?$limit=3000",
        "filename": "rodent_inspections.csv",
    },
]

os.makedirs(DATA_DIR, exist_ok=True)

# ── Download original 7 ───────────────────────────────────────────────────────
print("=" * 60)
print("Downloading original 7 datasets")
print("=" * 60)

for dataset_id, filename, where_clause in DATASETS:
    url = f"{BASE_URL}/{dataset_id}.csv"
    params = {"$limit": LIMIT}
    if where_clause:
        params["$where"] = where_clause

    print(f"\n{filename} ({dataset_id})...")
    try:
        response = requests.get(url, params=params, timeout=120)
        response.raise_for_status()
        df = pd.read_csv(StringIO(response.text))
        out_path = os.path.join(DATA_DIR, filename)
        df.to_csv(out_path, index=False)
        print(f"  Rows: {len(df)}")
        print(f"  Columns: {list(df.columns)}")
    except Exception as ex:
        print(f"  ERROR: {ex}")

# ── Download 5 new datasets ───────────────────────────────────────────────────
print("\n" + "=" * 60)
print("Downloading 5 new commercial / enforcement datasets")
print("=" * 60)

for ds in NEW_DATASETS:
    filename = ds["filename"]
    url      = ds["url"]
    print(f"\n{filename} ...")
    try:
        # JSON endpoint → convert to DataFrame then to CSV
        response = requests.get(url, timeout=120)
        response.raise_for_status()
        records = response.json()

        if not isinstance(records, list):
            raise ValueError(f"Expected list, got {type(records)}")

        df = pd.DataFrame(records)
        out_path = os.path.join(DATA_DIR, filename)
        df.to_csv(out_path, index=False)

        print(f"  Rows    : {len(df)}")
        print(f"  Columns : {list(df.columns)}")
        print(f"  Saved   : {out_path}")
    except Exception as ex:
        print(f"  ERROR: {ex}")

print("\nAll done.")

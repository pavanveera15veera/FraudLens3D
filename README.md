# FraudLens3D
A geospatial risk visualization tool I built for my Data Visualization course at NYU Tandon. The idea came from wanting to see if NYC's public violation data could be used to identify high-risk commercial zones — something useful for insurance underwriting or city planning.

The map pulls from 12 NYC Open Data datasets, scores each location based on how many different types of violations cluster there, and renders everything as an interactive 3D map.

## What it does

You get a dark Mapbox map of NYC with colored dots — each dot is a violation record, colored by type (housing, restaurant inspection, fire, construction, etc). The height of each dot represents the fraud/risk score for that location. Denser, more diverse clusters score higher.

Search any address or restaurant name and you get a full breakdown — every violation on record, any outstanding ECB fines, rodent inspection results, and a rough insurance recommendation. If you search a chain like 'Subway' it shows all their NYC locations ranked by risk.

There's also a portfolio mode where you draw a circle on the map and see aggregate risk stats for that area.

## Scoring

Each record gets placed into a ~300m grid cell. The score is:

score = (density × 0.5) + (dataset_diversity × 0.3) + (violation_severity × 0.2)

Density uses log normalization so one unusually dense area doesn't flatten everything else. ECB violations and failed rodent inspections add a bonus since they're stronger risk signals.

The distribution ends up between 0.19 and 0.88 with most records in the 0.3–0.7 range, which felt realistic.

## Stack

- React + Mapbox GL JS for the map and UI
- PapaParse for loading the CSVs in the browser
- Python + pandas for the initial data download pipeline
- NYC Open Data Socrata API for all 12 datasets

## Running it

You need Node 18+ and Python 3.9+.

```
git clone https://github.com/pavanveera15veera/FraudLens3D.git
cd FraudLens3D
bash docs/setup.sh
cd src && npm install && npm start
```

setup.sh downloads all the datasets automatically. Takes about 2 minutes.

## Datasets

Housing violations, restaurant inspections, construction violations, 311 requests, permit issuance, property valuation, fire incidents, ECB violations, OATH hearings, rodent inspections, active businesses, DCA complaints — all from data.cityofnewyork.us

## Notes

The Mapbox token in Scene3D.jsx is a dev token — replace it with your own from mapbox.com if you're running this long term. The data folder is gitignored since the CSVs are too large, setup.sh regenerates it.

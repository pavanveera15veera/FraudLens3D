# FraudLens3D
A geospatial risk visualization tool I built for my Data Visualization course at NYU Tandon. The idea came from wanting to see if NYC public violation data could be used to identify high-risk commercial zones — something useful for insurance underwriting or city planning.

## What it does

Dark Mapbox map of NYC with colored dots — each dot is a violation record, colored by type. Height = risk score. Denser clusters score higher. Search any address or restaurant and get a full breakdown — violations, ECB fines, rodent inspections, insurance recommendation. Search a chain like Subway and see all NYC locations ranked by risk. Portfolio mode lets you draw a circle and see aggregate stats for that zone.

## Scoring

score = (density x 0.5) + (diversity x 0.3) + (severity x 0.2)

Density uses log normalization. ECB violations and failed rodent inspections add a bonus. Distribution ends up 0.19 to 0.88, most records 0.3-0.7.

## Stack

React, Mapbox GL JS, PapaParse, Python/pandas, NYC Open Data Socrata API

## Run it

```
git clone https://github.com/pavanveera15veera/FraudLens3D.git
cd FraudLens3D
bash docs/setup.sh
cd src && npm install && npm start
```

## Datasets

Housing violations, restaurant inspections, construction violations, 311 requests, permit issuance, property valuation, fire incidents, ECB violations, OATH hearings, rodent inspections, active businesses, DCA complaints — all from data.cityofnewyork.us

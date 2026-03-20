# ATC Ground Point Route Builder

The **ATC Ground Point Route Builder** is a command-line tool that retrieves 7 days of historical flight schedule data from the AeroDataBox API and generates **route-based CSV schedules** for use in ATC Ground Point.

Each output row represents a **unique airline + airport + stand tag combination**, with all aircraft operating on that route consolidated into a single entry.

**Note:** This is an independent tool and is not affiliated with the developer of ATC Ground Point.

<a href="https://www.buymeacoffee.com/thatsimpilot" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" 
       alt="Buy Me A Coffee" 
       style="height: 60px !important;width: 217px !important;">
</a>

---

## Overview

This tool automates realistic schedule generation by:

- Fetching **7 days of historical flight data**
- Splitting requests into **AM and PM windows**
- Combining **arrivals and departures into unified routes**
- Mapping aircraft to **ICAO aircraft codes**
- Exporting a **clean CSV ready for ATC Ground Point**

---

## Output Format

The generated CSV uses the following structure:


`Airline, Airport, Airplane Models, Stand Tags`


### Example


QFA, YMML, B738:A332, ANY
VOZ, YBBN, B738, ANY
FDX, YSSY, B763, CARGO


### Logic

- One row per:
  - Airline
  - Route airport (origin/destination)
  - Stand tag
- Aircraft types are:
  - Deduplicated
  - Sorted
  - Joined with `:`
- Arrivals and departures are merged into the same row

---

## Features

### ICAO-Based Airport Handling
- Accepts **ICAO airport codes only**
- Ensures compatibility with ATC Ground Point

---

### Route Aggregation
- Departures grouped by **destination airport**
- Arrivals grouped by **origin airport**
- Combined into a single route entry

---

### Aircraft ICAO Mapping
Aircraft types are resolved using:

1. API-provided ICAO codes (preferred)
2. Custom mapping dictionary
3. Fallback to raw aircraft name if unmapped

Mapping file:

`aircraftMapping.py`


---

### Stand Tag Logic

- `ANY` → default passenger flights  
- `CARGO` → applied when `isCargo = true`

---

### 7-Day Historical Window

- User selects an **end date**
- Script automatically fetches:
  - Previous 6 days + selected day

---

### API Handling

- 14 API calls per run:
  - 7 days × 2 time windows
- Includes delay between requests to reduce rate limiting

---

### Output Folder Selection

- GUI folder picker for saving CSV
- Falls back to working directory if cancelled

---

## Installation

### Option 1: Python Script

#### Requirements

- Python 3.8+
- requests

Install dependencies:


`pip install requests`


Run:


`python routes_builder.py`


---

### Option 2: Executable

Download the prebuilt executable from the **Releases** page and run directly.

---

## Usage

You will be prompted for:

1. **RapidAPI Key**
2. **Airport ICAO Code**
3. **End Date (DD-MM-YYYY)**
   - Must be before today
4. **Output folder (via file picker)**

---

### Example


Please enter your RapidAPI key: XXXXX

Please enter the ICAO code of the airport: YSSY

Please enter the end date in DD-MM-YYYY format:
15-03-2026


---

## Output

The tool generates:


`<ICAO>_schedule.csv`


Example:


`YSSY_schedule.csv`


---

## How It Works

1. Builds AM/PM 12-hour windows:
   - 000000 → 115959
   - 120000 → 235959  
2. Fetches flight data from AeroDataBox API  
3. Processes arrivals and departures  
4. Normalises:
   - Airline codes
   - Airport ICAO codes
   - Aircraft ICAO types  
5. Aggregates routes  
6. Writes CSV output  

---

## Aircraft Mapping Notes

- Mapping ensures consistent ICAO aircraft codes
- Covers:
  - Airbus
  - Boeing
  - Regional aircraft
  - General aviation
- Generic aircraft families are mapped to best-fit defaults

If an aircraft is not mapped, it will appear unchanged in the CSV.

---

## Limitations

- Generic aircraft labels (e.g. "Boeing 737") are mapped to a default subtype
- Accuracy depends on API data quality
- Requires valid RapidAPI subscription

---

## API Usage

Data is sourced from AeroDataBox via RapidAPI.

- Each run performs **14 requests**
- Counts toward your API usage quota

---

## License

MIT License © Hayden Hookham

---

## Disclaimer

This project is not affiliated with ATC Ground Point.

---

## Future Improvements

- Automatic detection of unmapped aircraft
- Batch processing for multiple airports
- Custom stand tag rules
- Direct export to ATC Ground Point formats
- GUI version
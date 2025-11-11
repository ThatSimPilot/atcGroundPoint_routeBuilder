# Aerodatabox Route Builder

The **Aerodatabox Route Builder** is a command-line tool that retrieves 7 days of airport schedule data from the [Aerodatabox API](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) and generates route summaries in the format:

`QFA-YSSY-B737.10:A321.7-ANY#`

Each output line represents an airline–destination combination, showing all aircraft families operating on that route.

---

## Overview

This tool is designed for aviation enthusiasts, analysts, and developers who want to:
- Collect 7 days of airport flight schedule data.
- Automatically categorize flights by aircraft family.
- Generate compact route summaries.
- Optionally export the full schedule in JSON format.

---

## Installation

You can use this program in one of two ways:

### 1. Prebuilt Executable (Recommended)

A standalone Windows executable is available under the **Releases** section on GitHub.

- Download the latest `RouteBuilder.exe` from the [Releases page](../../releases/latest).
- Run it directly from File Explorer or a command prompt — **no Python installation required**.

### 2. Python Script

If you prefer to run the source code directly:

#### Requirements
- Python 3.8 or later  
- The `requests` library

## Usage

When you run the tool, you will be prompted to enter:

1. **RapidAPI key** – your personal Aerodatabox API key.  
2. **Airport code** – 4-letter ICAO (e.g., `YBBN`) or 3-letter IATA (e.g., `BNE`).  
3. **Start date** – `YYYY-MM-DD` format.  
   - The following 6 days are fetched automatically.  
   - The 7-day range must be entirely in the past (the last day before today).  
4. **Output folder path** – where the results will be saved.  
5. Whether to write:  
   - `combined_schedule.json` (y/n)  
   - `routes.txt` (y/n)  


### Example Interaction

== Aerodatabox 7-day fetch and route builder ==
Enter your RapidAPI key: xxxxxxx
Enter airport code (ICAO 4 letters or IATA 3 letters, e.g., YBBN or BNE): YBBN
Enter start date (YYYY-MM-DD) for a 7-day window that is fully in the past: 2025-10-28
Enter full output folder path: C:\Users\XXXX\Documents\Schedules
Write combined_schedule.json [y/n]: y
Write routes.txt [y/n]: y
Fetching 7 days (2025-10-28 to 2025-11-03) for YBBN...
Wrote 154 routes -> C:\Users\XXXX\Documents\Schedules\routes.txt


---

## Output Files

### routes.txt

Each line represents a route and the aircraft families that operated on it:

`<AirlineICAO>-<DestICAO>-<AircraftFamily1>.<ID>:<AircraftFamily2>.<ID>-ANY#`

**Example:**

QFA-YSSY-B737.10:A321.7-ANY#
VOZ-YMML-B738.10-ANY#


### combined_schedule.json

A full combined dataset containing all AM and PM schedules for the selected 7-day window.

---

## Aircraft Family IDs

| ID | Description | Example Types |
|----|--------------|---------------|
| 3  | Regional turboprops | ATR-72, AN-140 |
| 4  | DHC-8D / ATR-72 | DHC-8D |
| 5  | Small regional jets | CRJ700–1000, ARJ21, MD-80 |
| 6  | A220 / E295 family | A220-300, E295 |
| 7  | A320 family | A319, A320, A321 |
| 8  | A350 family | A350-900/1000 |
| 9  | A380 | A380-800 |
| 10 | B737 family | B737-700/800/900/MAX |
| 11 | B787 family | B787-8/9/10 |
| 12 | B747 family | B747-400/8 |
| 13 | B757 family | B757-200/300 |
| 14 | A340 / legacy quads | A340-300/600 |
| 15 | B777 family | B777-200/300 |
| 16 | A330 family | A330-200/300/NEO |
| 17 | B767 family | B767-300/400 |
| 26 | Fokker 100 | F100 |
| 1  | Unknown prop aircraft | GA, C208, PC12, etc. |

Full mapping is contained in the source code.

---

## Notes

- The tool performs 14 API requests per run (7 days × 2 time windows).  
- Data is fetched via the Aerodatabox API on RapidAPI, and usage counts against your RapidAPI quota.  
- If you rerun the tool with the same parameters, existing output files will be overwritten.

---

## License

This project uses data from the Aerodatabox API via RapidAPI.  
Users must supply their own API key and comply with Aerodatabox’s [terms of use](https://rapidapi.com/aedbx-aedbx/api/aerodatabox).

MIT License © 2025 Hayden Hookham
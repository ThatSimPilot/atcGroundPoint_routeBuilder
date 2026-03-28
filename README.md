# ATC Ground Point Route Builder

The **ATC Ground Point Route Builder** is a web-based tool that generates realistic CSV schedules for use in ATC Ground Point using historical flight data from the AeroDataBox API.

It is designed to run directly in your browser via **GitHub Pages**, with no installation required.

Each output row represents a **unique airline + airport + stand tag combination**, with all aircraft operating on that route consolidated into a single entry.

**Note:** This is an independent tool and is not affiliated with the developer of ATC Ground Point.

<a href="https://www.buymeacoffee.com/thatsimpilot" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" 
       alt="Buy Me A Coffee" 
       style="height: 60px !important;width: 217px !important;">
</a>

---

## 🌐 Web App (GitHub Pages)

👉 [Launch the Schedule Builder ](https://thatsimpilot.github.io/atcGroundPoint_routeBuilder/)

The tool runs entirely in your browser using the provided interface (`index.html`).

### Key Features

- No installation required  
- Fully browser-based  
- Instant CSV download  
- Clean, responsive UI  
- Supports two schedule types:
  - **Route-Based (Default Schedule)**
  - **Time-Based Schedule**

---

## 🧭 Schedule Modes

### ✈️ Default Route Builder (Aggregated)

- Generates **route-based schedules**
- Output is **aggregated by airline + airport**
- User provides:
  - Airport ICAO
  - End date
- Automatically fetches:
  - **Fixed 7-day window** (selected date + previous 6 days)

✔ Best for: realistic airline route distribution

#### 📊 Output Format

```
Airline, Airport, Airplane Models, Stand Tags
```

##### Example

```
QFA, YMML, B738:A332, ANY
VOZ, YBBN, B738, ANY
FDX, YSSY, B763, CARGO
```

---

### ⏱️ Time-Based Scheduler (Detailed)

- Generates **individual flight schedules with timestamps**
- User provides:
  - Airport ICAO
  - Start date
  - End date
- Constraints:
  - Maximum range: **7 days**

✔ Best for: detailed, time-accurate scheduling

#### 📊 Output Format

```
Time, Callsign, Departure Airport, Arrival Airport, Airplane Models, Stand Tags
```

##### Example

```
0700, UAL101, KIAH, YSSY, B789, ANY
0630, QFA405, YSSY, YMML, A321:A332, ANY
1331, FDX73, YSSY, VHHH, B77W, CARGO
```

---


## ⚙️ How It Works

1. Splits each day into 12-hour windows:
   - 0000 → 1159 
   - 1200 → 2359
2. Fetches flight data from AeroDataBox API  
3. Processes arrivals and departures  
4. Normalises:
   - Airline ICAO codes  
   - Airport ICAO codes  
   - Aircraft ICAO types  
5. Aggregates routes (route builder mode only)  
6. Exports CSV file  

---

## ✈️ Aircraft Handling

Aircraft types are resolved using:

1. API-provided ICAO codes (preferred)  
2. Custom mapping (`aircraftMapping.py`)  
3. Fallback to raw aircraft name  

---

## 🏷️ Stand Tag Logic

- `ANY` → default passenger flights  
- `CARGO` → applied when cargo flight detected
- Stand tags can updated via the [CustomGPT](https://chatgpt.com/g/g-69c0a72644508191b5259a40448479e1-atc-ground-point-schedule-stand-tag-applier)

---

## ⚠️ Limitations

- Accuracy depends on AeroDataBox API data  
- Generic aircraft types may map to defaults  
- Requires a valid RapidAPI key  

---

## 🔌 API Usage

- Uses AeroDataBox via RapidAPI  
- **2 API Requests** per day in schedule
  - 14 Requests for Default Schedule (Full 7 Days)
- Counts toward your API quota  

---

## 🖥️ Local Python Usage (Alternative)

If you prefer to run locally or modify the tool:

### Run from Repository
1. Clone repo
2. Install Python (3.8 or greater) and `requests` module
3. Run `routes_builder.py`

```
git clone https://github.com/ThatSimPilot/atcGroundPoint_routeBuilder.git
cd <repo-name>
pip install requests
python routes_builder.py
```

---

### Or Install and Run Individual Scripts

- `DefaultSchedule/routes_builder.py`
- `TimeBasedSchedule/routes_builder.py`

---

## 📁 Output

```
<ICAO>_schedule.csv
```

Example:

```
YSSY_schedule.csv
```

---

## Next Steps

- Schedule Database

---

## 📄 License

MIT License © Hayden Hookham

---

## ⚠️ Disclaimer

This project is not affiliated with ATC Ground Point.

---

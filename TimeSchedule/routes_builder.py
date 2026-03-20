import requests
from datetime import datetime, timedelta
import os, sys
import time
import tkinter as tk
from tkinter import filedialog
from collections import defaultdict
import csv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aircraftMapping import AIRCRAFT_NAME_TO_ICAO

BASE_URL = "https://aerodatabox.p.rapidapi.com/flights/airports"

QUERYPARAMS = {
    "withLeg":"true",
    "direction":"Both",
    "withCancelled":"true",
    "withCodeshared":"false",
    "withCargo":"true",
    "withPrivate":"true",
    "withLocation":"false"
}

def prompt_api_key () -> str:
    while True:
        key = input("Please enter your RapidAPI key: ")
        if key:
            return key
        print("API key cannot be empty. Please try again.")
        
    
def prompt_airport_code():
    while True:
        code = input("Please enter the ICAO code of the airport: ")
        if len(code) == 4 and code.isalpha():
            code_type = "ICAO"
            return code.upper(), code_type
        print("Invalid code. Please enter a valid ICAO (4 letters) code.") 
    
def prompt_end_date() -> datetime:
    while True:
        raw = input("Please enter the end date in DD-MM-YYYY format (Must be before today's date): ")
        try:
            end_date = datetime.strptime(raw, "%d-%m-%Y")
            today = datetime.now()

            #Must be before today's date
            if end_date.date() >= today.date():
                print("End date must be before today's date. Please try again.")
                continue

            return end_date
        except ValueError:
            print("Invalid date format. Please enter the date in DD-MM-YYYY format.")

def build_headers(api_key: str) -> dict:
    return {
        "x-rapidapi-key": api_key,
	    "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
	    "Content-Type": "application/json"
    }

def build_12hr_windows(end_date: datetime) -> list[tuple[datetime, datetime]]:
    start_date = end_date - timedelta(days=6)
    windows = []

    current_day = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    final_day = end_date.replace(hour=0, minute=0, second=0, microsecond=0)

    while current_day <= final_day:
        # AM: 000000 -> 115959
        am_start = current_day.replace(hour=0, minute=0, second=0, microsecond=0)
        am_end = current_day.replace(hour=11, minute=59, second=59, microsecond=0)

        # PM: 120000 -> 235959
        pm_start = current_day.replace(hour=12, minute=0, second=0, microsecond=0)
        pm_end = current_day.replace(hour=23, minute=59, second=59, microsecond=0)

        windows.append((am_start, am_end))
        windows.append((pm_start, pm_end))

        current_day += timedelta(days=1)

    return windows

def format_api_datetime(dt: datetime) -> str:
    """
    AeroDataBox endpoint examples use local datetime in the path like:
    YYYY-MM-DDTHH:MM:SS
    """
    return dt.strftime("%Y-%m-%dT%H:%M:%S")

def get_aircraft_icao(flight: dict) -> str:
    aircraft = flight.get("aircraft") or {}

    # Try API-provided aircraft codes first
    code = aircraft.get("modelCode") or aircraft.get("icaoCode") or aircraft.get("code")
    if code:
        return code.upper()

    # Then try your manual mapping
    name = aircraft.get("model") or aircraft.get("name") or "UNKNOWN"
    return AIRCRAFT_NAME_TO_ICAO.get(name, name)

def get_stand_tag(flight: dict) -> str:
    return "CARGO" if flight.get("isCargo") is True else "ANY"

def fetch_airport_flights(code_type: str, code: str, from_dt: datetime, to_dt: datetime, headers: dict):
    url = f"{BASE_URL}/{code_type}/{code}/{format_api_datetime(from_dt)}/{format_api_datetime(to_dt)}"

    try:
        response = requests.get(
            url,
            headers=headers,
            params=QUERYPARAMS,
            timeout=30
        )

        # Handle HTTP status codes explicitly
        if response.status_code == 200:
            try:
                return response.json()
            except ValueError:
                print(f"Invalid JSON response for {from_dt} → {to_dt}")
                return None

        elif response.status_code == 401:
            print("ERROR 401: Invalid API key.")
        elif response.status_code == 403:
            print("ERROR 403: Access forbidden.")
        elif response.status_code == 404:
            print(f"ERROR 404: Airport not found ({code}).")
        elif response.status_code == 429:
            print("ERROR 429: Rate limit exceeded. Slow down requests.")
        elif response.status_code >= 500:
            print(f"SERVER ERROR {response.status_code}: AeroDataBox issue.")
        else:
            print(f"HTTP ERROR {response.status_code}: {response.text}")

        return None

    except requests.Timeout:
        print(f"Timeout error for window {from_dt} → {to_dt}")
    except requests.ConnectionError:
        print("Connection error. Check your internet.")
    except requests.RequestException as e:
        print(f"Unexpected request error: {e}")

    return None

def choose_output_folder() -> str:
    """
    Open a folder picker so the user can choose where the CSV is saved.
    Falls back to current working directory if cancelled.
    """
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)

    folder = filedialog.askdirectory(title="Select destination folder for CSV output")
    root.destroy()

    if not folder:
        print("No folder selected. Using current working directory instead.")
        return os.getcwd()

    return folder


def get_airline_code(flight: dict) -> str:
    """
    Prefer operating airline from callsign prefix.
    Fall back to airline object from API.
    """
    call_sign = (flight.get("callSign") or "").strip().upper()
    if len(call_sign) >= 3 and call_sign[:3].isalpha():
        return call_sign[:3]

    airline = flight.get("airline") or {}

    return (
        airline.get("icao")
        or airline.get("iata")
        or airline.get("code")
        or airline.get("name")
        or "UNKNOWN"
    ).upper()

def get_route_airport_code(flight: dict, direction: str) -> str:
    """
    For departures, use arrival airport.
    For arrivals, use departure airport.
    Returns ICAO if available, otherwise IATA.
    """
    if direction == "departure":
        airport = (
            flight.get("arrival") or {}
        ).get("airport") or {}
    else:
        airport = (
            flight.get("departure") or {}
        ).get("airport") or {}

    return (
        airport.get("icao")
        or airport.get("iata")
        or airport.get("code")
        or "UNKNOWN"
    ).upper()

def get_callsign(flight: dict) -> str:
    return (flight.get("callSign") or "UNKNOWN").strip().upper()


def get_departure_airport_code(flight: dict) -> str:
    airport = (flight.get("departure") or {}).get("airport") or {}
    return (
        airport.get("icao")
        or airport.get("iata")
        or airport.get("code")
        or "UNKNOWN"
    ).upper()


def get_arrival_airport_code(flight: dict) -> str:
    airport = (flight.get("arrival") or {}).get("airport") or {}
    return (
        airport.get("icao")
        or airport.get("iata")
        or airport.get("code")
        or "UNKNOWN"
    ).upper()


def get_flight_time(flight: dict, direction: str) -> str:
    """
    For departures, use departure scheduled local time.
    For arrivals, use arrival scheduled local time.
    Returns HH:MM where possible.
    """
    if direction == "departure":
        time_block = (flight.get("departure") or {}).get("scheduledTime") or {}
    else:
        time_block = (flight.get("arrival") or {}).get("scheduledTime") or {}

    local_time = time_block.get("local")
    utc_time = time_block.get("utc")

    raw_time = local_time or utc_time
    if not raw_time:
        return "UNKNOWN"

    # Expected examples:
    # 2026-03-04 19:55+10:00
    # 2026-03-04 09:55Z
    try:
        time_part = raw_time.split(" ")[1]
        return time_part[:5]
    except (IndexError, AttributeError):
        return raw_time


def aggregate_flights_for_csv(all_results: list, airport_code: str) -> list[dict]:
    """
    Combines flights into rows with headings:
    Time, Callsign, Departure Airport, Arrival Airport, Airplane Model, Stand Tags

    For the requested airport:
    - departures always depart FROM airport_code
    - arrivals always arrive TO airport_code
    """
    airport_code = airport_code.upper()
    flights_map = defaultdict(set)

    for result in all_results:
        payload = result.get("data") or {}

        # Handle either:
        # 1) {"departures": [...], "arrivals": [...]}
        # 2) {"data": {"departures": [...], "arrivals": [...]}}
        if "departures" in payload or "arrivals" in payload:
            data = payload
        else:
            data = payload.get("data") or {}

        departures = data.get("departures") or []
        arrivals = data.get("arrivals") or []

        for flight in departures:
            callsign = get_callsign(flight)
            dep_airport = airport_code
            arr_airport = get_arrival_airport_code(flight)
            flight_time = get_flight_time(flight, "departure")
            aircraft_code = get_aircraft_icao(flight)
            stand_tag = get_stand_tag(flight)

            # For departures, only destination is required from API
            if arr_airport != "UNKNOWN":
                key = (flight_time, callsign, dep_airport, arr_airport, stand_tag)
                flights_map[key].add(aircraft_code)

        for flight in arrivals:
            callsign = get_callsign(flight)
            dep_airport = get_departure_airport_code(flight)
            arr_airport = airport_code
            flight_time = get_flight_time(flight, "arrival")
            aircraft_code = get_aircraft_icao(flight)
            stand_tag = get_stand_tag(flight)

            # For arrivals, only origin is required from API
            if dep_airport != "UNKNOWN":
                key = (flight_time, callsign, dep_airport, arr_airport, stand_tag)
                flights_map[key].add(aircraft_code)

    rows = []
    for (flight_time, callsign, dep_airport, arr_airport, stand_tag), aircraft_set in sorted(flights_map.items()):
        rows.append({
            "Time": flight_time,
            "Callsign": callsign,
            "Departure Airport": dep_airport,
            "Arrival Airport": arr_airport,
            "Airplane Model": ":".join(sorted(aircraft_set)),
            "Stand Tags": stand_tag
        })

    return rows

def write_csv(rows: list[dict], airport_code: str, end_date: datetime, output_folder: str) -> str:
    """
    Writes the time-based schedule CSV to disk.
    """
    filename = f"{airport_code.upper()}_schedule.csv"
    output_path = os.path.join(output_folder, filename)

    with open(output_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(
            csvfile,
            fieldnames=[
                "Time",
                "Callsign",
                "Departure Airport",
                "Arrival Airport",
                "Airplane Model",
                "Stand Tags"
            ]
        )
        writer.writeheader()
        writer.writerows(rows)

    return output_path

def main():
    api_key = prompt_api_key()
    code, code_type = prompt_airport_code()
    end_date = prompt_end_date()
    headers = build_headers(api_key)

    windows = build_12hr_windows(end_date)

    all_results = []

    for from_dt, to_dt in windows:
        print(f"Fetching {code} {code_type.upper()} from {from_dt} to {to_dt}")

        data = fetch_airport_flights(code_type, code, from_dt, to_dt, headers)

        if data:
            departures = data.get("departures") or []
            if departures:
                print("     Sample departure keys:", list(departures[0].keys()))
            arrivals = data.get("arrivals") or []
            if arrivals:
                print("     Sample arrival keys:", list(arrivals[0].keys()))

            print(f"  Returned {len(departures)} departures and {len(arrivals)} arrivals")

            all_results.append({
                "from": from_dt,
                "to": to_dt,
                "data": data
            })
        else:
            print("  No data returned for this window")

        time.sleep(0.5)

    print(f"\nCompleted. Pulled {len(all_results)} successful 12-hour windows.")

    if not all_results:
        print("No successful results returned, so no CSV was created.")
        return []

    rows = aggregate_flights_for_csv(all_results, code)

    if not rows:
        print("No flights found to write to CSV.")
        return all_results

    output_folder = choose_output_folder()
    print(f"Generated {len(rows)} flight rows for CSV.")
    csv_path = write_csv(rows, code, end_date, output_folder)

    print(f"CSV created successfully: {csv_path}")
    return all_results


if __name__ == "__main__":
    main()
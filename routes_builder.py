# fetch_and_build_routes_minimal.py
# Minimal standard-library version: only external dep is requests

import os
import sys
import json
import re
import requests
from datetime import datetime, date, timedelta
from typing import Dict, Set, Tuple, Optional

BASE_URL = "https://aerodatabox.p.rapidapi.com/flights/airports"
QUERYSTRING = {
    "withLeg": "true",
    "direction": "Both",
    "withCancelled": "true",
    "withCodeshared": "true",
    "withCargo": "true",
    "withPrivate": "true",
    "withLocation": "false",
}

def prompt_api_key() -> str:
    key = input("Enter your RapidAPI key: ").strip()
    if not key:
        print("API key is required.")
        sys.exit(1)
    return key

def prompt_airport_code() -> str:
    while True:
        code = input("Enter airport code (ICAO 4 letters or IATA 3 letters, e.g., YBBN or BNE): ").strip().upper()
        if len(code) in (3, 4) and code.isalnum():
            return code
        print("Invalid code. Enter 3-letter IATA or 4-letter ICAO.")

def prompt_start_date_past_window() -> date:
    """
    Prompt for YYYY-MM-DD until the 7-day window [start, start+6] is entirely in the past.
    The last day must be strictly before today.
    """
    while True:
        s = input("Enter start date (YYYY-MM-DD) for a 7-day window that is fully in the past: ").strip()
        try:
            d = datetime.strptime(s, "%Y-%m-%d").date()
        except ValueError:
            print("Invalid date format. Please use YYYY-MM-DD.")
            continue

        end_d = d + timedelta(days=6)
        today = date.today()
        if end_d < today:
            return d
        print(f"Invalid window. End date {end_d} must be before today {today}. Try an earlier start date.")

def prompt_output_folder() -> str:
    folder = input("Enter full output folder path: ").strip()
    if not folder:
        print("Output path required.")
        sys.exit(1)
    os.makedirs(folder, exist_ok=True)
    return folder

def prompt_yes_no(msg: str) -> bool:
    while True:
        ans = input(msg + " [y/n]: ").strip().lower()
        if ans in ("y", "yes"):
            return True
        if ans in ("n", "no"):
            return False
        print("Please answer y or n.")

def code_type_for(code: str) -> str:
    return "iata" if len(code) == 3 else "icao"

def fetch_window(api_key: str, code_type: str, airport_code: str, day_date: date, start_time: str, end_time: str) -> dict:
    headers = {
        "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
        "x-rapidapi-key": api_key,
    }
    from_iso = f"{day_date.isoformat()}T{start_time}"
    to_iso   = f"{day_date.isoformat()}T{end_time}"
    url = f"{BASE_URL}/{code_type}/{airport_code}/{from_iso}/{to_iso}"

    r = requests.get(url, headers=headers, params=QUERYSTRING, timeout=40)
    if r.status_code != 200:
        return {"_error": f"{r.status_code} {r.text[:200]}", "departures": [], "arrivals": []}
    try:
        return r.json()
    except Exception as e:
        return {"_error": f"JSON error: {e}", "departures": [], "arrivals": []}

# Aircraft mapping
FAMILY_ID = {
    "AT42": 3, "AT72": 3, "DH8D": 4,
    "CRJ7": 5, "CRJ9": 5, "CRJ1": 5, "CRJ2": 24,
    "ARJ21": 5, "MD80": 5, "MD90": 5, "B717": 5,
    "A220": 6, "E295": 6, "E195": 6, "E190": 25, "E175": 25, "E170": 25, "E145": 24,
    "A321": 7, "A320": 7, "A319": 7, "A300": 7, "A310": 7,
    "A350": 8, "A380": 9, "B737": 10, "B787": 11, "B747": 12,
    "B757": 13, "A340": 14, "B777": 15, "A330": 16, "B767": 17,
    "C208": 22, "B190": 23, "F100": 26,
    "TU204": 18, "AN12": 19, "AN124": 20, "MD11": 21,
    "IL18": 27, "IL62": 28, "IL96": 29, "TU154": 30, "B462": 31, "J328": 32,
}

def is_prop_like(text: str) -> bool:
    s = (text or "").upper()
    props = ["CESSNA", "PIPER", "BEECH", "KING AIR", "TURBOPROP", "DHC", "DASH", "ATR", "SAAB", "CARAVAN", "PC12"]
    return any(p in s for p in props)

def guess_prop_code(model: str) -> Optional[str]:
    s = (model or "").upper()
    direct = [("PC12", "PC12"), ("C208", "C208"), ("CARAVAN", "C208"), ("C172", "C172"),
              ("BE200", "BE20"), ("KING AIR", "BE20"), ("PA31", "PA31"), ("PA34", "PA34")]
    for needle, code in direct:
        if needle in s:
            return code
    tokens = re.findall(r"\b[A-Z]{1,2}\d{2,3}\b", s)
    return tokens[0] if tokens else None

def normalise_family(model: Optional[str]) -> Optional[str]:
    if not model:
        return None
    m = model.upper()
    # Boeing
    if "737" in m: return "B737"
    if "787" in m: return "B787"
    if "777" in m: return "B777"
    if "747" in m: return "B747"
    if "757" in m: return "B757"
    # Airbus
    if "A380" in m: return "A380"
    if "A350" in m: return "A350"
    if "A340" in m: return "A340"
    if "A330" in m: return "A330"
    if "A321" in m: return "A321"
    if "A320" in m or "A319" in m: return "A320"
    if "A310" in m: return "A310"
    if "A300" in m: return "A300"
    # A220 / E-jets
    if "A220" in m: return "A220"
    if "E195" in m: return "E195"
    if "E190" in m: return "E190"
    if "E175" in m or "E170" in m: return "E175"
    if "E145" in m: return "E145"
    # CRJ
    if "CRJ" in m or "CRG" in m:
        if "1000" in m: return "CRJ1"
        if "900" in m: return "CRJ9"
        if "700" in m: return "CRJ7"
        if "200" in m or "100" in m: return "CRJ2"
        return "CRJ7"
    # Props
    if "Q400" in m or "DHC" in m: return "DH8D"
    if "ATR72" in m or "ATR-72" in m or "ATR 72" in m: return "AT72"
    if "ATR42" in m or "ATR-42" in m or "ATR 42" in m: return "AT42"
    # Fokker
    if "F100" in m or "FOKKER 100" in m: return "F100"
    if "F70" in m or "FOKKER 70" in m: return "F100"
    # Misc
    if "C208" in m or "CARAVAN" in m: return "C208"
    if "B190" in m or "BEECH 1900" in m: return "B190"
    return None

def family_to_id(family: str) -> Optional[int]:
    return FAMILY_ID.get(family)

def extract_routes(combined: dict, home_icao: str) -> Dict[Tuple[str, str], Set[Tuple[str, int]]]:
    routes: Dict[Tuple[str, str], Set[Tuple[str, int]]] = {}
    for payload in combined.values():
        if not isinstance(payload, dict):
            continue
        for side in ("departures", "arrivals"):
            for f in payload.get(side, []):
                if (f.get("codeshareStatus") or "").lower() != "isoperator":
                    continue
                airline_icao = ((f.get("airline") or {}).get("icao") or "").upper()
                if not airline_icao or len(airline_icao) != 3:
                    continue
                if side == "departures":
                    other_icao = (((f.get("arrival") or {}).get("airport") or {}).get("icao") or "").upper()
                else:
                    other_icao = (((f.get("departure") or {}).get("airport") or {}).get("icao") or "").upper()
                if not other_icao or other_icao == home_icao:
                    continue
                model = ((f.get("aircraft") or {}).get("model")) or ""
                fam = normalise_family(model)
                if fam:
                    fid = family_to_id(fam)
                    if fid is None:
                        continue
                elif is_prop_like(model):
                    code = guess_prop_code(model) or "GA"
                    fam, fid = code, 1
                else:
                    continue
                routes.setdefault((airline_icao, other_icao), set()).add((fam, fid))
    return routes

def write_routes_txt(routes: Dict[Tuple[str, str], Set[Tuple[str, int]]], path: str) -> None:
    lines = []
    for (airline, dest) in sorted(routes.keys()):
        fams = sorted(routes[(airline, dest)], key=lambda x: (x[0], x[1]))
        joined = ":".join([f"{fam}.{fid}" for fam, fid in fams])
        lines.append(f"{airline}-{dest}-{joined}-ANY#")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def main():
    print("== Aerodatabox 7-day fetch and route builder ==")
    api_key = prompt_api_key()
    airport_code = prompt_airport_code()
    start_date = prompt_start_date_past_window()
    out_folder = prompt_output_folder()

    write_json = prompt_yes_no(f"Write {airport_code}_combined_schedule.json")
    write_txt  = prompt_yes_no(f"Write {airport_code}_routes.txt")
    if not write_json and not write_txt:
        print("Nothing to write. Choose at least one output format.")
        sys.exit(0)

    code_type = code_type_for(airport_code)
    home_icao = airport_code if code_type == "icao" else ""

    combined = {}
    days = [start_date + timedelta(days=i) for i in range(7)]
    windows = [("am", "00:00", "11:59"), ("pm", "12:00", "23:59")]

    print(f"Fetching 7 days ({days[0]} to {days[-1]}) for {airport_code}...")
    for d in days:
        for label, s, e in windows:
            data = fetch_window(api_key, code_type, airport_code, d, s, e)
            combined[f"{d.isoformat()}_{label}"] = data
            if "_error" in data:
                print(f"Warning: {d} {label} -> {data['_error'][:80]}")

    if write_json:
        json_path = os.path.join(out_folder, f"{airport_code}_combined_schedule.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(combined, f, ensure_ascii=False, indent=2)
        print(f"Saved combined JSON -> {json_path}")

    if write_txt:
        routes = extract_routes(combined, home_icao)
        txt_path = os.path.join(out_folder, f"{airport_code}_routes.txt")
        write_routes_txt(routes, txt_path)
        print(f"Wrote {len(routes)} routes -> {txt_path}")

if __name__ == "__main__":
    main()

import { AIRCRAFT_NAME_TO_ICAO } from "./aircraftMapping.js";

const BASE_URL = "https://aerodatabox.p.rapidapi.com/flights/airports";

const QUERY_PARAMS = new URLSearchParams({
  withLeg: "true",
  direction: "Both",
  withCancelled: "true",
  withCodeshared: "false",
  withCargo: "true",
  withPrivate: "true",
  withLocation: "false"
});

export async function generateDefaultSchedule({
  apiKey,
  airportCode,
  endDateRaw,
  onStatus = () => {},
  onLog = () => {}
}) {
  validateDefaultInputs(apiKey, airportCode, endDateRaw);

  const parsed = parseInputDate(endDateRaw);
  validateEndDate(parsed);

  const codeInfo = getAirportCodeType(airportCode);
  const headers = buildHeaders(apiKey);
  const windows = buildDefault12HrWindows(parsed);

  const allResults = [];

  onStatus(`Fetching ${windows.length} time windows...`);

  for (let i = 0; i < windows.length; i++) {
    const [fromDt, toDt] = windows[i];

    onStatus(
      `Fetching window ${i + 1} of ${windows.length}: ${formatDisplayDateTime(fromDt)} to ${formatDisplayDateTime(toDt)}`
    );

    const data = await fetchAirportFlights(
      codeInfo.codeType,
      codeInfo.code,
      fromDt,
      toDt,
      headers
    );

    if (data) {
      const departures = data.departures || [];
      const arrivals = data.arrivals || [];

      onLog(`Returned ${departures.length} departures and ${arrivals.length} arrivals`);

      allResults.push({
        from: fromDt,
        to: toDt,
        data
      });
    } else {
      onLog(`No data returned for ${formatDisplayDateTime(fromDt)} to ${formatDisplayDateTime(toDt)}`);
    }

    await sleep(500);
  }

  if (!allResults.length) {
    throw new Error("No successful results returned, so no CSV was created.");
  }

  const rows = aggregateDefaultFlightsForCsv(allResults);

  if (!rows.length) {
    throw new Error("No flights found to write to CSV.");
  }

  return {
    airportCode: codeInfo.code,
    rows
  };
}

export function defaultRowsToCsv(rows) {
  const headers = ["Airline", "Airport", "Airplane Models", "Stand Tags"];
  const lines = [headers.join(";")];

  for (const row of rows) {
    lines.push(
      headers
        .map((header) => csvEscape(row[header] ?? ""))
        .join(";")
    );
  }

  return lines.join("\n");
}

function validateDefaultInputs(apiKey, airportCode, endDateRaw) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("RapidAPI key cannot be empty.");
  }

  if (!airportCode || !airportCode.trim()) {
    throw new Error("Airport code cannot be empty.");
  }

  const normalized = airportCode.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized) && !/^[A-Z]{4}$/.test(normalized)) {
    throw new Error("Airport code must be a valid ICAO (4 letters) or IATA (3 letters) code.");
  }

  if (!endDateRaw) {
    throw new Error("End date is required.");
  }
}

function getAirportCodeType(airportCode) {
  const normalized = airportCode.trim().toUpperCase();

  if (/^[A-Z]{3}$/.test(normalized)) {
    return {
      code: normalized,
      codeType: "IATA"
    };
  }

  return {
    code: normalized,
    codeType: "ICAO"
  };
}

function parseInputDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function validateEndDate(endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (endDate >= today) {
    throw new Error("End date must be before today. Please enter yesterday or earlier.");
  }
}

function buildHeaders(apiKey) {
  return {
    "x-rapidapi-key": apiKey,
    "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
    "Content-Type": "application/json"
  };
}

function buildDefault12HrWindows(endDate) {
  const windows = [];

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);

  const currentDay = new Date(startDate);
  const finalDay = new Date(endDate);
  finalDay.setHours(0, 0, 0, 0);

  while (currentDay <= finalDay) {
    const amStart = new Date(currentDay);
    amStart.setHours(0, 0, 0, 0);

    const amEnd = new Date(currentDay);
    amEnd.setHours(11, 59, 0, 0);

    const pmStart = new Date(currentDay);
    pmStart.setHours(12, 0, 0, 0);

    const pmEnd = new Date(currentDay);
    pmEnd.setHours(23, 59, 0, 0);

    windows.push([amStart, amEnd]);
    windows.push([pmStart, pmEnd]);

    currentDay.setDate(currentDay.getDate() + 1);
  }

  return windows;
}

function formatApiDateTime(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

async function fetchAirportFlights(codeType, code, fromDt, toDt, headers) {
  const url = `${BASE_URL}/${codeType}/${code}/${formatApiDateTime(fromDt)}/${formatApiDateTime(toDt)}?${QUERY_PARAMS.toString()}`;

  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers
    });
  } catch {
    throw new Error("Connection error. Check your internet.");
  }

  if (response.status === 200) {
    try {
      return await response.json();
    } catch {
      throw new Error(`Invalid JSON response for ${formatDisplayDateTime(fromDt)} to ${formatDisplayDateTime(toDt)}`);
    }
  }

  if (response.status === 401) {
    throw new Error("ERROR 401: Invalid API key.");
  }

  if (response.status === 403) {
    throw new Error("ERROR 403: Access forbidden.");
  }

  if (response.status === 404) {
    throw new Error(`ERROR 404: Airport not found (${code}).`);
  }

  if (response.status === 429) {
    throw new Error("ERROR 429: Rate limit exceeded. Slow down requests.");
  }

  if (response.status >= 500) {
    throw new Error(`SERVER ERROR ${response.status}: AeroDataBox issue.`);
  }

  const text = await response.text();
  throw new Error(`HTTP ERROR ${response.status}: ${text}`);
}

function getAircraftIcao(flight) {
  const aircraft = flight.aircraft || {};

  const code = aircraft.modelCode || aircraft.icaoCode || aircraft.code;
  if (code) {
    return String(code).toUpperCase();
  }

  const name = aircraft.model || aircraft.name || "UNKNOWN";
  return AIRCRAFT_NAME_TO_ICAO[name] || name;
}

function getStandTag(flight) {
  return flight.isCargo === true ? "CARGO" : "ANY";
}

function getAirlineCode(flight) {
  const callSign = String(flight.callSign || "").trim().toUpperCase();

  if (callSign.length >= 3 && /^[A-Z]{3}/.test(callSign.slice(0, 3))) {
    return callSign.slice(0, 3);
  }

  const airline = flight.airline || {};

  return String(
    airline.icao ||
    airline.iata ||
    airline.code ||
    airline.name ||
    "UNKNOWN"
  ).toUpperCase();
}

function getRouteAirportCode(flight, direction) {
  let airport;

  if (direction === "departure") {
    airport = (flight.arrival || {}).airport || {};
  } else {
    airport = (flight.departure || {}).airport || {};
  }

  return String(
    airport.icao ||
    airport.iata ||
    airport.code ||
    "UNKNOWN"
  ).toUpperCase();
}

function aggregateDefaultFlightsForCsv(allResults) {
  const routesMap = new Map();

  for (const result of allResults) {
    const payload = result.data || {};
    const data =
      "departures" in payload || "arrivals" in payload
        ? payload
        : payload.data || {};

    const departures = data.departures || [];
    const arrivals = data.arrivals || [];

    for (const flight of departures) {
      const airlineCode = getAirlineCode(flight);
      const airportCode = getRouteAirportCode(flight, "departure");
      const aircraftCode = getAircraftIcao(flight);
      const standTag = getStandTag(flight);

      if (airlineCode !== "UNKNOWN" && airportCode !== "UNKNOWN") {
        const key = JSON.stringify([airlineCode, airportCode, standTag]);

        if (!routesMap.has(key)) {
          routesMap.set(key, new Set());
        }

        routesMap.get(key).add(aircraftCode);
      }
    }

    for (const flight of arrivals) {
      const airlineCode = getAirlineCode(flight);
      const airportCode = getRouteAirportCode(flight, "arrival");
      const aircraftCode = getAircraftIcao(flight);
      const standTag = getStandTag(flight);

      if (airlineCode !== "UNKNOWN" && airportCode !== "UNKNOWN") {
        const key = JSON.stringify([airlineCode, airportCode, standTag]);

        if (!routesMap.has(key)) {
          routesMap.set(key, new Set());
        }

        routesMap.get(key).add(aircraftCode);
      }
    }
  }

  const rows = [];

  for (const [key, aircraftSet] of routesMap.entries()) {
    const [airlineCode, airportCode, standTag] = JSON.parse(key);

    rows.push({
      Airline: airlineCode,
      Airport: airportCode,
      "Airplane Models": [...aircraftSet].sort().join(":"),
      "Stand Tags": standTag
    });
  }

  rows.sort((a, b) => {
    return (
      a.Airline.localeCompare(b.Airline) ||
      a.Airport.localeCompare(b.Airport) ||
      a["Stand Tags"].localeCompare(b["Stand Tags"])
    );
  });

  return rows;
}

function csvEscape(value) {
  const stringValue = String(value);

  if (
    stringValue.includes(";") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function formatDisplayDateTime(date) {
  return date.toLocaleString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
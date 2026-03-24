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

export async function generateTimeSchedule({
  apiKey,
  airportCode,
  startDateRaw,
  endDateRaw,
  onStatus = () => {},
  onLog = () => {}
}) {
  validateInputs(apiKey, airportCode, startDateRaw, endDateRaw);

  const startDate = parseInputDate(startDateRaw);
  const endDate = parseInputDate(endDateRaw);

  validateDateRange(startDate, endDate);

  const headers = buildHeaders(apiKey);
  const windows = build12HrWindows(startDate, endDate);
  const allResults = [];

  onStatus(`Fetching ${windows.length} time windows...`);

  for (let i = 0; i < windows.length; i++) {
    const [fromDt, toDt] = windows[i];

    onStatus(
      `Fetching window ${i + 1} of ${windows.length}: ${formatDisplayDateTime(fromDt)} to ${formatDisplayDateTime(toDt)}`
    );

    const data = await fetchAirportFlights("ICAO", airportCode, fromDt, toDt, headers);

    if (data) {
      const departures = data.departures || [];
      const arrivals = data.arrivals || [];

      allResults.push({
        from: fromDt,
        to: toDt,
        data
      });

      onLog(`Returned ${departures.length} departures and ${arrivals.length} arrivals`);
    } else {
      onLog(`No data returned for ${formatDisplayDateTime(fromDt)} to ${formatDisplayDateTime(toDt)}`);
    }

    await sleep(500);
  }

  if (!allResults.length) {
    throw new Error("No successful results returned, so no CSV was created.");
  }

  const rows = aggregateFlightsForCsv(allResults, airportCode);

  if (!rows.length) {
    throw new Error("No flights found to write to CSV.");
  }

  return {
    airportCode,
    rows
  };
}

export function timeRowsToCsv(rows) {
  const headers = [
    "Time",
    "Callsign",
    "Departure Airport",
    "Arrival Airport",
    "Airplane Model",
    "Stand Tags"
  ];

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

function validateInputs(apiKey, airportCode, startDateRaw, endDateRaw) {
  if (!apiKey) {
    throw new Error("RapidAPI key cannot be empty.");
  }

  if (!/^[A-Z]{4}$/i.test(airportCode)) {
    throw new Error("Airport code must be a valid 4-letter ICAO code.");
  }

  if (!startDateRaw || !endDateRaw) {
    throw new Error("Start date and end date are required.");
  }
}

function parseInputDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function validateDateRange(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (startDate > endDate) {
    throw new Error("Start date cannot be after end date.");
  }

  if (endDate >= today) {
    throw new Error("End date must be before today. Please enter yesterday or earlier.");
  }

  const dayCount = diffDaysInclusive(startDate, endDate);

  if (dayCount < 1) {
    throw new Error("Date range must include at least 1 day.");
  }

  if (dayCount > 7) {
    throw new Error("Date range cannot be more than 7 days.");
  }
}

function buildHeaders(apiKey) {
  return {
    "x-rapidapi-key": apiKey,
    "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
    "Content-Type": "application/json"
  };
}

function build12HrWindows(startDate, endDate) {
  const windows = [];
  const currentDay = new Date(startDate);
  const finalDay = new Date(endDate);

  currentDay.setHours(0, 0, 0, 0);
  finalDay.setHours(0, 0, 0, 0);

  while (currentDay <= finalDay) {
    const amStart = new Date(currentDay);
    amStart.setHours(0, 0, 0, 0);

    const amEnd = new Date(currentDay);
    amEnd.setHours(11, 59, 59, 0);

    const pmStart = new Date(currentDay);
    pmStart.setHours(12, 0, 0, 0);

    const pmEnd = new Date(currentDay);
    pmEnd.setHours(23, 59, 59, 0);

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

function getCallsign(flight) {
  const callSign = String(flight.callSign || "").trim().toUpperCase();
  if (callSign) {
    return callSign;
  }

  const airline = flight.airline || {};
  const airlineCode = airline.icao || airline.iata || airline.code || "";
  const flightNumber = flight.number || flight.flightNumber || "";

  if (airlineCode && flightNumber) {
    return `${String(airlineCode).toUpperCase()}${String(flightNumber).trim()}`;
  }

  if (airlineCode) {
    return String(airlineCode).toUpperCase();
  }

  return "UNKNOWN";
}

function getDepartureAirportCode(flight) {
  const airport = flight.departure?.airport || {};
  return String(airport.icao || airport.iata || airport.code || "UNKNOWN").toUpperCase();
}

function getArrivalAirportCode(flight) {
  const airport = flight.arrival?.airport || {};
  return String(airport.icao || airport.iata || airport.code || "UNKNOWN").toUpperCase();
}

function getFlightTime(flight, direction) {
  const timeBlock =
    direction === "departure"
      ? flight.departure?.scheduledTime || {}
      : flight.arrival?.scheduledTime || {};

  const rawTime = timeBlock.local || timeBlock.utc;
  if (!rawTime) {
    return "UNKNOWN";
  }

  try {
    if (rawTime.includes(" ")) {
      const timePart = rawTime.split(" ")[1];
      return timePart.slice(0, 2) + timePart.slice(3, 5);
    }

    if (rawTime.includes("T")) {
      const timePart = rawTime.split("T")[1];
      return timePart.slice(0, 2) + timePart.slice(3, 5);
    }

    return rawTime;
  } catch {
    return rawTime;
  }
}

function aggregateFlightsForCsv(allResults, airportCode) {
  const normalizedAirportCode = airportCode.toUpperCase();
  const flightsMap = new Map();

  for (const result of allResults) {
    const payload = result.data || {};
    const data =
      "departures" in payload || "arrivals" in payload
        ? payload
        : payload.data || {};

    const departures = data.departures || [];
    const arrivals = data.arrivals || [];

    for (const flight of departures) {
      const callsign = getCallsign(flight);
      const depAirport = normalizedAirportCode;
      const arrAirport = getArrivalAirportCode(flight);
      const flightTime = getFlightTime(flight, "departure");
      const aircraftCode = getAircraftIcao(flight);
      const standTag = getStandTag(flight);

      if (arrAirport !== "UNKNOWN") {
        const key = JSON.stringify([flightTime, callsign, depAirport, arrAirport, standTag]);

        if (!flightsMap.has(key)) {
          flightsMap.set(key, new Set());
        }

        flightsMap.get(key).add(aircraftCode);
      }
    }

    for (const flight of arrivals) {
      const callsign = getCallsign(flight);
      const depAirport = getDepartureAirportCode(flight);
      const arrAirport = normalizedAirportCode;
      const flightTime = getFlightTime(flight, "arrival");
      const aircraftCode = getAircraftIcao(flight);
      const standTag = getStandTag(flight);

      if (depAirport !== "UNKNOWN") {
        const key = JSON.stringify([flightTime, callsign, depAirport, arrAirport, standTag]);

        if (!flightsMap.has(key)) {
          flightsMap.set(key, new Set());
        }

        flightsMap.get(key).add(aircraftCode);
      }
    }
  }

  const rows = [];

  for (const [key, aircraftSet] of flightsMap.entries()) {
    const [flightTime, callsign, depAirport, arrAirport, standTag] = JSON.parse(key);

    rows.push({
      Time: flightTime,
      Callsign: callsign,
      "Departure Airport": depAirport,
      "Arrival Airport": arrAirport,
      "Airplane Model": [...aircraftSet].sort().join(":"),
      "Stand Tags": standTag
    });
  }

  rows.sort((a, b) => {
    return (
      a.Time.localeCompare(b.Time) ||
      a.Callsign.localeCompare(b.Callsign) ||
      a["Departure Airport"].localeCompare(b["Departure Airport"]) ||
      a["Arrival Airport"].localeCompare(b["Arrival Airport"]) ||
      a["Stand Tags"].localeCompare(b["Stand Tags"])
    );
  });

  return rows;
}

function csvEscape(value) {
  const stringValue = String(value);
  if (stringValue.includes(";") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function diffDaysInclusive(startDate, endDate) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((endDate - startDate) / msPerDay) + 1;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDisplayDateTime(date) {
  return date.toLocaleString();
}
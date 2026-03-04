import "./style.css";
import L from "leaflet";
import "leaflet.markercluster";

// --- Types ---
interface Station {
  id: string;
  name: string;
  area: string;
  status: "Open" | "Closed" | "Unknown";
  fuel: "Available" | "Low" | "Unavailable" | "Unknown";
  queue: "Short" | "Medium" | "Long" | "Empty";
  price: number | null;
  lastUpdated: string;
  lat: number;
  lng: number;
}

// --- Global State ---
let map: L.Map;
let markerClusterGroup: L.MarkerClusterGroup;
let allStations: Station[] = [];
let markersMap = new Map<string, L.Marker>();

// Filter states
let activeMode: "This Area" | "Near Me" = "This Area";
let filterOpenOnly = false;
let filterHasPriceOnly = false;
let userLocation: L.LatLng | null = null;

// --- DOM Elements ---
const listContainer = document.getElementById("stations-list")!;
const btnThisArea = document.getElementById("btn-this-area")!;
const btnNearMe = document.getElementById("btn-near-me")!;
const filterOpen = document.getElementById("filter-open")!;
const filterPrice = document.getElementById("filter-price")!;
const mobileHandle = document.getElementById("mobile-handle")!;
const sidebar = document.getElementById("sidebar")!;

// --- Initialization ---
async function init() {
  initMap();
  setupEventListeners();
  await loadData();
}

function initMap() {
  // Center roughly at Sao Paulo as default from mock
  map = L.map("map", {
    zoomControl: false, // we will add it to the top-left later maybe
  }).setView([-23.5505, -46.6333], 12);

  L.control.zoom({ position: "topleft" }).addTo(map);

  // Dark Tiles from CartoDB
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(map);

  // Initialize Marker Cluster plugin
  markerClusterGroup = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 50, // Better performance & grouping
  });

  map.addLayer(markerClusterGroup);

  // Map sync event
  map.on("moveend", () => {
    if (activeMode === "This Area") {
      updateListView();
    }
  });
}

async function loadData() {
  try {
    const res = await fetch("/stations.json"); // served from public dir via Vite
    const data = await res.json();
    allStations = data.stations || [];
    renderMarkers();
    updateListView();
  } catch (error) {
    listContainer.innerHTML = `<div class="empty-state">❌ Failed to load data</div>`;
  }
}

// --- Markers & Clusters logic ---
function renderMarkers() {
  markerClusterGroup.clearLayers();
  markersMap.clear();

  // Create custom icon
  const customIcon = L.divIcon({
    className: "custom-station-icon",
    html: `<div style="background:var(--accent-color);width:16px;height:16px;border-radius:50%;border:2px solid var(--bg-dark);box-shadow:0 0 4px var(--accent-color);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  allStations.forEach((station) => {
    // Basic filter logic applies to map markers as well if needed?
    // Client wants "marker clustering still works", so usually all markers stay on map,
    // but list filters might just filter the list, or both. Let's filter both for consistency.
    if (!passesFilters(station)) return;

    const marker = L.marker([station.lat, station.lng], { icon: customIcon });

    marker.on("click", () => {
      handleStationSelect(station.id);
    });

    markerClusterGroup.addLayer(marker);
    markersMap.set(station.id, marker);
  });
}

function passesFilters(station: Station): boolean {
  if (filterOpenOnly && station.status !== "Open") return false;
  if (filterHasPriceOnly && station.price === null) return false;
  return true;
}

// --- List View Logic ---
function updateListView() {
  let visibleStations: Station[] = [];

  if (activeMode === "This Area") {
    // Bounds check
    const bounds = map.getBounds();
    visibleStations = allStations.filter((s) => {
      if (!passesFilters(s)) return false;
      const latLng = L.latLng(s.lat, s.lng);
      return bounds.contains(latLng);
    });
  } else if (activeMode === "Near Me" && userLocation) {
    // Sort all by distance to user
    visibleStations = allStations
      .filter(passesFilters)
      .map((s) => {
        const dest = L.latLng(s.lat, s.lng);
        const distance = userLocation!.distanceTo(dest);
        return { ...s, distance };
      })
      .sort((a, b) => a.distance - b.distance);
  } else {
    // If Near Me clicked without geolocation yet
    listContainer.innerHTML = `
      <div class="empty-state">
         <span>📍</span>
         <p>Getting your location...</p>
      </div>`;
    return;
  }

  renderList(visibleStations);
}

function renderList(stations: Station[]) {
  if (stations.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
         <span>📭</span>
         <p>No stations matches the current view and filters.</p>
      </div>`;
    return;
  }

  listContainer.innerHTML = stations
    .map(
      (s) => `
    <div class="station-card" data-id="${s.id}">
      <div class="station-title">${s.name}</div>
      <div class="station-area">${s.area}</div>
      <div class="station-stats">
        <span class="status-indicator">
           <div class="dot ${s.status === "Open" ? "open" : s.status === "Closed" ? "closed" : "unknown"}"></div>
           ${s.status}
        </span>
        <span class="status-indicator">Fuel: ${s.fuel}</span>
      </div>
      <div class="station-stats" style="margin-top:8px;">
        <span class="price-tag">${s.price ? "$" + s.price.toFixed(2) : "--"}</span>
        <span style="font-size:0.8rem; color:var(--text-secondary)">Queue: ${s.queue} | ${s.lastUpdated}</span>
      </div>
    </div>
  `,
    )
    .join("");

  // Attach click events on DOM cards
  document.querySelectorAll(".station-card").forEach((card) => {
    card.addEventListener("click", () => {
      handleStationSelect(card.getAttribute("data-id")!);
    });
  });
}

// --- Interactions ---
function handleStationSelect(id: string) {
  // Highlight card
  document
    .querySelectorAll(".station-card")
    .forEach((c) => c.classList.remove("active"));
  const card = document.querySelector(`.station-card[data-id="${id}"]`);
  if (card) {
    card.classList.add("active");
    card.scrollIntoView({ behavior: "smooth", block: "center" }); // List auto scrolls to item
  }

  // Handle Map Zoom & Popup
  const marker = markersMap.get(id);
  if (marker) {
    const parent = markerClusterGroup.getVisibleParent(marker);
    if (parent && "spiderfy" in parent) {
      // It's inside a closed cluster. Map will fly to it and cluster will open automatically via flyTo usually,
      // but to be safe let's zoom in.
      map.flyTo(marker.getLatLng(), 15, { duration: 0.5 });
    } else {
      map.flyTo(marker.getLatLng(), 15, { duration: 0.5 });
    }

    // Simple popup as detail view constraint (or we could use the drawer)
    const station = allStations.find((s) => s.id === id);
    if (station) {
      L.popup({ autoPan: true, className: "dark-popup" })
        .setLatLng(marker.getLatLng())
        .setContent(
          `<b>${station.name}</b><br>${station.price ? "$" + station.price.toFixed(2) : "No Price Data"}`,
        )
        .openOn(map);
    }
  }
}

// --- Listeners & Buttons ---
function setupEventListeners() {
  btnThisArea.addEventListener("click", () => {
    activeMode = "This Area";
    btnThisArea.classList.add("active");
    btnNearMe.classList.remove("active");
    updateListView();
  });

  btnNearMe.addEventListener("click", () => {
    activeMode = "Near Me";
    btnNearMe.classList.add("active");
    btnThisArea.classList.remove("active");

    // Start geolocation
    if (!userLocation) {
      updateListView(); // shows loading
      map.locate({ setView: true, maxZoom: 14 });
    } else {
      updateListView();
    }
  });

  map.on("locationfound", (e) => {
    userLocation = e.latlng;
    // Add blue marker for user
    L.circleMarker(userLocation, {
      radius: 8,
      fillColor: "#007aff",
      color: "#fff",
      weight: 2,
      fillOpacity: 1,
    }).addTo(map);
    if (activeMode === "Near Me") updateListView();
  });

  map.on("locationerror", (e) => {
    console.error(e.message);
    if (activeMode === "Near Me") {
      listContainer.innerHTML = `<div class="empty-state">❌ Location access denied.</div>`;
    }
  });

  filterOpen.addEventListener("click", () => {
    filterOpenOnly = !filterOpenOnly;
    filterOpen.classList.toggle("active", filterOpenOnly);
    renderMarkers();
    updateListView();
  });

  filterPrice.addEventListener("click", () => {
    filterHasPriceOnly = !filterHasPriceOnly;
    filterPrice.classList.toggle("active", filterHasPriceOnly);
    renderMarkers();
    updateListView();
  });

  // Mobile Bottom Sheet toggle
  mobileHandle.addEventListener("click", () => {
    sidebar.classList.toggle("expanded");
  });
}

// Start
init();

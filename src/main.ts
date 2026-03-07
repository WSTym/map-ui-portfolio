import "./style.css";
import L from "leaflet";
import "leaflet.markercluster";

class g {
  map = null;
  userLocation = null;
  stations = [];
  markers = [];
  userMarker = null;
  nearestMarker = null;
  markerClusterGroup = null;
  allStations = [];
  filteredStations = [];
  constructor() {
    (this.initMap(),
      this.loadStations(),
      this.setupEventListeners(),
      this.startTimeUpdater());
  }
  initMap() {
    if ((console.log("Initializing map..."), !document.getElementById("map"))) {
      console.error("Map element not found!");
      return;
    }
    console.log("Map element found, creating Leaflet map...");
    try {
      ((this.map = L.map("map").setView([6.5244, 3.3792], 11)),
        console.log("Map created, adding tile layer..."),
        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 20,
          },
        ).addTo(this.map),
        console.log("Tile layer added, map should be visible"),
        (this.markerClusterGroup = L.markerClusterGroup({
          iconCreateFunction: (t) => this.createClusterIcon(t),
          spiderfyOnMaxZoom: !0,
          showCoverageOnHover: !1,
          zoomToBoundsOnClick: !0,
          maxClusterRadius: 50,
        })),
        this.map.addLayer(this.markerClusterGroup),
        setTimeout(() => {
          this.map &&
            (this.map.invalidateSize(), console.log("Map size invalidated"));
        }, 100));
    } catch (t) {
      console.error("Error initializing map:", t);
    }
  }
  createClusterIcon(e) {
    const t = e.getAllChildMarkers(),
      s = t.length;
    let greenCount = 0, // open + none/short
      redCount = 0, // open + long
      greyCount = 0, // closed or unknown
      yellowCount = 0; // open + medium
    t.forEach((l) => {
      const status = l.options.stationStatus;
      const queue = l.options.stationQueue;

      if (status === "closed") {
        greyCount++;
      } else if (queue === "none" || queue === "short" || queue === "empty") {
        greenCount++;
      } else if (queue === "medium") {
        yellowCount++;
      } else if (queue === "long") {
        redCount++;
      } else {
        greyCount++; // fallback for null/unknown queue while open
      }
    });
    let n = "marker-cluster-mixed";
    const u = greenCount / s,
      p = redCount / s,
      m = yellowCount / s,
      h = greyCount / s;
    return (
      u > 0.5
        ? (n = "marker-cluster-open")
        : p > 0.5
          ? (n = "marker-cluster-closed")
          : m > 0.5
            ? (n = "marker-cluster-limited")
            : h > 0.5 && (n = "marker-cluster-unknown"),
      L.divIcon({
        html: "<div>" + s + "</div>",
        className: "marker-cluster " + n,
        iconSize: L.point(40, 40),
      })
    );
  }
  setupEventListeners() {
    document.getElementById("locationBtn")?.addEventListener("click", () => {
      this.requestLocation();
    });
    const e = document.getElementById("searchInput");
    let t;
    e?.addEventListener("input", (s) => {
      (clearTimeout(t),
        (t = setTimeout(() => {
          this.filterStations(s.target.value);
        }, 300)));
    });

    /*
    // Add filter chip interactivity (for next task)
    const filterChips = document.querySelectorAll(".filter-chip");
    filterChips.forEach((chip) => {
      chip.addEventListener("click", (e) => {
        // Remove active from all chips
        filterChips.forEach((c) => c.classList.remove("active"));
        // Add to clicked
        const target = e.target as HTMLElement;
        target.classList.add("active");

        // simple visual status update
        const filterStr = target.getAttribute("data-filter");
        this.updateStatus(`Filter applied: ${filterStr}`);

        if (filterStr === "near_me") {
          this.requestLocation();
        }
      });
    });
    */
  }
  async loadStations() {
    try {
      const t = await (await fetch("/api/stations")).json();
      ((this.allStations = Array.isArray(t) ? t : t.stations || []),
        (this.stations = [...this.allStations]),
        this.renderStations(),
        this.addStationMarkers());
    } catch {
      const t = document.getElementById("stationsList");
      t &&
        (t.innerHTML =
          '<div class="error">Failed to load stations. Please refresh the page.</div>');
    }
  }
  async requestLocation() {
    if (!navigator.geolocation) {
      this.updateStatus("Geolocation not supported");
      return;
    }
    const e = document.getElementById("locationBtn");
    (e && (e.disabled = !0), this.updateStatus("Getting your location..."));
    const t = { enableHighAccuracy: !0, timeout: 1e4, maximumAge: 3e5 };
    navigator.geolocation.getCurrentPosition(
      (s) => this.onLocationSuccess(s),
      (s) => this.onLocationError(s),
      t,
    );
  }
  async onLocationSuccess(e) {
    ((this.userLocation = { lat: e.coords.latitude, lng: e.coords.longitude }),
      this.userMarker && this.map.removeLayer(this.userMarker),
      (this.userMarker = L.circleMarker(
        [this.userLocation.lat, this.userLocation.lng],
        { color: "#28a745", fillColor: "#28a745", fillOpacity: 0.8, radius: 8 },
      ).addTo(this.map)),
      this.map.setView([this.userLocation.lat, this.userLocation.lng], 13),
      await this.loadStationsWithDistance());
    const t = document.getElementById("locationBtn");
    t && (t.disabled = !1);
  }
  onLocationError(e) {
    let t = "Location unavailable";
    switch (e.code) {
      case e.PERMISSION_DENIED:
        t = "Location permission denied";
        break;
      case e.POSITION_UNAVAILABLE:
        t = "Location unavailable";
        break;
      case e.TIMEOUT:
        t = "Location request timeout";
        break;
    }
    this.updateStatus(t);
    const s = document.getElementById("locationBtn");
    s && (s.disabled = !1);
  }
  async loadStationsWithDistance() {
    try {
      const e =
          "/api/stations?lat=" +
          this.userLocation.lat +
          "&lon=" +
          this.userLocation.lng,
        s = await (await fetch(e)).json();
      if (
        ((this.allStations = Array.isArray(s) ? s : s.stations || []),
        (this.stations = [...this.allStations]),
        this.stations.length > 0)
      ) {
        const a = this.stations[0];
        (this.updateStatus(
          "Nearest station: " + a.distance.toFixed(1) + "km away",
        ),
          this.highlightNearestStation(a));
      }
      (this.renderStations(), this.addStationMarkers());
    } catch {
      this.updateStatus("Failed to calculate distances");
    }
  }
  filterStations(e) {
    if (!e.trim()) this.stations = [...this.allStations];
    else {
      const t = e.toLowerCase();
      this.stations = this.allStations.filter(
        (s) =>
          (s.brand && s.brand.toLowerCase().includes(t)) ||
          (s.name_canonical && s.name_canonical.toLowerCase().includes(t)) ||
          (s.neighbourhood && s.neighbourhood.toLowerCase().includes(t)) ||
          (s.lga && s.lga.toLowerCase().includes(t)),
      );
    }
    (this.renderStations(),
      this.addStationMarkers(),
      e.trim()
        ? this.updateStatus(
            "Found " + this.stations.length + ' stations matching "' + e + '"',
          )
        : this.updateStatus("Showing all stations"));
  }
  highlightNearestStation(e) {
    this.markers.forEach((s) => {
      const a = s.getElement();
      a && a.classList.remove("nearest-marker");
    });
    const t = this.markers.find((s) => s.options.stationId === e.station_id);
    if (t) {
      const s = t.getElement();
      (s && s.classList.add("nearest-marker"),
        this.markerClusterGroup.zoomToShowLayer(t, () => {
          (this.map.setView([e.latitude, e.longitude], 15), t.openPopup());
        }));
    }
  }
  addStationMarkers() {
    (this.markerClusterGroup.clearLayers(),
      (this.markers = []),
      this.stations.forEach((e) => {
        const t = e.status || "unknown",
          q = e.queue ? e.queue.toLowerCase() : null;
        let a = "#9CA3AF"; // Default Grey

        if (t === "closed") {
          a = "#9CA3AF"; // Grey for closed
        } else if (q === "none" || q === "short" || q === "empty") {
          a = "#28a745"; // Green
        } else if (q === "medium") {
          a = "#FFBF00"; // Yellow
        } else if (q === "long") {
          a = "#dc3545"; // Red
        } else {
          a = "#9CA3AF"; // Fallback grey
        }

        const i = L.circleMarker([e.latitude, e.longitude], {
            color: a,
            fillColor: a,
            fillOpacity: 0.7,
            radius: 6,
            stationId: e.station_id,
            stationStatus: t,
            stationQueue: q,
          }),
          o = this.createPopupContent(e);
        (i.bindPopup(o),
          i.on("click", () => {
            this.map.setView([e.latitude, e.longitude], 15);
          }),
          this.markerClusterGroup.addLayer(i),
          this.markers.push(i));
      }));
  }
  createPopupContent(e) {
    const t = e.distance ? e.distance.toFixed(1) + "km away" : "",
      s = e.price ? "₦" + e.price.toFixed(2) : "Price not available",
      a = e.queue
        ? e.queue.charAt(0).toUpperCase() + e.queue.slice(1) + " queue"
        : "Queue unknown",
      i = e.fuel_availability
        ? e.fuel_availability.replace("_", " ")
        : "Fuel status unknown";
    return (
      "<div><strong>" +
      e.brand +
      "</strong><br>" +
      e.name_canonical +
      "<br>" +
      (t ? "<small>" + t + "</small><br>" : "") +
      "<small>" +
      s +
      " • " +
      a +
      "</small><br><small>Fuel: " +
      i +
      "</small></div>"
    );
  }
  renderStations() {
    const e = document.getElementById("stationsList");
    if (e) {
      if (this.stations.length === 0) {
        e.innerHTML = '<div class="error">No stations found</div>';
        return;
      }
      ((e.innerHTML = this.stations
        .map((t) => this.createStationCard(t))
        .join("")),
        e.querySelectorAll(".station-card").forEach((t, s) => {
          t.addEventListener("click", () => {
            const a = this.stations[s];
            this.map.setView([a.latitude, a.longitude], 15);
            const i = this.markers.find(
              (o) => o.options.stationId === a.station_id,
            );
            i && i.openPopup();
          });
        }));
    }
  }
  createStationCard(e) {
    const t = e.distance
        ? '<span class="badge badge-distance">' +
          e.distance.toFixed(1) +
          "km</span>"
        : "",
      s = e.status
        ? '<span class="badge badge-' +
          e.status +
          '">' +
          (e.status === "open" ? "Open" : "Closed") +
          "</span>"
        : "",
      a = e.queue
        ? '<span class="badge badge-queue-' +
          e.queue.toLowerCase() +
          '">' +
          (e.queue.toLowerCase() === "none" ||
          e.queue.toLowerCase() === "empty" ||
          e.queue.toLowerCase() === "short"
            ? "Short/None"
            : e.queue.charAt(0).toUpperCase() + e.queue.slice(1)) +
          " queue</span>"
        : "",
      i = e.fuel_availability
        ? '<span class="badge badge-fuel-' +
          e.fuel_availability.replace("_", "-") +
          '">' +
          e.fuel_availability.replace("_", " ") +
          "</span>"
        : "",
      o = e.price ? "₦" + e.price.toFixed(2) : "Price not available",
      r = e.last_updated
        ? "Updated " + this.timeAgo(new Date(e.last_updated))
        : "No reports yet";
    return (
      '<div class="station-card"><div class="station-header"><div><div class="station-brand">' +
      e.brand +
      '</div><div class="station-name">' +
      e.name_canonical +
      '</div></div></div><div class="station-location">' +
      (e.neighbourhood || "") +
      ", " +
      (e.lga || "") +
      '</div><div class="station-badges">' +
      [t, s, a, i].filter(Boolean).join("") +
      '</div><div class="station-price">' +
      o +
      '</div><div class="station-updated">' +
      r +
      "</div></div>"
    );
  }
  updateStatus(e) {
    const t = document.getElementById("statusText");
    t && (t.textContent = e);
  }
  timeAgo(e) {
    const s = new Date().getTime() - e.getTime(),
      a = Math.floor(s / 6e4),
      i = Math.floor(a / 60),
      o = Math.floor(i / 24);
    return a < 1
      ? "just now"
      : a < 60
        ? a + " mins ago"
        : i < 24
          ? i + " hours ago"
          : o + " days ago";
  }
  startTimeUpdater() {
    setInterval(() => {
      document.querySelectorAll(".station-updated").forEach((t, s) => {
        if (this.stations[s] && this.stations[s].last_updated) {
          const a = this.timeAgo(new Date(this.stations[s].last_updated));
          t.textContent = "Updated " + a;
        }
      });
    }, 6e4);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  if ((console.log("DOM loaded, checking Leaflet..."), typeof L > "u")) {
    console.error("Leaflet library not loaded!");
    return;
  }
  (console.log("Leaflet loaded, initializing app..."),
    setTimeout(() => {
      new g();
    }, 200));
});

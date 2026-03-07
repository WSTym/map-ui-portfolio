declare const L: any;

class FuelStationTracker {
  map: any = null;
  userLocation: any = null;
  stations: any[] = [];
  markers: any[] = [];
  userMarker: any = null;
  nearestMarker: any = null;
  markerClusterGroup: any = null;
  allStations: any[] = []; // Store all stations for filtering
  filteredStations: any[] = [];

  constructor() {
    this.initMap();
    this.loadStations();
    this.setupEventListeners();
    this.startTimeUpdater();
  }

  initMap() {
    console.log("Initializing map...");

    const mapElement = document.getElementById("map");
    if (!mapElement) {
      console.error("Map element not found!");
      return;
    }

    console.log("Map element found, creating Leaflet map...");

    try {
      // Center on Lagos
      this.map = L.map("map").setView([6.5244, 3.3792], 11);

      console.log("Map created, adding tile layer...");

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20,
        },
      ).addTo(this.map);

      console.log("Tile layer added, map should be visible");

      // Initialize marker cluster group with custom icon function
      this.markerClusterGroup = L.markerClusterGroup({
        iconCreateFunction: (cluster: any) => this.createClusterIcon(cluster),
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 50,
      });

      this.map.addLayer(this.markerClusterGroup);

      // Force map resize after a short delay to ensure proper rendering
      setTimeout(() => {
        if (this.map) {
          this.map.invalidateSize();
          console.log("Map size invalidated");
        }
      }, 100);
    } catch (error) {
      console.error("Error initializing map:", error);
    }
  }

  createClusterIcon(cluster: any) {
    const markers = cluster.getAllChildMarkers();
    const total = markers.length;

    // Count stations by status and fuel availability
    let openCount = 0;
    let closedCount = 0;
    let unknownCount = 0;
    let limitedFuelCount = 0;

    markers.forEach((marker: any) => {
      const status = marker.options.stationStatus;
      const fuelAvailability = marker.options.fuelAvailability;

      if (status === "open") {
        if (fuelAvailability === "limited") {
          limitedFuelCount++;
        } else {
          openCount++;
        }
      } else if (status === "closed") {
        closedCount++;
      } else {
        unknownCount++;
      }
    });

    // Determine dominant status (>50% threshold)
    let clusterClass = "marker-cluster-mixed";
    const openPercent = openCount / total;
    const closedPercent = closedCount / total;
    const limitedPercent = limitedFuelCount / total;
    const unknownPercent = unknownCount / total;

    if (openPercent > 0.5) {
      clusterClass = "marker-cluster-open";
    } else if (closedPercent > 0.5) {
      clusterClass = "marker-cluster-closed";
    } else if (limitedPercent > 0.5) {
      clusterClass = "marker-cluster-limited";
    } else if (unknownPercent > 0.5) {
      clusterClass = "marker-cluster-unknown";
    }

    return L.divIcon({
      html: "<div>" + total + "</div>",
      className: "marker-cluster " + clusterClass,
      iconSize: L.point(40, 40),
    });
  }

  setupEventListeners() {
    document.getElementById("locationBtn")?.addEventListener("click", () => {
      this.requestLocation();
    });

    // Search functionality
    const searchInput = document.getElementById(
      "searchInput",
    ) as HTMLInputElement;
    let searchTimeout: any;
    searchInput?.addEventListener("input", (e: any) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.filterStations(e.target.value);
      }, 300); // Debounce search
    });
  }

  async loadStations() {
    try {
      const response = await fetch("/api/stations");
      const data = await response.json();
      this.allStations = data.stations || [];
      this.stations = [...this.allStations];
      this.renderStations();
      this.addStationMarkers();
    } catch (error) {
      const list = document.getElementById("stationsList");
      if (list)
        list.innerHTML =
          '<div class="error">Failed to load stations. Please refresh the page.</div>';
    }
  }

  async requestLocation() {
    if (!navigator.geolocation) {
      this.updateStatus("Geolocation not supported");
      return;
    }

    const btn = document.getElementById("locationBtn") as HTMLButtonElement;
    if (btn) btn.disabled = true;
    this.updateStatus("Getting your location...");

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000, // 5 minutes
    };

    navigator.geolocation.getCurrentPosition(
      (position) => this.onLocationSuccess(position),
      (error) => this.onLocationError(error),
      options,
    );
  }

  async onLocationSuccess(position: any) {
    this.userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };

    // Add user marker
    if (this.userMarker) {
      this.map.removeLayer(this.userMarker);
    }

    this.userMarker = L.circleMarker(
      [this.userLocation.lat, this.userLocation.lng],
      {
        color: "#28a745",
        fillColor: "#28a745",
        fillOpacity: 0.8,
        radius: 8,
      },
    ).addTo(this.map);

    // Recenter map on user
    this.map.setView([this.userLocation.lat, this.userLocation.lng], 13);

    // Reload stations with distance calculation
    await this.loadStationsWithDistance();

    const btn = document.getElementById("locationBtn") as HTMLButtonElement;
    if (btn) btn.disabled = false;
  }

  onLocationError(error: any) {
    let message = "Location unavailable";
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = "Location permission denied";
        break;
      case error.POSITION_UNAVAILABLE:
        message = "Location unavailable";
        break;
      case error.TIMEOUT:
        message = "Location request timeout";
        break;
    }
    this.updateStatus(message);
    const btn = document.getElementById("locationBtn") as HTMLButtonElement;
    if (btn) btn.disabled = false;
  }

  async loadStationsWithDistance() {
    try {
      const url =
        "/api/stations?lat=" +
        this.userLocation.lat +
        "&lon=" +
        this.userLocation.lng;
      const response = await fetch(url);
      const data = await response.json();
      this.allStations = data.stations || [];
      this.stations = [...this.allStations]; // Copy for display

      if (this.stations.length > 0) {
        const nearest = this.stations[0];
        this.updateStatus(
          "Nearest station: " + nearest.distance.toFixed(1) + "km away",
        );
        this.highlightNearestStation(nearest);
      }

      this.renderStations();
      this.addStationMarkers();
    } catch (error) {
      this.updateStatus("Failed to calculate distances");
    }
  }

  filterStations(searchTerm: string) {
    if (!searchTerm.trim()) {
      // Show all stations if search is empty
      this.stations = [...this.allStations];
    } else {
      // Filter stations by search term
      const term = searchTerm.toLowerCase();
      this.stations = this.allStations.filter((station) => {
        return (
          (station.brand && station.brand.toLowerCase().includes(term)) ||
          (station.name_canonical &&
            station.name_canonical.toLowerCase().includes(term)) ||
          (station.neighbourhood &&
            station.neighbourhood.toLowerCase().includes(term)) ||
          (station.lga && station.lga.toLowerCase().includes(term))
        );
      });
    }

    // Update display
    this.renderStations();
    this.addStationMarkers();

    // Update status
    if (searchTerm.trim()) {
      this.updateStatus(
        "Found " +
          this.stations.length +
          ' stations matching "' +
          searchTerm +
          '"',
      );
    } else {
      this.updateStatus("Showing all stations");
    }
  }

  highlightNearestStation(station: any) {
    // Remove previous nearest marker highlight
    this.markers.forEach((marker) => {
      const element = marker.getElement();
      if (element) {
        element.classList.remove("nearest-marker");
      }
    });

    // Find and highlight the nearest station marker
    const nearestMarker = this.markers.find(
      (marker) => marker.options.stationId === station.station_id,
    );

    if (nearestMarker) {
      const element = nearestMarker.getElement();
      if (element) {
        element.classList.add("nearest-marker");
      }

      // If marker is in a cluster, expand the cluster to show individual markers
      this.markerClusterGroup.zoomToShowLayer(nearestMarker, () => {
        // Focus on the marker after cluster expansion
        this.map.setView([station.latitude, station.longitude], 15);
        nearestMarker.openPopup();
      });
    }
  }

  addStationMarkers() {
    // Clear existing markers from cluster group
    this.markerClusterGroup.clearLayers();
    this.markers = [];

    this.stations.forEach((station) => {
      const status = station.status || "unknown";
      const fuelAvailability = station.fuel_availability;
      let color = "#9CA3AF"; // grey for unknown status

      if (status === "open") {
        // Check fuel availability for open stations
        if (fuelAvailability === "limited") {
          color = "#FFBF00"; // amber for limited fuel
        } else {
          color = "#28a745"; // green for open
        }
      } else if (status === "closed") {
        color = "#dc3545"; // red for closed
      }

      const marker = L.circleMarker([station.latitude, station.longitude], {
        color: color,
        fillColor: color,
        fillOpacity: 0.7,
        radius: 6,
        stationId: station.station_id,
        stationStatus: status, // Store status for clustering
        fuelAvailability: fuelAvailability, // Store fuel availability
      });

      const popupContent = this.createPopupContent(station);
      marker.bindPopup(popupContent);

      marker.on("click", () => {
        this.map.setView([station.latitude, station.longitude], 15);
        this.scrollToStationInList(station.station_id);
      });

      // Add to cluster group instead of directly to map
      this.markerClusterGroup.addLayer(marker);
      this.markers.push(marker);
    });
  }

  createPopupContent(station: any) {
    const distance = station.distance
      ? station.distance.toFixed(1) + "km away"
      : "";
    const price = station.price
      ? "₦" + station.price.toFixed(2)
      : "Price not available";
    const queue = station.queue
      ? station.queue.charAt(0).toUpperCase() +
        station.queue.slice(1) +
        " queue"
      : "Queue unknown";
    const fuel = station.fuel_availability
      ? station.fuel_availability.replace("_", " ")
      : "Fuel status unknown";

    return (
      "<div>" +
      "<strong>" +
      station.brand +
      "</strong><br>" +
      station.name_canonical +
      "<br>" +
      (distance ? "<small>" + distance + "</small><br>" : "") +
      "<small>" +
      price +
      " • " +
      queue +
      "</small><br>" +
      "<small>Fuel: " +
      fuel +
      "</small>" +
      "</div>"
    );
  }

  renderStations(stationsToRender = this.stations) {
    const container = document.getElementById("stationsList");
    if (!container) return;

    if (stationsToRender.length === 0) {
      container.innerHTML =
        '<div class="error">No stations found in this area</div>';
      return;
    }

    container.innerHTML = stationsToRender
      .map((station) => this.createStationCard(station))
      .join("");

    // Add click listeners to cards
    container.querySelectorAll(".station-card").forEach((card, index) => {
      // Create ID using canonical name or ID to allow scrolling to it later
      const station = stationsToRender[index];
      card.id = `station-card-${station.station_id}`;

      card.addEventListener("click", () => {
        // Highlight active card
        container
          .querySelectorAll(".station-card")
          .forEach((c) => c.classList.remove("active-card"));
        card.classList.add("active-card");

        // Find marker
        const marker = this.markers.find(
          (m) => m.options.stationId === station.station_id,
        );

        if (marker) {
          if (this.markerClusterGroup) {
            this.markerClusterGroup.zoomToShowLayer(marker, () => {
              this.map.setView([station.latitude, station.longitude], 16);
              marker.openPopup();
            });
          } else {
            this.map.setView([station.latitude, station.longitude], 16);
            marker.openPopup();
          }
        } else {
          this.map.setView([station.latitude, station.longitude], 16);
        }
      });
    });
  }

  scrollToStationInList(stationId: string | number) {
    const cardId = `station-card-${stationId}`;
    const card = document.getElementById(cardId);
    if (card) {
      // Highlight
      document
        .querySelectorAll(".station-card")
        .forEach((c) => c.classList.remove("active-card"));
      card.classList.add("active-card");
      // Scroll into view
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  createStationCard(station: any) {
    const distance = station.distance
      ? '<span class="badge badge-distance">' +
        station.distance.toFixed(1) +
        "km</span>"
      : "";

    const status = station.status
      ? '<span class="badge badge-' +
        station.status +
        '">' +
        (station.status === "open" ? "Open" : "Closed") +
        "</span>"
      : "";

    const queue = station.queue
      ? '<span class="badge badge-queue-' +
        station.queue +
        '">' +
        (station.queue
          ? station.queue.charAt(0).toUpperCase() + station.queue.slice(1)
          : "") +
        " queue</span>"
      : "";

    const fuel = station.fuel_availability
      ? '<span class="badge badge-fuel-' +
        station.fuel_availability.replace("_", "-") +
        '">' +
        station.fuel_availability.replace("_", " ") +
        "</span>"
      : "";

    const price = station.price
      ? "₦" + station.price.toFixed(2)
      : "Price not available";

    const timeAgo = station.last_updated
      ? "Updated " + this.timeAgo(new Date(station.last_updated))
      : "No reports yet";

    return (
      '<div class="station-card">' +
      '<div class="station-header">' +
      "<div>" +
      '<div class="station-brand">' +
      station.brand +
      "</div>" +
      '<div class="station-name">' +
      station.name_canonical +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="station-location">' +
      (station.neighbourhood || "") +
      ", " +
      (station.lga || "") +
      "</div>" +
      '<div class="station-badges">' +
      [distance, status, queue, fuel].filter(Boolean).join("") +
      "</div>" +
      '<div class="station-price">' +
      price +
      "</div>" +
      '<div class="station-updated">' +
      timeAgo +
      "</div>" +
      "</div>"
    );
  }

  updateStatus(text: string) {
    const elem = document.getElementById("statusText");
    if (elem) elem.textContent = text;
  }

  timeAgo(date: Date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return diffMins + " mins ago";
    if (diffHours < 24) return diffHours + " hours ago";
    return diffDays + " days ago";
  }

  startTimeUpdater() {
    setInterval(() => {
      // Update time ago text for all stations
      const cards = document.querySelectorAll(".station-updated");
      cards.forEach((element, index) => {
        if (this.stations[index] && this.stations[index].last_updated) {
          const timeAgo = this.timeAgo(
            new Date(this.stations[index].last_updated),
          );
          element.textContent = "Updated " + timeAgo;
        }
      });
    }, 60000);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, checking Leaflet...");

  if (typeof L === "undefined") {
    console.error("Leaflet library not loaded!");
    return;
  }

  console.log("Leaflet loaded, initializing app...");

  // Wait a bit more for all resources to be ready
  setTimeout(() => {
    new FuelStationTracker();
  }, 200);
});

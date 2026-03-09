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
  searchTerm: string = "";
  activeFilter: string = "All"; // Active chip filter

  // Bottom sheet state
  sidebar: HTMLElement | null = null;
  dragHandle: HTMLElement | null = null;
  startY: number = 0;
  currentY: number = 0;
  isDragging: boolean = false;
  sheetState: "collapsed" | "half" | "expanded" = "collapsed";
  minTransform: number = 0;
  halfTransform: number = 0;
  maxTransform: number = 0;

  // TS type removed

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

    // Count stations by queue status (M1 spec)
    let shortNoneEmptyQueueCount = 0;
    let mediumQueueCount = 0;
    let longQueueCount = 0;
    let closedUnknownCount = 0;

    markers.forEach((marker: any) => {
      const status = marker.options.stationStatus;
      const queue = marker.options.queueStatus;

      if (status !== "closed") {
        if (queue === "long") {
          longQueueCount++;
        } else if (queue === "medium") {
          mediumQueueCount++;
        } else if (queue === "short" || queue === "none" || queue === "empty") {
          shortNoneEmptyQueueCount++;
        } else {
          closedUnknownCount++; // Treat unknown queue as closed/unknown for clustering
        }
      } else {
        closedUnknownCount++; // Closed stations
      }
    });

    // Determine dominant queue status for cluster color
    let colorClass = "unknown"; // Default grey
    const longPercent = longQueueCount / total;
    const mediumPercent = mediumQueueCount / total;
    const shortNoneEmptyPercent = shortNoneEmptyQueueCount / total;
    const closedUnknownPercent = closedUnknownCount / total;

    if (shortNoneEmptyPercent > 0.5) {
      colorClass = "open"; // Green
    } else if (mediumPercent > 0.5) {
      colorClass = "limited"; // Yellow
    } else if (longPercent > 0.5) {
      colorClass = "closed"; // Red
    } else if (closedUnknownPercent > 0.5) {
      colorClass = "unknown"; // Grey
    }

    return L.divIcon({
      html: `<div><span>${total}</span></div>`,
      className: `marker-cluster marker-cluster-${colorClass}`,
      iconSize: L.point(40, 40),
    });
  }

  setupEventListeners() {
    this.setupBottomSheet();

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

    // Map bounds updates
    if (this.map) {
      this.map.on("moveend", () => {
        this.updateListFromBounds();
      });
      this.map.on("zoomend", () => {
        this.updateListFromBounds();
      });
    }

    // Filter Chips functionality
    const filterChips = document.querySelectorAll(".filter-chip");
    filterChips.forEach((chip) => {
      chip.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        const filterName = target.textContent?.trim() || "All";

        // Update UI
        filterChips.forEach((c) => c.classList.remove("active"));
        target.classList.add("active");

        // Apply filter logic
        if (filterName === "Near Me") {
          this.activeFilter = filterName;
          this.requestLocation(); // Call existing geolocation method
        } else {
          this.activeFilter = filterName;
          this.applyFilters();
        }
      });
    });
  }

  setupBottomSheet() {
    this.sidebar = document.getElementById("sidebar");
    this.dragHandle = document.getElementById("dragHandle");

    if (!this.sidebar || !this.dragHandle) return;

    const isMobile = () => window.innerWidth <= 768;

    let initialTransform = 0;
    let lastDragTime = 0;

    const calculateTransforms = () => {
      if (!this.sidebar) return;
      const windowHeight = window.innerHeight;
      const sheetHeight = windowHeight * 0.85; // matches 85vh in CSS

      this.maxTransform = 0; // fully expanded
      this.halfTransform = sheetHeight - windowHeight * 0.5; // half

      const header = this.sidebar.querySelector(".header") as HTMLElement;
      const dragHandleHeight = 24;
      // Estimate header height around 180 if not rendered yet
      const headerHeight = header ? header.offsetHeight : 180;
      const visibleHeight = headerHeight + dragHandleHeight;

      this.minTransform = sheetHeight - visibleHeight;

      this.snapToState(this.sheetState);
    };

    window.addEventListener("resize", () => {
      if (isMobile()) {
        calculateTransforms();
      } else if (this.sidebar) {
        this.sidebar.style.transform = ""; // Reset for desktop
      }
    });

    if (isMobile()) {
      setTimeout(calculateTransforms, 150);
    }

    const onHeaderClick = (e: Event) => {
      if (!isMobile()) return;
      // Prevent click action if user just dragged
      if (Date.now() - lastDragTime < 200) return;

      const target = e.target as HTMLElement;
      // Don't toggle if clicking input or buttons inside header
      if (
        target.closest("input") ||
        target.closest("button") ||
        target.closest(".filter-chip")
      ) {
        return;
      }

      let newState: "collapsed" | "half" | "expanded" = "half";
      if (this.sheetState === "collapsed") {
        newState = "half";
      } else if (this.sheetState === "half") {
        newState = "expanded";
      } else {
        newState = "collapsed";
      }
      this.snapToState(newState);
    };

    const header = this.sidebar.querySelector(".header");
    if (header) {
      header.addEventListener("click", onHeaderClick);
    }

    const onTouchStart = (e: TouchEvent) => {
      if (!isMobile() || !this.sidebar) return;

      const target = e.target as HTMLElement;
      const isHeader = target.closest(".header");
      const isHandle = target.closest(".drag-handle");

      if (!isHandle && !isHeader) {
        const stationsList = this.sidebar.querySelector(".stations-container");
        if (stationsList && stationsList.scrollTop > 0) {
          return;
        }
      }

      this.isDragging = true;
      this.sidebar.style.transition = "none";
      this.startY = e.touches[0].clientY;
      initialTransform = this.currentY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!this.isDragging || !isMobile() || !this.sidebar) return;

      const stationsList = this.sidebar.querySelector(".stations-container");
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - this.startY;

      if (Math.abs(deltaY) > 5) {
        lastDragTime = Date.now();
      }

      if (stationsList && stationsList.scrollTop > 0 && deltaY < 0) {
        return;
      }

      if (stationsList && stationsList.scrollTop <= 0 && deltaY > 0) {
        if (e.cancelable) e.preventDefault();
      } else if (
        e.target !== stationsList &&
        !stationsList?.contains(e.target as Node)
      ) {
        if (e.cancelable) e.preventDefault();
      }

      let newTransform = initialTransform + deltaY;

      if (newTransform < this.maxTransform - 20) {
        newTransform = this.maxTransform - 20;
      } else if (newTransform > this.minTransform + 20) {
        newTransform = this.minTransform + 20;
      }

      this.currentY = newTransform;
      this.sidebar.style.transform = `translateY(${newTransform}px)`;
    };

    const onTouchEnd = () => {
      if (!this.isDragging || !isMobile() || !this.sidebar) return;
      this.isDragging = false;
      this.sidebar.style.transition =
        "transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)";

      const distanceToMax = Math.abs(this.currentY - this.maxTransform);
      const distanceToHalf = Math.abs(this.currentY - this.halfTransform);
      const distanceToMin = Math.abs(this.currentY - this.minTransform);
      const minDistance = Math.min(
        distanceToMax,
        distanceToHalf,
        distanceToMin,
      );

      let newState: "collapsed" | "half" | "expanded" = this.sheetState;
      const deltaY = this.currentY - initialTransform;

      if (Math.abs(deltaY) > 50) {
        if (deltaY > 0) {
          if (this.sheetState === "expanded") newState = "half";
          else if (this.sheetState === "half") newState = "collapsed";
        } else {
          if (this.sheetState === "collapsed") newState = "half";
          else if (this.sheetState === "half") newState = "expanded";
        }
      } else {
        if (minDistance === distanceToMax) newState = "expanded";
        if (minDistance === distanceToHalf) newState = "half";
        if (minDistance === distanceToMin) newState = "collapsed";
      }

      this.snapToState(newState);
    };

    this.sidebar.addEventListener("touchstart", onTouchStart, {
      passive: false,
    });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
  }

  snapToState(state: "collapsed" | "half" | "expanded") {
    if (!this.sidebar) return;
    this.sheetState = state;
    let targetTransform = this.minTransform;

    if (state === "expanded") targetTransform = this.maxTransform;
    if (state === "half") targetTransform = this.halfTransform;
    if (state === "collapsed") targetTransform = this.minTransform;

    this.currentY = targetTransform;
    this.sidebar.style.transform = `translateY(${targetTransform}px)`;

    setTimeout(() => {
      if (this.map) this.map.invalidateSize();
    }, 300);
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

      this.applyFilters(); // Re-apply existing text/chip filters on nearest locations
    } catch (error) {
      this.updateStatus("Failed to calculate distances");
    }
  }

  filterStations(searchTerm: string) {
    this.searchTerm = searchTerm;
    this.applyFilters();
  }

  applyFilters() {
    let currentStations = [...this.allStations];

    // 1. Text Search Filter
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      currentStations = currentStations.filter((station) => {
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

    // 2. Chip Filter (Short Queue, Open)
    if (this.activeFilter === "Short Queue") {
      currentStations = currentStations.filter(
        (s) => s.queue === "none" || s.queue === "short" || s.queue === "empty",
      );
    } else if (this.activeFilter === "Open") {
      currentStations = currentStations.filter((s) => s.status === "open");
    }

    // 3. Near Me Sort
    if (
      this.userLocation &&
      currentStations.length > 0 &&
      currentStations[0].distance !== undefined
    ) {
      currentStations.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    this.stations = currentStations;

    // Update markers globally
    this.addStationMarkers();

    // Update visual list based on map bounds
    this.updateListFromBounds();
  }

  updateListFromBounds() {
    if (!this.map) return;

    try {
      const bounds = this.map.getBounds();

      // Filter the actively filtered stations by current map bounds for the UI List
      const visibleStations = this.stations.filter((station) => {
        if (!station.latitude || !station.longitude) return false;
        const latLng = L.latLng(station.latitude, station.longitude);
        return bounds.contains(latLng);
      });

      this.renderStations(visibleStations);

      // Update Top Status Message
      if (this.searchTerm.trim() || this.activeFilter !== "All") {
        this.updateStatus(
          "Showing " +
            visibleStations.length +
            " stations matching filters in this area",
        );
      } else if (visibleStations.length !== this.stations.length) {
        this.updateStatus(
          "Showing " + visibleStations.length + " stations in this area",
        );
      } else {
        this.updateStatus("Showing all stations");
      }
    } catch (e) {
      console.error("Error updating list from bounds:", e);
      this.renderStations(this.stations);
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
      const queue = station.queue;
      let color = "#9CA3AF"; // grey for unknown/closed status

      if (status !== "closed") {
        if (queue === "long") {
          color = "#dc3545"; // red
        } else if (queue === "medium") {
          color = "#FFBF00"; // amber/yellow
        } else if (queue === "short" || queue === "none" || queue === "empty") {
          color = "#28a745"; // green
        }
      }

      const marker = L.circleMarker([station.latitude, station.longitude], {
        color: color,
        fillColor: color,
        fillOpacity: 0.7,
        radius: 6,
        stationId: station.station_id,
        stationStatus: status, // Store status for clustering
        queueStatus: queue, // Store queue logic for clustering
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

        // Mobile snap to collapsed
        if (window.innerWidth <= 768) {
          // Add a small delay so other UI interactions don't override the state
          setTimeout(() => {
            if (this.sidebar) {
              this.snapToState("collapsed");
              // Explicitly set the transform to ensure it moves all the way down
              this.sidebar.style.transform = `translateY(${this.minTransform}px)`;
              this.currentY = this.minTransform;
            }
          }, 50);
        }

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

// Paris Trip Journal — interactivity: map, journal entries, photo upload, add-a-place.

const HOTEL = { lat: 48.8698, lng: 2.3533, name: "Hotel Aulivia Opéra" };
const IDENTITY_KEY = "paris_journal_identity";

let supabaseClient = null;
if (
  window.supabase &&
  typeof SUPABASE_URL === "string" &&
  typeof SUPABASE_ANON_KEY === "string" &&
  !SUPABASE_URL.includes("YOUR_") &&
  !SUPABASE_ANON_KEY.includes("YOUR_")
) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let map = null;

// ───────────────────────── helpers ─────────────────────────

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmtTimestamp(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function backendUnavailable(statusEl) {
  if (statusEl) {
    statusEl.textContent = "Backend isn't connected yet — config.js still has placeholder Supabase credentials.";
    statusEl.className = "add-place-status error";
  }
}

// ───────────────────────── identity ─────────────────────────

function getIdentity() {
  return localStorage.getItem(IDENTITY_KEY);
}

function setIdentity(name) {
  localStorage.setItem(IDENTITY_KEY, name);
  const label = document.getElementById("whoami-name");
  if (label) label.textContent = name;
}

function ensureIdentity() {
  const name = getIdentity();
  const label = document.getElementById("whoami-name");
  if (name && label) {
    label.textContent = name;
  } else {
    showIdentityModal();
  }
}

function showIdentityModal() {
  document.getElementById("identity-modal").hidden = false;
}

function hideIdentityModal() {
  document.getElementById("identity-modal").hidden = true;
}

function initIdentityModal() {
  document.getElementById("whoami-change").addEventListener("click", showIdentityModal);

  document.querySelectorAll(".identity-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      setIdentity(btn.dataset.name);
      hideIdentityModal();
    });
  });

  document.getElementById("identity-other-btn").addEventListener("click", () => {
    const input = document.getElementById("identity-other-input");
    const val = input.value.trim();
    if (val) {
      setIdentity(val);
      input.value = "";
      hideIdentityModal();
    }
  });
}

// ───────────────────────── lightbox ─────────────────────────

function initLightbox() {
  const lightbox = document.getElementById("lightbox");
  lightbox.addEventListener("click", () => { lightbox.hidden = true; });
}

function openLightbox(src) {
  document.getElementById("lightbox-img").src = src;
  document.getElementById("lightbox").hidden = false;
}

// ───────────────────────── image compression ─────────────────────────

function compressImage(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
          "image/jpeg",
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ───────────────────────── journal (comments) ─────────────────────────

function buildJournalUI(pinEl, pinId, pinName) {
  pinEl.id = "pin-" + pinId;

  const journal = document.createElement("div");
  journal.className = "journal";
  journal.innerHTML = `
    <button class="journal-toggle" type="button">Journal &amp; photos <span class="journal-count"></span></button>
    <div class="journal-body" hidden>
      <div class="journal-entries"><div class="journal-empty">Loading…</div></div>
      <form class="journal-form">
        <textarea rows="2" placeholder="Add a note…"></textarea>
        <input type="file" accept="image/*" capture="environment">
        <button type="submit">Post</button>
      </form>
    </div>
  `;

  const pinRight = pinEl.querySelector(".pin-right") || pinEl;
  pinRight.appendChild(journal);

  const toggle = journal.querySelector(".journal-toggle");
  const body = journal.querySelector(".journal-body");
  let loaded = false;

  toggle.addEventListener("click", async () => {
    body.hidden = !body.hidden;
    toggle.classList.remove("has-new");
    if (!body.hidden && !loaded) {
      loaded = true;
      await loadComments(pinId, journal);
    }
  });

  journal.querySelector(".journal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await postComment(pinId, pinName, journal, e.target);
  });

  return journal;
}

async function loadComments(pinId, journalEl) {
  const entriesEl = journalEl.querySelector(".journal-entries");
  const countEl = journalEl.querySelector(".journal-count");

  if (!supabaseClient) {
    entriesEl.innerHTML = '<div class="journal-empty">Backend not connected yet.</div>';
    return;
  }

  const { data, error } = await supabaseClient
    .from("paris_comments")
    .select("*")
    .eq("pin_id", String(pinId))
    .order("created_at", { ascending: true });

  if (error) {
    entriesEl.innerHTML = '<div class="journal-empty">Couldn\'t load notes — check connection.</div>';
    return;
  }

  renderComments(entriesEl, countEl, data || []);
}

function renderComments(entriesEl, countEl, data) {
  if (countEl) countEl.textContent = data.length ? `(${data.length})` : "";

  if (!data.length) {
    entriesEl.innerHTML = '<div class="journal-empty">No notes yet — be the first.</div>';
    return;
  }

  entriesEl.innerHTML = data
    .map((c) => `
      <div class="journal-entry">
        <div class="journal-entry-meta"><strong>${escapeHtml(c.author)}</strong> · ${fmtTimestamp(c.created_at)}</div>
        ${c.comment_text ? `<div>${escapeHtml(c.comment_text)}</div>` : ""}
        ${c.photo_url ? `<img class="journal-entry-photo" src="${escapeHtml(c.photo_url)}" alt="">` : ""}
      </div>
    `)
    .join("");

  entriesEl.querySelectorAll(".journal-entry-photo").forEach((img) => {
    img.addEventListener("click", () => openLightbox(img.src));
  });
}

async function postComment(pinId, pinName, journalEl, form) {
  if (!supabaseClient) {
    alert("Backend isn't connected yet — config.js still has placeholder Supabase credentials.");
    return;
  }

  const author = getIdentity();
  if (!author) {
    showIdentityModal();
    return;
  }

  const textarea = form.querySelector("textarea");
  const fileInput = form.querySelector('input[type="file"]');
  const text = textarea.value.trim();
  const file = fileInput.files[0];

  if (!text && !file) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Posting…";

  try {
    let photo_url = null;
    if (file) {
      const blob = await compressImage(file);
      const path = `${pinId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upErr } = await supabaseClient.storage
        .from("paris-photos")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: pub } = supabaseClient.storage.from("paris-photos").getPublicUrl(path);
      photo_url = pub.publicUrl;
    }

    const { error: insErr } = await supabaseClient.from("paris_comments").insert({
      pin_id: String(pinId),
      pin_name: pinName,
      author,
      comment_text: text || null,
      photo_url,
    });
    if (insErr) throw insErr;

    textarea.value = "";
    fileInput.value = "";
    await loadComments(pinId, journalEl);
  } catch (err) {
    console.error(err);
    alert("Couldn't post that — check your connection and try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Post";
  }
}

// ───────────────────────── map ─────────────────────────

function hotelIcon() {
  return L.divIcon({ className: "hotel-marker", html: "🏨", iconSize: [24, 24] });
}

function jumpToPin(id) {
  const target = document.getElementById("pin-" + id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  const journal = target.querySelector(".journal");
  if (journal) {
    const body = journal.querySelector(".journal-body");
    if (body && body.hidden) journal.querySelector(".journal-toggle").click();
  }
}

function initMap() {
  map = L.map("map", { scrollWheelZoom: false }).setView([HOTEL.lat, HOTEL.lng], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  L.marker([HOTEL.lat, HOTEL.lng], { icon: hotelIcon() })
    .addTo(map)
    .bindPopup(`<b>${escapeHtml(HOTEL.name)}</b><br>Home base`);

  document.querySelectorAll(".pin[data-pin-id]").forEach((pinEl) => {
    const id = pinEl.dataset.pinId;
    const lat = parseFloat(pinEl.dataset.lat);
    const lng = parseFloat(pinEl.dataset.lng);
    const name = pinEl.dataset.pinName;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const marker = L.circleMarker([lat, lng], {
      radius: 8, weight: 2, color: "#b86a6a", fillColor: "#b86a6a", fillOpacity: 0.7,
    }).addTo(map);
    marker.bindPopup(`<b>${escapeHtml(id)}. ${escapeHtml(name)}</b>`);
    marker.on("click", () => jumpToPin(id));
  });
}

function addPinMarker(pin) {
  if (!map) return;
  const marker = L.circleMarker([pin.lat, pin.lng], {
    radius: 8, weight: 2, color: "#5e8c76", fillColor: "#5e8c76", fillOpacity: 0.75,
  }).addTo(map);
  const notes = pin.notes ? `<br>${escapeHtml(pin.notes)}` : "";
  marker.bindPopup(`<b>${escapeHtml(pin.name)}</b>${notes}`);
  marker.on("click", () => jumpToPin(pin.id));
}

// ───────────────────────── added-during-trip pins ─────────────────────────

function addNewPinToPage(pin) {
  if (document.getElementById("pin-" + pin.id)) return;

  document.getElementById("added-pins-head").hidden = false;

  const card = document.createElement("div");
  card.className = "pin";
  card.dataset.pinId = pin.id;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`;
  const when = pin.created_at ? fmtTimestamp(pin.created_at) : "";

  card.innerHTML = `
    <div class="pin-left"><div class="pin-num c-sage">+</div><div class="pin-vline"></div></div>
    <div class="pin-right">
      <div class="pin-name">${escapeHtml(pin.name)}</div>
      <div class="pin-coords">
        ${pin.lat.toFixed(4)}°N, ${pin.lng.toFixed(4)}°E ·
        <a href="${mapsUrl}" target="_blank" rel="noopener">Google Maps</a>
      </div>
      <div class="pin-meta-row">
        <span class="pin-dist">Added by ${escapeHtml(pin.added_by)}${when ? " · " + when : ""}</span>
      </div>
      ${pin.notes ? `<p class="pin-desc">${escapeHtml(pin.notes)}</p>` : ""}
    </div>
  `;

  document.getElementById("added-pins").appendChild(card);
  buildJournalUI(card, pin.id, pin.name);
  addPinMarker(pin);
}

async function loadExistingNewPins() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("paris_pins")
    .select("*")
    .order("created_at", { ascending: true });
  if (error || !data) return;
  data.forEach(addNewPinToPage);
}

// ───────────────────────── add a place ─────────────────────────

const PARIS_VIEWBOX = "2.224,48.902,2.470,48.815"; // lon/lat box covering central Paris

function extractLatLngFromUrl(text) {
  const patterns = [
    /[@](-?\d+\.\d+),(-?\d+\.\d+)/,            // .../@48.86,2.33,17z
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,         // ?q=48.86,2.33
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,        // Apple Maps ll=lat,lng
    /[?&]daddr=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,          // Google place data param (lat, lng)
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  return null;
}

function extractNameFromUrl(text) {
  const m = text.match(/\/maps\/place\/([^/@]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].replace(/\+/g, " "));
  } catch {
    return m[1].replace(/\+/g, " ");
  }
}

async function geocode(query) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1" +
    `&viewbox=${PARIS_VIEWBOX}&bounded=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error("geocode request failed");
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

function initAddPlace() {
  document.getElementById("add-place-btn").addEventListener("click", async () => {
    const input = document.getElementById("place-input");
    const notesEl = document.getElementById("place-notes");
    const status = document.getElementById("add-place-status");
    const raw = input.value.trim();
    if (!raw) return;

    const author = getIdentity();
    if (!author) {
      showIdentityModal();
      return;
    }
    if (!supabaseClient) {
      backendUnavailable(status);
      return;
    }

    status.textContent = "Looking that up…";
    status.className = "add-place-status";

    try {
      const looksLikeUrl = /^https?:\/\//i.test(raw);
      let coords = null;
      let name = null;

      if (looksLikeUrl) {
        coords = extractLatLngFromUrl(raw);
        name = extractNameFromUrl(raw);
        if (!coords) {
          status.textContent =
            "Couldn't read coordinates from that link. Try a full Google Maps link (one with @lat,lng in it), or just type the place name instead.";
          status.className = "add-place-status error";
          return;
        }
        if (!name) name = `Place near ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
      } else {
        coords = await geocode(raw + ", Paris");
        if (!coords) {
          status.textContent = "Couldn't find that place — try a more specific name.";
          status.className = "add-place-status error";
          return;
        }
        name = raw;
      }

      const { data, error } = await supabaseClient
        .from("paris_pins")
        .insert({
          name,
          lat: coords.lat,
          lng: coords.lng,
          notes: notesEl.value.trim() || null,
          source_url: looksLikeUrl ? raw : null,
          added_by: author,
        })
        .select()
        .single();

      if (error) throw error;

      addNewPinToPage(data);
      input.value = "";
      notesEl.value = "";
      status.textContent = `Added "${name}" to the map.`;
      status.className = "add-place-status success";
    } catch (err) {
      console.error(err);
      status.textContent = "Something went wrong. Check your connection and try again.";
      status.className = "add-place-status error";
    }
  });
}

// ───────────────────────── realtime ─────────────────────────

function setupRealtime() {
  if (!supabaseClient) return;

  supabaseClient
    .channel("paris-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "paris_pins" }, (payload) => {
      addNewPinToPage(payload.new);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "paris_comments" }, (payload) => {
      const pinEl = document.getElementById("pin-" + payload.new.pin_id);
      if (!pinEl) return;
      const journal = pinEl.querySelector(".journal");
      const body = journal.querySelector(".journal-body");
      if (!body.hidden) {
        loadComments(payload.new.pin_id, journal);
      } else {
        journal.querySelector(".journal-toggle").classList.add("has-new");
      }
    })
    .subscribe();
}

// ───────────────────────── init ─────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  initIdentityModal();
  initLightbox();
  ensureIdentity();
  initAddPlace();

  document.querySelectorAll(".pin[data-pin-id]").forEach((pinEl) => {
    buildJournalUI(pinEl, pinEl.dataset.pinId, pinEl.dataset.pinName);
  });

  initMap();

  if (!supabaseClient) {
    const status = document.getElementById("add-place-status");
    backendUnavailable(status);
  } else {
    await loadExistingNewPins();
    setupRealtime();
  }
});

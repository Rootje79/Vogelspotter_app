const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwnbGfesd3_4nxVRRYfkk9Sj-o60pSJQiw_p0c1zkYeAZ-h7tlbmj6k4jCWlBKC3_gq_g/exec";

let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let vogelAtlas = [];
let pickerMap, pickerMarker;

// --- INITIALISATIE ---
async function init() {
    await laadVogelLijst();
    initMap();
    startGPS();
    renderObservations();
}

async function laadVogelLijst() {
    try {
        const res = await fetch('soorten.json');
        vogelAtlas = await res.json();
        const dl = document.getElementById('vogelLijst');
        vogelAtlas.forEach(v => {
            let o = document.createElement('option');
            o.value = v.naam;
            dl.appendChild(o);
        });
    } catch (e) { console.error("Kon soorten.json niet laden."); }
}

// --- KAART & GPS ---
function initMap() {
    pickerMap = L.map('mapPicker').setView([52.1326, 5.2913], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);
    pickerMap.on('click', e => setMarker(e.latlng.lat, e.latlng.lng));
}

function setMarker(lat, lon) {
    const fLat = parseFloat(lat).toFixed(6);
    const fLon = parseFloat(lon).toFixed(6);
    document.getElementById('latitude').value = fLat;
    document.getElementById('longitude').value = fLon;
    if (pickerMarker) pickerMarker.setLatLng([fLat, fLon]);
    else pickerMarker = L.marker([fLat, fLon]).addTo(pickerMap);
}

function startGPS() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(p => {
            const lat = p.coords.latitude;
            const lon = p.coords.longitude;
            pickerMap.setView([lat, lon], 15);
            setMarker(lat, lon);
            document.getElementById('gps-indicator').innerText = "📍 GPS Actief";
        }, err => { document.getElementById('gps-indicator').innerText = "📍 GPS niet beschikbaar"; });
    }
}

// --- LOGICA ---
document.getElementById('speciesInput').addEventListener('input', (e) => {
    const vogel = vogelAtlas.find(v => v.naam === e.target.value);
    const info = document.getElementById('speciesInfo');
    if (vogel) {
        document.getElementById('latinInput').value = vogel.WetSchap || "";
        document.getElementById('statusInput').value = vogel.status || "";
        info.innerHTML = `<i>${vogel.WetSchap}</i> • <span style="color:#666">${vogel.status}</span>`;
    } else { info.innerText = ""; }
});

document.getElementById('obsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('editId').value;
    
    const isGezien = document.getElementById('checkGezien').checked;
    const isGehoord = document.getElementById('checkGehoord').checked;
    let methode = (isGezien && isGehoord) ? "Gezien + Gehoord" : (isGezien ? "Gezien" : "Gehoord");

    const data = {
        species: document.getElementById('speciesInput').value,
        latin: document.getElementById('latinInput').value,
        status: document.getElementById('statusInput').value,
        count: document.getElementById('countInput').value,
        methode: methode,
        notes: document.getElementById('noteInput').value,
        coords: { lat: document.getElementById('latitude').value, lon: document.getElementById('longitude').value },
        tag: "Handmatige invoer",
        synced: false
    };

    if (editId) {
        const idx = observations.findIndex(o => o.id == editId);
        observations[idx] = { ...observations[idx], ...data };
        document.getElementById('editId').value = "";
        document.getElementById('saveBtn').innerText = "WAARNEMING OPSLAAN 💾";
        document.getElementById('saveBtn').style.background = "var(--primary)";
    } else {
        data.id = Date.now();
        data.timestamp = new Date().toLocaleString('nl-NL');
        observations.unshift(data);
    }

    localStorage.setItem('birdObs', JSON.stringify(observations));
    e.target.reset();
    document.getElementById('speciesInfo').innerText = "";
    renderObservations();
});

function bewerkWaarneming(id) {
    const o = observations.find(x => x.id === id);
    document.getElementById('editId').value = o.id;
    document.getElementById('speciesInput').value = o.species;
    document.getElementById('latinInput').value = o.latin || "";
    document.getElementById('statusInput').value = o.status || "";
    document.getElementById('countInput').value = o.count;
    document.getElementById('noteInput').value = o.notes;
    document.getElementById('checkGezien').checked = o.methode.includes("Gezien");
    document.getElementById('checkGehoord').checked = o.methode.includes("Gehoord");
    if(o.coords.lat) {
        setMarker(o.coords.lat, o.coords.lon);
        pickerMap.setView([o.coords.lat, o.coords.lon], 15);
    }
    window.scrollTo({top:0, behavior:'smooth'});
    document.getElementById('saveBtn').innerText = "WIJZIGING OPSLAAN ✏️";
    document.getElementById('saveBtn').style.background = "#ffa000";
}

function renderObservations() {
    const list = document.getElementById('obsList');
    list.innerHTML = observations.map(o => `
        <div class="card ${o.synced ? 'synced' : 'pending'}">
            <div style="flex:1">
                <strong>${o.species} (${o.count}x)</strong><br>
                <span class="latin-text">${o.latin || ''}</span><br>
                <small>${o.timestamp} | ${o.methode} | ${o.status || ''}</small>
            </div>
            <div style="display:flex; gap:10px;">
                <button onclick="bewerkWaarneming(${o.id})" style="border:none; background:none; font-size:1.2rem;">✏️</button>
                <button onclick="verwijder(${o.id})" class="delete-btn">🗑️</button>
            </div>
        </div>
    `).join('');
}

async function synchroniseerData() {
    const pending = observations.filter(o => !o.synced);
    if(pending.length === 0) return alert("Alles is al bijgewerkt!");
    for (let o of pending) {
        try {
            await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(o) });
            o.synced = true;
        } catch (e) { console.error("Sync faal", e); }
    }
    localStorage.setItem('birdObs', JSON.stringify(observations));
    renderObservations();
    alert("Klaar! Gegevens staan in de Sheet.");
}

function verwijder(id) {
    if(confirm("Verwijderen?")) {
        observations = observations.filter(o => o.id !== id);
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
    }
}

init();

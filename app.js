const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzhghDGxZVExNW8TIZ2qzMqHFK3tEVFFblg6ODEp4Juel9g1AT3vf541-gcDmN8qqNeeA/exec";

let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let locationTags = JSON.parse(localStorage.getItem('locationTags')) || [];
let vogelAtlas = [];
let currentCoords = null;
let huidigeFilter = 'vandaag'; // Standaard op vandaag

async function init() {
    await laadVogelLijst();
    startGPS();
    resetTimestamp();
    renderTags();
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
    } catch (e) { console.error("JSON laden mislukt"); }
}

function resetTimestamp() {
    const nu = new Date();
    nu.setMinutes(nu.getMinutes() - nu.getTimezoneOffset());
    document.getElementById('manualTimestamp').value = nu.toISOString().slice(0, 16);
}

function startGPS() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(p => {
            currentCoords = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
            document.getElementById('gps-indicator').innerText = `📍 GPS OK (±${Math.round(p.coords.accuracy)}m)`;
            checkNearbyTags();
        }, null, { enableHighAccuracy: true });
    }
}

function checkNearbyTags() {
    const tagInput = document.getElementById('tagInput');
    if (!currentCoords || locationTags.length === 0 || tagInput.value !== "") return;
    let dichtstbij = null;
    let minAfstand = 0.15;
    locationTags.forEach(tag => {
        const d = berekenAfstand(currentCoords, tag);
        if (d < minAfstand) { minAfstand = d; dichtstbij = tag; }
    });
    if (dichtstbij) {
        tagInput.value = dichtstbij.name;
        tagInput.classList.add('tag-detected');
    }
}

function berekenAfstand(c1, c2) {
    const R = 6371;
    const dLat = (c2.lat - c1.lat) * Math.PI / 180;
    const dLon = (c2.lon - c1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(c1.lat*Math.PI/180) * Math.cos(c2.lat*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

document.getElementById('speciesInput').addEventListener('input', (e) => {
    const v = vogelAtlas.find(x => x.naam === e.target.value);
    document.getElementById('latinInput').value = v ? v.WetSchap : "";
});

document.getElementById('obsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const species = document.getElementById('speciesInput').value;
    const tagName = document.getElementById('tagInput').value.trim();
    const manualTime = new Date(document.getElementById('manualTimestamp').value);
    
    const newObs = {
        id: Date.now(),
        synced: false,
        species: species,
        wetenschappelijk: document.getElementById('latinInput').value,
        count: document.getElementById('countInput').value,
        notes: document.getElementById('noteInput').value,
        tag: tagName,
        coords: currentCoords,
        timestamp: manualTime.toLocaleString('nl-NL')
    };

    if (tagName && currentCoords) {
        if (!locationTags.find(t => t.name.toLowerCase() === tagName.toLowerCase())) {
            locationTags.push({ name: tagName, lat: currentCoords.lat, lon: currentCoords.lon });
            localStorage.setItem('locationTags', JSON.stringify(locationTags));
            renderTags();
        }
    }

    observations.unshift(newObs);
    localStorage.setItem('birdObs', JSON.stringify(observations));
    e.target.reset();
    resetTimestamp();
    document.getElementById('tagInput').classList.remove('tag-detected');
    renderObservations();
});

function toggleFilter(f) {
    huidigeFilter = f;
    document.getElementById('btnAll').classList.toggle('active', f === 'alles');
    document.getElementById('btnToday').classList.toggle('active', f === 'vandaag');
    document.getElementById('btnPending').classList.toggle('active', f === 'pending');
    renderObservations();
}

function renderObservations() {
    const list = document.getElementById('obsList');
    const searchTerm = document.getElementById('searchObs').value.toLowerCase();
    const nuStr = new Date().toLocaleDateString('nl-NL');
    const jaarStr = "2026";

    document.getElementById('totalSpecies').innerText = new Set(observations.map(o => o.species)).size;
    document.getElementById('speciesToday').innerText = new Set(observations.filter(o => o.timestamp.includes(nuStr)).map(o => o.species)).size;
    document.getElementById('speciesYear').innerText = new Set(observations.filter(o => o.timestamp.includes(jaarStr)).map(o => o.species)).size;

    let filtered = observations.filter(o => {
        const matchSearch = o.species.toLowerCase().includes(searchTerm) || (o.tag && o.tag.toLowerCase().includes(searchTerm));
        if (huidigeFilter === 'vandaag') return matchSearch && o.timestamp.includes(nuStr);
        if (huidigeFilter === 'pending') return matchSearch && !o.synced;
        return matchSearch;
    });

    list.innerHTML = filtered.map(o => `
        <div class="card ${o.synced ? 'synced' : 'pending'}">
            <div>
                <strong>${o.species} ${o.synced ? '✅' : '☁️'}</strong><br>
                <small><em>${o.wetenschappelijk}</em></small> (x${o.count})<br>
                <small>${o.timestamp} | ${o.tag || 'Geen tag'}</small>
            </div>
            <button class="delete-btn" onclick="verwijderWaarneming(${o.id})">🗑️</button>
        </div>
    `).join('');
}

function voegLocatieHandmatigToe() {
    const name = document.getElementById('manualTagName').value.trim();
    const lat = parseFloat(document.getElementById('manualLat').value);
    const lon = parseFloat(document.getElementById('manualLon').value);
    if (name && lat && lon) {
        locationTags.push({ name, lat, lon });
        localStorage.setItem('locationTags', JSON.stringify(locationTags));
        document.getElementById('manualTagName').value = '';
        document.getElementById('manualLat').value = '';
        document.getElementById('manualLon').value = '';
        renderTags();
    }
}

function renderTags() {
    const container = document.getElementById('tagList');
    container.innerHTML = locationTags.length === 0 ? "" : "<strong>Opgeslagen plekken:</strong><br>" + locationTags.map((t, i) => `
        <div style="display:flex; justify-content:space-between; font-size:0.7rem; border-bottom:1px solid #eee; padding:4px 0;">
            <span>${t.name}</span>
            <span onclick="verwijderTag(${i})" style="color:red; cursor:pointer;">Verwijder</span>
        </div>
    `).join('');
}

function verwijderTag(i) {
    locationTags.splice(i, 1);
    localStorage.setItem('locationTags', JSON.stringify(locationTags));
    renderTags();
}

async function synchroniseerData() {
    const pending = observations.filter(o => !o.synced);
    if (pending.length === 0) return alert("Klaar!");
    const btn = document.getElementById('syncBtn');
    btn.disabled = true;
    for (let o of pending) {
        try {
            await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(o) });
            o.synced = true;
        } catch (e) { break; }
    }
    localStorage.setItem('birdObs', JSON.stringify(observations));
    btn.disabled = false;
    renderObservations();
}

function verwijderWaarneming(id) {
    if(confirm("Verwijderen?")) {
        observations = observations.filter(o => o.id !== id);
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
    }
}

init();

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzhghDGxZVExNW8TIZ2qzMqHFK3tEVFFblg6ODEp4Juel9g1AT3vf541-gcDmN8qqNeeA/exec";
let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let locationTags = JSON.parse(localStorage.getItem('locationTags')) || [];
let vogelAtlas = [];
let currentCoords = null;
let huidigeFilter = 'alles';

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
    } catch (e) { console.error("JSON fout", e); }
}

document.getElementById('speciesInput').addEventListener('input', (e) => {
    const v = vogelAtlas.find(x => x.naam === e.target.value);
    if (v) document.getElementById('latinInput').value = v.WetSchap;
});

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
    if (!currentCoords || locationTags.length === 0) return;
    const tagInput = document.getElementById('tagInput');
    if (tagInput.value !== "") return;
    let dichtstbij = null;
    let minAfstand = 0.15; // 150m
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

document.getElementById('obsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const species = document.getElementById('speciesInput').value;
    const v = vogelAtlas.find(x => x.naam === species);
    const tagName = document.getElementById('tagInput').value.trim();

    const newObs = {
        id: Date.now(),
        synced: false,
        species: species,
        wetenschappelijk: document.getElementById('latinInput').value || (v ? v.WetSchap : ""),
        count: document.getElementById('countInput').value,
        notes: document.getElementById('noteInput').value,
        tag: tagName,
        coords: currentCoords,
        timestamp: new Date().toLocaleString('nl-NL')
    };

    if (tagName && currentCoords) {
        if (!locationTags.find(t => t.name.toLowerCase() === tagName.toLowerCase())) {
            locationTags.push({ name: tagName, lat: currentCoords.lat, lon: currentCoords.lon });
            localStorage.setItem('locationTags', JSON.stringify(locationTags));
        }
    }

    observations.unshift(newObs);
    localStorage.setItem('birdObs', JSON.stringify(observations));
    renderObservations();
    e.target.reset();
    document.getElementById('tagInput').classList.remove('tag-detected');
});

function toggleFilter(f) {
    huidigeFilter = f;
    document.getElementById('filterAllBtn').classList.toggle('active', f === 'alles');
    document.getElementById('filterTodayBtn').classList.toggle('active', f === 'vandaag');
    document.getElementById('filterPendingBtn').classList.toggle('active', f === 'pending');
    renderObservations();
}

async function synchroniseerData() {
    const pending = observations.filter(o => !o.synced);
    if (pending.length === 0) return alert("Alles is gesynct!");
    const btn = document.getElementById('syncBtn');
    btn.disabled = true;
    for (let o of pending) {
        try {
            await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(o) });
            o.synced = true;
        } catch (e) { break; }
    }
    localStorage.setItem('birdObs', JSON.stringify(observations));
    renderObservations();
    btn.disabled = false;
    btn.innerText = "Sync ☁️";
}

function verwijderWaarneming(idx) {
    if(confirm("Verwijderen?")) {
        observations.splice(idx, 1);
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
    }
}

function renderObservations() {
    const list = document.getElementById('obsList');
    const searchTerm = document.getElementById('searchObs').value.toLowerCase();
    const nu = new Date().toLocaleDateString('nl-NL');
    const jaar = new Date().getFullYear().toString();

    // Stats
    document.getElementById('totalSpecies').innerText = new Set(observations.map(o => o.species)).size;
    document.getElementById('speciesToday').innerText = new Set(observations.filter(o => o.timestamp.includes(nu)).map(o => o.species)).size;
    document.getElementById('speciesYear').innerText = new Set(observations.filter(o => o.timestamp.includes(jaar)).map(o => o.species)).size;

    // Filter & Zoek
    let filtered = observations.filter(o => {
        const matchSearch = o.species.toLowerCase().includes(searchTerm) || (o.tag && o.tag.toLowerCase().includes(searchTerm));
        if (huidigeFilter === 'vandaag') return matchSearch && o.timestamp.includes(nu);
        if (huidigeFilter === 'pending') return matchSearch && !o.synced;
        return matchSearch;
    });

    list.innerHTML = filtered.map(o => {
        const realIdx = observations.findIndex(item => item.id === o.id);
        return `
            <div class="card ${o.synced ? 'synced' : 'pending'}">
                <div>
                    <strong>${o.species} ${o.synced ? '✅' : '☁️'}</strong><br>
                    <small><em>${o.wetenschappelijk}</em></small> (x${o.count})<br>
                    <small>${o.timestamp} | ${o.tag || 'Geen tag'}</small>
                </div>
                <button class="delete-btn" onclick="verwijderWaarneming(${realIdx})">🗑️</button>
            </div>`;
    }).join('');
}

laadVogelLijst();
startGPS();
renderObservations();

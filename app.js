const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzhghDGxZVExNW8TIZ2qzMqHFK3tEVFFblg6ODEp4Juel9g1AT3vf541-gcDmN8qqNeeA/exec";

// Data laden
let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let locationTags = JSON.parse(localStorage.getItem('locationTags')) || [];
let vogelAtlas = [];
let currentCoords = null;
let currentFilter = 'alles';

// 1. Initialisatie
async function init() {
    await laadVogelLijst();
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
    } catch (e) { console.error("Atlas kon niet laden", e); }
}

// 2. GPS Functies
function startGPS() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(p => {
            currentCoords = { 
                lat: p.coords.latitude, 
                lon: p.coords.longitude, 
                accuracy: p.coords.accuracy 
            };
            document.getElementById('gps-indicator').innerText = `📍 GPS OK (±${Math.round(p.coords.accuracy)}m)`;
            checkNearbyTags();
        }, null, { enableHighAccuracy: true });
    }
}

function checkNearbyTags() {
    const tagInput = document.getElementById('tagInput');
    if (!currentCoords || locationTags.length === 0 || tagInput.value !== "") return;

    let dichtstbij = null;
    let minAfstand = 0.15; // 150 meter

    locationTags.forEach(tag => {
        const d = berekenAfstand(currentCoords, tag);
        if (d < minAfstand) {
            minAfstand = d;
            dichtstbij = tag;
        }
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

// 3. Formulier Afhandeling
document.getElementById('speciesInput').addEventListener('input', (e) => {
    const v = vogelAtlas.find(x => x.naam === e.target.value);
    document.getElementById('latinInput').value = v ? v.WetSchap : "";
});

document.getElementById('obsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const species = document.getElementById('speciesInput').value;
    const tagName = document.getElementById('tagInput').value.trim();

    const newObs = {
        id: Date.now(),
        synced: false,
        species: species,
        wetenschappelijk: document.getElementById('latinInput').value,
        count: document.getElementById('countInput').value,
        notes: document.getElementById('noteInput').value,
        tag: tagName,
        coords: currentCoords,
        timestamp: new Date().toLocaleString('nl-NL')
    };

    // Nieuwe tag onthouden?
    if (tagName && currentCoords) {
        if (!locationTags.find(t => t.name.toLowerCase() === tagName.toLowerCase())) {
            locationTags.push({ name: tagName, lat: currentCoords.lat, lon: currentCoords.lon });
            localStorage.setItem('locationTags', JSON.stringify(locationTags));
        }
    }

    observations.unshift(newObs);
    localStorage.setItem('birdObs', JSON.stringify(observations));
    e.target.reset();
    document.getElementById('tagInput').classList.remove('tag-detected');
    renderObservations();
});

// 4. Filtering & Rendering
function toggleFilter(f) {
    huidigeFilter = f; // Zorg dat deze variabele bovenaan in je app.js staat
    
    // Update de knoppen (visueel)
    document.querySelectorAll('.filter-bar button').forEach(b => b.classList.remove('active'));
    if(f === 'alles') document.getElementById('btnAll').classList.add('active');
    if(f === 'vandaag') document.getElementById('btnToday').classList.add('active');
    if(f === 'pending') document.getElementById('btnPending').classList.add('active');
    
    renderObservations();
}

function renderObservations() {
    const list = document.getElementById('obsList');
    const searchTerm = document.getElementById('searchObs').value.toLowerCase();
    const nu = new Date().toLocaleDateString('nl-NL');
    const jaar = "2026";

    // Update Stats
    const uniqueAll = new Set(observations.map(o => o.species));
    const uniqueToday = new Set(observations.filter(o => o.timestamp.includes(nu)).map(o => o.species));
    const uniqueYear = new Set(observations.filter(o => o.timestamp.includes(jaar)).map(o => o.species));

    document.getElementById('totalSpecies').innerText = uniqueAll.size;
    document.getElementById('speciesToday').innerText = uniqueToday.size;
    document.getElementById('speciesYear').innerText = uniqueYear.size;

    // Filter Lijst
    let filtered = observations.filter(o => {
        const matchSearch = o.species.toLowerCase().includes(searchTerm) || (o.tag && o.tag.toLowerCase().includes(searchTerm));
        if (currentFilter === 'vandaag') return matchSearch && o.timestamp.includes(nu);
        if (currentFilter === 'pending') return matchSearch && !o.synced;
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

// 5. Sync & Verwijderen
async function synchroniseerData() {
    const pending = observations.filter(o => !o.synced);
    if (pending.length === 0) return alert("Alles is up-to-date!");
    
    const btn = document.getElementById('syncBtn');
    btn.disabled = true;
    btn.innerText = "...";

    for (let o of pending) {
        try {
            await fetch(GOOGLE_SCRIPT_URL, { 
                method: 'POST', 
                mode: 'no-cors', 
                body: JSON.stringify(o) 
            });
            o.synced = true;
        } catch (e) { console.error("Sync fout", e); }
    }

    localStorage.setItem('birdObs', JSON.stringify(observations));
    btn.disabled = false;
    btn.innerText = "Sync ☁️";
    renderObservations();
}

function verwijderWaarneming(id) {
    if(confirm("Waarneming verwijderen?")) {
        observations = observations.filter(o => o.id !== id);
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
    }
}

// Start de app
init();

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzhghDGxZVExNW8TIZ2qzMqHFK3tEVFFblg6ODEp4Juel9g1AT3vf541-gcDmN8qqNeeA/exec";

// --- GLOBALE VARIABELEN ---
let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let locationTags = JSON.parse(localStorage.getItem('locationTags')) || [];
let vogelAtlas = [];
let currentCoords = null;
let huidigeFilter = 'vandaag';

// --- 1. INITIALISATIE ---
async function init() {
    console.log("App start op...");
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
        if(dl) {
            vogelAtlas.forEach(v => {
                let o = document.createElement('option');
                o.value = v.naam;
                dl.appendChild(o);
            });
        }
    } catch (e) { console.error("Atlas laden mislukt:", e); }
}

// --- 2. DE IMPORT FUNCTIE (NU HIER BOVENIN) ---
function startDeImport() {
    alert("Check: De knop werkt!"); // Als je dit ziet, is de verbinding OK
    const fileInput = document.getElementById('importFile');
    if (!fileInput || !fileInput.files[0]) {
        alert("Selecteer eerst een bestand via 'Bestand kiezen'.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.obs && data.tags) {
                if (confirm(`Bestand herkend! ${data.obs.length} waarnemingen toevoegen?`)) {
                    observations = [...observations, ...data.obs];
                    locationTags = [...locationTags, ...data.tags];
                    
                    // Dubbelen eruit filteren
                    observations = observations.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
                    locationTags = locationTags.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);

                    localStorage.setItem('birdObs', JSON.stringify(observations));
                    localStorage.setItem('locationTags', JSON.stringify(locationTags));
                    
                    alert("Import succesvol!");
                    window.location.reload();
                }
            } else { alert("Geen geldig vogel-bestand."); }
        } catch (err) { alert("Fout bij verwerken: " + err.message); }
    };
    reader.readAsText(fileInput.files[0]);
}

// --- 3. EXPORT ---
function exporteerData() {
    const data = { obs: observations, tags: locationTags };
    const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vogel_backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// --- 4. GPS & LOGICA ---
function startGPS() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(p => {
            currentCoords = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
            const ind = document.getElementById('gps-indicator');
            if(ind) ind.innerText = `📍 GPS OK (±${Math.round(p.coords.accuracy)}m)`;
            checkNearbyTags();
        }, null, { enableHighAccuracy: true });
    }
}

function checkNearbyTags() {
    const tagInput = document.getElementById('tagInput');
    if (!currentCoords || locationTags.length === 0 || !tagInput || tagInput.value !== "") return;
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

function resetTimestamp() {
    const nu = new Date();
    nu.setMinutes(nu.getMinutes() - nu.getTimezoneOffset());
    const field = document.getElementById('manualTimestamp');
    if(field) field.value = nu.toISOString().slice(0, 16);
}

// --- 5. OPSLAAN & TONEN ---
const obsForm = document.getElementById('obsForm');
if(obsForm) {
    obsForm.addEventListener('submit', (e) => {
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
        renderObservations();
    });
}

function toggleFilter(f) {
    huidigeFilter = f;
    renderObservations();
}

function renderObservations() {
    const list = document.getElementById('obsList');
    if(!list) return;
    const searchTerm = document.getElementById('searchObs').value.toLowerCase();
    const nuStr = new Date().toLocaleDateString('nl-NL');

    let filtered = observations.filter(o => {
        const matchSearch = o.species.toLowerCase().includes(searchTerm);
        if (huidigeFilter === 'vandaag') return matchSearch && o.timestamp.includes(nuStr);
        return matchSearch;
    });

    list.innerHTML = filtered.map(o => `
        <div class="card ${o.synced ? 'synced' : 'pending'}">
            <div><strong>${o.species}</strong><br><small>${o.timestamp}</small></div>
            <button class="delete-btn" onclick="verwijderWaarneming(${o.id})">🗑️</button>
        </div>
    `).join('');
}

function renderTags() {
    const container = document.getElementById('tagList');
    if(!container) return;
    container.innerHTML = locationTags.map((t, i) => `<div>${t.name} <span onclick="verwijderTag(${i})">❌</span></div>`).join('');
}

function verwijderWaarneming(id) {
    if(confirm("Verwijderen?")) {
        observations = observations.filter(o => o.id !== id);
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
    }
}

init();

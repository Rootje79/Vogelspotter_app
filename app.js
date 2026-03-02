const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzhghDGxZVExNW8TIZ2qzMqHFK3tEVFFblg6ODEp4Juel9g1AT3vf541-gcDmN8qqNeeA/exec";

// --- GLOBALE VARIABELEN ---
let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let locationTags = JSON.parse(localStorage.getItem('locationTags')) || [];
let vogelAtlas = [];
let currentCoords = null;
let huidigeFilter = 'vandaag'; // Standaard filter op vandaag

// --- 1. INITIALISATIE ---
async function init() {
    console.log("App start op...");
    await laadVogelLijst();
    startGPS();
    resetTimestamp();
    renderTags();
    renderObservations(); // Dit vult direct de lijst en de tellers
}

async function laadVogelLijst() {
    try {
        const res = await fetch('soorten.json');
        vogelAtlas = await res.json();
        const dl = document.getElementById('vogelLijst');
        if (dl) {
            dl.innerHTML = '';
            vogelAtlas.forEach(v => {
                let o = document.createElement('option');
                o.value = v.naam;
                dl.appendChild(o);
            });
        }
    } catch (e) { 
        console.error("Laden soorten.json mislukt:", e); 
    }
}

// --- 2. BACKUP & IMPORT (CHROME PROOF) ---
function startDeImport() {
    const fileInput = document.getElementById('importFile');
    if (!fileInput || !fileInput.files[0]) {
        alert("Selecteer eerst een .json bestand.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.obs && data.tags) {
                if (confirm(`Bestand geladen! ${data.obs.length} waarnemingen toevoegen?`)) {
                    observations = [...observations, ...data.obs];
                    locationTags = [...locationTags, ...data.tags];
                    
                    // Verwijder dubbelen op basis van unieke ID/Naam
                    observations = observations.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
                    locationTags = locationTags.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);

                    localStorage.setItem('birdObs', JSON.stringify(observations));
                    localStorage.setItem('locationTags', JSON.stringify(locationTags));
                    
                    alert("Import succesvol!");
                    window.location.reload();
                }
            } else {
                alert("Ongeldig bestand.");
            }
        } catch (err) {
            alert("Fout bij verwerken: " + err.message);
        }
    };
    reader.readAsText(fileInput.files[0]);
}

function exporteerData() {
    try {
        const data = { obs: observations, tags: locationTags };
        const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vogel_backup_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        alert("Export mislukt: " + err.message);
    }
}

// --- 3. GPS & LOCATIE ---
function startGPS() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(p => {
            currentCoords = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
            const ind = document.getElementById('gps-indicator');
            if (ind) ind.innerText = `📍 GPS OK (±${Math.round(p.coords.accuracy)}m)`;
            checkNearbyTags();
        }, (err) => {
            const ind = document.getElementById('gps-indicator');
            if (ind) ind.innerText = "📍 GPS uit of geen bereik";
        }, { enableHighAccuracy: true });
    }
}

function checkNearbyTags() {
    const tagInput = document.getElementById('tagInput');
    if (!currentCoords || locationTags.length === 0 || !tagInput || tagInput.value !== "") return;
    
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

// --- 4. FORMULIER & OPSLAAN ---
function resetTimestamp() {
    const nu = new Date();
    nu.setMinutes(nu.getMinutes() - nu.getTimezoneOffset());
    const field = document.getElementById('manualTimestamp');
    if (field) field.value = nu.toISOString().slice(0, 16);
}

const obsForm = document.getElementById('obsForm');
if (obsForm) {
    obsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const species = document.getElementById('speciesInput').value;
        const tagName = document.getElementById('tagInput').value.trim();
        const manualTime = new Date(document.getElementById('manualTimestamp').value);
        
        const newObs = {
            id: Date.now(),
            synced: false,
            species: species,
            wetenschappelijk: document.getElementById('latinInput').value || "",
            count: document.getElementById('countInput').value || 1,
            notes: document.getElementById('noteInput').value || "",
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
}

const speciesInput = document.getElementById('speciesInput');
if (speciesInput) {
    speciesInput.addEventListener('input', (e) => {
        const v = vogelAtlas.find(x => x.naam === e.target.value);
        const latField = document.getElementById('latinInput');
        if (latField) latField.value = v ? v.WetSchap : "";
    });
}

// --- 5. STATISTIEKEN & FILTEREN ---
function toggleFilter(f) {
    huidigeFilter = f;
    const btnAll = document.getElementById('btnAll');
    const btnToday = document.getElementById('btnToday');
    const btnPending = document.getElementById('btnPending');
    
    if (btnAll) btnAll.classList.toggle('active', f === 'alles');
    if (btnToday) btnToday.classList.toggle('active', f === 'vandaag');
    if (btnPending) btnPending.classList.toggle('active', f === 'pending');
    
    renderObservations();
}

function renderObservations() {
    const list = document.getElementById('obsList');
    if (!list) return;
    
    const searchTerm = (document.getElementById('searchObs')?.value || "").toLowerCase();
    const nuStr = new Date().toLocaleDateString('nl-NL');
    const ditJaar = new Date().getFullYear().toString();

    // Stats Berekenen (Unieke soorten)
    const totalDisp = document.getElementById('totalSpecies');
    const todayDisp = document.getElementById('speciesToday');
    const yearDisp = document.getElementById('speciesYear');
    
    if (totalDisp) totalDisp.innerText = new Set(observations.map(o => o.species)).size;
    if (todayDisp) {
        const vandaagObs = observations.filter(o => o.timestamp && o.timestamp.includes(nuStr));
        todayDisp.innerText = new Set(vandaagObs.map(o => o.species)).size;
    }
    if (yearDisp) {
        const jaarObs = observations.filter(o => o.timestamp && o.timestamp.includes(ditJaar));
        yearDisp.innerText = new Set(jaarObs.map(o => o.species)).size;
    }

    // Filter de lijst
    let filtered = observations.filter(o => {
        const matchSearch = o.species.toLowerCase().includes(searchTerm) || (o.tag && o.tag.toLowerCase().includes(searchTerm));
        if (huidigeFilter === 'vandaag') return matchSearch && o.timestamp.includes(nuStr);
        if (huidigeFilter === 'pending') return matchSearch && !o.synced;
        return matchSearch;
    });

    if (filtered.length === 0) {
        list.innerHTML = `<p style="text-align:center; color:#888; padding:20px;">Geen waarnemingen.</p>`;
    } else {
        list.innerHTML = filtered.map(o => `
            <div class="card ${o.synced ? 'synced' : 'pending'}">
                <div>
                    <strong>${o.species} ${o.synced ? '✅' : '☁️'}</strong><br>
                    <small>${o.timestamp} | ${o.tag || 'Geen tag'}</small>
                </div>
                <button class="delete-btn" onclick="verwijderWaarneming(${o.id})">🗑️</button>
            </div>
        `).join('');
    }
}

// --- 6. LOCATIE & SYNC ---
function voegLocatieHandmatigToe() {
    const name = document.getElementById('manualTagName').value.trim();
    const lat = parseFloat(document.getElementById('manualLat').value);
    const lon = parseFloat(document.getElementById('manualLon').value);
    if (name && !isNaN(lat) && !isNaN(lon)) {
        locationTags.push({ name, lat, lon });
        localStorage.setItem('locationTags', JSON.stringify(locationTags));
        document.getElementById('manualTagName').value = '';
        document.getElementById('manualLat').value = '';
        document.getElementById('manualLon').value = '';
        renderTags();
        alert("Locatie toegevoegd!");
    }
}

function renderTags() {
    const container = document.getElementById('tagList');
    if (!container) return;
    container.innerHTML = locationTags.map((t, i) => `
        <div style="display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid #eee;">
            <span>${t.name}</span>
            <span onclick="verwijderTag(${i})" style="color:red; cursor:pointer;">❌</span>
        </div>
    `).join('');
}

function verwijderTag(i) {
    if (confirm("Locatie verwijderen?")) {
        locationTags.splice(i, 1);
        localStorage.setItem('locationTags', JSON.stringify(locationTags));
        renderTags();
    }
}

function verwijderWaarneming(id) {
    if (confirm("Waarneming verwijderen?")) {
        observations = observations.filter(o => o.id !== id);
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
    }
}

async function synchroniseerData() {
    const pending = observations.filter(o => !o.synced);
    if (pending.length === 0) return alert("Alles is gesynchroniseerd!");
    const btn = document.getElementById('syncBtn');
    if (btn) { btn.disabled = true; btn.innerText = "..."; }
    for (let o of pending) {
        try {
            await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(o) });
            o.synced = true;
        } catch (e) { break; }
    }
    localStorage.setItem('birdObs', JSON.stringify(observations));
    if (btn) { btn.disabled = false; btn.innerText = "Sync ☁️"; }
    renderObservations();
}

init();

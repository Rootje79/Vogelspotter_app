const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxbM8NKbxEVfGXy3vIlegTRM7gD43NLAbPcUcScCHS27MOjP0GzCsjTKQHOtLq_HW-fiw/exec";

let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let vogelAtlas = [];
let pickerMap, pickerMarker, huidigeFilter = 'vandaag';

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
            let o = document.createElement('option'); o.value = v.naam; dl.appendChild(o);
        });
    } catch (e) { console.error("Fout laden JSON"); }
}

// --- LOCATIE LOGICA ---
function initMap() {
    pickerMap = L.map('mapPicker').setView([52.1326, 5.2913], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);
    pickerMap.on('click', e => setMarker(e.latlng.lat, e.latlng.lng));
}

function toggleKaart() {
    const c = document.getElementById('mapContainer');
    const b = document.getElementById('mapToggleBtn');
    c.style.display = (c.style.display === 'none') ? 'block' : 'none';
    b.innerText = (c.style.display === 'none') ? '🗺️ TOON KAART' : '🙈 VERBERG KAART';
    if(c.style.display === 'block') setTimeout(() => pickerMap.invalidateSize(), 200);
}

function setMarker(lat, lon) {
    const fLat = parseFloat(lat).toFixed(6), fLon = parseFloat(lon).toFixed(6);
    document.getElementById('latitude').value = fLat;
    document.getElementById('longitude').value = fLon;
    if (pickerMarker) pickerMarker.setLatLng([fLat, fLon]);
    else pickerMarker = L.marker([fLat, fLon]).addTo(pickerMap);
}

function startGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(p => {
            setMarker(p.coords.latitude, p.coords.longitude);
            pickerMap.setView([p.coords.latitude, p.coords.longitude], 15);
        }, null, {enableHighAccuracy:true});
    }
}

// --- FORMULIER & STATS ---
document.getElementById('speciesInput').addEventListener('input', e => {
    const v = vogelAtlas.find(x => x.naam === e.target.value);
    if (v) {
        document.getElementById('latinInput').value = v.WetSchap || "";
        document.getElementById('statusInput').value = v.status || "";
        document.getElementById('speciesInfo').innerHTML = `<i>${v.WetSchap}</i> • ${v.status}`;
    }
});

document.getElementById('obsForm').addEventListener('submit', e => {
    e.preventDefault();
    const editId = document.getElementById('editId').value;
    const data = {
        species: document.getElementById('speciesInput').value,
        latin: document.getElementById('latinInput').value,
        status: document.getElementById('statusInput').value,
        count: document.getElementById('countInput').value,
        methode: (document.getElementById('checkGezien').checked ? "Gezien" : "") + (document.getElementById('checkGehoord').checked ? " Gehoord" : ""),
        tag: document.getElementById('tagInput').value,
        notes: document.getElementById('noteInput').value,
        coords: { lat: document.getElementById('latitude').value, lon: document.getElementById('longitude').value },
        synced: false
    };

    if (editId) {
        const idx = observations.findIndex(o => o.id == editId);
        observations[idx] = { ...observations[idx], ...data };
        document.getElementById('editId').value = "";
    } else {
        data.id = Date.now();
        data.timestamp = new Date().toLocaleString('nl-NL');
        data.rawDate = new Date(); // Voor stats
        observations.unshift(data);
    }

    localStorage.setItem('birdObs', JSON.stringify(observations));
    e.target.reset();
    renderObservations();
});

function renderObservations() {
    const list = document.getElementById('obsList');
    const query = document.getElementById('searchInput').value.toLowerCase();
    const nu = new Date();
    
    // STATISTIEKEN (Unieke soorten)
    const getUnique = (arr) => new Set(arr.map(o => o.species)).size;
    document.getElementById('statLife').innerText = getUnique(observations);
    document.getElementById('statYear').innerText = getUnique(observations.filter(o => new Date(o.rawDate).getFullYear() === nu.getFullYear()));
    document.getElementById('statMonth').innerText = getUnique(observations.filter(o => new Date(o.rawDate).getMonth() === nu.getMonth() && new Date(o.rawDate).getFullYear() === nu.getFullYear()));
    document.getElementById('statDay').innerText = getUnique(observations.filter(o => new Date(o.rawDate).toDateString() === nu.toDateString()));

    let filtered = observations.filter(o => {
        const m = o.species.toLowerCase().includes(query) || (o.tag && o.tag.toLowerCase().includes(query));
        if (huidigeFilter === 'vandaag') return m && new Date(o.rawDate).toDateString() === nu.toDateString();
        if (huidigeFilter === 'pending') return m && !o.synced;
        return m;
    });

    list.innerHTML = filtered.map(o => `
        <div class="card ${o.synced ? 'synced' : 'pending'}">
            <div style="flex:1" onclick="bewerkWaarneming(${o.id})">
                <strong>${o.species} (${o.count})</strong><br>
                <small>${o.timestamp} | ${o.tag || 'Geen tag'}</small>
            </div>
            <button onclick="verwijder(${o.id})" style="border:none; background:none; color:red;">🗑️</button>
        </div>
    `).join('');
}

function setFilter(f) {
    huidigeFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`filter-${f}`).classList.add('active');
    renderObservations();
}

function bewerkWaarneming(id) {
    const o = observations.find(x => x.id === id);
    document.getElementById('editId').value = o.id;
    document.getElementById('speciesInput').value = o.species;
    document.getElementById('countInput').value = o.count;
    document.getElementById('tagInput').value = o.tag || "";
    document.getElementById('noteInput').value = o.notes;
    setMarker(o.coords.lat, o.coords.lon);
    window.scrollTo(0,0);
}

async function synchroniseerData() {
    const pending = observations.filter(o => !o.synced);
    for (let o of pending) {
        try {
            await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(o) });
            o.synced = true;
        } catch (e) {}
    }
    localStorage.setItem('birdObs', JSON.stringify(observations));
    renderObservations();
    alert("Sync klaar!");
}

// --- IMPORT / EXPORT ---
function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(observations));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "vogel_export.json");
    dlAnchorElem.click();
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.readAsText(file,'UTF-8');
        reader.onload = readerEvent => {
            const content = JSON.parse(readerEvent.target.result);
            observations = content;
            localStorage.setItem('birdObs', JSON.stringify(observations));
            renderObservations();
        }
    }
    input.click();
}

function verwijder(id) { if(confirm("Wissen?")) { observations = observations.filter(o => o.id !== id); localStorage.setItem('birdObs', JSON.stringify(observations)); renderObservations(); } }

init();

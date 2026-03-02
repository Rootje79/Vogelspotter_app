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
    } catch (e) { console.error("Fout bij laden soorten.json"); }
}

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
    document.getElementById('latitude').value = lat.toFixed(6);
    document.getElementById('longitude').value = lon.toFixed(6);
    if (pickerMarker) pickerMarker.setLatLng([lat, lon]);
    else pickerMarker = L.marker([lat, lon]).addTo(pickerMap);
    updateLocatieTag(lat, lon);
}

// Automatische Locatietag via Nominatim (Gratis OpenStreetMap service)
async function updateLocatieTag(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await res.json();
        const tag = data.address.city || data.address.town || data.address.village || data.address.suburb || "Onbekende plek";
        document.getElementById('tagInput').value = tag;
    } catch (e) {
        document.getElementById('tagInput').value = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    }
}

function startGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(p => {
            setMarker(p.coords.latitude, p.coords.longitude);
            pickerMap.setView([p.coords.latitude, p.coords.longitude], 15);
            document.getElementById('gps-status').innerText = "📍 GPS Actief";
        }, (err) => { document.getElementById('gps-status').innerText = "📍 GPS uitgeschakeld"; });
    }
}

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
    const now = new Date();
    
    const data = {
        species: document.getElementById('speciesInput').value,
        latin: document.getElementById('latinInput').value,
        status: document.getElementById('statusInput').value,
        count: document.getElementById('countInput').value,
        methode: (document.getElementById('checkGezien').checked ? "Gezien" : "") + (document.getElementById('checkGehoord').checked ? " Gehoord" : ""),
        tag: document.getElementById('tagInput').value,
        notes: document.getElementById('noteInput').value,
        coords: { lat: parseFloat(document.getElementById('latitude').value), lon: parseFloat(document.getElementById('longitude').value) },
        synced: false,
        timestamp: now.toLocaleString('nl-NL'),
        isoDate: now.toISOString() // Harde datum voor stats
    };

    if (editId) {
        const idx = observations.findIndex(o => o.id == editId);
        observations[idx] = { ...observations[idx], ...data };
        document.getElementById('editId').value = "";
        document.getElementById('saveBtn').innerText = "OPSLAAN 💾";
    } else {
        data.id = Date.now();
        observations.unshift(data);
    }

    localStorage.setItem('birdObs', JSON.stringify(observations));
    e.target.reset();
    document.getElementById('speciesInfo').innerText = "";
    renderObservations();
});

function renderObservations() {
    const list = document.getElementById('obsList');
    const query = document.getElementById('searchInput').value.toLowerCase();
    const nu = new Date();
    
    // --- STATISTIEKEN BEREKENING ---
    const getUnique = (arr) => new Set(arr.map(o => o.species)).size;
    
    const lifeList = observations;
    const yearList = observations.filter(o => new Date(o.isoDate).getFullYear() === nu.getFullYear());
    const monthList = yearList.filter(o => new Date(o.isoDate).getMonth() === nu.getMonth());
    const dayList = monthList.filter(o => new Date(o.isoDate).toDateString() === nu.toDateString());

    document.getElementById('statLife').innerText = getUnique(lifeList);
    document.getElementById('statYear').innerText = getUnique(yearList);
    document.getElementById('statMonth').innerText = getUnique(monthList);
    document.getElementById('statDay').innerText = getUnique(dayList);

    // --- FILTEREN EN WEERGEVEN ---
    let filtered = observations.filter(o => {
        const matchesSearch = o.species.toLowerCase().includes(query) || (o.tag && o.tag.toLowerCase().includes(query));
        if (huidigeFilter === 'vandaag') return matchesSearch && new Date(o.isoDate).toDateString() === nu.toDateString();
        if (huidigeFilter === 'pending') return matchesSearch && !o.synced;
        return matchesSearch;
    });

    list.innerHTML = filtered.map(o => `
        <div class="card ${o.synced ? 'synced' : 'pending'}">
            <div style="flex:1" onclick="bewerkWaarneming(${o.id})">
                <strong>${o.species} (${o.count})</strong><br>
                <small>${o.timestamp} | ${o.tag || 'Geen tag'}</small>
            </div>
            <button onclick="verwijder(${o.id})" style="border:none; background:none; color:red; font-size:1.2rem; cursor:pointer;">🗑️</button>
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
    if(!o) return;
    document.getElementById('editId').value = o.id;
    document.getElementById('speciesInput').value = o.species;
    document.getElementById('countInput').value = o.count;
    document.getElementById('tagInput').value = o.tag || "";
    document.getElementById('noteInput').value = o.notes;
    document.getElementById('latitude').value = o.coords.lat;
    document.getElementById('longitude').value = o.coords.lon;
    document.getElementById('saveBtn').innerText = "WIJZIGING OPSLAAN ✏️";
    window.scrollTo({top: 0, behavior: 'smooth'});
}

async function synchroniseerData() {
    const pending = observations.filter(o => !o.synced);
    if(pending.length === 0) return alert("Geen nieuwe data.");
    for (let o of pending) {
        try {
            await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(o) });
            o.synced = true;
        } catch (e) { console.error(e); }
    }
    localStorage.setItem('birdObs', JSON.stringify(observations));
    renderObservations();
    alert("Klaar!");
}

function exportData() {
    const blob = new Blob([JSON.stringify(observations)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = "vogels_backup.json"; a.click();
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = e => {
        const reader = new FileReader();
        reader.onload = ev => {
            observations = JSON.parse(ev.target.result);
            localStorage.setItem('birdObs', JSON.stringify(observations));
            renderObservations();
        };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
}

function verwijder(id) {
    if(confirm("Waarneming verwijderen?")) {
        observations = observations.filter(o => o.id !== id);
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
    }
}

init();

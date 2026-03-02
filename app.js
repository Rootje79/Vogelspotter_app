const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxbM8NKbxEVfGXy3vIlegTRM7gD43NLAbPcUcScCHS27MOjP0GzCsjTKQHOtLq_HW-fiw/exec";

let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let vogelAtlas = [];
let pickerMap, pickerMarker, huidigeFilter = 'vandaag';

function getLocalISOString(date) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return (new Date(date - tzOffset)).toISOString().slice(0, 16);
}

async function init() {
    await laadVogelLijst();
    initMap();
    startGPS();
    document.getElementById('datetimeInput').value = getLocalISOString(new Date());
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

function initMap() {
    pickerMap = L.map('mapPicker').setView([52.1326, 5.2913], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);
    pickerMap.on('click', e => setMarker(e.latlng.lat, e.latlng.lng));
}

function toggleKaart() {
    const c = document.getElementById('mapContainer');
    const b = document.getElementById('mapToggleBtn');
    c.style.display = (c.style.display === 'none') ? 'block' : 'none';
    b.innerText = (c.style.display === 'none') ? '🗺️ KAART TONEN' : '🙈 KAART VERBERGEN';
    if(c.style.display === 'block') setTimeout(() => pickerMap.invalidateSize(), 200);
}

function setMarker(lat, lon) {
    document.getElementById('latitude').value = lat.toFixed(6);
    document.getElementById('longitude').value = lon.toFixed(6);
    if (pickerMarker) pickerMarker.setLatLng([lat, lon]);
    else pickerMarker = L.marker([lat, lon]).addTo(pickerMap);
    haalAdresOp(lat, lon);
}

async function haalAdresOp(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await res.json();
        const plek = data.address.city || data.address.town || data.address.village || "Onbekend";
        document.getElementById('tagInput').value = plek;
    } catch (e) {}
}

function startGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(p => {
            setMarker(p.coords.latitude, p.coords.longitude);
            pickerMap.setView([p.coords.latitude, p.coords.longitude], 15);
            document.getElementById('gps-status').innerText = "📍 GPS Actief";
        }, null, {enableHighAccuracy:true});
    }
}

document.getElementById('speciesInput').addEventListener('input', e => {
    const v = vogelAtlas.find(x => x.naam === e.target.value);
    if (v) {
        document.getElementById('latinInput').value = v.WetSchap || "";
        document.getElementById('statusInput').value = v.status || "";
        document.getElementById('speciesInfo').innerHTML = `<i>${v.WetSchap}</i> • <b>${v.status}</b>`;
    }
});

// --- DE OPSLAAN FUNCTIE ---
document.getElementById('obsForm').addEventListener('submit', e => {
    e.preventDefault();
    const editId = document.getElementById('editId').value;
    const gekozenDatum = new Date(document.getElementById('datetimeInput').value);
    
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
        timestamp: gekozenDatum.toLocaleString('nl-NL'),
        isoDate: gekozenDatum.toISOString()
    };

    if (editId) {
        // Gebruik slappe vergelijking (==) voor het geval ID tekst of getal is
        const idx = observations.findIndex(o => o.id == editId);
        if (idx !== -1) {
            observations[idx] = { ...observations[idx], ...data };
            console.log("Bijgewerkt: ", editId);
        }
        document.getElementById('editId').value = "";
        document.getElementById('saveBtn').innerText = "OPSLAAN 💾";
        document.getElementById('saveBtn').style.background = "var(--primary)";
    } else {
        data.id = Date.now();
        observations.unshift(data);
    }

    localStorage.setItem('birdObs', JSON.stringify(observations));
    e.target.reset();
    document.getElementById('datetimeInput').value = getLocalISOString(new Date());
    document.getElementById('speciesInfo').innerText = "";
    renderObservations();
});

function renderObservations() {
    const list = document.getElementById('obsList');
    const query = document.getElementById('searchInput').value.toLowerCase();
    const nu = new Date();
    
    // Stats Update
    const getUnique = (arr) => new Set(arr.map(o => o.species)).size;
    document.getElementById('statLife').innerText = getUnique(observations);
    document.getElementById('statYear').innerText = getUnique(observations.filter(o => new Date(o.isoDate || Date.now()).getFullYear() === nu.getFullYear()));
    document.getElementById('statDay').innerText = getUnique(observations.filter(o => new Date(o.isoDate || Date.now()).toDateString() === nu.toDateString()));
    // Maand stats toevoegen
    document.getElementById('statMonth').innerText = getUnique(observations.filter(o => {
        let d = new Date(o.isoDate || Date.now());
        return d.getMonth() === nu.getMonth() && d.getFullYear() === nu.getFullYear();
    }));

    let filtered = observations.filter(o => {
        const match = o.species.toLowerCase().includes(query) || (o.tag && o.tag.toLowerCase().includes(query));
        if (huidigeFilter === 'vandaag') return match && new Date(o.isoDate || Date.now()).toDateString() === nu.toDateString();
        if (huidigeFilter === 'pending') return match && !o.synced;
        return match;
    });

    list.innerHTML = filtered.map(o => `
        <div class="card ${o.synced ? 'synced' : 'pending'}">
            <div style="flex:1" onclick="bewerkWaarneming(${o.id})">
                <strong>${o.species} (${o.count})</strong><br>
                <small>${o.timestamp} | ${o.tag || ''}</small>
            </div>
            <button onclick="verwijder(${o.id})" style="border:none; background:none; color:red; font-size:1.2rem;">🗑️</button>
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
    const o = observations.find(x => x.id == id);
    if(!o) return;
    
    document.getElementById('editId').value = o.id;
    document.getElementById('speciesInput').value = o.species;
    document.getElementById('countInput').value = o.count;
    document.getElementById('tagInput').value = o.tag || "";
    document.getElementById('noteInput').value = o.notes;
    document.getElementById('latitude').value = o.coords.lat;
    document.getElementById('longitude').value = o.coords.lon;
    
    // Zorg dat de datumkiezer de tijd van de vogel pakt
    const d = o.isoDate ? new Date(o.isoDate) : new Date();
    document.getElementById('datetimeInput').value = getLocalISOString(d);

    document.getElementById('saveBtn').innerText = "WIJZIGING OPSLAAN ✏️

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbySdVGHJXIajy_R5dnujbQaJ7PF2Zn2gxZb-LrHl4LpTyndfGX27wxciJzMIIIXc8kUJQ/exec"; // PLAK HIER JE NIEUWE IMPLEMENTATIE URL

let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let vogelAtlas = [];
let pickerMap, pickerMarker, huidigeFilter = 'vandaag';

// --- HULPFUNCTIES ---

function getLocalISOString(date) {
    if (!date || isNaN(date.getTime())) date = new Date();
    const tzOffset = date.getTimezoneOffset() * 60000;
    return (new Date(date - tzOffset)).toISOString().slice(0, 16);
}

// Haal gebiedsnaam op via Nominatim (OpenStreetMap)
async function haalAdresOp(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await res.json();
        const plek = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.road || "Onbekend gebied";
        document.getElementById('tagInput').value = plek;
    } catch (e) {
        console.log("Gebied kon niet worden opgehaald via internet.");
    }
}

// --- INITIALISATIE ---

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
            let o = document.createElement('option'); 
            o.value = v.naam; 
            dl.appendChild(o);
        });
    } catch (e) { console.error("Vogellijst niet geladen"); }
}

function initMap() {
    pickerMap = L.map('mapPicker').setView([52.13, 5.29], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);
    
    pickerMap.on('click', e => {
        setMarker(e.latlng.lat, e.latlng.lng);
    });
}

function toggleKaart() {
    const c = document.getElementById('mapContainer');
    const btn = document.getElementById('mapToggleBtn');
    if (c.style.display === 'none') {
        c.style.display = 'block';
        btn.innerText = "🗺️ KAART VERBERGEN";
        setTimeout(() => pickerMap.invalidateSize(), 200);
    } else {
        c.style.display = 'none';
        btn.innerText = "🗺️ KAART TONEN";
    }
}

function setMarker(lat, lon) {
    document.getElementById('latitude').value = lat.toFixed(6);
    document.getElementById('longitude').value = lon.toFixed(6);
    if (pickerMarker) {
        pickerMarker.setLatLng([lat, lon]);
    } else {
        pickerMarker = L.marker([lat, lon]).addTo(pickerMap);
    }
    haalAdresOp(lat, lon);
}

function startGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(p => {
            const lat = p.coords.latitude;
            const lon = p.coords.longitude;
            document.getElementById('gpsStatus').style.background = "#4caf50"; // GROEN
            document.getElementById('gpsStatus').title = "Locatie gevonden";
            setMarker(lat, lon);
            pickerMap.setView([lat, lon], 13);
        }, (err) => {
            document.getElementById('gpsStatus').style.background = "red";
        }, { enableHighAccuracy: true });
    }
}

// --- EVENT LISTENERS ---

document.getElementById('speciesInput').addEventListener('input', e => {
    const v = vogelAtlas.find(x => x.naam === e.target.value);
    if (v) {
        document.getElementById('latinInput').value = v.WetSchap || "";
        document.getElementById('statusInput').value = v.status || "";
        document.getElementById('speciesInfo').innerText = `${v.WetSchap} • ${v.status}`;
    } else {
        document.getElementById('speciesInfo').innerText = "";
    }
});

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
        coords: { 
            lat: parseFloat(document.getElementById('latitude').value) || 52, 
            lon: parseFloat(document.getElementById('longitude').value) || 5 
        },
        synced: false,
        timestamp: gekozenDatum.toLocaleString('nl-NL'),
        isoDate: gekozenDatum.toISOString()
    };

    if (editId) {
        const idx = observations.findIndex(o => String(o.id) === String(editId));
        if (idx !== -1) observations[idx] = { ...observations[idx], ...data, id: editId };
    } else {
        data.id = "ID-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
        observations.unshift(data);
    }

    localStorage.setItem('birdObs', JSON.stringify(observations));
    e.target.reset();
    document.getElementById('editId').value = "";
    document.getElementById('saveBtn').innerText = "OPSLAAN 💾";
    document.getElementById('saveBtn').style.background = "#2d5a27";
    document.getElementById('datetimeInput').value = getLocalISOString(new Date());
    renderObservations();
});

// --- RENDER & STATS ---

function renderObservations() {
    const list = document.getElementById('obsList');
    const query = (document.getElementById('searchInput').value || "").toLowerCase();
    const nu = new Date();
    
    const getUnique = (arr) => new Set(arr.map(o => o.species)).size;
    document.getElementById('statLife').innerText = getUnique(observations);
    document.getElementById('statYear').innerText = getUnique(observations.filter(o => new Date(o.isoDate).getFullYear() === nu.getFullYear()));
    document.getElementById('statDay').innerText = getUnique(observations.filter(o => new Date(o.isoDate).toDateString() === nu.toDateString()));
    document.getElementById('statMonth').innerText = getUnique(observations.filter(o => {
        let d = new Date(o.isoDate);
        return d.getMonth() === nu.getMonth() && d.getFullYear() === nu.getFullYear();
    }));

    let filtered = observations.filter(o => {
        const match = o.species.toLowerCase().includes(query) || (o.tag && o.tag.toLowerCase().includes(query));
        if (huidigeFilter === 'vandaag') return match && new Date(o.isoDate).toDateString() === nu.toDateString();
        if (huidigeFilter === 'pending') return match && !o.synced;
        return match;
    });

    list.innerHTML = filtered.map(o => `
        <div class="card" style="border-left-color: ${o.synced ? '#4caf50' : '#ffa000'}; background: white; padding: 12px; margin: 10px; border-radius: 10px; border-left-width: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">
            <div style="flex:1" onclick="bewerkWaarneming('${o.id}')">
                <strong>${o.species} (${o.count})</strong><br>
                <small>${o.timestamp} | ${o.tag || ''}</small>
            </div>
            <button onclick="verwijder('${o.id}')" style="border:none; background:none; color:red; font-size:1.2rem; cursor:pointer;">🗑️</button>
        </div>
    `).join('');
}

function bewerkWaarneming(id) {
    const o = observations.find(x => String(x.id) === String(id));
    if(!o) return;
    document.getElementById('editId').value = o.id;
    document.getElementById('speciesInput').value = o.species;
    document.getElementById('countInput').value = o.count;
    document.getElementById('tagInput').value = o.tag;
    document.getElementById('noteInput').value = o.notes;
    document.getElementById('latitude').value = o.coords.lat;
    document.getElementById('longitude').value = o.coords.lon;
    document.getElementById('latinInput').value = o.latin || "";
    document.getElementById('statusInput').value = o.status || "";
    document.getElementById('datetimeInput').value = getLocalISOString(new Date(o.isoDate));
    document.getElementById('saveBtn').innerText = "WIJZIGING OPSLAAN ✏️";
    document.getElementById('saveBtn').style.background = "#ffa000";
    window.scrollTo({top: 0, behavior: 'smooth'});
}

// --- DATA SYNC & BACKUP ---

async function synchroniseerData() {
    const pending = observations.filter(o => !o.synced);
    if(pending.length === 0) return alert("Alles is al bijgewerkt!");
    
    let gelukt = 0;
    for (let o of pending) {
        try {
            await fetch(GOOGLE_SCRIPT_URL, { 
                method: 'POST', 
                mode: 'no-cors', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(o) 
            });
            o.synced = true;
            gelukt++;
        } catch (e) { console.error("Fout bij sync item:", o.id); }
    }
    localStorage.setItem('birdObs', JSON.stringify(observations));
    renderObservations();
    alert(`Sync voltooid! ${gelukt} items verwerkt.`);
}

async function haalDataUitSheet() {
    const btn = event.target;
    btn.innerText = "LADEN... ⏳";
    try {
        const res = await fetch(GOOGLE_SCRIPT_URL);
        const data = await res.json();
        let nieuw = 0;
        data.forEach(item => {
            if(!observations.some(o => String(o.id) === String(item.id))) {
                observations.push({
                    id: item.id, species: item.species, latin: item.latin, status: item.status,
                    count: item.count, tag: item.tag, notes: item.notes, timestamp: item.timestamp,
                    isoDate: item.isoDate, synced: true, 
                    coords: {lat: parseFloat(item.latitude), lon: parseFloat(item.longitude)}
                });
                nieuw++;
            }
        });
        observations.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
        alert(`${nieuw} nieuwe waarnemingen opgehaald!`);
    } catch(e) { 
        alert("Fout bij ophalen. Check de console."); 
    } finally {
        btn.innerText = "HAAL UIT SHEET 📥";
    }
}

function exportData() {
    const blob = new Blob([JSON.stringify(observations, null, 2)], {type: "application/json"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `VogelBackup_${new Date().toLocaleDateString()}.json`;
    a.click();
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const reader = new FileReader();
        reader.onload = ev => {
            const data = JSON.parse(ev.target.result);
            // Zorg voor ID's en datums bij oude importbestanden
            observations = data.map(item => ({
                ...item, 
                id: item.id || "ID-"+Date.now()+"-"+Math.random(),
                isoDate: item.isoDate || new Date().toISOString()
            }));
            localStorage.setItem('birdObs', JSON.stringify(observations));
            renderObservations();
            alert("Import succesvol!");
        };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
}

function verwijder(id) {
    if(confirm("Weet je zeker dat je deze waarneming wilt verwijderen?")) {
        observations = observations.filter(o => String(o.id) !== String(id));
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
    }
}

function setFilter(f) {
    huidigeFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`filter-${f}`).classList.add('active');
    renderObservations();
}

init();

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxbM8NKbxEVfGXy3vIlegTRM7gD43NLAbPcUcScCHS27MOjP0GzCsjTKQHOtLq_HW-fiw/exec";

let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let vogelAtlas = [];
let pickerMap, pickerMarker, huidigeFilter = 'vandaag';

// Helpt om een Date object in het juiste formaat voor de input te krijgen
function getLocalISOString(date) {
    if (!date || isNaN(date.getTime())) date = new Date();
    const tzOffset = date.getTimezoneOffset() * 60000;
    return (new Date(date - tzOffset)).toISOString().slice(0, 16);
}

// Probeert een datum te maken van oude tekst-timestamps (bijv "2-3-2026 14:00")
function parseOldTimestamp(ts) {
    if (!ts) return new Date();
    // Vervang streepjes door schuine strepen voor betere browser support
    const parts = ts.split(' ');
    const dateParts = parts[0].split('-');
    if (dateParts.length === 3) {
        // Maak er YYYY-MM-DD van voor de constructor
        return new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T${parts[1] || '12:00'}`);
    }
    return new Date();
}

async function init() {
    await laadVogelLijst();
    initMap();
    startGPS();
    // Alleen bij EERSTE keer laden van de app zetten we de klok op 'nu'
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
    } catch (e) { console.error("JSON laden mislukt"); }
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

// --- OPSLAAN / BIJWERKEN ---
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
        const idx = observations.findIndex(o => o.id == editId);
        if (idx !== -1) {
            // Update waarneming maar behoud het originele ID
            observations[idx] = { ...observations[idx], ...data, id: observations[idx].id };
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
    // Zet de klok weer op 'nu' voor de volgende NIEUWE waarneming
    document.getElementById('datetimeInput').value = getLocalISOString(new Date());
    document.getElementById('speciesInfo').innerText = "";
    renderObservations();
});

function renderObservations() {
    const list = document.getElementById('obsList');
    const query = document.getElementById('searchInput').value.toLowerCase();
    const nu = new Date();
    
    const getUnique = (arr) => new Set(arr.map(o => o.species)).size;
    document.getElementById('statLife').innerText = getUnique(observations);
    document.getElementById('statYear').innerText = getUnique(observations.filter(o => new Date(o.isoDate || Date.now()).getFullYear() === nu.getFullYear()));
    document.getElementById('statDay').innerText = getUnique(observations.filter(o => new Date(o.isoDate || Date.now()).toDateString() === nu.toDateString()));
    document.getElementById('statMonth').innerText = getUnique(observations.filter(o => {
        let d = new Date(o.isoDate || Date.now());
        return d.getMonth() === nu.getMonth() && d.getFullYear() === nu.getFullYear();
    }));

    let filtered = observations.filter(o => {
        const match = o.species.toLowerCase().includes(query) || (o.tag && o.tag.toLowerCase().includes(query));
        if (huidigeFilter === 'vandaag') {
            const d = o.isoDate ? new Date(o.isoDate) : parseOldTimestamp(o.timestamp);
            return match && d.toDateString() === nu.toDateString();
        }
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

// --- DE BEWERK FUNCTIE (NU EXTRA VEILIG) ---
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
    document.getElementById('latinInput').value = o.latin || "";
    document.getElementById('statusInput').value = o.status || "";
    document.getElementById('speciesInfo').innerHTML = `<i>${o.latin || ''}</i> • <b>${o.status || ''}</b>`;
    
    // BEPAAL DE DATUM: Gebruik isoDate OF herleid uit de timestamp tekst
    let d;
    if (o.isoDate) {
        d = new Date(o.isoDate);
    } else {
        d = parseOldTimestamp(o.timestamp);
    }
    
    // Forceer de datumkiezer naar de OUDE datum van de vogel
    document.getElementById('datetimeInput').value = getLocalISOString(d);

    document.getElementById('saveBtn').innerText = "WIJZIGING OPSLAAN ✏️";
    document.getElementById('saveBtn').style.background = "var(--accent)";
    window.scrollTo({top: 0, behavior: 'smooth'});
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
    alert("Klaar!");
}

function exportData() {
    const blob = new Blob([JSON.stringify(observations)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = "vogel_backup.json"; a.click();
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = ev => {
            try {
                let json = JSON.parse(ev.target.result);
                let data = Array.isArray(json) ? json : [json];
                
                // We maken een schone start voor de import
                const nieuweLijst = data.map((item, index) => {
                    const nu = new Date();
                    // Herleid datum uit isoDate, timestamp of pak NU
                    let d = item.isoDate ? new Date(item.isoDate) : 
                            (item.timestamp ? parseOldTimestamp(item.timestamp) : nu);
                    
                    // Als de datum ongeldig is, pak nu
                    if (isNaN(d.getTime())) d = nu;

                    return {
                        id: Date.now() + index + Math.floor(Math.random() * 1000),
                        species: item.species || "Onbekend",
                        latin: item.latin || "",
                        status: item.status || "",
                        count: item.count || 1,
                        methode: item.methode || "Gezien",
                        tag: item.tag || "",
                        notes: item.notes || "",
                        coords: item.coords || { lat: 52.1, lon: 5.2 },
                        synced: false,
                        timestamp: d.toLocaleString('nl-NL'),
                        isoDate: d.toISOString()
                    };
                });

                // Voeg toe aan wat we al hadden
                observations = [...nieuweLijst, ...observations];
                localStorage.setItem('birdObs', JSON.stringify(observations));
                
                // FORCEER REFRESH VAN SCHERM
                renderObservations();
                alert(nieuweLijst.length + " vogels succesvol ingeladen!");
            } catch (err) {
                alert("Fout: Het bestand is geen geldig vogel-bestand.");
                console.error(err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function verwijder(id) {
    if(confirm("Verwijderen?")) {
        observations = observations.filter(o => o.id != id);
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
    }
}

init();

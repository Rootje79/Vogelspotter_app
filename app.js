const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxbM8NKbxEVfGXy3vIlegTRM7gD43NLAbPcUcScCHS27MOjP0GzCsjTKQHOtLq_HW-fiw/exec";

let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let vogelAtlas = [];
let pickerMap, pickerMarker, huidigeFilter = 'vandaag';

// Helper: Datum naar formaat voor <input type="datetime-local">
function getLocalISOString(date) {
    if (!date || isNaN(date.getTime())) date = new Date();
    const tzOffset = date.getTimezoneOffset() * 60000;
    return (new Date(date - tzOffset)).toISOString().slice(0, 16);
}

// Helper: Probeert een datum te maken van oude tekst ("2-3-2026 14:00")
function parseOldTimestamp(ts) {
    if (!ts) return new Date();
    try {
        const parts = ts.split(' ');
        const dateParts = parts[0].split('-');
        if (dateParts.length === 3) {
            return new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T${parts[1] || '12:00'}`);
        }
    } catch(e) { return new Date(); }
    return new Date();
}

async function init() {
    await laadVogelLijst();
    initMap();
    startGPS();
    // Zet de invoerdatum standaard op NU
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
    } catch (e) { console.error("Kon soorten.json niet laden."); }
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

// OPSLAAN EN WIJZIGEN
document.getElementById('obsForm').addEventListener('submit', e => {
    e.preventDefault();
    
    try {
        const editId = document.getElementById('editId').value;
        const species = document.getElementById('speciesInput').value;
        const latVal = document.getElementById('latitude').value;
        const lonVal = document.getElementById('longitude').value;
        
        // Check of de vogelnaam wel is ingevuld
        if (!species) {
            alert("Vul aleeerst een vogelsoort in!");
            return;
        }

        const gekozenDatum = new Date(document.getElementById('datetimeInput').value);
        
        const data = {
            species: species,
            latin: document.getElementById('latinInput').value || "",
            status: document.getElementById('statusInput').value || "",
            count: document.getElementById('countInput').value || 1,
            methode: (document.getElementById('checkGezien').checked ? "Gezien" : "") + (document.getElementById('checkGehoord').checked ? " Gehoord" : ""),
            tag: document.getElementById('tagInput').value || "",
            notes: document.getElementById('noteInput').value || "",
            // Zorg dat coords altijd getallen zijn, zelfs als de kaart niet is gebruikt
            coords: { 
                lat: parseFloat(latVal) || 52.1326, 
                lon: parseFloat(lonVal) || 5.2913 
            },
            synced: false,
            timestamp: gekozenDatum.toLocaleString('nl-NL'),
            isoDate: gekozenDatum.toISOString()
        };

        if (editId) {
            // WIJZIGEN BESTAANDE VOGEL
            const idx = observations.findIndex(o => o.id == editId);
            if (idx !== -1) {
                // We behouden het ID, de rest updaten we
                observations[idx] = { ...observations[idx], ...data, id: observations[idx].id };
                console.log("Item bijgewerkt:", editId);
            }
        } else {
            // NIEUWE VOGEL TOEVOEGEN
            data.id = Date.now() + Math.floor(Math.random() * 1000);
            observations.unshift(data);
            console.log("Nieuw item toegevoegd:", data.id);
        }

        // Opslaan in lokaal geheugen
        localStorage.setItem('birdObs', JSON.stringify(observations));
        
        // Formulier resetten
        e.target.reset();
        document.getElementById('editId').value = "";
        document.getElementById('saveBtn').innerText = "OPSLAAN 💾";
        document.getElementById('saveBtn').style.background = "#2d5a27";
        document.getElementById('datetimeInput').value = getLocalISOString(new Date());
        document.getElementById('speciesInfo').innerText = "";
        
        // Lijst en tellers verversen
        renderObservations();
        
        // Optioneel: scroll naar de lijst om te zien dat hij er staat
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

    } catch (err) {
        console.error("Opslaan mislukt:", err);
        alert("Er ging iets mis bij het opslaan: " + err.message);
    }
});

// DE TELLERS EN DE LIJST
function renderObservations() {
    const list = document.getElementById('obsList');
    const query = (document.getElementById('searchInput').value || "").toLowerCase();
    const nu = new Date();
    
    // Tellers (Life, Jaar, Maand, Dag)
    const getUniqueSoorten = (arr) => new Set(arr.map(o => o.species)).size;
    
    const lifeList = observations;
    const yearList = observations.filter(o => new Date(o.isoDate || Date.now()).getFullYear() === nu.getFullYear());
    const monthList = yearList.filter(o => new Date(o.isoDate || Date.now()).getMonth() === nu.getMonth());
    const dayList = observations.filter(o => new Date(o.isoDate || Date.now()).toDateString() === nu.toDateString());

    document.getElementById('statLife').innerText = getUniqueSoorten(lifeList);
    document.getElementById('statYear').innerText = getUniqueSoorten(yearList);
    document.getElementById('statMonth').innerText = getUniqueSoorten(monthList);
    document.getElementById('statDay').innerText = getUniqueSoorten(dayList);

    let filtered = observations.filter(o => {
        const match = o.species.toLowerCase().includes(query) || (o.tag && o.tag.toLowerCase().includes(query));
        if (huidigeFilter === 'vandaag') return match && new Date(o.isoDate || Date.now()).toDateString() === nu.toDateString();
        if (huidigeFilter === 'pending') return match && !o.synced;
        return match;
    });

    list.innerHTML = filtered.map(o => `
        <div class="card ${o.synced ? 'synced' : 'pending'}" style="background:white; padding:12px; margin:10px; border-radius:10px; border-left:6px solid ${o.synced ? '#4caf50' : '#ffa000'}; display:flex; justify-content:space-between; align-items:center;">
            <div style="flex:1" onclick="bewerkWaarneming(${o.id})">
                <strong>${o.species} (${o.count})</strong><br>
                <small>${o.timestamp} | ${o.tag || ''}</small>
            </div>
            <button onclick="verwijder(${o.id})" style="border:none; background:none; color:red; font-size:1.2rem; padding:10px;">🗑️</button>
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
    document.getElementById('latinInput').value = o.latin || "";
    document.getElementById('statusInput').value = o.status || "";
    document.getElementById('speciesInfo').innerHTML = `<i>${o.latin || ''}</i> • <b>${o.status || ''}</b>`;
    
    const d = o.isoDate ? new Date(o.isoDate) : parseOldTimestamp(o.timestamp);
    document.getElementById('datetimeInput').value = getLocalISOString(d);

    document.getElementById('saveBtn').innerText = "WIJZIGING OPSLAAN ✏️";
    document.getElementById('saveBtn').style.background = "#ffa000";
    window.scrollTo({top: 0, behavior: 'smooth'});
}

// DE VERBETERDE IMPORT
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = e => {
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                let json = JSON.parse(ev.target.result);
                let data = Array.isArray(json) ? json : [json];
                
                const nieuweItems = data.map((item, index) => {
                    let d = item.isoDate ? new Date(item.isoDate) : 
                            (item.timestamp ? parseOldTimestamp(item.timestamp) : new Date());
                    if (isNaN(d.getTime())) d = new Date();

                    return {
                        id: Date.now() + index + Math.floor(Math.random() * 1000),
                        species: item.species || "Onbekend",
                        latin: item.latin || "",
                        status: item.status || "",
                        count: item.count || 1,
                        methode: item.methode || "Gezien",
                        tag: item.tag || "Import",
                        notes: item.notes || "",
                        coords: item.coords || { lat: 52.1, lon: 5.2 },
                        synced: false,
                        timestamp: d.toLocaleString('nl-NL'),
                        isoDate: d.toISOString()
                    };
                });

                observations = [...nieuweItems, ...observations];
                localStorage.setItem('birdObs', JSON.stringify(observations));
                renderObservations();
                alert(nieuweItems.length + " vogels toegevoegd!");
            } catch (err) { alert("Fout bij laden bestand."); }
        };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
}

async function synchroniseerData() {
    const pending = observations.filter(o => !o.synced);
    if(pending.length === 0) return alert("Alles is gesynct!");
    for (let o of pending) {
        try {
            await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(o) });
            o.synced = true;
        } catch (e) {}
    }
    localStorage.setItem('birdObs', JSON.stringify(observations));
    renderObservations();
    alert("Sync voltooid!");
}

function exportData() {
    const blob = new Blob([JSON.stringify(observations)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = "vogel_backup.json"; a.click();
}

function verwijder(id) {
    if(confirm("Verwijderen?")) {
        observations = observations.filter(o => o.id != id);
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
    }
}

init();

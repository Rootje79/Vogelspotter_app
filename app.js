const GOOGLE_SCRIPT_URL = "JOUW_WEB_APP_URL_HIER";
let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let locationTags = JSON.parse(localStorage.getItem('locationTags')) || [];
let vogelAtlas = [];
let currentCoords = null;

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

if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(p => {
        currentCoords = { lat: p.coords.latitude, lon: p.coords.longitude };
        document.getElementById('gps-indicator').innerText = `📍 GPS OK`;
    });
}

document.getElementById('obsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = vogelAtlas.find(x => x.naam === document.getElementById('speciesInput').value);
    const newObs = {
        id: Date.now(),
        synced: false,
        species: document.getElementById('speciesInput').value,
        wetenschappelijk: document.getElementById('latinInput').value || (v ? v.WetSchap : ""),
        status: v ? v.status : "onbekend",
        count: document.getElementById('countInput').value,
        notes: document.getElementById('noteInput').value,
        tag: document.getElementById('tagInput').value,
        coords: currentCoords,
        timestamp: new Date().toLocaleString('nl-NL')
    };
    observations.unshift(newObs);
    localStorage.setItem('birdObs', JSON.stringify(observations));
    renderObservations();
    e.target.reset();
});

async function synchroniseerData() {
    const pending = observations.filter(o => !o.synced);
    if (pending.length === 0) return alert("Alles is bijgewerkt!");
    
    const btn = document.getElementById('syncBtn');
    btn.disabled = true;
    btn.innerText = "⏳...";

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

function verwijderWaarneming(index) {
    if(confirm("Verwijderen?")) {
        observations.splice(index, 1);
        localStorage.setItem('birdObs', JSON.stringify(observations));
        renderObservations();
    }
}

function renderObservations() {
    const list = document.getElementById('obsList');
    const unique = new Set(observations.map(o => o.species));
    document.getElementById('totalBirds').innerText = observations.reduce((s, o) => s + parseInt(o.count), 0);
    document.getElementById('totalSpecies').innerText = unique.size;

    list.innerHTML = observations.map((o, i) => `
        <div class="card ${o.synced ? 'synced' : 'pending'}">
            <div>
                <strong>${o.species} ${o.synced ? '✅' : '☁️'}</strong><br>
                <small><em>${o.wetenschappelijk}</em></small> (x${o.count})<br>
                <small>${o.timestamp} | ${o.tag || 'Geen tag'}</small>
            </div>
            <button class="delete-btn" onclick="verwijderWaarneming(${i})">🗑️</button>
        </div>
    `).join('');
    document.getElementById('lifelist').innerHTML = Array.from(unique).map(s => `<li>${s}</li>`).join('');
}

laadVogelLijst();
renderObservations();

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzhghDGxZVExNW8TIZ2qzMqHFK3tEVFFblg6ODEp4Juel9g1AT3vf541-gcDmN8qqNeeA/exec";
let observations = JSON.parse(localStorage.getItem('birdObs')) || [];
let locationTags = JSON.parse(localStorage.getItem('locationTags')) || [];
let vogelAtlas = [];
let currentCoords = null;

// 1. Vogelatlas laden
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
        console.log("Atlas geladen. Tags in geheugen:", locationTags.length);
    } catch (e) { console.error("JSON fout", e); }
}

// 2. Wetenschappelijke naam invullen
document.getElementById('speciesInput').addEventListener('input', (e) => {
    const v = vogelAtlas.find(x => x.naam === e.target.value);
    if (v) document.getElementById('latinInput').value = v.WetSchap;
});

// 3. Verbeterde GPS & Automatische Tagging
function startGPS() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(p => {
            currentCoords = { 
                lat: p.coords.latitude, 
                lon: p.coords.longitude,
                accuracy: p.coords.accuracy 
            };
            
            const meterNauwkeurig = Math.round(p.coords.accuracy);
            document.getElementById('gps-indicator').innerText = `📍 GPS OK (±${meterNauwkeurig}m)`;

            // --- DE FIX: Directe herkenning ---
            if (locationTags.length > 0) {
                const tagInput = document.getElementById('tagInput');
                
                // Zoek dichtstbijzijnde tag
                let dichtstbij = null;
                let minAfstand = 0.2; // We verhogen de straal naar 200 meter voor de zekerheid

                locationTags.forEach(tag => {
                    const d = berekenAfstand(currentCoords, tag);
                    if (d < minAfstand) {
                        minAfstand = d;
                        dichtstbij = tag;
                    }
                });

                if (dichtstbij && tagInput.value === "") {
                    tagInput.value = dichtstbij.name;
                    tagInput.classList.add('tag-detected'); // Gebruik de CSS class
                    console.log("Tag automatisch ingevuld: " + dichtstbij.name);
                }
            }
            
        }, err => {
            document.getElementById('gps-indicator').innerText = "📍 GPS Fout: " + err.message;
        }, { 
            enableHighAccuracy: true, 
            timeout: 5000, 
            maximumAge: 0 
        });
    }
}

function checkNearbyTags() {
    if (!currentCoords || locationTags.length === 0) return;

    // Zoek naar een tag binnen 150 meter (0.15 km)
    const straal = 0.15; 
    const dichtstbijzijndeTag = locationTags
        .map(tag => ({ ...tag, afstand: berekenAfstand(currentCoords, tag) }))
        .filter(tag => tag.afstand < straal)
        .sort((a, b) => a.afstand - b.afstand)[0];

    const tagInput = document.getElementById('tagInput');
    
    // Alleen invullen als het veld nog leeg is (voorkomt overschrijven handmatige invoer)
    if (dichtstbijzijndeTag && tagInput.value === "") {
        tagInput.value = dichtstbijzijndeTag.name;
        tagInput.style.backgroundColor = "#e8f0e6"; // Lichtgroene hint dat het automatisch is
    }
}

// Haversine formule voor afstand in km
function berekenAfstand(c1, c2) {
    const R = 6371;
    const dLat = (c2.lat - c1.lat) * Math.PI / 180;
    const dLon = (c2.lon - c1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(c1.lat*Math.PI/180) * Math.cos(c2.lat*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 4. Opslaan
document.getElementById('obsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = vogelAtlas.find(x => x.naam === document.getElementById('speciesInput').value);
    const tagName = document.getElementById('tagInput').value.trim();

    const newObs = {
        id: Date.now(),
        synced: false,
        species: document.getElementById('speciesInput').value,
        wetenschappelijk: document.getElementById('latinInput').value || (v ? v.WetSchap : ""),
        status: v ? v.status : "onbekend",
        count: document.getElementById('countInput').value,
        notes: document.getElementById('noteInput').value,
        tag: tagName,
        coords: currentCoords,
        timestamp: new Date().toLocaleString('nl-NL')
    };

    // Belangrijk: Sla de locatie op als een nieuwe tag als deze nog niet bestaat
    if (tagName && currentCoords) {
        const bestaandeTag = locationTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
        if (!bestaandeTag) {
            locationTags.push({ name: tagName, lat: currentCoords.lat, lon: currentCoords.lon });
            localStorage.setItem('locationTags', JSON.stringify(locationTags));
            console.log("Nieuwe tag opgeslagen:", tagName);
        }
    }

    observations.unshift(newObs);
    localStorage.setItem('birdObs', JSON.stringify(observations));
    renderObservations();
    
    // Reset formulier maar behoud achtergrondkleur tagInput
    e.target.reset();
    document.getElementById('tagInput').style.backgroundColor = "";
});

// 5. Synchronisatie
async function synchroniseerData() {
    const pending = observations.filter(o => !o.synced);
    if (pending.length === 0) return alert("Geen nieuwe waarnemingen.");
    
    const btn = document.getElementById('syncBtn');
    btn.disabled = true;
    btn.innerText = "⏳...";

    for (let o of pending) {
        try {
            const res = await fetch(GOOGLE_SCRIPT_URL, { 
                method: 'POST', 
                mode: 'no-cors', 
                body: JSON.stringify(o) 
            });
            o.synced = true;
        } catch (e) { 
            alert("Sync afgebroken: geen internet?");
            break; 
        }
    }
    localStorage.setItem('birdObs', JSON.stringify(observations));
    renderObservations();
    btn.disabled = false;
    btn.innerText = "Sync ☁️";
}

function verwijderWaarneming(index) {
    if(confirm("Verwijderen uit lijst?")) {
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
    document.getElementById('lifelist').innerHTML = Array.from(unique).sort().map(s => `<li>${s}</li>`).join('');
}

// Start de boel
laadVogelLijst();
startGPS();
renderObservations();

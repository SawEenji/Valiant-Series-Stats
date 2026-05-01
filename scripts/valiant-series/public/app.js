async function load() {

  let players = await fetch("/api/players").then(r => r.json());
  let matches = await fetch("/api/matches").then(r => r.json());
  let tournaments = await fetch("/api/tournaments").then(r => r.json());

  document.getElementById("app").innerHTML = `
    <div class="card">
      <h3>🏆 Топ игроков</h3>
      ${players.sort((a,b)=>b.elo-a.elo).map(p=>`
        <div>${p.nick} (${p.elo})</div>
      `).join("")}
    </div>

    <div class="card">
      <h3>🎮 Матчи</h3>
      ${matches.map((m,i)=>`
        <div>
          ${m.team1} vs ${m.team2} (${m.score}) [${m.status}]
          <button onclick="finish(${i})">🏆</button>
        </div>
      `).join("")}
    </div>

    <div class="card">
      <h3>🏆 Турниры</h3>
      ${tournaments.map(t=>`
        <div>${t.name} (${t.status})</div>
      `).join("")}
    </div>
  `;
}

async function finish(id){
  await fetch("/api/matches/finish", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({id})
  });

  load();
}

load();

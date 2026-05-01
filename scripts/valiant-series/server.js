const express = require("express");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static("public"));

let db = JSON.parse(fs.readFileSync("db.json"));

// ===== SAVE =====
function save() {
  fs.writeFileSync("db.json", JSON.stringify(db, null, 2));
}

// ===== PLAYERS =====
app.get("/api/players", (req, res) => res.json(db.players));

app.post("/api/players", (req, res) => {
  db.players.push(req.body);
  save();
  res.sendStatus(200);
});

// ===== TEAMS =====
app.get("/api/teams", (req, res) => res.json(db.teams));

app.post("/api/teams", (req, res) => {
  db.teams.push(req.body);
  save();
  res.sendStatus(200);
});

// ===== MATCHES =====
app.get("/api/matches", (req, res) => res.json(db.matches));

app.post("/api/matches", (req, res) => {
  db.matches.push(req.body);
  save();
  res.sendStatus(200);
});

// ===== TOURNAMENTS =====
app.get("/api/tournaments", (req, res) => res.json(db.tournaments));

app.post("/api/tournaments", (req, res) => {
  db.tournaments.push(req.body);
  save();
  res.sendStatus(200);
});

// ===== FINISH MATCH (ELO) =====
app.post("/api/matches/finish", (req, res) => {
  let m = db.matches[req.body.id];

  let [s1, s2] = m.score.split("-").map(Number);

  let t1 = db.teams.find(t => t.name === m.team1);
  let t2 = db.teams.find(t => t.name === m.team2);

  if (!t1 || !t2) return res.sendStatus(400);

  let k = 32;

  let e1 = 1 / (1 + Math.pow(10, (t2.elo - t1.elo) / 400));
  let r1 = s1 > s2 ? 1 : 0;

  t1.elo += Math.round(k * (r1 - e1));
  t2.elo += Math.round(k * ((1 - r1) - (1 - e1)));

  m.status = "FINISHED";

  save();
  res.sendStatus(200);
});

app.listen(3000, () => console.log("Server started"));

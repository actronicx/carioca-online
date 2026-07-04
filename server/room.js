const {
  MANI, creaMazzo, mescola, puntiCarta, isGruppoStessoValore, isScalaColore,
  isGruppoChiusuraValido, validaGruppo, NUM_CARTE_MANO, nomeRichiesta,
} = require("./gameEngine");

function generaCodice() {
  const lettere = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // niente O/I per evitare confusione
  let codice = "";
  for (let i = 0; i < 4; i++) codice += lettere[Math.floor(Math.random() * lettere.length)];
  return codice;
}

function nuovaStanza(nomeHost, socketIdHost) {
  const codice = generaCodice();
  const stato = {
    codice,
    nomi: [nomeHost],
    socketIds: [socketIdHost],
    connessi: [true],
    numGiocatori: 1,
    giocatoreIniziale: 0,
    fase: "lobby", // lobby | gioco | manoFinita | partitaFinita
    round: 0,
    maniRimanenti: [],
    manoAttuale: null,
    mazzo: [],
    pozzo: [],
    mani: [],
    sceso: [],
    combinazioniScese: [],
    turno: 0,
    haPescato: false,
    punteggi: [],
    storicoPunteggi: [],
    messaggio: "",
  };
  return stato;
}

function entraStanza(stato, nome, socketId) {
  if (stato.fase !== "lobby") return { ok: false, errore: "La partita è già iniziata." };
  if (stato.numGiocatori >= 6) return { ok: false, errore: "La stanza è piena (massimo 6 giocatori)." };
  stato.nomi.push(nome);
  stato.socketIds.push(socketId);
  stato.connessi.push(true);
  stato.numGiocatori += 1;
  return { ok: true, idx: stato.numGiocatori - 1 };
}

function distribuisciCarte(stato) {
  const nuovoMazzo = mescola(creaMazzo());
  const nuoveMani = [];
  let cursore = 0;
  for (let i = 0; i < stato.numGiocatori; i++) {
    nuoveMani.push(nuovoMazzo.slice(cursore, cursore + NUM_CARTE_MANO));
    cursore += NUM_CARTE_MANO;
  }
  const restoMazzo = nuovoMazzo.slice(cursore);
  const primaCartaPozzo = restoMazzo.pop();
  stato.mazzo = restoMazzo;
  stato.pozzo = [primaCartaPozzo];
  stato.mani = nuoveMani;
  stato.sceso = new Array(stato.numGiocatori).fill(false);
  stato.combinazioniScese = new Array(stato.numGiocatori).fill(null).map(() => []);
  stato.haPescato = false;
  stato.manoAttuale = null;
  stato.messaggio = "";
  const chooserIdx = (stato.giocatoreIniziale + stato.round) % stato.numGiocatori;
  stato.turno = chooserIdx;
}

function iniziaPartita(stato, giocatoreInizialeIdx) {
  if (stato.fase !== "lobby") return { ok: false, errore: "La partita è già iniziata." };
  if (stato.numGiocatori < 2) return { ok: false, errore: "Servono almeno 2 giocatori." };
  stato.giocatoreIniziale = giocatoreInizialeIdx % stato.numGiocatori;
  stato.punteggi = new Array(stato.numGiocatori).fill(0);
  stato.storicoPunteggi = [];
  stato.round = 0;
  stato.maniRimanenti = MANI.map((m) => m.id);
  distribuisciCarte(stato);
  stato.fase = "gioco";
  return { ok: true };
}

function sceltaMano(stato, idx, idMano) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno di scegliere." };
  if (stato.manoAttuale) return { ok: false, errore: "La mano è già stata scelta." };
  const manoScelta = MANI.find((m) => m.id === idMano);
  if (!manoScelta || !stato.maniRimanenti.includes(idMano)) return { ok: false, errore: "Mano non valida." };
  stato.maniRimanenti = stato.maniRimanenti.filter((x) => x !== idMano);
  stato.manoAttuale = manoScelta;
  stato.messaggio = `${manoScelta.nome} — ${manoScelta.desc}`;
  return { ok: true };
}

function pescaDalMazzo(stato, idx) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (!stato.manoAttuale) return { ok: false, errore: "La mano non è stata ancora scelta." };
  if (stato.haPescato) return { ok: false, errore: "Hai già pescato in questo turno." };
  if (stato.mazzo.length === 0) {
    if (stato.pozzo.length <= 1) return { ok: false, errore: "Nessuna carta disponibile da pescare." };
    const ultima = stato.pozzo[stato.pozzo.length - 1];
    const nuovoMazzo = mescola(stato.pozzo.slice(0, -1));
    const carta = nuovoMazzo[0];
    stato.mazzo = nuovoMazzo.slice(1);
    stato.pozzo = [ultima];
    stato.mani[idx] = [...stato.mani[idx], carta];
  } else {
    const nuovoMazzo = [...stato.mazzo];
    const carta = nuovoMazzo.pop();
    stato.mazzo = nuovoMazzo;
    stato.mani[idx] = [...stato.mani[idx], carta];
  }
  stato.haPescato = true;
  return { ok: true };
}

function pescaDalPozzo(stato, idx) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (!stato.manoAttuale) return { ok: false, errore: "La mano non è stata ancora scelta." };
  if (stato.haPescato) return { ok: false, errore: "Hai già pescato in questo turno." };
  if (stato.pozzo.length === 0) return { ok: false, errore: "Il pozzo è vuoto." };
  const nuovoPozzo = [...stato.pozzo];
  const carta = nuovoPozzo.pop();
  stato.pozzo = nuovoPozzo;
  stato.mani[idx] = [...stato.mani[idx], carta];
  stato.haPescato = true;
  return { ok: true };
}

function finalizzaMano(stato, vincitoreIdx) {
  const puntiMano = stato.mani.map((m) => m.reduce((tot, c) => tot + puntiCarta(c), 0));
  puntiMano[vincitoreIdx] = 0;
  stato.punteggi = stato.punteggi.map((p, i) => p + puntiMano[i]);
  stato.storicoPunteggi.push({ round: stato.round, manoNome: stato.manoAttuale.nome, punti: puntiMano, vincitore: vincitoreIdx });
  stato.messaggio = `${stato.nomi[vincitoreIdx]} ha chiuso la mano "${stato.manoAttuale.nome}"!`;
  stato.fase = "manoFinita";
}

function scarta(stato, idx, idCarta) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (!stato.haPescato) return { ok: false, errore: "Devi prima pescare una carta." };
  const manoGiocatore = stato.mani[idx];
  const carta = manoGiocatore.find((c) => c.id === idCarta);
  if (!carta) return { ok: false, errore: "Carta non trovata in mano." };

  const vietati = stato.manoAttuale.valoriVietati || [];
  if (vietati.length > 0 && vietati.includes(carta.valore)) {
    const tuttiScesi = stato.sceso.length > 0 && stato.sceso.every((s) => s);
    const obbligato = manoGiocatore.every((c) => vietati.includes(c.valore));
    if (!tuttiScesi && !obbligato) {
      return { ok: false, errore: `Non puoi scartare ${carta.valore} finché non sono scesi tutti i giocatori con "${stato.manoAttuale.nome}" (a meno che tu non abbia in mano solo ${vietati.join("/")}).` };
    }
  }

  const nuovaMano = manoGiocatore.filter((c) => c.id !== idCarta);
  stato.mani[idx] = nuovaMano;
  stato.pozzo = [...stato.pozzo, carta];
  stato.haPescato = false;

  if (nuovaMano.length === 0) {
    finalizzaMano(stato, idx);
    return { ok: true };
  }
  stato.turno = (idx + 1) % stato.numGiocatori;
  stato.messaggio = "";
  return { ok: true };
}

const LUNGHEZZA_ATTESA = {
  coppiaVestita: 2,
  coppiaNonVestita: 2,
  coppiaEsatta: 2,
  trisEsatto: 3,
  pokerSemiDiversi: 4,
  scalaReale5: 5,
};

function motivoErroreGruppo(carte, richiesta) {
  if (carte.length === 0) return "non hai messo nessuna carta in questo gruppo";
  const contieneJolly = carte.some((c) => c.jolly);
  if (contieneJolly) return "contiene un jolly, che non è ammesso nella discesa iniziale";
  const attesa = LUNGHEZZA_ATTESA[richiesta.tipo];
  if (attesa && carte.length !== attesa) return `servono esattamente ${attesa} carte (ne hai messe ${carte.length})`;
  if (richiesta.tipo === "scalaMin3" && carte.length < 3) return `servono almeno 3 carte (ne hai messe ${carte.length})`;
  const nonJolly = carte.filter((c) => !c.jolly);
  const valori = new Set(nonJolly.map((c) => c.valore));
  if (richiesta.tipo !== "scalaMin3" && valori.size > 1) return "le carte non hanno tutte lo stesso valore";
  const semi = nonJolly.map((c) => c.seme);
  if (new Set(semi).size !== semi.length) return "hai due carte con lo stesso seme (serve un seme diverso per ciascuna)";
  if (richiesta.tipo === "coppiaVestita") return "servono due carte tra J, Q, K, Asso";
  if (richiesta.tipo === "coppiaNonVestita") return "servono due carte numeriche tra 2 e 10";
  if (richiesta.tipo === "scalaReale5" || richiesta.tipo === "scalaMin3") return "le carte non sono in sequenza dello stesso seme";
  return "controlla che i valori e i semi corrispondano a quanto richiesto";
}

function confermaScendi(stato, idx, gruppiIds) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (stato.sceso[idx]) return { ok: false, errore: "Sei già sceso in questa mano." };
  const richieste = stato.manoAttuale.richiesta;
  if (gruppiIds.length !== richieste.length) return { ok: false, errore: "Numero di gruppi non corretto." };
  const manoGiocatore = stato.mani[idx];
  const gruppiCarte = gruppiIds.map((ids) => ids.map((id) => manoGiocatore.find((c) => c.id === id)).filter(Boolean));

  for (let i = 0; i < richieste.length; i++) {
    if (!validaGruppo(gruppiCarte[i], richieste[i], false)) {
      const motivo = motivoErroreGruppo(gruppiCarte[i], richieste[i]);
      return { ok: false, errore: `Il gruppo ${i + 1} (${nomeRichiesta(richieste[i])}) non è valido: ${motivo}.` };
    }
  }

  const idsUsati = new Set(gruppiIds.flat());
  const nuovaMano = manoGiocatore.filter((c) => !idsUsati.has(c.id));
  stato.mani[idx] = nuovaMano;
  stato.combinazioniScese[idx] = gruppiCarte.map((carte, i) => ({ tipo: richieste[i].tipo, carte }));
  stato.sceso[idx] = true;
  stato.messaggio = `${stato.nomi[idx]} è sceso! Ora può scartare o attaccare carte alle combinazioni.`;

  if (nuovaMano.length === 0) {
    finalizzaMano(stato, idx);
  }
  return { ok: true };
}

function confermaScendiLibero(stato, idx, tipo, ids) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (!stato.sceso[idx]) return { ok: false, errore: "Devi prima scendere la combinazione richiesta." };
  const manoGiocatore = stato.mani[idx];
  const carte = ids.map((id) => manoGiocatore.find((c) => c.id === id)).filter(Boolean);

  let valido = false;
  let erroreMsg = "";
  if (tipo === "tris") {
    valido = carte.length === 3 && isGruppoStessoValore(carte, { lunghezzaEsatta: 3, semiDiversi: true, permettiJolly: true });
    erroreMsg = "Servono esattamente 3 carte dello stesso valore, semi diversi (o jolly).";
  } else if (tipo === "poker") {
    valido = carte.length === 4 && isGruppoStessoValore(carte, { lunghezzaEsatta: 4, semiDiversi: true, permettiJolly: true });
    erroreMsg = "Servono esattamente 4 carte dello stesso valore, semi diversi (o jolly).";
  } else if (tipo === "scala") {
    valido = carte.length >= 3 && isScalaColore(carte, { min: 3, permettiJolly: true });
    erroreMsg = "Servono almeno 3 carte dello stesso seme, in sequenza (o jolly).";
  }
  if (!valido) return { ok: false, errore: erroreMsg };

  const idsUsati = new Set(ids);
  const nuovaMano = manoGiocatore.filter((c) => !idsUsati.has(c.id));
  stato.mani[idx] = nuovaMano;
  const nomeGruppo = tipo === "tris" ? "trisLibero" : tipo === "poker" ? "pokerLibero" : "scalaLibera";
  stato.combinazioniScese[idx] = [...stato.combinazioniScese[idx], { tipo: nomeGruppo, carte }];
  stato.messaggio = `Nuova combinazione (${tipo === "tris" ? "Tris" : tipo === "poker" ? "Poker" : "Scala"}) scesa sul tavolo!`;

  if (nuovaMano.length === 0) {
    finalizzaMano(stato, idx);
  }
  return { ok: true };
}

function attaccaCarte(stato, idx, giocatoreTarget, gruppoIdx, ids) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (!stato.sceso[idx]) return { ok: false, errore: "Devi prima scendere con la tua combinazione." };
  const manoGiocatore = stato.mani[idx];
  const carte = ids.map((id) => manoGiocatore.find((c) => c.id === id)).filter(Boolean);
  if (carte.length === 0) return { ok: false, errore: "Nessuna carta selezionata." };

  const vietati = stato.manoAttuale.valoriVietati || [];
  if (vietati.length > 0) {
    const contieneVietata = carte.some((c) => vietati.includes(c.valore));
    const tuttiScesi = stato.sceso.length > 0 && stato.sceso.every((s) => s);
    if (contieneVietata && !tuttiScesi) {
      return { ok: false, errore: `Non puoi attaccare ${vietati.join("/")} finché non sono scesi tutti i giocatori con "${stato.manoAttuale.nome}".` };
    }
  }

  const gruppoEsistente = stato.combinazioniScese[giocatoreTarget]?.[gruppoIdx];
  if (!gruppoEsistente) return { ok: false, errore: "Combinazione non trovata." };
  const nuovoGruppo = [...gruppoEsistente.carte, ...carte];
  const eGruppoScala = gruppoEsistente.tipo.toLowerCase().includes("scala");
  const valido = eGruppoScala
    ? isScalaColore(nuovoGruppo, { min: 3, permettiJolly: true })
    : isGruppoStessoValore(nuovoGruppo, { semiDiversi: true, permettiJolly: true });
  if (!valido) return { ok: false, errore: "Le carte selezionate non si aggiungono validamente a questa combinazione." };

  stato.combinazioniScese[giocatoreTarget][gruppoIdx] = { ...gruppoEsistente, carte: nuovoGruppo };
  const idsUsati = new Set(ids);
  const nuovaMano = manoGiocatore.filter((c) => !idsUsati.has(c.id));
  stato.mani[idx] = nuovaMano;
  stato.messaggio = "Carte aggiunte alla combinazione!";

  if (nuovaMano.length === 0) {
    finalizzaMano(stato, idx);
  }
  return { ok: true };
}

function confermaChiusura(stato, idx, gruppiIds) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  const manoGiocatore = stato.mani[idx];
  const tuttiId = gruppiIds.flat();
  const idsUnici = new Set(tuttiId);
  if (idsUnici.size !== tuttiId.length) return { ok: false, errore: "Alcune carte sono assegnate a più di un gruppo." };
  if (tuttiId.length !== manoGiocatore.length) return { ok: false, errore: `Devi assegnare tutte le ${manoGiocatore.length} carte ai gruppi per chiudere.` };

  for (let i = 0; i < gruppiIds.length; i++) {
    const carte = gruppiIds[i].map((id) => manoGiocatore.find((c) => c.id === id)).filter(Boolean);
    if (!isGruppoChiusuraValido(carte)) {
      return { ok: false, errore: `Il gruppo ${i + 1} non è valido (serve tris, poker o scala da 3+ carte stesso seme, senza jolly).` };
    }
  }

  stato.mani[idx] = [];
  finalizzaMano(stato, idx);
  return { ok: true };
}

function prossimaMano(stato) {
  if (stato.fase !== "manoFinita") return { ok: false, errore: "Non è il momento di passare alla mano successiva." };
  if (stato.maniRimanenti.length === 0) {
    stato.fase = "partitaFinita";
  } else {
    stato.round += 1;
    distribuisciCarte(stato);
    stato.fase = "gioco";
  }
  return { ok: true };
}

// Restituisce lo stato "personalizzato" per un dato giocatore: solo la propria mano è visibile per intero
function serializzaPerGiocatore(stato, idx) {
  return {
    codice: stato.codice,
    nomi: stato.nomi,
    numGiocatori: stato.numGiocatori,
    connessi: stato.connessi,
    giocatoreIniziale: stato.giocatoreIniziale,
    fase: stato.fase,
    round: stato.round,
    maniRimanenti: stato.maniRimanenti,
    maniDisponibili: MANI,
    manoAttuale: stato.manoAttuale,
    mazzoCount: stato.mazzo.length,
    pozzo: stato.pozzo,
    manoGiocatore: stato.mani[idx] || [],
    carteAltri: stato.mani.map((m) => m.length),
    sceso: stato.sceso,
    combinazioniScese: stato.combinazioniScese,
    turno: stato.turno,
    haPescato: stato.haPescato,
    punteggi: stato.punteggi,
    storicoPunteggi: stato.storicoPunteggi,
    messaggio: stato.messaggio,
    tuoIndice: idx,
  };
}

module.exports = {
  nuovaStanza, entraStanza, iniziaPartita, sceltaMano, pescaDalMazzo, pescaDalPozzo,
  scarta, confermaScendi, confermaScendiLibero, attaccaCarte, confermaChiusura, prossimaMano,
  serializzaPerGiocatore,
};

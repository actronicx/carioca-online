const {
  MANI, creaMazzo, mescola, puntiCarta, isGruppoStessoValore, isScalaColore,
  isGruppoChiusuraValido, validaGruppo, NUM_CARTE_MANO, nomeRichiesta, validaEPuntiGruppoScala40, SEMI,
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

const ID_BOMBA = 8;

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
  stato.sceltaAlBuio = false;
  const chooserIdx = (stato.giocatoreIniziale + stato.round) % stato.numGiocatori;
  stato.turno = chooserIdx;
  stato.sceltoDa = chooserIdx;
  stato.turnoContatore = 0; // incrementa ad ogni turno individuale giocato in questa mano
  stato.turnoScesoIn = new Array(stato.numGiocatori).fill(null); // in che turno (contatore) ciascuno è sceso
  stato.scartoReclamabile = null; // { cartaId, giocatoreCheHaRifiutato, richiedenti: [idx,...] } durante la finestra di 10s
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

function sceltaMano(stato, idx, idMano, alBuio) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno di scegliere." };
  if (stato.manoAttuale) return { ok: false, errore: "La mano è già stata scelta." };
  const manoScelta = MANI.find((m) => m.id === idMano);
  if (!manoScelta || !stato.maniRimanenti.includes(idMano)) return { ok: false, errore: "Mano non valida." };
  stato.maniRimanenti = stato.maniRimanenti.filter((x) => x !== idMano);
  stato.manoAttuale = manoScelta;
  stato.sceltoDa = idx;
  stato.sceltaAlBuio = idMano === ID_BOMBA && !!alBuio;
  stato.messaggio = stato.sceltaAlBuio
    ? `${manoScelta.nome} (scelta al buio!) — ${manoScelta.desc}`
    : `${manoScelta.nome} — ${manoScelta.desc}`;
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
  // Ha rifiutato la carta in cima al pozzo (se c'era, e non è un Jolly): si apre una finestra di 10s
  // in cui chiunque altro può segnalare interesse; passato il tempo, vince chi è di turno più vicino.
  // Un Jolly scartato non è MAI reclamabile da nessuno.
  const cimaPozzo = stato.pozzo[stato.pozzo.length - 1];
  stato.scartoReclamabile = cimaPozzo && !cimaPozzo.jolly
    ? { cartaId: cimaPozzo.id, giocatoreCheHaRifiutato: idx, richiedenti: [] }
    : null;
  return { ok: true };
}

function pescaDalPozzo(stato, idx) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (!stato.manoAttuale) return { ok: false, errore: "La mano non è stata ancora scelta." };
  if (stato.haPescato) return { ok: false, errore: "Hai già pescato in questo turno." };
  if (stato.pozzo.length === 0) return { ok: false, errore: "Il pozzo è vuoto." };

  const cartaInCima = stato.pozzo[stato.pozzo.length - 1];

  if (cartaInCima.jolly) {
    return { ok: false, errore: "Non puoi mai prendere un Jolly dal pozzo (scartato o rifiutato). Pesca dal mazzo." };
  }

  const vietati = stato.manoAttuale.valoriVietati || [];
  if (vietati.length > 0 && vietati.includes(cartaInCima.valore)) {
    const tuttiScesi = stato.sceso.length > 0 && stato.sceso.every((s) => s);
    if (!tuttiScesi) {
      return { ok: false, errore: `Non puoi prendere ${cartaInCima.valore} dal pozzo finché non sono scesi tutti i giocatori con "${stato.manoAttuale.nome}". Pesca dal mazzo.` };
    }
  }

  const nuovoPozzo = [...stato.pozzo];
  const carta = nuovoPozzo.pop();
  stato.pozzo = nuovoPozzo;
  stato.mani[idx] = [...stato.mani[idx], carta];
  stato.haPescato = true;
  return { ok: true };
}

function finalizzaMano(stato, vincitoreIdx) {
  const puntiMano = stato.mani.map((m) => m.reduce((tot, c) => tot + puntiCarta(c), 0));

  let bonusVincitore = -10; // vince la mano: -10 punti
  if (vincitoreIdx === stato.sceltoDa) {
    bonusVincitore = -20; // vince la mano che ha scelto lui stesso: -20 punti
    if (stato.manoAttuale.id === ID_BOMBA && stato.sceltaAlBuio) {
      bonusVincitore = -40; // ha scelto la Bomba al buio e l'ha vinta: -40 punti
    }
  }
  puntiMano[vincitoreIdx] = bonusVincitore;

  stato.punteggi = stato.punteggi.map((p, i) => p + puntiMano[i]);
  stato.storicoPunteggi.push({
    round: stato.round,
    manoNome: stato.manoAttuale.nome,
    punti: puntiMano,
    vincitore: vincitoreIdx,
    bonusVincitore,
  });
  stato.messaggio = `${stato.nomi[vincitoreIdx]} ha chiuso la mano "${stato.manoAttuale.nome}"! (${bonusVincitore} punti)`;
  stato.fase = "manoFinita";
}

function scarta(stato, idx, idCarta) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (!stato.haPescato) return { ok: false, errore: "Devi prima pescare una carta." };
  const manoGiocatore = stato.mani[idx];
  const carta = manoGiocatore.find((c) => c.id === idCarta);
  if (!carta) return { ok: false, errore: "Carta non trovata in mano." };

  const vietati = stato.manoAttuale.valoriVietati || [];
  let eraObbligato = false;
  if (vietati.length > 0 && vietati.includes(carta.valore)) {
    const tuttiScesi = stato.sceso.length > 0 && stato.sceso.every((s) => s);
    const obbligato = manoGiocatore.every((c) => vietati.includes(c.valore));
    if (!tuttiScesi && !obbligato) {
      return { ok: false, errore: `Non puoi scartare ${carta.valore} finché non sono scesi tutti i giocatori con "${stato.manoAttuale.nome}" (a meno che tu non abbia in mano solo ${vietati.join("/")}).` };
    }
    eraObbligato = !tuttiScesi && obbligato;
  }

  const nuovaMano = manoGiocatore.filter((c) => c.id !== idCarta);
  stato.mani[idx] = nuovaMano;
  stato.pozzo = [...stato.pozzo, carta];
  stato.haPescato = false;
  stato.scartoReclamabile = null; // la nuova carta scartata seppellisce quella eventualmente reclamabile

  if (nuovaMano.length === 0) {
    finalizzaMano(stato, idx);
    return { ok: true };
  }
  stato.turno = (idx + 1) % stato.numGiocatori;
  stato.turnoContatore += 1;
  stato.messaggio = eraObbligato
    ? `${stato.nomi[idx]} era OBBLIGATO a scartare ${carta.valore} (aveva solo carte vietate in mano)!`
    : "";
  return { ok: true };
}

// Un altro giocatore (fuori dal proprio turno) segnala interesse per lo scarto rifiutato.
// Non assegna subito la carta: si limita a mettersi in lista durante la finestra di 10 secondi.
function registraRichiestaScarto(stato, idx) {
  if (!stato.manoAttuale) return { ok: false, errore: "La mano non è stata ancora scelta." };
  if (!stato.scartoReclamabile) return { ok: false, errore: "Non c'è nessuno scarto rifiutato da reclamare in questo momento." };
  if (idx === stato.turno) return { ok: false, errore: "Non puoi reclamare lo scarto durante il tuo turno: usa pesca dal mazzo o dal pozzo." };
  if (stato.scartoReclamabile.richiedenti.includes(idx)) {
    return { ok: false, errore: "Hai già segnalato il tuo interesse per questa carta." };
  }
  stato.scartoReclamabile.richiedenti.push(idx);
  stato.messaggio = `${stato.nomi[idx]} ha segnalato interesse per lo scarto rifiutato...`;
  return { ok: true };
}

// Chiamata dal server allo scadere dei 10 secondi: assegna la carta a chi, tra i richiedenti,
// è di turno più vicino a chi l'aveva rifiutata (in ordine di gioco, senso antiorario).
function risolviScartoReclamabile(stato) {
  const info = stato.scartoReclamabile;
  if (!info) return { assegnata: false };
  stato.scartoReclamabile = null;

  if (info.richiedenti.length === 0) {
    return { assegnata: false };
  }

  // La carta potrebbe essere già stata sepolta da un nuovo scarto nel frattempo
  if (stato.pozzo.length === 0 || stato.pozzo[stato.pozzo.length - 1].id !== info.cartaId) {
    stato.messaggio = "La carta era già stata coperta da un nuovo scarto: nessuno la riceve.";
    return { assegnata: false };
  }

  const n = stato.numGiocatori;
  let vincitore = null;
  for (let passo = 1; passo <= n; passo++) {
    const candidato = (info.giocatoreCheHaRifiutato + passo) % n;
    if (info.richiedenti.includes(candidato)) {
      vincitore = candidato;
      break;
    }
  }
  if (vincitore === null) return { assegnata: false };

  const nuovoPozzo = [...stato.pozzo];
  const carta = nuovoPozzo.pop();
  stato.pozzo = nuovoPozzo;
  stato.mani[vincitore] = [...stato.mani[vincitore], carta];
  const nomeCarta = carta.jolly ? "il Jolly" : `${carta.valore} di ${carta.seme}`;
  stato.messaggio = `${stato.nomi[vincitore]} si aggiudica ${nomeCarta} dallo scarto rifiutato (era il più vicino di turno tra gli interessati)! Ora ha ${stato.mani[vincitore].length} carte.`;
  return { assegnata: true, vincitore };
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
  stato.turnoScesoIn[idx] = stato.turnoContatore;
  stato.messaggio = `${stato.nomi[idx]} è sceso! Dal prossimo turno potrà attaccare carte e scendere altre combinazioni.`;

  if (nuovaMano.length === 0) {
    finalizzaMano(stato, idx);
  }
  return { ok: true };
}

// La Scala 40 ha una discesa "libera": il giocatore compone quanti gruppi vuole
// (tris, poker o scale da 3+ carte, mai coppie/full) finché insieme totalizzano almeno 40 punti.
// Verifica che la discesa non contenga carte o gruppi superflui: se togliendo un intero gruppo,
// o una singola carta da un gruppo più lungo del minimo, si resta comunque a 40+, la discesa non è valida.
function verificaMinimalitaScala40(gruppiCarte, risultatiGruppi, totalePunti) {
  for (let i = 0; i < gruppiCarte.length; i++) {
    const senzaQuestoGruppo = totalePunti - risultatiGruppi[i].punti;
    if (senzaQuestoGruppo >= 40) {
      return `Il gruppo ${i + 1} non ti serve: anche senza, arriveresti comunque a ${senzaQuestoGruppo} punti. Tienilo in mano per il turno successivo.`;
    }
  }
  for (let i = 0; i < gruppiCarte.length; i++) {
    const carte = gruppiCarte[i];
    if (carte.length <= 3) continue; // già al minimo (tris/scala da 3)
    for (let j = 0; j < carte.length; j++) {
      const ridotto = carte.filter((_, k) => k !== j);
      const esitoRidotto = validaEPuntiGruppoScala40(ridotto);
      if (esitoRidotto) {
        const nuovoTotale = totalePunti - risultatiGruppi[i].punti + esitoRidotto.punti;
        if (nuovoTotale >= 40) {
          return `Il gruppo ${i + 1} ha una carta di troppo: puoi toglierne una e restare comunque a ${nuovoTotale} punti. Tienila in mano per il turno successivo.`;
        }
      }
    }
  }
  return null;
}

function confermaScendiScala40(stato, idx, gruppiIds) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (stato.sceso[idx]) return { ok: false, errore: "Sei già sceso in questa mano." };
  if (!gruppiIds || gruppiIds.length === 0) return { ok: false, errore: "Devi comporre almeno un gruppo (tris, poker o scala)." };

  const manoGiocatore = stato.mani[idx];
  const gruppiCarte = gruppiIds.map((ids) => ids.map((id) => manoGiocatore.find((c) => c.id === id)).filter(Boolean));

  let totalePunti = 0;
  const risultatiGruppi = [];
  for (let i = 0; i < gruppiCarte.length; i++) {
    const esito = validaEPuntiGruppoScala40(gruppiCarte[i]);
    if (!esito) {
      return { ok: false, errore: `Il gruppo ${i + 1} non è un tris, un poker o una scala validi (niente coppie o full nella Scala 40).` };
    }
    totalePunti += esito.punti;
    risultatiGruppi.push({ tipo: esito.tipo, carte: gruppiCarte[i], punti: esito.punti });
  }

  if (totalePunti < 40) {
    return { ok: false, errore: `Servono almeno 40 punti per scendere: questi gruppi ne valgono solo ${totalePunti}.` };
  }

  const erroreMinimalita = verificaMinimalitaScala40(gruppiCarte, risultatiGruppi, totalePunti);
  if (erroreMinimalita) {
    return { ok: false, errore: erroreMinimalita };
  }

  const idsUsati = new Set(gruppiIds.flat());
  const nuovaMano = manoGiocatore.filter((c) => !idsUsati.has(c.id));
  stato.mani[idx] = nuovaMano;
  stato.combinazioniScese[idx] = risultatiGruppi.map(({ tipo, carte }) => ({ tipo, carte }));
  stato.sceso[idx] = true;
  stato.turnoScesoIn[idx] = stato.turnoContatore;
  stato.messaggio = `${stato.nomi[idx]} è sceso con ${totalePunti} punti! Dal prossimo turno potrà attaccare carte e scendere altre combinazioni.`;

  if (nuovaMano.length === 0) {
    finalizzaMano(stato, idx);
  }
  return { ok: true };
}

// Quando un gruppo tris/poker contiene uno o più jolly, ciascuno deve essere "dichiarato":
// il giocatore specifica quale carta (valore+seme) rappresenta. Richiesto solo per tris/poker
// (in una scala il valore del jolly è già implicito dalla posizione, regola universale 2).
// dichiarazioniInput: { [idCartaJolly]: "cuori"|"quadri"|"fiori"|"picche" }
function costruisciDichiarazioniJolly(carte, dichiarazioniInput) {
  const nonJolly = carte.filter((c) => !c.jolly);
  const valore = nonJolly[0]?.valore;
  const semiUsati = new Set(nonJolly.map((c) => c.seme));
  const jollyDichiarati = {};
  for (const c of carte) {
    if (!c.jolly) continue;
    const semeScelto = dichiarazioniInput?.[c.id];
    if (!semeScelto || !SEMI.includes(semeScelto)) {
      return { ok: false, errore: "Devi specificare il seme che ogni Jolly del gruppo rappresenta (es. 'Jolly = Asso di Quadri')." };
    }
    if (semiUsati.has(semeScelto)) {
      return { ok: false, errore: `Il seme scelto per il Jolly è già usato da un'altra carta nel gruppo: deve rappresentare un seme diverso.` };
    }
    semiUsati.add(semeScelto);
    jollyDichiarati[c.id] = { valore, seme: semeScelto };
  }
  return { ok: true, jollyDichiarati };
}

function confermaScendiLibero(stato, idx, tipo, ids, dichiarazioniJolly) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (!stato.sceso[idx]) return { ok: false, errore: "Devi prima scendere la combinazione richiesta." };
  if (stato.turnoScesoIn[idx] === stato.turnoContatore) {
    return { ok: false, errore: "Puoi scendere combinazioni extra solo a partire dal turno successivo a quello in cui sei sceso." };
  }
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

  let jollyDichiarati = {};
  if (tipo !== "scala" && carte.some((c) => c.jolly)) {
    const esitoDichiarazione = costruisciDichiarazioniJolly(carte, dichiarazioniJolly);
    if (!esitoDichiarazione.ok) return { ok: false, errore: esitoDichiarazione.errore };
    jollyDichiarati = esitoDichiarazione.jollyDichiarati;
  }

  const idsUsati = new Set(ids);
  const nuovaMano = manoGiocatore.filter((c) => !idsUsati.has(c.id));
  stato.mani[idx] = nuovaMano;
  const nomeGruppo = tipo === "tris" ? "trisLibero" : tipo === "poker" ? "pokerLibero" : "scalaLibera";
  stato.combinazioniScese[idx] = [...stato.combinazioniScese[idx], { tipo: nomeGruppo, carte, jollyDichiarati }];
  stato.messaggio = `Nuova combinazione (${tipo === "tris" ? "Tris" : tipo === "poker" ? "Poker" : "Scala"}) scesa sul tavolo!`;

  if (nuovaMano.length === 0) {
    finalizzaMano(stato, idx);
  }
  return { ok: true };
}

function attaccaCarte(stato, idx, giocatoreTarget, gruppoIdx, ids, dichiarazioniJolly) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (!stato.sceso[idx]) return { ok: false, errore: "Devi prima scendere con la tua combinazione." };
  if (stato.turnoScesoIn[idx] === stato.turnoContatore) {
    return { ok: false, errore: "Puoi attaccare carte alle combinazioni solo a partire dal turno successivo a quello in cui sei sceso." };
  }
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

  let nuoveDichiarazioni = { ...(gruppoEsistente.jollyDichiarati || {}) };
  if (!eGruppoScala) {
    const jollyNuovi = carte.filter((c) => c.jolly);
    if (jollyNuovi.length > 0) {
      const esitoDichiarazione = costruisciDichiarazioniJolly(nuovoGruppo, dichiarazioniJolly);
      if (!esitoDichiarazione.ok) return { ok: false, errore: esitoDichiarazione.errore };
      nuoveDichiarazioni = esitoDichiarazione.jollyDichiarati;
    }
  }

  stato.combinazioniScese[giocatoreTarget][gruppoIdx] = { ...gruppoEsistente, carte: nuovoGruppo, jollyDichiarati: nuoveDichiarazioni };
  const idsUsati = new Set(ids);
  const nuovaMano = manoGiocatore.filter((c) => !idsUsati.has(c.id));
  stato.mani[idx] = nuovaMano;
  stato.messaggio = "Carte aggiunte alla combinazione!";

  if (nuovaMano.length === 0) {
    finalizzaMano(stato, idx);
  }
  return { ok: true };
}

// Riscatto del jolly: solo chi possiede davvero la carta dichiarata (valore+seme) può, nel proprio
// turno, sostituirla al jolly in una combinazione (propria o altrui) e riprendersi il jolly — che
// però deve usare SUBITO per formare una nuova combinazione (tris, poker o scala). Operazione
// atomica: se la nuova combinazione col jolly non è valida, non si tocca nulla.
function riscattaJolly(stato, idx, { giocatoreTarget, gruppoIdx, idJollyCarta, idCartaPropria, nuovoGruppoIds, tipoNuovoGruppo, dichiarazioniJolly }) {
  if (idx !== stato.turno) return { ok: false, errore: "Non è il tuo turno." };
  if (!stato.sceso[idx]) return { ok: false, errore: "Devi essere sceso per poter riscattare un jolly." };
  if (stato.turnoScesoIn[idx] === stato.turnoContatore) {
    return { ok: false, errore: "Puoi riscattare un jolly solo dal turno successivo a quello in cui sei sceso." };
  }

  const gruppo = stato.combinazioniScese[giocatoreTarget]?.[gruppoIdx];
  if (!gruppo) return { ok: false, errore: "Combinazione non trovata." };
  const dichiarazione = gruppo.jollyDichiarati?.[idJollyCarta];
  if (!dichiarazione) return { ok: false, errore: "Questo Jolly non ha una dichiarazione da riscattare." };

  const manoGiocatore = stato.mani[idx];
  const cartaPropria = manoGiocatore.find((c) => c.id === idCartaPropria);
  if (!cartaPropria) return { ok: false, errore: "Carta non trovata in mano." };
  if (cartaPropria.valore !== dichiarazione.valore || cartaPropria.seme !== dichiarazione.seme) {
    return { ok: false, errore: `Devi avere ${dichiarazione.valore} di ${dichiarazione.seme} per riscattare questo Jolly.` };
  }

  const idxCartaNelGruppo = gruppo.carte.findIndex((c) => c.id === idJollyCarta);
  if (idxCartaNelGruppo === -1) return { ok: false, errore: "Il Jolly non è più in questa combinazione." };
  const jollyCarta = gruppo.carte[idxCartaNelGruppo];

  // Il jolly ripreso deve essere usato SUBITO in una nuova combinazione: valido tutto PRIMA di
  // modificare qualsiasi cosa, così se fallisce non si tocca nulla (operazione atomica).
  const manoSenzaCartaPropria = manoGiocatore.filter((c) => c.id !== idCartaPropria);
  const carteNuovoGruppo = (nuovoGruppoIds || [])
    .map((id) => (id === jollyCarta.id ? jollyCarta : manoSenzaCartaPropria.find((c) => c.id === id)))
    .filter(Boolean);

  if (!carteNuovoGruppo.some((c) => c.id === jollyCarta.id)) {
    return { ok: false, errore: "Devi usare subito il Jolly appena ripreso in una nuova combinazione." };
  }

  let nuovoGruppoValido = false;
  if (tipoNuovoGruppo === "tris") {
    nuovoGruppoValido = carteNuovoGruppo.length === 3 && isGruppoStessoValore(carteNuovoGruppo, { lunghezzaEsatta: 3, semiDiversi: true, permettiJolly: true });
  } else if (tipoNuovoGruppo === "poker") {
    nuovoGruppoValido = carteNuovoGruppo.length === 4 && isGruppoStessoValore(carteNuovoGruppo, { lunghezzaEsatta: 4, semiDiversi: true, permettiJolly: true });
  } else if (tipoNuovoGruppo === "scala") {
    nuovoGruppoValido = carteNuovoGruppo.length >= 3 && isScalaColore(carteNuovoGruppo, { min: 3, permettiJolly: true });
  }
  if (!nuovoGruppoValido) {
    return { ok: false, errore: "Le carte scelte per la nuova combinazione con il Jolly non sono valide: l'operazione è annullata, il Jolly resta dov'era." };
  }

  let jollyDichiaratiNuovoGruppo = {};
  if (tipoNuovoGruppo !== "scala") {
    const esitoDichiarazione = costruisciDichiarazioniJolly(carteNuovoGruppo, dichiarazioniJolly);
    if (!esitoDichiarazione.ok) return { ok: false, errore: esitoDichiarazione.errore };
    jollyDichiaratiNuovoGruppo = esitoDichiarazione.jollyDichiarati;
  }

  // Tutto valido: ora si applicano davvero le modifiche
  const nuoveCarteGruppoOrigine = [...gruppo.carte];
  nuoveCarteGruppoOrigine[idxCartaNelGruppo] = cartaPropria;
  const nuoveDichiarazioniOrigine = { ...gruppo.jollyDichiarati };
  delete nuoveDichiarazioniOrigine[idJollyCarta];
  stato.combinazioniScese[giocatoreTarget][gruppoIdx] = { ...gruppo, carte: nuoveCarteGruppoOrigine, jollyDichiarati: nuoveDichiarazioniOrigine };

  const idsDaRimuovereDallaMano = new Set([idCartaPropria, ...carteNuovoGruppo.filter((c) => c.id !== jollyCarta.id).map((c) => c.id)]);
  const nuovaMano = manoGiocatore.filter((c) => !idsDaRimuovereDallaMano.has(c.id));
  stato.mani[idx] = nuovaMano;

  const nomeNuovoGruppo = tipoNuovoGruppo === "tris" ? "trisLibero" : tipoNuovoGruppo === "poker" ? "pokerLibero" : "scalaLibera";
  stato.combinazioniScese[idx] = [...stato.combinazioniScese[idx], { tipo: nomeNuovoGruppo, carte: carteNuovoGruppo, jollyDichiarati: jollyDichiaratiNuovoGruppo }];

  stato.messaggio = `${stato.nomi[idx]} ha riscattato il Jolly con ${cartaPropria.valore} di ${cartaPropria.seme} e lo ha subito usato in una nuova combinazione!`;

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
    scartoReclamabile: stato.scartoReclamabile,
    punteggi: stato.punteggi,
    storicoPunteggi: stato.storicoPunteggi,
    messaggio: stato.messaggio,
    tuoIndice: idx,
  };
}

module.exports = {
  nuovaStanza, entraStanza, iniziaPartita, sceltaMano, pescaDalMazzo, pescaDalPozzo, registraRichiestaScarto, risolviScartoReclamabile,
  scarta, confermaScendi, confermaScendiScala40, confermaScendiLibero, attaccaCarte, riscattaJolly, confermaChiusura, prossimaMano,
  serializzaPerGiocatore,
};

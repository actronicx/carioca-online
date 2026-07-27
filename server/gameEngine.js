// ============ COSTANTI DI GIOCO ============
const SEMI = ["cuori", "quadri", "fiori", "picche"];
const VALORI = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const VALORE_NUM = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 };
const PUNTI_CARTA = { A: 10, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 10, Q: 10, K: 10, JOLLY: 25 };
const VALORI_VESTITI = ["A", "J", "Q", "K"];
const VALORI_NUMERICI = ["2", "3", "4", "5", "6", "7", "8", "9", "10"];
const NUM_CARTE_MANO = 13;

const MANI = [
  { id: 1, nome: "Coppia Vestita", desc: "Una coppia di Jack, Regine, Re o Assi (semi diversi). Non si possono scartare né attaccare J/Q/K/A finché non sono scesi tutti i giocatori", richiesta: [{ tipo: "coppiaVestita" }], valoriVietati: ["J", "Q", "K", "A"] },
  { id: 2, nome: "Doppia Coppia", desc: "Una coppia vestita (J/Q/K/A) e una coppia non vestita (2-10). Non si possono scartare né attaccare J/Q/K/A finché non sono scesi tutti i giocatori", richiesta: [{ tipo: "coppiaVestita" }, { tipo: "coppiaNonVestita" }], valoriVietati: ["J", "Q", "K", "A"] },
  { id: 3, nome: "Tris", desc: "Tre carte dello stesso valore, tutte di seme diverso", richiesta: [{ tipo: "trisEsatto" }] },
  { id: 4, nome: "Full", desc: "Un tris (semi diversi) più una coppia", richiesta: [{ tipo: "trisEsatto" }, { tipo: "coppiaEsatta" }] },
  { id: 5, nome: "Poker", desc: "Quattro carte dello stesso valore, tutte con seme diverso", richiesta: [{ tipo: "pokerSemiDiversi" }] },
  { id: 6, nome: "Scala Reale", desc: "Cinque carte in sequenza, tutte dello stesso seme. Non si possono scartare né attaccare 5 e 10 finché non sono scesi tutti i giocatori", richiesta: [{ tipo: "scalaReale5" }], valoriVietati: ["5", "10"] },
  { id: 7, nome: "Chiusura", desc: "Nessuna discesa parziale: si vince chiudendo tutta la mano in un colpo solo con tris, poker o scale da 3+ carte (stesso seme), senza jolly", richiesta: [{ tipo: "chiusura" }] },
  { id: 8, nome: "Bomba", desc: "Poker (semi diversi) + scala da 5 dello stesso seme. Non si possono scartare né attaccare 5 e 10 finché non sono scesi tutti i giocatori (a meno che restino solo 5/10 in mano, per lo scarto)", richiesta: [{ tipo: "pokerSemiDiversi" }, { tipo: "scalaReale5" }], valoriVietati: ["5", "10"] },
  { id: 9, nome: "Trik Trak", desc: "Coppia vestita + tris (semi diversi) + scala da 3+ carte stesso seme. Non si possono scartare né attaccare J/Q/K/A finché non sono scesi tutti i giocatori (a meno che restino solo J/Q/K/A in mano, per lo scarto)", richiesta: [{ tipo: "coppiaVestita" }, { tipo: "trisEsatto" }, { tipo: "scalaMin3" }], valoriVietati: ["J", "Q", "K", "A"] },
  { id: 10, nome: "Scala 40", desc: "Per scendere servono tris, poker o scale (3+ carte, niente coppie o full) che insieme totalizzano almeno 40 punti. Il jolly vale come la carta che sostituisce. L'Asso vale 1 punto in scala prima del 2, altrimenti 11 punti (in tris/poker o in scala dopo il Re); le figure valgono 10, le numeriche il loro valore.", richiesta: [{ tipo: "scala40" }] },
];

// ============ MAZZO ============
function creaMazzo() {
  const mazzo = [];
  let id = 0;
  for (let m = 0; m < 2; m++) {
    for (const seme of SEMI) {
      for (const valore of VALORI) {
        mazzo.push({ id: `c${id++}`, seme, valore, jolly: false });
      }
    }
    mazzo.push({ id: `j${id++}`, seme: null, valore: "JOLLY", jolly: true });
    mazzo.push({ id: `j${id++}`, seme: null, valore: "JOLLY", jolly: true });
  }
  return mazzo;
}

function mescola(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function puntiCarta(c) {
  return PUNTI_CARTA[c.valore] ?? 5;
}

// ============ VALIDAZIONE COMBINAZIONI ============
function isGruppoStessoValore(carte, { lunghezzaEsatta, valoriAmmessi, semiDiversi = false, permettiJolly = true } = {}) {
  if (lunghezzaEsatta && carte.length !== lunghezzaEsatta) return false;
  if (carte.length < 2) return false;
  const nonJolly = carte.filter((c) => !c.jolly);
  const jollyCount = carte.length - nonJolly.length;
  if (jollyCount > 0 && !permettiJolly) return false;
  if (nonJolly.length === 0) return false;
  const valore = nonJolly[0].valore;
  if (!nonJolly.every((c) => c.valore === valore)) return false;
  if (valoriAmmessi && !valoriAmmessi.includes(valore)) return false;
  if (semiDiversi) {
    const semi = nonJolly.map((c) => c.seme);
    if (new Set(semi).size !== semi.length) return false;
    if (jollyCount > 4 - semi.length) return false;
  } else {
    if (jollyCount > nonJolly.length) return false;
  }
  return true;
}

// Valida una scala. Prova prima l'asso come carta bassa (prima del 2); se fallisce e la scala
// contiene davvero un asso, riprova considerandolo carta alta (dopo il Re) — es. Q-K-A.
function isScalaColore(carte, { min = 3, exact = null, permettiJolly = true } = {}) {
  if (exact !== null && carte.length !== exact) return false;
  if (carte.length < min) return false;
  const nonJolly = carte.filter((c) => !c.jolly);
  const jollyCount = carte.length - nonJolly.length;
  if (jollyCount > 0 && !permettiJolly) return false;
  if (nonJolly.length === 0) return false;
  const seme = nonJolly[0].seme;
  if (!nonJolly.every((c) => c.seme === seme)) return false;

  function provaConAssoAlto(assoAlto) {
    const numeri = nonJolly
      .map((c) => (c.valore === "A" && assoAlto ? 14 : VALORE_NUM[c.valore]))
      .sort((a, b) => a - b);
    for (let i = 1; i < numeri.length; i++) if (numeri[i] === numeri[i - 1]) return false;
    const minNum = numeri[0];
    const maxNum = numeri[numeri.length - 1];
    const spanNaturale = maxNum - minNum + 1;
    const buchi = spanNaturale - numeri.length;
    if (buchi > jollyCount) return false;
    const jollyResidui = jollyCount - buchi;
    const spanTotale = spanNaturale + jollyResidui;
    return spanTotale === carte.length && maxNum + jollyResidui <= 14;
  }

  if (provaConAssoAlto(false)) return true;
  const haAsso = nonJolly.some((c) => c.valore === "A");
  if (haAsso && provaConAssoAlto(true)) return true;
  return false;
}

function isCoppiaVestita(carte, permettiJolly = true) {
  return isGruppoStessoValore(carte, { lunghezzaEsatta: 2, valoriAmmessi: VALORI_VESTITI, semiDiversi: true, permettiJolly });
}
function isCoppiaNonVestita(carte, permettiJolly = true) {
  return isGruppoStessoValore(carte, { lunghezzaEsatta: 2, valoriAmmessi: VALORI_NUMERICI, semiDiversi: true, permettiJolly });
}
function isCoppiaEsatta(carte, permettiJolly = true) {
  return isGruppoStessoValore(carte, { lunghezzaEsatta: 2, semiDiversi: true, permettiJolly });
}
function isTrisEsatto(carte, permettiJolly = true) {
  return isGruppoStessoValore(carte, { lunghezzaEsatta: 3, semiDiversi: true, permettiJolly });
}
function isPokerSemiDiversi(carte, permettiJolly = true) {
  return isGruppoStessoValore(carte, { lunghezzaEsatta: 4, semiDiversi: true, permettiJolly });
}
function isScalaReale5(carte, permettiJolly = true) {
  return isScalaColore(carte, { exact: 5, permettiJolly });
}
function isGruppoChiusuraValido(carte) {
  if (carte.length < 3) return false;
  if (carte.length <= 4 && isGruppoStessoValore(carte, { semiDiversi: true, permettiJolly: false })) return true;
  if (isScalaColore(carte, { min: 3, permettiJolly: false })) return true;
  return false;
}

// ============ SCALA 40 ============
// Punteggio di un tris/poker per la Scala 40: l'Asso vale 11, le figure 10, le altre il valore nominale.
function calcolaPuntiGruppoValoreScala40(carte) {
  const nonJolly = carte.filter((c) => !c.jolly);
  if (nonJolly.length === 0) return null;
  const valore = nonJolly[0].valore;
  const puntiUnitari = valore === "A" ? 11 : ["J", "Q", "K"].includes(valore) ? 10 : parseInt(valore, 10);
  return puntiUnitari * carte.length;
}

// Punteggio di una scala per la Scala 40: prova sia l'asso basso (vale 1) sia l'asso alto (vale 11),
// e sceglie l'interpretazione che dà più punti (quella che il giocatore intendeva giocare).
function calcolaPuntiScalaScala40(carte) {
  const nonJolly = carte.filter((c) => !c.jolly);
  const jollyCount = carte.length - nonJolly.length;
  if (nonJolly.length === 0) return null;

  function calcolaConAssoAlto(assoAlto) {
    const numeri = nonJolly
      .map((c) => (c.valore === "A" && assoAlto ? 14 : VALORE_NUM[c.valore]))
      .sort((a, b) => a - b);
    for (let i = 1; i < numeri.length; i++) if (numeri[i] === numeri[i - 1]) return null;
    const minNum = numeri[0];
    const maxNum = numeri[numeri.length - 1];
    const spanNaturale = maxNum - minNum + 1;
    const buchi = spanNaturale - numeri.length;
    if (buchi > jollyCount) return null;
    const jollyResidui = jollyCount - buchi;
    const spanTotale = spanNaturale + jollyResidui;
    if (spanTotale !== carte.length) return null;
    const nuovoMax = maxNum + jollyResidui;
    if (nuovoMax > 14) return null;
    let punti = 0;
    for (let n = minNum; n <= nuovoMax; n++) {
      if (n === 1) punti += 1; // asso prima del 2
      else if (n === 14) punti += 11; // asso dopo il re
      else if (n >= 11 && n <= 13) punti += 10; // J, Q, K
      else punti += n; // 2-10
    }
    return punti;
  }

  const risultatoBasso = calcolaConAssoAlto(false);
  const haAsso = nonJolly.some((c) => c.valore === "A");
  const risultatoAlto = haAsso ? calcolaConAssoAlto(true) : null;
  if (risultatoBasso === null && risultatoAlto === null) return null;
  if (risultatoBasso === null) return risultatoAlto;
  if (risultatoAlto === null) return risultatoBasso;
  return Math.max(risultatoBasso, risultatoAlto);
}

// Valida un singolo gruppo per la Scala 40 (tris, poker o scala — mai coppie o full) e ne calcola i punti.
// Ritorna null se il gruppo non è un tris/poker/scala valido.
function validaEPuntiGruppoScala40(carte) {
  if (carte.length < 3) return null;
  if (carte.length <= 4 && isGruppoStessoValore(carte, { semiDiversi: true, permettiJolly: true })) {
    return { valido: true, punti: calcolaPuntiGruppoValoreScala40(carte), tipo: carte.length === 4 ? "pokerLibero" : "trisLibero" };
  }
  if (isScalaColore(carte, { min: 3, permettiJolly: true })) {
    return { valido: true, punti: calcolaPuntiScalaScala40(carte), tipo: "scalaLibera" };
  }
  return null;
}

function nomeRichiesta(r) {
  switch (r.tipo) {
    case "coppiaVestita": return "Coppia Vestita (J/Q/K/A)";
    case "coppiaNonVestita": return "Coppia (2-10)";
    case "coppiaEsatta": return "Coppia";
    case "trisEsatto": return "Tris (semi diversi)";
    case "pokerSemiDiversi": return "Poker (semi diversi)";
    case "scalaReale5": return "Scala Reale (5 carte)";
    case "scalaMin3": return "Scala (3+ carte)";
    case "scala40": return "Scala 40 (min. 40 punti)";
    default: return r.tipo;
  }
}

function validaGruppo(carte, richiesta, permettiJolly = true) {
  if (richiesta.tipo === "coppiaVestita") return isCoppiaVestita(carte, permettiJolly);
  if (richiesta.tipo === "coppiaNonVestita") return isCoppiaNonVestita(carte, permettiJolly);
  if (richiesta.tipo === "coppiaEsatta") return isCoppiaEsatta(carte, permettiJolly);
  if (richiesta.tipo === "trisEsatto") return isTrisEsatto(carte, permettiJolly);
  if (richiesta.tipo === "pokerSemiDiversi") return isPokerSemiDiversi(carte, permettiJolly);
  if (richiesta.tipo === "scalaReale5") return isScalaReale5(carte, permettiJolly);
  if (richiesta.tipo === "scalaMin3") return isScalaColore(carte, { min: 3, permettiJolly });
  return false;
}

module.exports = {
  SEMI, VALORI, VALORE_NUM, PUNTI_CARTA, VALORI_VESTITI, VALORI_NUMERICI, NUM_CARTE_MANO, MANI,
  creaMazzo, mescola, puntiCarta,
  isGruppoStessoValore, isScalaColore, isCoppiaVestita, isCoppiaNonVestita, isCoppiaEsatta,
  isTrisEsatto, isPokerSemiDiversi, isScalaReale5, isGruppoChiusuraValido, nomeRichiesta, validaGruppo,
  calcolaPuntiGruppoValoreScala40, calcolaPuntiScalaScala40, validaEPuntiGruppoScala40,
};

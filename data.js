// Programma di allenamento e video degli esercizi.
// eq: attrezzo, usato per l'incremento di carico consigliato (manubri, bilanciere, cavo, macchina)
// v: video YouTube [id, canale]; il primo è il principale.

const EX = {
  db_flat:{n:"Panca piana manubri",s:"Schienale 0°",eq:"db",cue:"Scapole addotte e depresse, gomiti a ~45°, scendi fino a sentire l'allungamento del petto.",v:[["1V3vpcaxRYQ","Davis Diley"],["nxphAl94cBU","V Athlete · ITA"],["WbCEvFA0NJs","DeltaBolic"]]},
  db_incl:{n:"Panca inclinata manubri",s:"Schienale 30–35°",eq:"db",cue:"Panca a 30–35°, spingi verso l'alto e leggermente indietro, sopra la parte alta del petto.",v:[["ou6s32mJgjU","Davis Diley"],["vqv--vheaH0","Sam Johnston"]]},
  cable_fly:{n:"Croci ai cavi dall'alto",s:"High-to-Low Cable Fly",eq:"cable",cue:"Carrucole alte, braccia leggermente flesse, chiudi verso il basso davanti ai fianchi (nel primo video è la figura in basso).",v:[["erPxSMlmlN4","Fit With elmira"],["x4JX_T5QAMM","Davis Diley"],["xOzBZdNcwLQ","V Athlete · ITA"],["c44hwGS-peY","DeltaBolic"]]},
  db_ohp:{n:"Shoulder press manubri",s:"Schienale 75–80°",eq:"db",cue:"Schienale quasi verticale, avambracci verticali, non battere i manubri in alto.",v:[["OLePvpxQEGk","Davis Diley"],["YORuKZAHhTc","V Athlete · ITA"],["k6tzKisR3NY","DeltaBolic"],["pyjhDBvXg_8","Noha Rabasco · ITA"]]},
  lat_raise:{n:"Alzate laterali manubri",s:"",eq:"db",cue:"Sali di lato fino all'altezza delle spalle, mignolo non sopra il pollice, scendi controllato.",v:[["JIhbYYA1Q90","Davis Diley"],["cbGge5apOeE","Noha Rabasco · ITA"],["3YzoL_yjg_s","Sam Johnston"],["lMYs7FY8os4","DeltaBolic"]]},
  rope_pd:{n:"Triceps rope pushdown",s:"",eq:"cable",cue:"Gomiti fermi ai fianchi; in basso apri la corda e stendi completamente.",v:[["dLvwZb_mW2s","Sam Johnston"],["-PqzEk57xiw","DeltaBolic"],["sf-RPCQntKk","João Pedro"],["wzPeY5FORGQ","Noha Rabasco · ITA"]]},
  oh_ext:{n:"Estensioni tricipiti sopra la testa",s:"Cavo · barra dritta · carrucola alta",eq:"cable",cue:"Di spalle alla carrucola alta, busto inclinato, gomiti puntati in avanti, stendi in avanti.",v:[["NTk0Igxqcsk","DeltaBolic"],["oZ1MbUl-_-w","DeltaBolic"],["7lYeoKRXO-0","Davis Diley"]]},
  lat_pd:{n:"Lat pulldown",s:"",eq:"machine",cue:"Petto alto, tira con i gomiti verso i fianchi, porta la barra alla parte alta del petto.",v:[["z-lxcsIN4T4","Davis Diley"],["H0ZQrYaNaXk","Noha Rabasco · ITA"],["SAksjqH4Hkk","Max De Cet"],["Yvnu0SuobbU","V Athlete · ITA"]]},
  cs_row:{n:"Cybex row con supporto petto",s:"",eq:"machine",cue:"Petto incollato al supporto, tira i gomiti indietro, breve pausa a fine movimento.",v:[["G35gTqGcXXA","DeltaBolic"],["p88Y69wWQz0","DeltaBolic"],["5znB5VYd71I","Sam Johnston"]]},
  sa_pd:{n:"Straight-arm cable pulldown",s:"",eq:"cable",cue:"Braccia quasi tese, busto leggermente inclinato, porta la barra verso le cosce usando i dorsali.",v:[["zECTZHrvuMg","DeltaBolic"],["lnec6DdscJU","DeltaBolic"],["hAMcfubonDc","DeltaBolic"]]},
  db_curl:{n:"Curl manubri in piedi con supinazione",s:"",eq:"db",cue:"Parti a presa neutra e ruota il palmo verso l'alto mentre sali; gomiti fermi.",v:[["ArBMucKnUuU","V Athlete · ITA"],["VaX_lZUYQBo","Sam Johnston"],["zP7IMCtC9LY","V Athlete · ITA"],["MKWBV29S6c0","DeltaBolic"]]},
  hammer:{n:"Hammer curl manubri",s:"",eq:"db",cue:"Presa neutra (pollici in alto) per tutta la ripetizione, gomiti fermi ai fianchi.",v:[["_aoad2yuP5w","DeltaBolic · varianti curl"],["fVdCFehqd0c","Dickerson Ross · brachiale"]]},
  smith_sq:{n:"Smith machine squat",s:"",eq:"bb",cue:"Piedi leggermente avanti rispetto al bilanciere, scendi in profondità con la schiena neutra.",v:[["iKCJCydYYrE","DeltaBolic"],["jPrzu4kp47o","DeltaBolic"],["Jrr50i0wVUA","João Pedro"]]},
  db_rdl:{n:"Romanian deadlift manubri",s:"",eq:"db",cue:"Ginocchia leggermente flesse e ferme, spingi i fianchi indietro, manubri vicini alle gambe.",v:[["QbbURJEUALw","DeltaBolic"],["5FToP72plRQ","Sam Johnston"],["0hjQsGS9hWM","Noha Rabasco · ITA"],["qk0lUhqvII0","V Athlete · ITA"],["Wou9zVQrAfs","DeltaBolic · RDL vs stiff"]]},
  leg_press:{n:"Leg press inclinata",s:"",eq:"machine",cue:"Bacino sempre appoggiato, scendi finché resta in posizione, non bloccare le ginocchia in alto.",v:[["EotSw18oR9w","DeltaBolic"],["_vN05ay2sjs","Sam Johnston"],["wDNPCqFailQ","Fit With elmira"],["To8Juu6ufMA","Noha Rabasco · ITA"]]},
  leg_curl:{n:"Leg curl macchina",s:"",eq:"machine",cue:"Asse del ginocchio allineato al perno della macchina, bacino fermo, fase negativa lenta.",v:[["xdbEG3xGLI8","DeltaBolic · seduto"],["EnZZIaPCb8k","DeltaBolic"],["7kgCV4InX80","Noha Rabasco · ITA"]]},
  calf:{n:"Standing calf raise",s:"",eq:"machine",cue:"Allungamento completo in basso con breve pausa, poi sali sull'avampiede fino in cima.",v:[["4-BeqqIFiPM","João Pedro"],["ey9a2M71-vU","DeltaBolic"],["1_B7pkicFk8","Davis Diley"]]},
  bb_bench:{n:"Panca piana bilanciere",s:"Schienale 0°",eq:"bb",cue:"Arco moderato, scapole retratte, bilanciere a metà-basso petto, piedi ben piantati.",note:"Da confermare: in UPPER il bilanciere non è ancora confermato al posto dei manubri.",v:[["EdDqD4aKwxM","Davis Diley"],["i-gLOirnPaU","Davis Diley · 5 step"],["5NStATS0zrw","DeltaBolic"],["llJtcqNVXcw","Fit With elmira"]]},
  rev_pec:{n:"Reverse pec deck",s:"Deltoidi posteriori",eq:"machine",cue:"Petto al supporto, braccia quasi tese, apri di lato senza alzare le spalle.",v:[["H5UxZFl0lgk","DeltaBolic"],["EpL_7UvO-yM","V Athlete · ITA"],["sIQNCJ6Xwsk","DeltaBolic"]]},
  leg_ext:{n:"Leg extension",s:"",eq:"machine",cue:"Ginocchio allineato al perno, stendi completamente e scendi controllato.",v:[["uM86QE59Tgc","DeltaBolic"],["IxRYNJS1cL8","Sam Johnston"],["OXl3MD2Kf7I","Noha Rabasco · ITA"]]}
};

// [esercizio, serie, rip minime, rip massime, recupero in secondi]
const SESSIONS = {
  PUSH:[["db_flat",2,6,10,180],["db_incl",2,8,12,120],["cable_fly",2,12,15,90],["db_ohp",2,8,12,120],["lat_raise",2,12,20,90],["rope_pd",2,10,15,90],["oh_ext",2,10,15,90]],
  PULL:[["lat_pd",2,8,12,120],["cs_row",2,8,12,120],["sa_pd",2,10,15,90],["db_curl",2,10,15,90],["hammer",2,10,15,90]],
  LEGS:[["smith_sq",2,8,12,180],["db_rdl",2,8,12,180],["leg_press",2,9,12,180],["leg_curl",2,10,15,120],["calf",2,10,20,90]],
  UPPER:[["bb_bench",2,6,10,180],["lat_pd",2,8,12,120],["db_incl",2,8,12,120],["cs_row",2,8,12,120],["lat_raise",2,12,20,90],["rev_pec",2,12,20,90],["rope_pd",2,10,15,90]],
  LOWER:[["leg_press",2,9,12,180],["db_rdl",2,8,12,180],["leg_ext",2,10,15,90],["leg_curl",2,10,15,120],["calf",2,10,20,90],["db_curl",2,10,15,90]]
};

const CYCLE = ["PUSH","PULL","LEGS","REST","UPPER","REST","LOWER"];
const RIR_MIN = 2, RIR_MAX = 3;
const EQ_LABEL = {db:"manubri (kg per manubrio)",bb:"bilanciere",cable:"cavo",machine:"macchina"};

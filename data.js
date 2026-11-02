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

/* ---------- Recupero attivo: mobilità e stretching (a tempo, senza carichi) ----------
   kind:"time" → sec = durata di un giro (per lato se sides), niente kg/RIR */
Object.assign(EX,{
  mob_post:{kind:"time",sec:60,n:"Postura e colonna",s:"Mobilità",cue:"Segui il video con calma, movimento lento e respirazione regolare.",v:[["MIFQK7cllo8","Markour"],["zs5oDFJ7ieU","Low Back Ability"]]},
  mob_back:{kind:"time",sec:60,n:"Sblocco schiena e spalle",s:"Mobilità",cue:"Ampiezza progressiva, senza forzare il fine corsa.",v:[["9NokgyI76ak","Rash Elagin"],["m7dOrLxxXVs","Flow with Mira · pilates schiena"]]},
  mob_hip:{kind:"time",sec:75,n:"Flow mobilità anche",s:"Mobilità · 4 movimenti",cue:"Esegui i 4 movimenti in sequenza controllando bacino e schiena.",v:[["ttKfbFqocY8","Limitless Sapiens"],["t7rOppk6y3w","João Pedro"],["xOAZ-uqq3yA","Sam Johnston · 5 drill"]]},
  mob_psoas:{kind:"time",sec:45,sides:true,n:"Rilascio psoas",s:"Mobilità · per lato",cue:"Glutei contratti e bacino in retroversione, senza inarcare la schiena.",v:[["7bqPkuJK1j8","Conor Harris"]]},
  mob_piri:{kind:"time",sec:45,sides:true,n:"Piriforme",s:"Mobilità · per lato",cue:"Allungamento dolce: niente formicolii lungo la gamba.",v:[["kEpHkn8amFE","Recover Pain"]]},
  mob_bullet:{kind:"time",sec:60,n:"Movimenti \"bulletproof\"",s:"Mobilità attiva",cue:"Movimenti controllati su tutto il range di movimento.",v:[["PqApPF0DJcY","Zale Parisino"],["2tEOIrVBeWc","Real talk with Mario"]]},
  mob_quad:{kind:"time",sec:60,n:"Quadrupedia e primal movement",s:"Mobilità attiva",cue:"Ginocchia vicine al pavimento, schiena neutra, movimenti fluidi.",v:[["iQttn4K-D7w","Markour"],["98wCs3eHVBY","LeoMoves"],["9gZBGwqpmEM","LeoMoves"],["ma8b9eZsXEA","LeoMoves"],["lJqSnVyeWFw","LeoMoves"]]},
  mob_bridge:{kind:"time",sec:60,n:"Ponte glutei fatto bene",s:"Attivazione",cue:"Spingi coi talloni, glutei contratti in alto, senza iperestendere la schiena.",v:[["2_axYmo-mS4","Marcello Chiapponi · ITA"]]},

  st_pec:{kind:"time",sec:30,sides:true,n:"Allungamento pettorali alla porta",s:"Stretching parte alta · per lato",cue:"Avambraccio sullo stipite, gomito all'altezza della spalla, ruota il busto lontano.",v:[["M850sCj9LHQ","MedBridge"],["CEQMx4zFwYs","MidwestOrtho"]]},
  st_lat:{kind:"time",sec:30,sides:true,n:"Allungamento dorsali",s:"Stretching parte alta · per lato",cue:"Spingi i fianchi indietro e allunga il fianco, respira nell'allungamento.",v:[["wzyB34izUNI","NASM"],["SAZDip5crww","Cumberland Chiropractic"],["6V5tSn9oEJg","ATHLEAN-X"]]},
  st_rdelt:{kind:"time",sec:30,sides:true,n:"Spalla posteriore (cross-body)",s:"Stretching parte alta · per lato",cue:"Porta il braccio davanti al petto tenendo la scapola bassa, senza ruotare il busto.",v:[["swvXpKN832E","[P]rehab"],["WaR_T0aUoew","Mike Reinold"]]},
  st_tri:{kind:"time",sec:30,sides:true,n:"Tricipiti sopra la testa",s:"Stretching parte alta · per lato",cue:"Gomito verso il soffitto, mano dietro la testa, aiutati con l'altra mano.",v:[["3_eaPeNRpzk","UCSF Orthopaedics"],["MWzR-WE_nhU","Hinge Health"]]},
  st_trap:{kind:"time",sec:30,sides:true,n:"Trapezio superiore e collo",s:"Stretching parte alta · per lato",cue:"Orecchio verso la spalla, spalla opposta bassa, trazione leggera.",v:[["-r0eoFS7_5Q","Ask Doctor Jo"],["UIQud2Uak-g","LSM Chiropractic"]]},
  st_tspine:{kind:"time",sec:45,sides:true,n:"Toracica \"open book\"",s:"Stretching parte alta · per lato",cue:"Sul fianco, ginocchia unite, apri il braccio seguendolo con lo sguardo.",v:[["93C-PRmMra0","Bij & Gab"],["peeW19ofFUg","Elite Performance Institute"]]},
  st_hipflex:{kind:"time",sec:45,sides:true,n:"Flessori dell'anca (couch stretch)",s:"Stretching gambe · per lato",cue:"Gluteo contratto e bacino in retroversione; avvicinati al muro gradualmente.",v:[["QiKl5UoiG5c","Movement Enhanced"],["d9pOjXCKGN8","Tom Morrison"]]},
  st_quad:{kind:"time",sec:30,sides:true,n:"Quadricipiti in piedi",s:"Stretching gambe · per lato",cue:"Ginocchia vicine, bacino in retroversione, tallone verso il gluteo.",v:[["R7g1POiEoZs","E3 Rehab"],["j-KreYRNOCc","MGH Orthopaedics"]]},
  st_ham:{kind:"time",sec:30,sides:true,n:"Femorali",s:"Stretching gambe · per lato",cue:"Schiena dritta, piegati dalle anche; contrai il femorale qualche secondo prima di allungare.",v:[["5f5aHVj-f9Q","Hinge Health"],["adPJxmVzaGM","fitness-facts · contrai prima"]]},
  st_glute:{kind:"time",sec:30,sides:true,n:"Glutei (figura 4)",s:"Stretching gambe · per lato",cue:"Caviglia sul ginocchio opposto, avvicina la gamba al petto mantenendo la schiena a terra.",v:[["2VE_NLcNMvQ","Ask Doctor Jo"],["oaHvY7NOvHk","Tom Morrison"]]},
  st_add:{kind:"time",sec:45,n:"Adduttori (frog stretch)",s:"Stretching gambe",cue:"Ginocchia larghe a 90°, spingi lentamente i fianchi indietro.",v:[["XnRu_yJbMpE","Iordan Krouchev"],["qtU_WSx2wvw","MVMT Performance"]]},
  st_calf:{kind:"time",sec:30,sides:true,n:"Polpacci al muro",s:"Stretching gambe · per lato",cue:"Gamba dietro tesa e tallone a terra; poi piega il ginocchio per il soleo.",v:[["mafo7o7OnFo","HSS"],["kTnS4Sxnt0E","OrthoIndy · soleo"]]}
});

// [esercizio, giri, secondi per giro (per lato), -, pausa in secondi]
Object.assign(SESSIONS,{
  "MOBILITÀ":[["mob_post",2,60,null,15],["mob_back",2,60,null,15],["mob_hip",2,75,null,15],["mob_psoas",2,45,null,15],["mob_piri",2,45,null,15],["mob_bullet",2,60,null,15],["mob_quad",2,60,null,20],["mob_bridge",2,60,null,20]],
  "STRETCHING":[["st_pec",2,30,null,10],["st_lat",2,30,null,10],["st_rdelt",2,30,null,10],["st_tri",2,30,null,10],["st_trap",2,30,null,10],["st_tspine",2,45,null,10],["st_hipflex",2,45,null,10],["st_quad",2,30,null,10],["st_ham",2,30,null,10],["st_glute",2,30,null,10],["st_add",2,45,null,10],["st_calf",2,30,null,10]]
});
const EXTRA_SESSIONS = ["MOBILITÀ","STRETCHING"];   // fuori dal ciclo PPL

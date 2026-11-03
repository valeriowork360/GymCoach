// Programma di allenamento e video degli esercizi.
// eq: attrezzo, usato per l'incremento di carico consigliato (manubri, bilanciere, cavo, macchina)
// v: video YouTube [id, canale]; il primo è il principale.

const EX = {
  db_flat:{n:"Panca piana manubri",s:"Schienale 0°",eq:"db",cue:"Scapole addotte e depresse, gomiti a ~45°, scendi fino a sentire l'allungamento del petto.",v:[["1V3vpcaxRYQ","Davis Diley"],["nxphAl94cBU","V Athlete · ITA"],["WbCEvFA0NJs","DeltaBolic"]]},
  db_incl:{n:"Panca inclinata manubri",s:"Schienale 30–35°",eq:"db",cue:"Panca a 30–35°, spingi verso l'alto e leggermente indietro, sopra la parte alta del petto.",v:[["ou6s32mJgjU","Davis Diley"],["vqv--vheaH0","Sam Johnston"]]},
  cable_fly:{n:"Croci ai cavi dall'alto",s:"High-to-Low Cable Fly",eq:"cable",lm:"per lato (un pacco per lato)",cue:"Carrucole alte, braccia leggermente flesse, chiudi verso il basso davanti ai fianchi (nel primo video è la figura in basso).",v:[["erPxSMlmlN4","Fit With elmira"],["x4JX_T5QAMM","Davis Diley"],["xOzBZdNcwLQ","V Athlete · ITA"],["c44hwGS-peY","DeltaBolic"]]},
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
  leg_press:{n:"Leg press inclinata",s:"",eq:"plate",cue:"Bacino sempre appoggiato, scendi finché resta in posizione, non bloccare le ginocchia in alto.",v:[["EotSw18oR9w","DeltaBolic"],["_vN05ay2sjs","Sam Johnston"],["wDNPCqFailQ","Fit With elmira"],["To8Juu6ufMA","Noha Rabasco · ITA"]]},
  leg_curl:{n:"Leg curl macchina",s:"",eq:"machine",cue:"Asse del ginocchio allineato al perno della macchina, bacino fermo, fase negativa lenta.",v:[["xdbEG3xGLI8","DeltaBolic · seduto"],["EnZZIaPCb8k","DeltaBolic"],["7kgCV4InX80","Noha Rabasco · ITA"]]},
  back_ext:{n:"Back extension 45° (iperestensioni)",s:"Femorali, glutei e lombari",eq:"plate",cue:"Anca appena sopra il bordo del cuscino, schiena neutra: scendi piegando l'anca (non arrotondare) e risali spingendo col bacino fino alla linea del corpo, senza iperestendere.",note:"Usata al posto del RDL quando la zona lombare è sensibile.",v:[["8rXdAAwm8Rs","DeltaBolic"],["KbHoC--dDwA","DeltaBolic · glutei vs lombari"],["waqxM9HvqWg","DeltaBolic · errore da evitare"]]},
  calf:{n:"Standing calf raise",s:"",eq:"machine",cue:"Allungamento completo in basso con breve pausa, poi sali sull'avampiede fino in cima.",v:[["4-BeqqIFiPM","João Pedro"],["ey9a2M71-vU","DeltaBolic"],["1_B7pkicFk8","Davis Diley"]]},
  bb_bench:{n:"Panca piana bilanciere",s:"Schienale 0°",eq:"bb",cue:"Arco moderato, scapole retratte, bilanciere a metà-basso petto, piedi ben piantati.",note:"Da confermare: in UPPER il bilanciere non è ancora confermato al posto dei manubri.",v:[["EdDqD4aKwxM","Davis Diley"],["i-gLOirnPaU","Davis Diley · 5 step"],["5NStATS0zrw","DeltaBolic"],["llJtcqNVXcw","Fit With elmira"]]},
  rev_pec:{n:"Reverse pec deck",s:"Deltoidi posteriori",eq:"machine",cue:"Petto al supporto, braccia quasi tese, apri di lato senza alzare le spalle. Variante scelta: pugni chiusi appoggiati sopra le maniglie senza stringerle, guidi con i gomiti.",v:[["vpPjY_2Kq1A","TylerPath · riferimento scelto"],["H5UxZFl0lgk","DeltaBolic"],["EpL_7UvO-yM","V Athlete · ITA"],["sIQNCJ6Xwsk","DeltaBolic"]]},
  hack_sq:{n:"Hack squat inclinata",s:"Macchina a dischi",eq:"plate",cue:"Profondità costante e bacino stabile; calibra la tolleranza lombare prima di aumentare.",v:[["rzsfm43_9c0","DeltaBolic"],["cFGgMO-ENiQ","DeltaBolic · varianti"],["IjEK8a-aKIg","Fit With elmira"]]},
  lunge_db:{n:"Affondi con manubri",s:"",eq:"db",cue:"Busto stabile, passo indietro controllato, ginocchio anteriore in linea con il piede.",v:[["mJilHWIBWO8","DeltaBolic"],["_Zc5kyQ5S_A","DeltaBolic · statico"],["EFcgvIDRqbY","Fit With elmira"]]},
  leg_ext:{n:"Leg extension",s:"",eq:"machine",cue:"Ginocchio allineato al perno, stendi completamente e scendi controllato.",v:[["uM86QE59Tgc","DeltaBolic"],["IxRYNJS1cL8","Sam Johnston"],["OXl3MD2Kf7I","Noha Rabasco · ITA"]]}
};

// [esercizio, serie, rip minime, rip massime, recupero in secondi]
const SESSIONS = {
  PUSH:[["db_flat",2,6,10,180],["db_incl",2,8,12,150],["cable_fly",2,12,15,90],["db_ohp",2,8,12,150],["lat_raise",2,12,20,90],["rope_pd",2,10,15,90],["oh_ext",2,10,15,90]],
  PULL:[["lat_pd",2,8,12,150],["cs_row",2,8,12,150],["sa_pd",2,10,15,90],["db_curl",2,10,15,90],["hammer",2,10,15,90]],
  LEGS:[["smith_sq",2,8,12,180],["db_rdl",2,8,12,180],["leg_press",2,9,12,180],["leg_curl",2,10,15,150],["calf",2,10,20,90]],
  UPPER:[["bb_bench",2,6,10,180],["lat_pd",2,8,12,150],["db_incl",2,8,12,150],["cs_row",2,8,12,150],["lat_raise",2,12,20,90],["rev_pec",2,12,20,90],["rope_pd",2,10,15,90]],
  LOWER:[["leg_press",2,9,12,180],["db_rdl",2,8,12,180],["leg_ext",2,10,15,90],["leg_curl",2,10,15,150],["calf",2,10,20,90],["db_curl",2,10,15,90]]
};

const CYCLE = ["PUSH","PULL","LEGS","REST","UPPER","REST","LOWER"];
const RIR_MIN = 2, RIR_MAX = 3;
const EQ_LABEL = {db:"manubri",bb:"bilanciere / Smith",plate:"macchina a dischi",cable:"cavo",machine:"macchina a pacco pesi"};
// come si intende il carico: per manubrio, per lato (dischi su bilanciere, Smith e macchine a dischi), totale (pacco pesi e cavi)
const LOAD_MODE = {db:"per manubrio",bb:"per lato",plate:"per lato",cable:"totale",machine:"totale"};

/* Alternative mirate per il cambio esercizio: stesso muscolo e stesso tipo di stimolo.
   [id esistente o nome nuovo, motivo] */
const ALT = {
  db_flat:[["bb_bench","stessa spinta orizzontale, carico più alto"],["Chest press orizzontale macchina","spinta orizzontale stabile, facile da portare vicino al cedimento"],["Panca piana al Smith","stessa traiettoria guidata"],["Piegamenti zavorrati","spinta orizzontale a corpo libero"]],
  db_incl:[["Panca inclinata al Smith 30°","stesso angolo, traiettoria guidata"],["Chest press inclinata macchina","petto alto con macchina stabile"],["Panca inclinata bilanciere 30°","stesso angolo con bilanciere"],["Croci ai cavi dal basso (low-to-high)","petto alto in isolamento"]],
  cable_fly:[["Pec deck (croci alla macchina)","isolamento del petto con buon allungamento"],["Croci con manubri su panca piana","forte carico in allungamento"],["Croci ai cavi da seduto su panca","stesso movimento, busto stabile"]],
  db_ohp:[["Shoulder press macchina","spinta verticale stabile"],["Shoulder press al Smith da seduto","traiettoria guidata, schienale alto"],["Shoulder press manubri in piedi","stessa spinta, più core"]],
  lat_raise:[["Alzate laterali al cavo","tensione costante e carico anche in allungamento"],["Alzate laterali alla macchina","deltoide laterale isolato e stabile"],["Alzate laterali da seduto con manubri","meno slancio"]],
  rope_pd:[["Pushdown al cavo con barra dritta","stesso movimento, più carico"],["Pushdown monobraccio al cavo","lavoro unilaterale"],["Dip alla macchina","tricipiti con carico alto"]],
  oh_ext:[["Estensioni sopra la testa al cavo con corda","stesso stimolo in allungamento"],["Estensioni sopra la testa con manubrio","capo lungo in allungamento"],["Estensioni sopra la testa monobraccio al cavo","unilaterale, buon allungamento"]],
  lat_pd:[["Lat machine presa neutra","stesso movimento, presa più comoda"],["Trazioni assistite alla macchina","stessa trazione verticale"],["Pulldown monobraccio al cavo","più allungamento del gran dorsale"],["Pullover alla macchina","dorsali con braccia tese"]],
  cs_row:[["Rematore con manubri su panca inclinata","stesso supporto al petto"],["T-bar row con supporto petto","rematore stabile, carico alto"],["Pulley basso (seated cable row)","rematore orizzontale al cavo"],["Rematore alla macchina a dischi","stesso pattern, carico alto"]],
  sa_pd:[["Pullover al cavo con corda","stesso movimento con più ampiezza"],["Pullover alla macchina","dorsali a braccia tese, stabile"],["Pullover con manubrio su panca","forte allungamento"]],
  db_curl:[["Curl su panca inclinata con manubri","bicipite in allungamento"],["Curl al cavo basso","tensione costante"],["Curl con bilanciere EZ","più carico"],["Curl alla macchina (preacher)","isolamento stabile"]],
  hammer:[["Hammer curl al cavo con corda","stessa presa neutra, tensione costante"],["Curl presa inversa con bilanciere EZ","brachiale e brachioradiale"],["Hammer curl incrociato (cross-body)","stessa presa, più brachiale"]],
  smith_sq:[["hack_sq","squat guidato, focus quadricipiti"],["Pendulum squat","quadricipiti in profondità"],["leg_press","stesso focus quadricipiti"],["Squat con bilanciere","stesso pattern libero"]],
  db_rdl:[["Romanian deadlift con bilanciere","stesso hip hinge, più carico"],["Romanian deadlift al Smith","hip hinge guidato"],["Back extension 45° (iperestensioni)","stessa catena posteriore in allungamento, meno carico sulla schiena"]],
  leg_press:[["hack_sq","spinta guidata, focus quadricipiti"],["Pendulum squat","quadricipiti in profondità"],["smith_sq","stesso focus quadricipiti"],["Leg press orizzontale","stesso movimento da seduto"]],
  leg_curl:[["Leg curl seduto","il leg curl da seduto allunga di più i femorali (Maeo 2021)"],["Leg curl sdraiato","stesso isolamento dei femorali"],["Nordic curl assistito","eccentrica intensa sui femorali"]],
  calf:[["Calf raise alla leg press","polpacci a gamba tesa"],["Calf raise in piedi al Smith","stesso esercizio con bilanciere guidato"],["Calf raise monopodalico con manubrio","stesso stimolo, unilaterale"]],
  bb_bench:[["db_flat","stessa spinta con più ampiezza"],["Panca piana al Smith","traiettoria guidata"],["Chest press orizzontale macchina","spinta stabile"]],
  rev_pec:[["Croci inverse ai cavi incrociati","deltoide posteriore con tensione costante"],["Alzate posteriori con manubri su panca inclinata","deltoide posteriore con petto in appoggio"],["Face pull alla corda","deltoide posteriore e cuffia dei rotatori"]],
  leg_ext:[["Leg extension monogamba","stesso isolamento, una gamba alla volta"],["Sissy squat assistito","quadricipiti in allungamento"],["hack_sq","quadricipiti con carico alto"]],
  hack_sq:[["leg_press","stesso focus quadricipiti"],["smith_sq","squat guidato"],["Pendulum squat","quadricipiti in profondità"]],
  lunge_db:[["Bulgarian split squat con manubri","stesso lavoro unilaterale, più allungamento"],["Affondi al Smith","traiettoria guidata"],["Step-up con manubri","unilaterale per quadricipiti e glutei"]]
};

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

  st_follow:{kind:"time",sec:300,n:"Stretching parte alta — 5 min",s:"Stretching · segui il video",cue:"Segui il video dall'inizio alla fine: movimenti lenti, respirazione profonda, allungamento senza dolore.",v:[["bgMNXt88RQ8","Vitality · 5 min upper body"]]},
  st_legs:{kind:"time",sec:60,n:"Stretching gambe dopo l'allenamento",s:"Stretching · segui il video (short)",cue:"Segui le posizioni del video per ridurre l'indolenzimento dopo le gambe: allungamento dolce, respirazione lenta.",v:[["AfBdxBqRc0g","Lean Physique Lab · gambe"]]},
  st_total:{kind:"time",sec:600,n:"Stretching total body — 10 min",s:"Stretching · segui il video",cue:"Routine completa per tutto il corpo: segui il video dall'inizio alla fine senza forzare.",v:[["COO2S7lPBzA","Tone and Tighten · 10 min"]]},
  st_pec:{kind:"time",sec:30,sides:true,n:"Allungamento pettorali alla porta",s:"Stretching parte alta · per lato",cue:"Avambraccio sullo stipite, gomito all'altezza della spalla, ruota il busto lontano.",v:[]},
  st_lat:{kind:"time",sec:30,sides:true,n:"Allungamento dorsali",s:"Stretching parte alta · per lato",cue:"Spingi i fianchi indietro e allunga il fianco, respira nell'allungamento.",v:[]},
  st_rdelt:{kind:"time",sec:30,sides:true,n:"Spalla posteriore (cross-body)",s:"Stretching parte alta · per lato",cue:"Porta il braccio davanti al petto tenendo la scapola bassa, senza ruotare il busto.",v:[]},
  st_tri:{kind:"time",sec:30,sides:true,n:"Tricipiti sopra la testa",s:"Stretching parte alta · per lato",cue:"Gomito verso il soffitto, mano dietro la testa, aiutati con l'altra mano.",v:[]},
  st_trap:{kind:"time",sec:30,sides:true,n:"Trapezio superiore e collo",s:"Stretching parte alta · per lato",cue:"Orecchio verso la spalla, spalla opposta bassa, trazione leggera.",v:[]},
  st_tspine:{kind:"time",sec:45,sides:true,n:"Toracica \"open book\"",s:"Stretching parte alta · per lato",cue:"Sul fianco, ginocchia unite, apri il braccio seguendolo con lo sguardo.",v:[]},
  st_hipflex:{kind:"time",sec:45,sides:true,n:"Flessori dell'anca (couch stretch)",s:"Stretching gambe · per lato",cue:"Gluteo contratto e bacino in retroversione; avvicinati al muro gradualmente.",v:[]},
  st_quad:{kind:"time",sec:30,sides:true,n:"Quadricipiti in piedi",s:"Stretching gambe · per lato",cue:"Ginocchia vicine, bacino in retroversione, tallone verso il gluteo.",v:[]},
  st_ham:{kind:"time",sec:30,sides:true,n:"Femorali",s:"Stretching gambe · per lato",cue:"Schiena dritta, piegati dalle anche; contrai il femorale qualche secondo prima di allungare.",v:[]},
  st_glute:{kind:"time",sec:30,sides:true,n:"Glutei (figura 4)",s:"Stretching gambe · per lato",cue:"Caviglia sul ginocchio opposto, avvicina la gamba al petto mantenendo la schiena a terra.",v:[]},
  st_add:{kind:"time",sec:45,n:"Adduttori (frog stretch)",s:"Stretching gambe",cue:"Ginocchia larghe a 90°, spingi lentamente i fianchi indietro.",v:[]},
  st_calf:{kind:"time",sec:30,sides:true,n:"Polpacci al muro",s:"Stretching gambe · per lato",cue:"Gamba dietro tesa e tallone a terra; poi piega il ginocchio per il soleo.",v:[]}
});

// [esercizio, giri, secondi per giro (per lato), -, pausa in secondi]
Object.assign(SESSIONS,{
  "MOBILITÀ":[["mob_post",2,60,null,15],["mob_back",2,60,null,15],["mob_hip",2,75,null,15],["mob_psoas",2,45,null,15],["mob_piri",2,45,null,15],["mob_bullet",2,60,null,15],["mob_quad",2,60,null,20],["mob_bridge",2,60,null,20]],
  "STRETCHING":[["st_follow",1,300,null,0],["st_legs",1,60,null,0],["st_total",1,600,null,0]]
});
const EXTRA_SESSIONS = ["MOBILITÀ","STRETCHING"];   // fuori dal ciclo PPL

/* gruppo muscolare principale (per la dashboard del volume) */
const MUSCLE = {db_flat:"Petto",db_incl:"Petto",cable_fly:"Petto",bb_bench:"Petto",db_ohp:"Spalle",lat_raise:"Spalle",rev_pec:"Spalle",
  rope_pd:"Tricipiti",oh_ext:"Tricipiti",lat_pd:"Schiena",cs_row:"Schiena",sa_pd:"Schiena",db_curl:"Bicipiti",hammer:"Bicipiti",
  smith_sq:"Quadricipiti",leg_press:"Quadricipiti",hack_sq:"Quadricipiti",leg_ext:"Quadricipiti",lunge_db:"Quadricipiti",
  db_rdl:"Femorali",back_ext:"Femorali",leg_curl:"Femorali",calf:"Polpacci"};
const MUSCLE_ORDER = ["Petto","Schiena","Spalle","Tricipiti","Bicipiti","Quadricipiti","Femorali","Polpacci"];

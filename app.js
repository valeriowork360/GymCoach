/* Gym Coach — registro allenamenti con video, chat e consigli sul carico.
   Tutti i dati restano nel browser (localStorage) del telefono. */

const LS = "gymcoach_v1";
const $ = s => document.querySelector(s);

/* ---------------- stato ---------------- */
function defState(){
  return {
    cyclePos:-1,          // indice nel CYCLE dell'ultimo passaggio completato
    cur:null,             // sessione in corso
    history:[],           // sessioni archiviate
    sugg:{},              // carico consigliato per la prossima volta, per esercizio
    ui:{videoHidden:false},
    settings:{apiKey:"",model:"gemini-flash-latest",inc:{db:2,bb:2.5,cable:2.5,machine:2.5}}
  };
}
function loadState(){
  try{
    const s = JSON.parse(localStorage.getItem(LS));
    if(s){ const d=defState(); return {...d,...s,settings:{...d.settings,...s.settings,inc:{...d.settings.inc,...(s.settings||{}).inc}},ui:{...d.ui,...s.ui}}; }
  }catch(e){}
  return defState();
}
let st = loadState();
function save(){ try{ localStorage.setItem(LS, JSON.stringify(st)); }catch(e){ sys("Attenzione: impossibile salvare sul dispositivo."); } }

/* ---------------- utilità ---------------- */
const esc = t => String(t??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const md = t => esc(t).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/(^|[\s(])\*(\S[^*]*?)\*/g,"$1<i>$2</i>").replace(/\n/g,"<br>");
const fmtT = s => { s=Math.max(0,Math.round(s)); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); };
const restTxt = s => s%60===0 ? (s/60)+" min" : fmtT(s);
const kgTxt = k => k==null ? "?" : (Math.round(k*100)/100).toString().replace(".",",");
const dateTxt = ts => new Date(ts).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"});
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

function item(){ return st.cur ? SESSIONS[st.cur.session][st.cur.exIdx] : null; }
function exOf(it){ return EX[it[0]]; }
function setsOf(i){ return (st.cur.log[i] ||= []); }
function workSets(i){ return setsOf(i).filter(s=>!s.extra); }

/* ultima prestazione registrata di un esercizio nell'archivio */
function lastPerf(exId){
  for(let i=st.history.length-1;i>=0;i--){
    const h=st.history[i]; const e=h.ex.find(x=>x.ex===exId && x.sets.length);
    if(e) return {date:h.start, session:h.session, sets:e.sets};
  }
  return null;
}
function perfTxt(sets){ return sets.filter(s=>!s.extra).map(s=>`${kgTxt(s.kg)} kg × ${s.reps} (RIR ${s.rir})`).join(" · "); }

/* ---------------- logica del coach ---------------- */
const e1rm = (w,r,q) => w*(1+(r+q)/30);                // stima con formula di Epley
const loadFor = (e,r,q) => e/(1+(r+q)/30);
function roundInc(w,inc){ return Math.max(inc, Math.round(w/inc)*inc); }

/* carico consigliato per centrare il range a RIR 2–3 partendo da una serie */
function targetLoad(it,set){
  const [id,,lo,hi]=it, inc=st.settings.inc[EX[id].eq]||2.5;
  if(!set.kg) return null;
  const mid=(lo+hi)/2, e=e1rm(set.kg,set.reps,set.rir);
  let w=roundInc(loadFor(e,mid,(RIR_MIN+RIR_MAX)/2),inc);
  const maxStep=Math.max(inc, set.kg*0.15);
  w=clamp(w,set.kg-maxStep,set.kg+maxStep);
  return roundInc(w,inc);
}
function judge(it,set){
  const [,,lo,hi]=it;
  if(set.rir>RIR_MAX) return "light";
  if(set.rir<RIR_MIN) return "heavy";
  if(set.reps>hi) return "light";
  if(set.reps<lo) return "heavy";
  return "ok";
}
function coachSet(it,set){
  const [id,,lo,hi]=it, inc=st.settings.inc[EX[id].eq]||2.5, v=judge(it,set);
  let w=targetLoad(it,set);
  if(set.kg && w!=null){
    if(v==="heavy" && w>=set.kg) w=Math.max(inc,set.kg-inc);
    if(v==="light" && w<=set.kg) w=set.kg+inc;
    if(v==="ok") w=set.kg;
  }
  let why;
  if(v==="ok") why=`<span class="ok">✔ Carico giusto</span>: ${set.reps} rip nel range ${lo}–${hi} a RIR ${set.rir}.`;
  else if(v==="heavy") why=`<span class="down">⬇ Troppo pesante</span>: ${set.rir<RIR_MIN?`RIR ${set.rir} è troppo vicino al cedimento`:`${set.reps} rip sono sotto il minimo di ${lo}`}.`;
  else why=`<span class="up">⬆ Troppo leggero</span>: ${set.rir>RIR_MAX?`RIR ${set.rir}, ti restavano troppe ripetizioni`:`${set.reps} rip superano il massimo di ${hi}`}.`;
  return {v,w,why};
}
/* consiglio per la prossima seduta (double progression) */
function nextTime(it,sets){
  const [id,,lo,hi]=it, inc=st.settings.inc[EX[id].eq]||2.5;
  const ws=sets.filter(s=>!s.extra); if(!ws.length) return null;
  const last=ws[ws.length-1];
  if(!last.kg) return {kg:null,txt:"Prossima volta punta ad aggiungere ripetizioni mantenendo RIR 2–3."};
  if(ws.every(s=>s.reps>=hi && s.rir>=RIR_MIN)) return {kg:last.kg+inc,txt:`Tutte le serie al massimo del range (${hi} rip) con RIR ≥ ${RIR_MIN}: **la prossima volta sali a ${kgTxt(last.kg+inc)} kg**.`};
  const v=judge(it,last);
  if(v==="heavy"){ const w=Math.min(targetLoad(it,last)??last.kg, last.kg-inc); return {kg:Math.max(inc,w),txt:`La prossima volta parti da **${kgTxt(Math.max(inc,w))} kg** per restare nel range a RIR 2–3.`}; }
  if(v==="light"){ const w=Math.max(targetLoad(it,last)??last.kg, last.kg+inc); return {kg:w,txt:`La prossima volta prova **${kgTxt(w)} kg**.`}; }
  return {kg:last.kg,txt:`La prossima volta **resta a ${kgTxt(last.kg)} kg** e prova ad aggiungere ripetizioni fino a ${hi} in entrambe le serie.`};
}
function suggestedKg(exId){
  const s=st.sugg[exId]; if(s && s.kg!=null) return s.kg;
  const p=lastPerf(exId); if(p){ const ws=p.sets.filter(x=>!x.extra); if(ws.length) return ws[ws.length-1].kg; }
  return null;
}

/* ---------------- parser delle serie ---------------- */
const WORDS={zero:0,uno:1,una:1,un:1,due:2,tre:3,quattro:4,cinque:5,sei:6,sette:7,otto:8,nove:9,dieci:10,undici:11,dodici:12,tredici:13,quattordici:14,quindici:15,sedici:16,diciassette:17,diciotto:18,diciannove:19,venti:20,ventuno:21,ventidue:22,ventitre:23,"ventitré":23,ventiquattro:24,venticinque:25,ventisei:26,ventisette:27,ventotto:28,ventinove:29,trenta:30,quaranta:40,cinquanta:50,sessanta:60,settanta:70,ottanta:80,novanta:90,cento:100};
function norm(t){
  t=t.toLowerCase().replace(/’/g,"'");
  t=t.replace(/[a-zàèéìòù]+/g,w=>WORDS[w]!=null?String(WORDS[w]):w);
  t=t.replace(/(\d+)\s*e\s*mezzo/g,(m,a)=>a+".5").replace(/(\d),(\d)/g,"$1.$2");
  return t;
}
function parseSet(raw){
  let t=" "+norm(raw)+" ", kg=null, reps=null, rir=null, m;
  const take=(re,f)=>{ m=t.match(re); if(m){ f(m); t=t.replace(m[0]," "); return true;} return false; };
  take(/\brir\s*(?:di|=|:)?\s*(\d)\b/,m=>rir=+m[1]) || take(/\b(\d)\s*rir\b/,m=>rir=+m[1]) || take(/@\s*(\d)\b/,m=>rir=+m[1]) || take(/\b(\d)\s*(?:in canna|di riserva|buffer)/,m=>rir=+m[1]);
  take(/(\d+(?:\.\d+)?)\s*(?:kg|kili|kilo|chili|chilo|k)\b/,m=>kg=+m[1]);
  take(/(\d+)\s*(?:rip\w*|reps?|volte|ripetizioni)\b/,m=>reps=+m[1]);
  if(kg==null && reps==null) take(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+)\b/,m=>{kg=+m[1];reps=+m[2];});
  if(reps==null) take(/(?:\bx|×|\bper)\s*(\d+)\b/,m=>reps=+m[1]);
  if(kg==null) take(/(?:\bcon|\bcarico|\bpeso|\ba)\s*(\d+(?:\.\d+)?)\b/,m=>kg=+m[1]);
  const left=(t.match(/\d+(?:\.\d+)?/g)||[]).map(Number);
  for(const n of left){
    if(reps==null && kg!=null){ reps=n; continue; }
    if(kg==null && reps!=null){ kg=n; continue; }
    if(kg==null && reps==null){ kg=n; continue; }
    if(rir==null && n<=6){ rir=n; continue; }
  }
  if(kg!=null && reps==null && rir==null && left.length===1){ reps=kg; kg=null; } // "9" da solo = ripetizioni
  if(reps!=null && (reps<1||reps>60)) reps=null;
  if(rir!=null && rir>10) rir=null;
  return {kg,reps,rir,found:reps!=null||rir!=null&&kg!=null};
}
const isQuestion = t => /\?/.test(t) || /^\s*(come|perch|cosa|qual|quant[oie]? |quando|posso|devo|dovrei|meglio|ho (dolore|male)|mi fa|che |dove|spiega|consigli|è normale|e se|va bene)/i.test(t);

/* ---------------- chat ---------------- */
function addMsg(who,text,cls=""){
  if(!st.cur) return;
  st.cur.chat.push({who,text,cls,t:Date.now()});
  if(st.cur.chat.length>300) st.cur.chat=st.cur.chat.slice(-300);
  save(); drawMsg({who,text,cls});
}
const bot=(t,cls)=>addMsg("bot",t,cls), sys=t=>addMsg("sys",t), user=t=>addMsg("user",t);
function drawMsg(m){
  const d=document.createElement("div");
  d.className=`msg ${m.who} ${m.cls||""}`;
  d.innerHTML = m.who==="bot" ? m.text : esc(m.text);   // i testi del bot sono generati dall'app già sicuri
  $("#chat").appendChild(d); $("#chat").scrollTop=1e9;
  return d;
}

function introExercise(){
  const it=item(), e=exOf(it), [id,n,lo,hi,rest]=it, list=SESSIONS[st.cur.session];
  const p=lastPerf(id), sk=suggestedKg(id), sg=st.sugg[id];
  let t=`<b>${st.cur.exIdx+1}/${list.length} · ${esc(e.n)}</b>${e.s?` <span class="muted">(${esc(e.s)})</span>`:""}<br>${n} serie × ${lo}–${hi} rip · RIR ${RIR_MIN}–${RIR_MAX} · recupero ${restTxt(rest)}`;
  if(e.note) t+=`<br><span class="down">⚠ ${esc(e.note)}</span>`;
  if(p) t+=`<br>Ultima volta (${dateTxt(p.date)}): ${esc(perfTxt(p.sets))}`;
  if(sk!=null) t+=`<br>👉 <b>Oggi: ${kgTxt(sk)} kg</b>${sg&&sg.txt?"":""}`;
  else t+=`<br>👉 Prima volta: scegli un carico con cui arrivi a ~${Math.round((lo+hi)/2)} rip lasciandone 2–3 in canna.`;
  t+=`<br><span class="muted">${esc(e.cue)}</span>`;
  const done=workSets(st.cur.exIdx).length;
  if(done) t+=`<br><span class="muted">Già fatte ${done}/${n} serie.</span>`;
  else t+=`<br><span class="muted">A fine serie scrivimi, per esempio: <i>${kgTxt(sk??20)} kg ${hi-1} rip RIR 2</i></span>`;
  bot(t,"intro");
}

/* ---------------- gestione input ---------------- */
async function onSend(text){
  text=text.trim(); if(!text||!st.cur) return;
  unlockAudio(); user(text);
  const t=text.toLowerCase().trim();

  // comandi
  if(/^(annulla|cancella)( ultima)?( serie)?$/.test(t)) return undoSet();
  if(/^(salta|prossimo|successivo|avanti|next)( esercizio)?$/.test(t)) return goEx(st.cur.exIdx+1);
  if(/^(indietro|precedente)( esercizio)?$/.test(t)) return goEx(st.cur.exIdx-1);
  if(/^(fine|termina|finito|chiudi)( la)?( sessione| allenamento)?$/.test(t)) return finishSession();
  if(/^(storico|progressi)$/.test(t)) return showHistoryEx();

  // risposta a una domanda in sospeso (RIR, ripetizioni, carico)
  const pend=st.cur.pending;
  if(pend){
    const p=parseSet(text), only=t.match(/^\D*(\d+(?:[.,]\d+)?)\D*$/);
    if(pend.need==="rir"){ const v=p.rir??(only?+only[1].replace(",","."):null); if(v!=null && v<=10) return logSet({...pend,rir:v}); }
    if(pend.need==="reps"){ const v=p.reps??(only?+only[1]:null); if(v) return logSet({...pend,reps:v,rir:pend.rir??p.rir}); }
    if(pend.need==="kg"){ const v=p.kg??(only?+only[1].replace(",","."):null); if(v!=null) return logSet({...pend,kg:v}); }
  }

  const p=parseSet(text);
  if(!isQuestion(t) && p.found){ st.cur.pending=null; return logSet(p); }
  return askAI(text);
}

function logSet(p){
  const it=item(), [id,n,lo,hi,rest]=it, i=st.cur.exIdx, sets=setsOf(i), ws=workSets(i);
  let kg=p.kg;
  if(kg==null) kg = sets.length ? sets[sets.length-1].kg : suggestedKg(id);
  if(kg==null){ st.cur.pending={need:"kg",reps:p.reps,rir:p.rir}; save(); bot("Con che carico (kg)?"); return drawChips(); }
  if(p.reps==null){ st.cur.pending={need:"reps",kg,rir:p.rir}; save(); bot(`Quante ripetizioni con ${kgTxt(kg)} kg?`); return drawChips(); }
  if(p.rir==null){ st.cur.pending={need:"rir",kg,reps:p.reps}; save(); bot(`${kgTxt(kg)} kg × ${p.reps}: quante <b>RIR</b> ti sentivi (ripetizioni rimaste in canna)?`); return drawChips(); }
  st.cur.pending=null;
  const extra = ws.length>=n;
  const set={kg,reps:p.reps,rir:p.rir,t:Date.now(),...(extra?{extra:true}:{})};
  sets.push(set); save();
  const c=coachSet(it,set), num=ws.length+1;
  let txt = extra ? `Serie extra registrata: ${kgTxt(kg)} kg × ${set.reps}, RIR ${set.rir} <span class="muted">(non conta nelle serie allenanti)</span>.`
                  : `Serie ${num}/${n}: <b>${kgTxt(kg)} kg × ${set.reps}</b>, RIR ${set.rir}.<br>${c.why}`;
  const lastOfEx = !extra && num>=n;
  if(!extra && !lastOfEx){
    if(c.v==="ok") txt+=` Serie ${num+1}: <b>resta a ${kgTxt(kg)} kg</b>.`;
    else if(c.w!=null) txt+=` Serie ${num+1}: <b>${c.v==="heavy"?"scendi":"sali"} a ${kgTxt(c.w)} kg</b>.`;
    txt+=`<br>Recupero ${restTxt(rest)}.`;
  }
  bot(txt);
  if(lastOfEx){
    const nt=nextTime(it,setsOf(i));
    if(nt){ (st.cur.prevSugg ||= {})[id] = st.sugg[id] ?? null; st.sugg[id]={kg:nt.kg,txt:nt.txt,date:Date.now()}; bot(`<b>${esc(EX[id].n)} completato.</b> ${md(nt.txt)}`); }
    save();
    const list=SESSIONS[st.cur.session];
    const nextIdx=list.findIndex((x,k)=>k>i && workSets(k).length<x[1]);
    if(nextIdx>=0){ startTimer(rest); goEx(nextIdx,true); }
    else { const pending=list.findIndex((x,k)=>workSets(k).length<x[1]);
      if(pending>=0){ bot(`Manca ancora <b>${esc(EX[list[pending][0]].n)}</b>.`); startTimer(rest); goEx(pending,true); }
      else { stopTimer(); bot(`🏁 <b>Hai completato tutta la sessione ${st.cur.session}!</b> Tocca <b>Fine sessione</b> per archiviarla.`); }
    }
  } else if(!extra) startTimer(rest);
  drawExbar(); drawChips();
}

function undoSet(){
  const i=st.cur.exIdx, sets=setsOf(i);
  if(!sets.length){
    // se l'esercizio corrente è vuoto, annulla l'ultima serie dell'esercizio precedente
    const prev=Object.keys(st.cur.log).map(Number).filter(k=>st.cur.log[k].length).sort((a,b)=>b-a)[0];
    if(prev==null) return bot("Non c'è nessuna serie da annullare.");
    const s=st.cur.log[prev].pop(); restoreSugg(SESSIONS[st.cur.session][prev][0]); save(); bot(`Annullata: ${esc(EX[SESSIONS[st.cur.session][prev][0]].n)} — ${kgTxt(s.kg)} kg × ${s.reps}, RIR ${s.rir}.`);
    return goEx(prev);
  }
  const s=sets.pop(); restoreSugg(item()[0]); st.cur.pending=null; save(); stopTimer();
  bot(`Annullata l'ultima serie (${kgTxt(s.kg)} kg × ${s.reps}, RIR ${s.rir}).`);
  drawExbar(); drawChips();
}

function restoreSugg(id){
  const ps=st.cur.prevSugg;
  if(ps && id in ps){ if(ps[id]==null) delete st.sugg[id]; else st.sugg[id]=ps[id]; delete ps[id]; }
}
function goEx(k,auto){
  const list=SESSIONS[st.cur.session];
  if(k<0) return bot("Sei già al primo esercizio.");
  if(k>=list.length) return bot("Era l'ultimo esercizio. Tocca <b>Fine sessione</b> per archiviare.");
  st.cur.exIdx=k; st.cur.vid=0; st.cur.pending=null; save();
  drawVideo(); drawExbar(); drawTop(); introExercise(); drawChips();
}

function showHistoryEx(){
  const id=item()[0], rows=[];
  for(let i=st.history.length-1;i>=0 && rows.length<6;i--){
    const h=st.history[i], e=h.ex.find(x=>x.ex===id&&x.sets.length);
    if(e) rows.push(`${dateTxt(h.start)} (${h.session}): ${esc(perfTxt(e.sets))}`);
  }
  bot(rows.length?`<b>Storico ${esc(EX[id].n)}</b><br>`+rows.join("<br>"):`Nessuno storico per ${esc(EX[id].n)}: questa è la prima volta.`);
}

/* ---------------- AI (Gemini, opzionale) ---------------- */
function aiContext(){
  const it=item(), [id,n,lo,hi,rest]=it, e=EX[id];
  const today=SESSIONS[st.cur.session].map((x,k)=>{const s=workSets(k);return `- ${EX[x[0]].n}: ${x[1]}×${x[2]}–${x[3]}, recupero ${x[4]}s${s.length?` | fatto oggi: ${perfTxt(s)}`:""}`}).join("\n");
  const p=lastPerf(id);
  return `Sei il coach di palestra personale dell'utente, dentro un'app di registro allenamenti. Rispondi SEMPRE in italiano, in modo breve e pratico (massimo 90 parole), da personal trainer esperto e prudente.
Obiettivo: ipertrofia e progressione tecnica/di forza. Programma PPL + Upper/Lower, 2 serie allenanti per esercizio, RIR target 2–3 (0–1 non è il target), double progression: prima aumentare le ripetizioni nel range, poi il carico quando entrambe le serie raggiungono il limite alto a RIR 2–3. Non convertire unità, fori o kg/lato tra macchine diverse. Se l'utente segnala dolore (non semplice fatica) consiglia di fermarsi o modificare l'esercizio e, se persiste, di sentire un professionista; non fare diagnosi.
Sessione di oggi: ${st.cur.session}
${today}
Esercizio corrente: ${e.n}${e.s?` (${e.s})`:""}, attrezzo: ${EQ_LABEL[e.eq]}, ${n} serie × ${lo}–${hi} rip, RIR 2–3, recupero ${rest}s. Indicazioni tecniche: ${e.cue}
Serie fatte oggi su questo esercizio: ${perfTxt(setsOf(st.cur.exIdx))||"nessuna"}.
Ultima volta: ${p?dateTxt(p.date)+" "+perfTxt(p.sets):"nessun dato"}. Carico consigliato oggi: ${suggestedKg(id)??"non definito"}.
Rispondi SOLO con JSON valido, in uno di questi due formati:
{"azione":"serie","kg":numero o null,"rip":numero o null,"rir":numero o null}  → se il messaggio dell'utente sta comunicando una serie appena fatta (carico, ripetizioni, RIR);
{"azione":"risposta","testo":"..."} → per qualsiasi altra cosa (domande, dubbi, commenti). Nel testo puoi usare **grassetto**.`;
}
async function askAI(text){
  const key=st.settings.apiKey;
  if(!key){
    bot(`Non ho capito il messaggio come serie. Per registrarla scrivi per esempio <i>24 kg 9 rip RIR 2</i>.<br>Per farmi domande libere aggiungi la chiave gratuita di Gemini in ⚙ Impostazioni.`);
    return;
  }
  const recent=st.cur.chat.slice(-9,-1).filter(m=>m.who!=="sys").map(m=>(m.who==="user"?"Utente: ":"Coach: ")+m.text.replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,300)).join("\n");
  const prompt=(recent?`Conversazione recente:\n${recent}\n\n`:"")+`Nuovo messaggio dell'utente: ${text}`;
  const typing=drawMsg({who:"bot",text:"…",cls:"typing"});
  const models=[...new Set([st.settings.model||"gemini-flash-latest","gemini-flash-latest","gemini-3.5-flash-lite","gemini-2.5-flash"])];
  let out=null, err="";
  for(const model of models){
    try{
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
        method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
        body:JSON.stringify({systemInstruction:{parts:[{text:aiContext()}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json"}})
      });
      if(r.status===404){ err="modello non trovato"; continue; }
      if(r.status===429){ err="Limite gratuito di Gemini raggiunto per ora: riprova tra un minuto."; break; }
      if(r.status===400||r.status===401||r.status===403){ const j=await r.json().catch(()=>({})); err=(j.error&&j.error.message)||"chiave non valida"; if(/API key/i.test(err)) err="La chiave Gemini non è valida: controllala in ⚙ Impostazioni."; break; }
      if(!r.ok){ err="errore "+r.status; continue; }
      const j=await r.json();
      out=((j.candidates||[])[0]?.content?.parts||[]).map(p=>p.text||"").join("");
      if(out) break;
    }catch(e){ err="Nessuna connessione: per le domande serve internet. Le serie le registro anche offline."; break; }
  }
  typing.remove();
  if(!out){ bot(esc(err||"Non sono riuscito a rispondere.")); return; }
  let j=null; try{ j=JSON.parse(out.replace(/^```(json)?|```$/g,"").trim()); }catch(e){}
  if(j && j.azione==="serie" && (j.rip!=null || j.rir!=null)){ st.cur.pending=null; return logSet({kg:j.kg??null,reps:j.rip??null,rir:j.rir??null}); }
  bot(md(j&&j.testo ? j.testo : out));
}

/* ---------------- timer di recupero ---------------- */
let tEnd=0,tTot=0,tInt=null,beeped=false,ac=null;
function unlockAudio(){ try{ ac=ac||new (window.AudioContext||window.webkitAudioContext)(); if(ac.state==="suspended") ac.resume(); }catch(e){} }
function beep(){
  try{ if(ac){ [0,.3,.6].forEach(o=>{const os=ac.createOscillator(),g=ac.createGain();os.frequency.value=880;os.connect(g);g.connect(ac.destination);g.gain.setValueAtTime(.3,ac.currentTime+o);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+o+.22);os.start(ac.currentTime+o);os.stop(ac.currentTime+o+.25);}); } }catch(e){}
  try{ navigator.vibrate && navigator.vibrate([400,150,400]); }catch(e){}
}
function startTimer(sec){ tTot=sec; tEnd=Date.now()+sec*1000; beeped=false; if(st.cur){st.cur.timer={end:tEnd,tot:tTot};save();} $("#timer").hidden=false; clearInterval(tInt); tick(); tInt=setInterval(tick,250); }
function stopTimer(){ clearInterval(tInt); $("#timer").hidden=true; if(st.cur){st.cur.timer=null;save();} }
function tick(){
  const left=(tEnd-Date.now())/1000;
  $("#tVal").textContent = left>=0 ? fmtT(left) : "+"+fmtT(-left);
  $("#tVal").classList.toggle("over",left<0);
  $("#tBar").style.width=clamp(100*(1-left/tTot),0,100)+"%";
  if(left<=0 && !beeped){ beeped=true; beep(); }
  if(left<-300) stopTimer();
}
$("#tPlus").onclick=()=>{ tEnd+=15000; tTot+=15; beeped=false; if(st.cur){st.cur.timer={end:tEnd,tot:tTot};save();} tick(); };
$("#tStop").onclick=stopTimer;

/* ---------------- schermo sempre acceso ---------------- */
let wake=null;
async function keepAwake(){ try{ if(st.cur && "wakeLock" in navigator && !wake){ wake=await navigator.wakeLock.request("screen"); wake.addEventListener("release",()=>wake=null); } }catch(e){} }
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"){ keepAwake(); if(st.cur&&st.cur.timer) tick(); } });

/* ---------------- disegno ---------------- */
function drawTop(){
  if(!st.cur){ $("#topSess").textContent="Gym Coach"; $("#topSub").textContent="Registro allenamenti"; return; }
  const list=SESSIONS[st.cur.session], done=list.reduce((a,x,k)=>a+Math.min(x[1],workSets(k).length),0), tot=list.reduce((a,x)=>a+x[1],0);
  $("#topSess").textContent=st.cur.session;
  $("#topSub").textContent=`Esercizio ${st.cur.exIdx+1}/${list.length} · ${done}/${tot} serie · iniziata ${new Date(st.cur.start).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}`;
}
function drawVideo(){
  const e=exOf(item()), vi=clamp(st.cur.vid||0,0,e.v.length-1), [id]=e.v[vi];
  $("#player").classList.toggle("collapsed",!!st.ui.videoHidden);
  if(!st.ui.videoHidden){
    const src=`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&playsinline=1&rel=0&modestbranding=1`;
    const f=$("#frame iframe");
    if(!f || f.dataset.id!==id) $("#frame").innerHTML=`<iframe data-id="${id}" src="${src}" title="Video ${esc(e.n)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  } else $("#frame").innerHTML="";
  $("#vchips").innerHTML = e.v.map(([vid,ch],k)=>`<button class="vchip ${k===vi&&!st.ui.videoHidden?"on":""}" data-k="${k}">▶ ${esc(ch)}</button>`).join("")
    + `<button class="vchip ghost" id="vToggle">${st.ui.videoHidden?"Mostra video":"Nascondi video"}</button>`
    + `<a class="vchip ghost" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener" style="text-decoration:none;color:var(--mut)">Apri in YouTube ↗</a>`;
  $("#vchips").querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>{ st.cur.vid=+b.dataset.k; st.ui.videoHidden=false; save(); drawVideo(); });
  $("#vToggle").onclick=()=>{ st.ui.videoHidden=!st.ui.videoHidden; save(); drawVideo(); };
}
function drawExbar(){
  const it=item(), e=exOf(it), [,n,lo,hi,rest]=it, ws=workSets(st.cur.exIdx);
  let dots=""; for(let s=0;s<n;s++){ const x=ws[s]; dots+=`<span class="dot ${x?"done":s===ws.length?"next":""}" title="Serie ${s+1}">${x?x.reps:s+1}</span>`; }
  const sk=suggestedKg(it[0]);
  $("#exbar").innerHTML=`<div class="nm">${esc(e.n)}<span class="rx">${n}×${lo}–${hi} · RIR ${RIR_MIN}–${RIR_MAX} · rec ${restTxt(rest)}${sk!=null?` · oggi ${kgTxt(sk)} kg`:""}</span></div><div class="dots">${dots}</div>`;
  drawTop();
}
function drawChips(){
  const c=$("#chips"), pend=st.cur&&st.cur.pending;
  let html="";
  if(pend && pend.need==="rir") html=[0,1,2,3,4,5].map(v=>`<button class="chip acc" data-say="RIR ${v}">RIR ${v}</button>`).join("");
  else if(pend && pend.need==="reps"){ const [, ,lo,hi]=item(); for(let v=Math.max(1,lo-2);v<=hi+2;v++) html+=`<button class="chip acc" data-say="${v} rip">${v}</button>`; }
  else {
    const list=SESSIONS[st.cur.session], allDone=list.every((x,k)=>workSets(k).length>=x[1]);
    html=`<button class="chip" data-cmd="undo">↶ Annulla serie</button>`
      +`<button class="chip" data-cmd="next">Esercizio successivo →</button>`
      +`<button class="chip" data-cmd="hist">📈 Storico</button>`
      +`<button class="chip" data-cmd="list">☰ Elenco</button>`
      +`<button class="chip ${allDone?"acc":""}" data-cmd="end">🏁 Fine sessione</button>`;
  }
  c.innerHTML=html;
  c.querySelectorAll("[data-say]").forEach(b=>b.onclick=()=>onSend(b.dataset.say));
  c.querySelectorAll("[data-cmd]").forEach(b=>b.onclick=()=>{ unlockAudio(); ({undo:undoSet,next:()=>goEx(st.cur.exIdx+1),hist:showHistoryEx,list:openList,end:finishSession})[b.dataset.cmd](); });
}
function drawChat(){ $("#chat").innerHTML=""; (st.cur.chat||[]).forEach(drawMsg); }

function render(){
  if(st.cur){
    $("#home").hidden=true; $("#workout").hidden=false;
    drawTop(); drawVideo(); drawExbar(); drawChat(); drawChips();
    if(st.cur.timer && st.cur.timer.end>Date.now()-300000){ tEnd=st.cur.timer.end; tTot=st.cur.timer.tot; beeped=tEnd<Date.now(); $("#timer").hidden=false; clearInterval(tInt); tick(); tInt=setInterval(tick,250); }
    keepAwake();
  } else { $("#workout").hidden=true; $("#home").hidden=false; stopTimer(); drawTop(); drawHome(); }
}

/* ---------------- home e ciclo ---------------- */
function nextStep(){ return (st.cyclePos+1)%CYCLE.length; }
function drawHome(){
  const ni=nextStep(), nx=CYCLE[ni];
  const nextSess = nx==="REST" ? CYCLE[(ni+1)%CYCLE.length] : nx;
  const last=st.history[st.history.length-1];
  const cyc=CYCLE.map((c,k)=>`<span class="${k===ni?"next":k<=st.cyclePos?"done":""}">${c}</span>`).join("");
  const cnt=s=>`${SESSIONS[s].length} esercizi · ${SESSIONS[s].reduce((a,x)=>a+x[1],0)} serie`;
  $("#home").innerHTML=`
    <h1>Gym Coach</h1>
    <p class="lead">${last?`Ultima sessione: <b>${last.session}</b> il ${new Date(last.start).toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"})}.`:"Nessuna sessione registrata finora."}</p>
    <div class="cyc">${cyc}</div>
    ${nx==="REST"?`<div class="card" style="margin:0 0 12px"><h3>Prossimo passaggio: riposo</h3><p class="muted" style="margin:0 0 10px">Se hai già riposato, segnalo e passa a ${nextSess}.</p><button class="btn" id="restDone">Riposo fatto ✓</button></div>`:""}
    <button class="big" data-s="${nextSess}">▶ Inizia ${nextSess}<small>${cnt(nextSess)}${nx==="REST"?" · dopo il riposo":""}</small></button>
    <div class="grid">${Object.keys(SESSIONS).filter(s=>s!==nextSess).map(s=>`<button class="sbtn" data-s="${s}"><b>${s}</b><span>${cnt(s)}</span></button>`).join("")}</div>
    <div class="card"><h3>Come funziona</h3><p class="muted" style="margin:0">Durante ogni esercizio vedi i suoi video. A fine serie scrivi o detta, per esempio <i>24 kg 9 rip RIR 2</i>: registro la serie, ti dico se il carico è giusto, alto o basso, e parte il recupero. Puoi anche fare domande sull'esercizio${st.settings.apiKey?"":" (serve la chiave Gemini gratuita in ⚙)"}.</p></div>`;
  $("#home").querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>startSession(b.dataset.s));
  const rd=$("#restDone"); if(rd) rd.onclick=()=>{ st.cyclePos=ni; save(); drawHome(); };
}
function startSession(s){
  unlockAudio();
  st.cur={id:uid(),session:s,start:Date.now(),exIdx:0,vid:0,log:{},chat:[],pending:null,timer:null};
  save(); render();
  sys(`Sessione ${s} iniziata alle ${new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}`);
  introExercise(); drawChips();
}
function finishSession(){
  if(!st.cur) return;
  const list=SESSIONS[st.cur.session];
  const ex=list.map((x,k)=>({ex:x[0],sets:(st.cur.log[k]||[]).map(({kg,reps,rir,extra})=>({kg,reps,rir,...(extra?{extra:true}:{})}))})).filter(e=>e.sets.length);
  const total=ex.reduce((a,e)=>a+e.sets.filter(s=>!s.extra).length,0), planned=list.reduce((a,x)=>a+x[1],0);
  if(!ex.length){
    openSheet("Fine sessione",`<p>Non hai registrato nessuna serie. Vuoi chiudere la sessione senza salvarla?</p><div class="row"><button class="btn danger" id="discard">Chiudi senza salvare</button><button class="btn" id="keep">Continua</button></div>`);
    $("#discard").onclick=()=>{ st.cur=null; save(); closeSheet(); render(); }; $("#keep").onclick=closeSheet; return;
  }
  openSheet("Fine sessione",`<p>Hai registrato <b>${total}/${planned}</b> serie allenanti in ${ex.length} esercizi.</p><p class="muted">La sessione verrà salvata nell'archivio e il ciclo passerà al passaggio successivo.</p><div class="row"><button class="btn acc" id="confirmEnd">Salva e chiudi</button><button class="btn" id="keep">Continua ad allenarmi</button></div>`);
  $("#keep").onclick=closeSheet;
  $("#confirmEnd").onclick=()=>{
    st.history.push({id:st.cur.id,session:st.cur.session,start:st.cur.start,end:Date.now(),ex});
    const pos=CYCLE.indexOf(st.cur.session); st.cyclePos=pos;
    st.cur=null; save(); closeSheet(); stopTimer();
    try{ wake && wake.release(); }catch(e){}
    render();
  };
}

/* ---------------- fogli: elenco, archivio, impostazioni ---------------- */
function openSheet(title,html){ $("#sheetTitle").textContent=title; $("#sheetBody").innerHTML=html; $("#sheet").hidden=false; }
function closeSheet(){ $("#sheet").hidden=true; }
$("#sheetClose").onclick=closeSheet;
$("#sheet").onclick=e=>{ if(e.target.id==="sheet") closeSheet(); };

function openList(){
  if(!st.cur){ openSheet("Esercizi","<p class='muted'>Inizia una sessione per vedere l'elenco.</p>"); return; }
  const list=SESSIONS[st.cur.session];
  openSheet(st.cur.session+" · esercizi", list.map((x,k)=>{ const d=workSets(k).length, full=d>=x[1];
    return `<button class="li ${k===st.cur.exIdx?"cur":""} ${full?"done":""}" data-k="${k}"><span class="i">${full?"✓":k+1}</span><span class="nm">${esc(EX[x[0]].n)}</span><span class="rx">${d}/${x[1]} · ${x[2]}–${x[3]}</span></button>`; }).join("")
    +`<button class="btn danger wide" id="endFromList">🏁 Fine sessione</button>`);
  $("#sheetBody").querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>{ closeSheet(); goEx(+b.dataset.k); });
  $("#endFromList").onclick=()=>{ closeSheet(); finishSession(); };
}
$("#btnList").onclick=openList;

function exportJSON(){ return JSON.stringify({app:"gym-coach",version:1,exported:new Date().toISOString(),cyclePos:st.cyclePos,sugg:st.sugg,history:st.history},null,1); }
function exportText(){
  return st.history.map(h=>`${h.session} — ${new Date(h.start).toLocaleDateString("it-IT")}\n`+h.ex.map(e=>`  ${EX[e.ex]?EX[e.ex].n:e.ex}: ${e.sets.map(s=>`${kgTxt(s.kg)}kg×${s.reps} RIR${s.rir}${s.extra?" (extra)":""}`).join(", ")}`).join("\n")).join("\n\n");
}
function openArchive(){
  const hs=[...st.history].reverse();
  const items=hs.length?hs.map(h=>{
    const n=h.ex.reduce((a,e)=>a+e.sets.filter(s=>!s.extra).length,0), dur=Math.round((h.end-h.start)/60000);
    return `<details class="hs"><summary><span><b>${h.session}</b> <span class="muted">${new Date(h.start).toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit",year:"2-digit"})}</span></span><span class="muted">${n} serie · ${dur} min</span></summary>
      <div class="det">${h.ex.map(e=>`<div><b>${esc(EX[e.ex]?EX[e.ex].n:e.ex)}</b><br><span>${esc(e.sets.map(s=>`${kgTxt(s.kg)} kg × ${s.reps} · RIR ${s.rir}${s.extra?" (extra)":""}`).join("  |  "))}</span></div>`).join("")}
      <div><button class="btn danger" data-del="${h.id}">Elimina sessione</button></div></div></details>`;
  }).join(""):`<p class="muted">Ancora nessuna sessione archiviata.</p>`;
  openSheet("Archivio",`${items}
    <div class="card"><h3>Backup</h3><p class="muted" style="margin:0 0 10px">I dati sono salvati solo su questo telefono. Fai ogni tanto un backup: il file si può reimportare, il testo si può incollare in una chat con Claude per un'analisi.</p>
    <div class="row"><button class="btn" id="exFile">⬇ Esporta file</button><button class="btn" id="exCopy">📋 Copia testo</button><label class="btn" style="display:inline-block">⬆ Importa file<input type="file" id="imFile" accept="application/json,.json" hidden></label></div><p class="muted" id="exMsg"></p></div>`);
  $("#sheetBody").querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{
    if(b.dataset.armed){ st.history=st.history.filter(h=>h.id!==b.dataset.del); save(); openArchive(); }
    else { b.dataset.armed=1; b.textContent="Tocca di nuovo per eliminare"; }
  });
  $("#exFile").onclick=()=>{ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([exportJSON()],{type:"application/json"})); a.download=`gym-coach-${new Date().toISOString().slice(0,10)}.json`; a.click(); };
  $("#exCopy").onclick=async()=>{ try{ await navigator.clipboard.writeText(exportText()||"Nessuna sessione."); $("#exMsg").textContent="Copiato negli appunti."; }catch(e){ $("#exMsg").textContent="Copia non riuscita su questo browser."; } };
  $("#imFile").onchange=async e=>{
    const f=e.target.files[0]; if(!f) return;
    try{ const j=JSON.parse(await f.text()); if(!Array.isArray(j.history)) throw 0;
      const ids=new Set(st.history.map(h=>h.id)); let added=0;
      j.history.forEach(h=>{ if(!ids.has(h.id)){ st.history.push(h); added++; } });
      st.history.sort((a,b)=>a.start-b.start);
      if(j.sugg) st.sugg={...j.sugg,...st.sugg};
      if(typeof j.cyclePos==="number" && st.cyclePos<0) st.cyclePos=j.cyclePos;
      save(); openArchive(); $("#exMsg").textContent=`Importate ${added} sessioni.`;
    }catch(err){ $("#exMsg").textContent="File non valido."; }
  };
}
$("#btnArchive").onclick=openArchive;

function openSettings(){
  const s=st.settings;
  openSheet("Impostazioni",`
    <label class="f" for="sKey">Chiave API Gemini (gratuita, per la chat con domande libere)</label>
    <input class="inp" id="sKey" type="password" value="${esc(s.apiKey)}" placeholder="Incolla qui la chiave" autocomplete="off">
    <p class="muted">Creala gratis su <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Resta salvata solo su questo telefono. Senza chiave l'app funziona lo stesso: registra le serie e dà i consigli sul carico.</p>
    <label class="f" for="sModel">Modello Gemini</label>
    <input class="inp" id="sModel" value="${esc(s.model)}">
    <div class="row" style="margin-top:8px"><button class="btn" id="sTest">Prova la chiave</button><span class="muted" id="sTestMsg"></span></div>
    <label class="f">Incremento minimo di carico (kg)</label>
    <div class="inc">${Object.entries(EQ_LABEL).map(([k,l])=>`<span>${l[0].toUpperCase()+l.slice(1)}</span><input class="inp" inputmode="decimal" data-inc="${k}" value="${kgTxt(s.inc[k])}">`).join("")}</div>
    <button class="btn acc wide" id="sSave">Salva</button>
    <div class="card"><h3>Ciclo</h3><p class="muted" style="margin:0 0 8px">Ultimo passaggio completato: <b>${st.cyclePos>=0?CYCLE[st.cyclePos]:"nessuno"}</b>. Correggilo se serve:</p>
      <select class="inp" id="sCycle"><option value="-1">Nessuno (si riparte da PUSH)</option>${CYCLE.map((c,k)=>`<option value="${k}" ${k===st.cyclePos?"selected":""}>${k+1}. ${c}</option>`).join("")}</select></div>
    <div class="card"><h3>Zona pericolosa</h3><button class="btn danger" id="sWipe">Cancella tutti i dati</button></div>`);
  const collect=()=>{ s.apiKey=$("#sKey").value.trim(); s.model=$("#sModel").value.trim()||"gemini-flash-latest";
    document.querySelectorAll("[data-inc]").forEach(i=>{ const v=parseFloat(i.value.replace(",",".")); if(v>0) s.inc[i.dataset.inc]=v; });
    st.cyclePos=+$("#sCycle").value; save(); };
  $("#sSave").onclick=()=>{ collect(); closeSheet(); render(); };
  $("#sTest").onclick=async()=>{ collect(); $("#sTestMsg").textContent="Provo…";
    try{ const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.model)}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":s.apiKey},body:JSON.stringify({contents:[{role:"user",parts:[{text:"Rispondi solo: ok"}]}]})});
      $("#sTestMsg").textContent = r.ok ? "✓ Funziona" : r.status===404 ? "Modello non trovato: prova gemini-flash-latest" : r.status===429 ? "Limite raggiunto, riprova tra poco" : "Chiave non valida ("+r.status+")";
    }catch(e){ $("#sTestMsg").textContent="Nessuna connessione"; } };
  $("#sWipe").onclick=e=>{ const b=e.target; if(b.dataset.armed){ localStorage.removeItem(LS); st=defState(); closeSheet(); render(); } else { b.dataset.armed=1; b.textContent="Tocca di nuovo: cancella archivio e impostazioni"; } };
}
$("#btnSettings").onclick=openSettings;

/* ---------------- composer e dettatura ---------------- */
$("#msg").addEventListener("focus",()=>document.body.classList.add("kbd"));
$("#msg").addEventListener("blur",()=>setTimeout(()=>document.body.classList.remove("kbd"),150));
$("#composer").onsubmit=e=>{ e.preventDefault(); const v=$("#msg").value; $("#msg").value=""; onSend(v); };
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SR){
  const mic=$("#btnMic"); mic.hidden=false; let rec=null;
  mic.onclick=()=>{
    unlockAudio();
    if(rec){ rec.stop(); return; }
    rec=new SR(); rec.lang="it-IT"; rec.interimResults=true; rec.maxAlternatives=1;
    mic.classList.add("on"); let final="";
    rec.onresult=ev=>{ let txt=""; for(const r of ev.results){ txt+=r[0].transcript; if(r.isFinal) final=txt; } $("#msg").value=txt; };
    rec.onend=()=>{ mic.classList.remove("on"); rec=null; const v=(final||$("#msg").value).trim(); if(v){ $("#msg").value=""; onSend(v); } };
    rec.onerror=()=>{ mic.classList.remove("on"); rec=null; };
    rec.start();
  };
}

if("serviceWorker" in navigator && location.protocol==="https:") navigator.serviceWorker.register("sw.js").catch(()=>{});
render();

// Jeu de données FICTIF pour les captures d'écran (aucun réseau, aucune donnée réelle).
(async function(){
  const scen = (location.hash||"#aujourdhui_course").slice(1);
  const R = (()=>{ let s=42; return ()=>{ s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; })();
  try{ localStorage.clear(); localStorage.setItem("mra_tutorialSeen", JSON.stringify(["aujourdhui","progression","programme","profil"])); }catch(e){}

  // --- réseau neutralisé
  supa.auth.getUser = async()=>({data:{user:{id:"demo", email:"camille@exemple.fr"}}});
  const inserted=[]; let insId=0; window.__calls=[];
  supa.from = (table)=>({ select(){return this}, order(){return Promise.resolve({data:[],error:null})}, maybeSingle: async()=>({data:null,error:null}),
    update(patch){ return {eq: async(col,val)=>{ window.__calls.push(["update",table,patch,col,val]); if(table==="planned_sessions"){ plannedSessions.filter(x=>x[col]===val).forEach(p=>Object.assign(p,patch)); } if(table==="runs"){ const r=rows.find(x=>x[col]===val)||inserted.find(x=>x[col]===val); if(r) Object.assign(r,patch); } return {error:null}; }}; },
    insert(row){ const id="m"+(++insId); window.__calls.push(["insert",table,row]); if(table==="runs") inserted.push({id, ...row}); const pr=Promise.resolve({error:null}); pr.select=()=>({single:async()=>({data:{id},error:null})}); return pr; },
    upsert: async()=>({error:null}),
    delete(){ return {eq: async(col,val)=>{ window.__calls.push(["delete",table,val]); const i=inserted.findIndex(x=>x.id===val); if(i>=0) inserted.splice(i,1); const j=rows.findIndex(x=>x.id===val); if(j>=0) rows.splice(j,1); return {error:null}; }}; } });
  window.loadData = async()=>{ if(typeof rows!=="undefined"){ RUNS=[...rows,...inserted].sort((a,b)=>new Date(a.start_date)-new Date(b.start_date)).map(mapRow); runningRuns=RUNS.filter(r=>r.includeInStats); efRuns=runningRuns.filter(r=>r.type==="EF"); fracRuns=runningRuns.filter(r=>r.type==="Fractionné"); } };

  // --- profil fictif
  maxHr = 191; restingHr = 58; vo2Max = 48; pseudo = "Camille"; age = 34; gender = "Femme"; cities = ["Rennes"]; userEmail = "camille@exemple.fr";
  restingHrIsManual = false; vo2MaxIsManual = false; suspendedZones = [];
  onboardingCompletedAt = "2026-06-01T08:00:00Z";
  goals = { principal:{objectifPrincipal:"Préparer une course", distanceCourse:"10km", dateCible:"2026-12-13", pbExistant:"Oui", pbSec:2820, terrainCourse:"Plat", objectifChrono:"Oui", tempsViseSec:2700},
            secondaire:{}, niveau:"Intermédiaire", frequence:"3", frequenceAutre:"1", kmMensuel:"90", terrain:"Route", equipement:"Apple Watch", joursIndisponibles:"6" };
  programSettings = {};

  // --- séances réelles fictives (14 semaines)
  const startOf = (n)=>{ const d=new Date(); d.setDate(d.getDate()-n); d.setHours(7,20+Math.floor(R()*20),0,0); return d; };
  function genHr(durSec, avg, kind){
    const out=[];
    for(let t=0;t<=durSec;t+=20){
      let hr;
      if(kind==="frac"){
        const warm=600, rep=300, work=180, reps=6;
        if(t<warm) hr = 105 + (avg-30-105)*Math.min(1,t/300);
        else if(t<warm+reps*rep){ const p=(t-warm)%rep; hr = p<work ? avg+14-(p<40?(40-p)*0.6:0) : avg-24; }
        else hr = avg-32;
      } else if(kind==="seuil"){
        if(t<600) hr = 108 + (avg-38-108)*Math.min(1,t/300);
        else if(t<1800) hr = avg + (t-600)/1200*4;
        else hr = avg-30;
      } else { hr = 112 + (avg-112)*Math.min(1,t/300) + 3*Math.sin(t/90); }
      out.push({t, hr: Math.round(hr + (R()-0.5)*4)});
    }
    return out;
  }
  function fracPaces(){
    const out=[]; const warm=600, rep=300, work=180, reps=6, total=600+6*300+420;
    for(let t=0;t<=total;t+=20){
      let pace;
      if(t<warm) pace=390; else if(t<warm+reps*rep){ const p=(t-warm)%rep; pace = p<work ? 268 : 395; } else pace=402;
      out.push({t, pace: Math.round(pace + (R()-0.5)*8)});
    }
    return out;
  }
  const rows=[]; let nid=0;
  const push=(o)=>{ rows.push({ id:"d"+(++nid), apple_type:"Running", include_in_stats:true, ...o }); return rows[rows.length-1]; };
  for(let n=98;n>=1;n--){
    const d=startOf(n); const dow=(d.getDay()+6)%7; const wk=Math.floor(n/7);
    if(R()<0.1 && n>8) continue;
    const progress=(98-n)/98;
    const efPace = 372 - progress*22 + (R()-0.5)*8;
    if(dow===1){
      if(wk%2===0){ const s=push({start_date:d.toISOString(), type:"Fractionné", distance_km:8.44, duration_sec:2820, avg_hr:158, hr_series:genHr(2820,158,"frac"), pace_series:fracPaces(), calories:520}); s.peak_hr=Math.max(...s.hr_series.map(x=>x.hr)); }
      else { const dist=8.2; const s=push({start_date:d.toISOString(), type:"Seuil", distance_km:dist, duration_sec:Math.round(dist*(efPace-48)), avg_hr:163, hr_series:genHr(Math.round(dist*(efPace-48)),163,"seuil"), calories:540}); s.peak_hr=Math.max(...s.hr_series.map(x=>x.hr)); }
    } else if(dow===3 || dow===5){
      const dist = (dow===3 ? 7 : 8) + (R()-0.5)*0.6; const dur=Math.round(dist*efPace); const avg=Math.round(149 - progress*3 + (R()-0.5)*3);
      const s=push({start_date:d.toISOString(), type:"EF", distance_km:Math.round(dist*100)/100, duration_sec:dur, avg_hr:avg, hr_series:genHr(dur,avg,"ef"), calories:Math.round(dist*62)}); s.peak_hr=Math.max(...s.hr_series.map(x=>x.hr));
    } else if(dow===6){
      const dist = 10 + progress*3 + (R()-0.5)*0.6; const dur=Math.round(dist*(efPace+14)); const avg=151;
      const s=push({start_date:d.toISOString(), type:"Long", distance_km:Math.round(dist*100)/100, duration_sec:dur, avg_hr:avg, hr_series:genHr(dur,avg,"ef"), calories:Math.round(dist*63)}); s.peak_hr=Math.max(...s.hr_series.map(x=>x.hr));
    }
  }
  // Séance d'hier : sortie easy rapide (meilleure allure easy) ; un renfo mercredi
  const yest = rows.find(r=>new Date(r.start_date).toDateString()===startOf(1).toDateString());
  if(yest){ yest.distance_km=8.1; yest.duration_sec=Math.round(8.1*343); yest.avg_hr=147; yest.hr_series=genHr(yest.duration_sec,147,"ef"); yest.peak_hr=Math.max(...yest.hr_series.map(x=>x.hr)); }
  if((scen==="celebration_record"||scen==="hier") && yest){ yest.distance_km=15.4; yest.duration_sec=Math.round(15.4*331); yest.avg_hr=150; yest.hr_series=genHr(yest.duration_sec,150,"ef"); yest.peak_hr=Math.max(...yest.hr_series.map(x=>x.hr)); }
  const renfoRun = push({start_date:startOf(2).toISOString(), type:"Renfo", apple_type:"Strength", distance_km:0, duration_sec:1500, avg_hr:112, include_in_stats:false});
  // ressentis : tous notés sauf hier
  rows.forEach(r=>{ if(r.include_in_stats===false) return; r.pain_ratings = { rpe: r.type==="Fractionné"?8:r.type==="Seuil"?7:r.type==="Long"?6:5, note: 4, gene:false, fatigue:3, mental:2, respiration:2 }; });
  if(yest) yest.pain_ratings = null;
  if(scen==='q1') push({start_date:new Date().toISOString(), type:'EF', distance_km:7.6, duration_sec:2700, avg_hr:148});
  let todayRunRow = null;
  if(scen==="seance_faite"){ const d=new Date(); d.setHours(7,33,0,0); todayRunRow = push({start_date:d.toISOString(), type:"EF", distance_km:8.1, duration_sec:2778, avg_hr:148, hr_series:genHr(2778,148,"ef"), calories:500}); todayRunRow.peak_hr=Math.max(...todayRunRow.hr_series.map(x=>x.hr)); todayRunRow.pain_ratings={rpe:5,note:4,gene:false,fatigue:3,mental:2,respiration:2}; }
  rows.sort((a,b)=>new Date(a.start_date)-new Date(b.start_date));
  if(scen==="rappels"){ const cut=startOf(8).getTime(); for(let i=rows.length-1;i>=0;i--){ if(new Date(rows[i].start_date).getTime()>cut) rows.splice(i,1); } }
  RUNS = rows.map(mapRow); runningRuns = RUNS.filter(r=>r.includeInStats); efRuns = runningRuns.filter(r=>r.type==="EF"); fracRuns = runningRuns.filter(r=>r.type==="Fractionné");
  const lastRun = runningRuns[runningRuns.length-1];

  // --- séances prévues fictives
  const today = new Date(); today.setHours(0,0,0,0);
  const at = (off)=>{ const d=new Date(today); d.setDate(d.getDate()+off); return d; };
  let pid=0;
  const P = (off, o)=>({ id:"p"+(++pid), status:"planned", source:"generated", planned_date:localDateStr(at(off)), week_start_date:localDateStr(mondayOf(at(off))), ...o });
  const easyRationale = "Sortie easy : elle construit ton endurance sans te fatiguer. Elle est placée le vendredi, répartie avec tes autres sorties pour étaler l'effort sur la semaine.";
  const dowToday = (today.getDay()+6)%7;
  const mondayOff = -dowToday;
  const wkSessions = [];
  wkSessions.push(P(mondayOff, {type:"EF", pace_zone:"easy", title:"Sortie easy", target_distance_km:7, target_pace_sec_per_km:362, rationale:easyRationale, status:"missed"}));
  wkSessions.push(P(mondayOff+1, {type:"Fractionné", pace_zone:"interval", title:"Séance qualité", target_distance_km:8, target_pace_sec_per_km:268, rationale:"Séance de fractionné : elle développe ta vitesse et ta capacité à encaisser un effort intense.", status:"done", linked_run_id:rows.find(r=>r.type==="Fractionné"&&new Date(r.start_date)>at(mondayOff))?.id}));
  wkSessions.push(P(mondayOff+2, {type:"Renfo", pace_zone:null, title:"Renfo", rationale:CROSS_TRAINING_RATIONALE["Renfo"], status:"done"}));
  wkSessions.push(P(mondayOff+3, {type:"EF", pace_zone:"easy", title:"Sortie easy", target_distance_km:8, target_pace_sec_per_km:362, rationale:easyRationale, status:"done", linked_run_id: yest && yest.id}));
  wkSessions.push(P(mondayOff+5, {type:"Long", pace_zone:"easy", title:"Sortie longue", target_distance_km:13, target_pace_sec_per_km:372, rationale:"Sortie longue : tu cours à allure tranquille, plus longtemps, pour développer ton endurance."}));
  const future=[];
  for(let w=1; w<=3; w++){
    const m = mondayOff + 7*w;
    future.push(P(m+1, {type:"Seuil", pace_zone:"threshold", title:"Séance qualité", target_distance_km:8, target_pace_sec_per_km:312, rationale:"Séance au seuil : elle t'entraîne à tenir plus longtemps une bonne allure."}));
    future.push(P(m+2, {type:"Mobilité", pace_zone:null, title:"Mobilité", rationale:CROSS_TRAINING_RATIONALE["Mobilité"]}));
    future.push(P(m+3, {type:"EF", pace_zone:"easy", title:"Sortie easy", target_distance_km:8, target_pace_sec_per_km:362, rationale:easyRationale}));
    future.push(P(m+5, {type:"Long", pace_zone:"easy", title:"Sortie longue", target_distance_km:13+w, target_pace_sec_per_km:372, rationale:"Sortie longue : tu cours à allure tranquille, plus longtemps, pour développer ton endurance."}));
    future.push(P(m+5, {type:"Yoga", pace_zone:null, title:"Yoga", rationale:CROSS_TRAINING_RATIONALE["Yoga"]}));
  }
  const todayEasy = P(0, {type:"EF", pace_zone:"easy", title:"Sortie easy", target_distance_km:7.5, target_pace_sec_per_km:360, rationale:easyRationale});
  const todayYoga = P(0, {type:"Yoga", pace_zone:null, title:"Yoga", rationale:CROSS_TRAINING_RATIONALE["Yoga"]});
  const strength = buildStrengthSession({type:"Renfo", niveau:"Intermédiaire", objectif:"Préparer une course", pausedZoneKeys:[], rotationSeed:3});
  const todayRenfo = P(0, {type:"Renfo", pace_zone:null, title:"Renfo", rationale:CROSS_TRAINING_RATIONALE["Renfo"], description:formatExerciseList(strength.exercises), target_duration_min:strength.durationMin});

  function celebrationOff(){ try{ localStorage.setItem("mra_celebratedRuns", JSON.stringify([lastRun.id])); localStorage.setItem("mra_effCelebratedAt", localDateStr(new Date())); }catch(e){} }
  function rateYesterday(){ if(yest){ const r=runningRuns.find(x=>x.id===yest.id); if(r) r.painRatings={rpe:5,note:4,gene:false,fatigue:3,mental:2,respiration:2}; } }

  // --- scénarios
  document.getElementById("authView").style.display="none";
  document.getElementById("appView").style.display="block";
  document.getElementById("tabs").style.display="";
  const show = (tab)=>{ activeTab=tab; renderTabs(); renderContent(); };

  if(scen==="aujourdhui_course"){
    plannedSessions=[...wkSessions, todayEasy, todayYoga, ...future]; show("aujourdhui");
  } else if(scen==="q1"){
    celebrationOff(); rateYesterday(); plannedSessions=[...wkSessions, todayEasy, ...future]; activeTab="aujourdhui";
    window.__q1={before:todayEasy.status};
    renderApp();
    window.__q1.afterRender=todayEasy.status;
    await runProgramMaintenance();
    window.__q1.after=todayEasy.status; window.__q1.linked=!!todayEasy.linked_run_id;
    window.__q1.html=document.getElementById("content").innerText.slice(0,400);
  } else if(scen==="merge"||scen==="merge_ask"){
    celebrationOff(); rateYesterday();
    const dur = scen==="merge" ? 2700 : 1500;
    rows.push({ id:"man1", apple_type:"Manuel", include_in_stats:true, type:"EF", start_date:new Date(new Date(yest.start_date).getTime()+3600000).toISOString(), distance_km:7.4, duration_sec:dur, avg_hr:null, pain_ratings:{rpe:6,note:3,gene:false,fatigue:4,mental:2,respiration:2}, notes:"jambes lourdes" });
    rows.sort((a,b)=>new Date(a.start_date)-new Date(b.start_date)); await loadData();
    wkSessions[3].linked_run_id="man1";
    plannedSessions=[...wkSessions, todayEasy, ...future]; activeTab="aujourdhui"; window.confirm=()=>true;
    const out=window.__mg={before:{runs:RUNS.length, manual:RUNS.filter(r=>r.appleType==="Manuel").length}};
    renderApp(); await runProgramMaintenance();
    out.after={runs:RUNS.length, manual:RUNS.filter(r=>r.appleType==="Manuel").length};
    const ysynced=RUNS.find(r=>r.id===yest.id);
    out.synced={rated:!!ysynced.painRatings, notes:ysynced.notes||null};
    out.planned={linked:wkSessions[3].linked_run_id, status:wkSessions[3].status, isYest: wkSessions[3].linked_run_id===yest.id};
    const txt=document.getElementById("content").innerText;
    out.notice=txt.includes("On a remplacé ta saisie"); out.ask=txt.includes("Est-ce la même séance");
    if(scen==="merge_ask"){ await mergeSame("man1", yest.id); const t2=document.getElementById("content").innerText; out.afterYes={manual:RUNS.filter(r=>r.appleType==="Manuel").length, notice:t2.includes("On a remplacé ta saisie"), ask:t2.includes("Est-ce la même séance"), planned:wkSessions[3].linked_run_id===yest.id}; }
  } else if(scen==="attach"){
    celebrationOff(); rateYesterday();
    wkSessions[3].status="skipped"; wkSessions[3].linked_run_id=null;
    plannedSessions=[...wkSessions, todayEasy, ...future]; activeTab="aujourdhui"; window.confirm=()=>true;
    const out=window.__at={};
    renderApp(); await runProgramMaintenance();
    const txt=document.getElementById("content").innerText;
    out.card=txt.includes("Cette sortie correspond à une séance prévue"); out.note=(txt.match(/Ta sortie de [^.]*\. La séance de [^.]*\./)||[null])[0];
    out.buttons=[...document.querySelectorAll("button")].filter(b=>b.textContent.includes("Oui, c'est celle-là")).length;
    out.cardText=txt.slice(txt.indexOf("Cette sortie"), txt.indexOf("Cette sortie")+330);
    const monday=wkSessions[0]; out.mondayBefore={status:monday.status,date:monday.planned_date};
    await attachRun(RUNS.find(r=>r.id===yest.id).id, monday.id);
    out.mondayAfter={status:monday.status,date:monday.planned_date,linked:monday.linked_run_id===yest.id};
    const t2=document.getElementById("content").innerText;
    out.afterCard=t2.includes("Cette sortie correspond"); out.afterNote=t2.includes("Ta sortie de");
  } else if(scen==="mr"){
    celebrationOff(); rateYesterday(); plannedSessions=[...wkSessions, todayEasy, ...future]; activeTab="aujourdhui"; renderApp();
    window.confirm=()=>true; const out=window.__mr={};
    out.btnOnCard = document.getElementById("content").innerText.includes("J'ai fait cette séance");
    openManualRun(todayEasy.id);
    out.prefill = {...manualRunForm};
    out.sheetShown = !!document.querySelector("#sheetRoot .sheet");
    manualRunSet("distKm","7.4"); manualRunSet("durationText","44:00"); manualRunSet("hr","150"); ratingSlide("rpe", 5); ratingGene(false);
    await saveManualRun();
    const ins = window.__calls.find(c=>c[0]==="insert"&&c[1]==="runs");
    out.insertRow = ins && ins[2];
    out.todayStatus = todayEasy.status; out.linked = todayEasy.linked_run_id;
    out.tab = activeTab; out.sheetClosed = !document.querySelector("#sheetRoot .sheet");
    out.newRun = RUNS.filter(r=>r.appleType==="Manuel").map(r=>({id:r.id,type:r.type,dist:r.dist,dur:r.durationSec,includeInStats:r.includeInStats}));
    out.histText = document.getElementById("content").innerText.includes("Saisie à la main");
    out.deleteBefore = todayEasy.status;
    await deleteRunNow(todayEasy.linked_run_id);
    out.afterDelete = {status:todayEasy.status, linked:todayEasy.linked_run_id, manualLeft:RUNS.filter(r=>r.appleType==="Manuel").length};
    // erreurs de validation
    openManualRun(); manualRunSet("durationText",""); await saveManualRun(); out.err = document.getElementById("mrError").textContent;
  } else if(scen==="feuille_saisie"){
    // Feuille de saisie à la main ouverte (en-tête commun, poignée, ×) + message en bas
    celebrationOff(); rateYesterday(); plannedSessions=[...wkSessions, todayEasy, ...future]; activeTab="aujourdhui"; renderApp();
    openManualRun(todayEasy.id); toast("Séance enregistrée");
  } else if(scen==="saisie_doublon"){
    // N1b : ajout depuis l'historique, une course synchronisée existe déjà ce jour-là
    celebrationOff(); rateYesterday(); plannedSessions=[...wkSessions, todayEasy, ...future]; show("progression"); openHistory();
    const y = yest ? RUNS.find(r=>r.id===yest.id) : lastRun;
    openManualRun(); manualRunSet("date", localDateStr(dateFromRun(y))); manualRunSet("type", y.type); manualRunSet("distKm","8"); manualRunSet("durationText", fmtDur(y.durationSec)); renderManualRunSheet();
  } else if(scen==="composants"){
    // Planche des composants de base du design (S1) : pastilles, boutons, champ, interrupteur, badge, types
    show("aujourdhui");
    const dots = Object.keys(TC).map(t=>`<div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:56px"><div class="session-dot" style="background:${TC[t]}22;color:${TC[t]}">${icon(TICON[t]||"activity",18)}</div><span style="font-size:10px;color:var(--text-3)">${t==="Other"?"Autre":t}</span></div>`).join("");
    document.getElementById("content").innerHTML = `
      <div class="card"><div class="stitle">Pastilles</div>
        <div class="filters"><button class="flt active">Semaine</button><button class="flt">Mois</button><button class="flt">Tout</button><button class="flt">Courses</button></div>
        <div class="stitle" style="margin-top:6px">Boutons</div>
        <button class="btn-primary">Enregistrer</button>
        <button class="btn-secondary" style="margin-top:8px">Annuler</button>
        <button class="btn-danger">Supprimer</button></div>
      <div class="card"><div class="stitle">Champ, interrupteur, badge</div>
        <div class="field"><input placeholder="Email" value="camille@exemple.fr"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin:6px 0 12px"><span style="font-size:15px">Compter dans mes stats</span><label class="toggle"><input type="checkbox" checked><span class="track"></span><span class="thumb"></span></label></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><span style="font-size:15px">Notifications</span><label class="toggle"><input type="checkbox"><span class="track"></span><span class="thumb"></span></label></div>
        <div class="save-confirm show">${icon("check",13)} Enregistré</div></div>
      <div class="card"><div class="stitle">Couleurs par type</div><div style="display:flex;flex-wrap:wrap;gap:10px">${dots}</div></div>
      <div class="card" style="border-color:var(--attention-line);background:var(--attention-bg)"><div style="font-size:14px;font-weight:600;color:var(--attention)">Attention (violet)</div><div style="font-size:13px;color:var(--text-3);margin-top:4px">Fond à 10 %, liseré à 40 %, texte sur violet #0C0D0F.</div></div>`;
    toast("Séance enregistrée");
  } else if(scen==="seance_faite"){
    // Séance prévue faite, reçue d'Apple Santé : chiffres réels, « prévu 7,5 km », détail cardio replié
    celebrationOff(); rateYesterday();
    const done = P(0, {type:"EF", pace_zone:"easy", title:"Sortie easy", target_distance_km:7.5, target_pace_sec_per_km:360, rationale:easyRationale, status:"done", linked_run_id:todayRunRow.id});
    plannedSessions=[...wkSessions, done, ...future]; show("aujourdhui");
  } else if(scen==="seance_retard"){
    // Séance d'un jour passé, rien reçu : « Pas encore reçue d'Apple Santé » + « J'ai fait cette séance »
    const late = P(-1, {type:"EF", pace_zone:"easy", title:"Sortie easy", target_distance_km:7, target_pace_sec_per_km:362, rationale:easyRationale});
    plannedSessions=[late]; show("aujourdhui");
    document.getElementById("content").innerHTML = programSessionCardHTML(late, new Date());
  } else if(scen==="hier"){
    // Carte « Hier » : record de distance + ressenti à noter, sans carte de rattachement
    try{ localStorage.setItem("mra_notLinked", JSON.stringify(rows.map(r=>r.id))); localStorage.setItem("mra_celebratedRuns","[]"); localStorage.removeItem("mra_effCelebratedAt"); }catch(e){}
    plannedSessions=[...wkSessions, todayRenfo, ...future]; show("aujourdhui");
  } else if(scen==="aujourdhui_renfo"){
    celebrationOff(); rateYesterday(); plannedSessions=[...wkSessions, todayRenfo, ...future]; openLearnMore=new Set([todayRenfo.id]); show("aujourdhui");
  } else if(scen==="aujourdhui_repos"){
    celebrationOff(); rateYesterday(); plannedSessions=[...wkSessions, ...future]; show("aujourdhui");
  } else if(scen==="programme_semaine" || scen==="programme_mois"){
    celebrationOff(); rateYesterday();
    // douleur répétée (genou, intensité 6) pour montrer la bannière d'adaptation
    runningRuns.slice(-2).forEach(r=>{ r.painRatings = { ...(r.painRatings||{}), genoux_g:6 }; });
    plannedSessions=[...wkSessions, todayEasy, todayYoga, ...future];
    programViewMode = scen==="programme_mois" ? "month" : "week"; programWeekOffset=0; programSelectedDate=localDateStr(today);
    show("programme");
  } else if(scen==="progression"){
    celebrationOff(); plannedSessions=[...wkSessions, ...future];
    openMonths=null; openManageRow=new Set([lastRun.id]); show("progression");
  } else if(/^progression_(allure|regularite|forme)$/.test(scen)){
    // Les trois autres variantes de la carte objectif (journal 5f, 5g, 5h)
    goals.principal = { objectifPrincipal: scen==="progression_allure" ? "Améliorer mon allure" : scen==="progression_regularite" ? "Courir plus régulièrement" : "Rester en forme" };
    // programme commencé il y a 9 semaines (une séance déjà faite cette semaine-là) : « Semaine 10 du programme »
    const oldMonday = localDateStr(at(mondayOff-63));
    const startRow = P(-63, {type:"EF", pace_zone:"easy", title:"Sortie easy", status:"done"});
    startRow.week_start_date = oldMonday;
    celebrationOff(); plannedSessions=[startRow, ...wkSessions, ...future]; openMonths=null; openManageRow=new Set(); show("progression");
  } else if(scen==="historique" || scen==="historique_mois"){
    celebrationOff(); plannedSessions=[...wkSessions, ...future]; show("progression"); openHistory();
    if(scen==="historique_mois"){ const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); toggleHistMonth(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")); }
  } else if(scen==="detail_seance" || scen==="detail_cardio" || scen==="detail_suppression"){
    celebrationOff(); plannedSessions=[...wkSessions, ...future]; show("progression"); openHistory();
    const ef = runningRuns.filter(r=>r.type==="EF" && r.hrSeries && r.hrSeries.length>10).slice(-1)[0] || lastRun;
    if(scen==="detail_cardio") openHrDetail.add(ef.id);
    openRunSheet(ef.id); if(scen==="detail_suppression") askDeleteRun();
  } else if(/^ressenti/.test(scen)){
    celebrationOff(); plannedSessions=[...wkSessions, ...future]; show("progression"); openHistory();
    const tgt = runningRuns.filter(r=>r.type==="EF").slice(-1)[0] || lastRun;
    tgt.painRatings = null;    // séance pas encore notée : le préremplissage ne reprend que fatigue, mental, respiration
    openRatingSheet(tgt.id);
    ratingSlide("rpe", 4);
    if(scen==="ressenti_corps"){ ratingGene(true); ratingZone("genoux_g"); ratingZoneSlide(5); }
    if(scen==="ressenti_dos"){ ratingGene(true); ratingView("back"); ratingZone("mollets_d"); ratingZoneSlide(7); }
  } else if(scen==="jauge_charge" || scen==="jauge_info"){
    celebrationOff(); plannedSessions=[...wkSessions, ...future]; openMonths=null; openManageRow=new Set(); show("progression");
    openChargeSheet(); if(scen==="jauge_info") toggleChargeInfo();
  } else if(scen==="profil_objectifs"){
    setProfilSectionState("objectifs"); show("profil");
  } else if(scen==="profil_compte"){
    setProfilSectionState("compte"); show("profil");
  } else if(scen==="aujourdhui_savoir_plus"){
    celebrationOff(); rateYesterday(); plannedSessions=[...wkSessions, todayEasy, ...future]; openLearnMore=new Set([todayEasy.id]); show("aujourdhui");
  } else if(scen==="programme_ajout"){
    celebrationOff(); rateYesterday(); wkSessions[0].status="done"; plannedSessions=[...wkSessions, ...future];
    const sunday=localDateStr(at(mondayOff+6)); programViewMode="week"; programWeekOffset=0; programSelectedDate=sunday; openAddForm=sunday; show("programme");
  } else if(scen==="carte_corps"){
    celebrationOff(); plannedSessions=[...wkSessions, ...future]; openMonths=null; openManageRow=new Set([lastRun.id]); show("progression");
    const prefix="sess_"+lastRun.id; setRatingNote(prefix,2); setRatingGene(prefix,true); bodyZoneTap(prefix,"genoux_g"); bodyZoneTap(prefix,"dos");
    const row=document.getElementById("hist_"+lastRun.id); const wrap=row.nextElementSibling; const holder=document.createElement("div"); holder.className="card"; holder.append(row.cloneNode(true), wrap.cloneNode(true));
    const c=document.getElementById("content"); c.innerHTML=""; c.append(holder);
  } else if(scen==="celebration_record"){
    rateYesterday(); localStorage.removeItem("mra_celebratedRuns"); plannedSessions=[...wkSessions, ...future]; show("aujourdhui");
  } else if(scen==="douleur_forte" || scen==="zone_pause"){
    celebrationOff(); rateYesterday(); plannedSessions=[...wkSessions, todayEasy, ...future];
    if(scen==="douleur_forte"){ const lr=runningRuns[runningRuns.length-1]; lr.painRatings={...(lr.painRatings||{}), genoux_g:8}; }
    else { suspendedZones=[{zone:"genoux_g", since:new Date(Date.now()-3*86400000).toISOString()}]; }
    programViewMode="week"; programWeekOffset=0; programSelectedDate=localDateStr(today); show("programme");
  } else if(scen==="rappels"){
    celebrationOff(); goals.principal.pbExistant="Non"; goals.principal.pbSec=""; programSettings={ guidedTest:{status:"pending"}, beginnerPlan:{startMonday:"2026-07-20"} };
    plannedSessions=[...wkSessions, ...future]; show("aujourdhui");
  } else if(scen==="marche_course" || scen==="test_niveau"){
    RUNS=[]; runningRuns=[]; efRuns=[]; fracRuns=[]; goals={ principal:{objectifPrincipal:"Rester en forme"}, secondaire:{}, niveau:"Débutant", frequence:"3", frequenceAutre:"1", joursIndisponibles:"6" };
    if(scen==="marche_course"){
      programSettings={ beginnerPlan:{startMonday:localDateStr(mondayOf(today))} };
      const rowsC=couchSessionRows(2,[0,2,4],1);
      plannedSessions=rowsC.map((r,i)=>P(mondayOff+r.dayIndex, {type:"EF", pace_zone:"easy", title:r.title, description:r.description, target_duration_min:r.durationMin, rationale:r.rationale, generation_reason:"beginner_plan", status:i===0?"done":"planned"}));
      // séance du jour = la 3e (vendredi)
    } else {
      programSettings={ guidedTest:{status:"pending"} }; goals.principal.pbExistant="Non";
      const t=guidedTestSession(); plannedSessions=[P(0,{type:"EF", pace_zone:"easy", title:t.title, description:t.description, target_duration_min:t.durationMin, rationale:t.rationale, generation_reason:"guided_test"})];
    }
    show("aujourdhui");
  } else if(scen==="vide_aujourdhui"){
    RUNS=[]; runningRuns=[]; efRuns=[]; fracRuns=[]; plannedSessions=[]; show("aujourdhui");
  } else if(scen==="vide_progression"){
    RUNS=[]; runningRuns=[]; efRuns=[]; fracRuns=[]; plannedSessions=[]; show("progression");
  } else if(scen==="vide_programme"){
    RUNS=[]; runningRuns=[]; efRuns=[]; fracRuns=[]; plannedSessions=[]; programViewMode="week"; programWeekOffset=0; show("programme");
  } else if(scen.startsWith("onboarding")){
    RUNS=[]; runningRuns=[]; efRuns=[]; fracRuns=[]; plannedSessions=[]; goals={}; programSettings={}; onboardingCompletedAt=null; onb=null; onbRestarting=false;
    renderApp();
    if(scen==="onboarding_bienvenue") { /* écran d'accueil du parcours */ } else {
    onbGo(1);
    onbSet("objectif","Préparer une course"); onbSet("distanceCourse","10km"); onbSet("dateCible","2026-12-13");
    if(scen==="onboarding_niveau"||scen==="onboarding_recap"){ onbGo(1); onbSet("frequenceHistorique","2 à 3 fois par semaine"); onbSet("dureeMax",40); onbSetField("chronoM","47"); onbSet("chronoDistance","10km"); }
    if(scen==="onboarding_dispos"){ onbGo(1); onbSet("frequenceHistorique","2 à 3 fois par semaine"); onbSet("dureeMax",40); onbGo(1); onbToggleDay(6); onbToggleDay(2); }
    if(scen==="onboarding_recap"){ onbGo(1); onbToggleDay(6); onbGo(1); }
    }
  }
  setTimeout(()=>{ try{ const ds=(r)=>localDateStr(dateFromRun(r)); const rec=weekRecap(runningRuns.map(r=>({date:ds(r),distKm:r.dist,durationSec:r.durationSec})), plannedSessions, localDateStr(new Date())); document.title="DIAG "+JSON.stringify({n:runningRuns.length, sem:rec.thisWeek, derniers:runningRuns.slice(-5).map(r=>[ds(r),r.type,r.dist,Math.round(r.durationSec/60)])}); }catch(e){ document.title="DIAG ERR "+e; } const h=Math.ceil(document.getElementById("content").getBoundingClientRect().bottom + window.scrollY + 96); const tops=[...document.getElementById("content").children].map(c=>Math.round(c.getBoundingClientRect().top+window.scrollY)); parent.postMessage({h, tops}, "*"); }, 4500);
})();

/* Animations du bandeau « Bravo pour ta course ! » (C33, 19/10/2026).
   Fichier fourni par Claude Design (docs/design/mra-cheer.js, avec sa page de démonstration demo-celebrations.html),
   repris tel quel. 9 animations : reprise, objectif, cap, serie, semaine, plus-longue, endurance, vitesse, renfo ;
   la course officielle n'en a pas encore (l'app montre l'icône du type de séance). Dans le bandeau, l'élément est masqué
   aux lecteurs d'écran (aria-hidden) : le bouton du bandeau porte déjà tout le texte. */
/* Petites animations de célébration du bandeau « Bravo pour ta course ! » (MyRunningApp).
   Même principe que record-man.js : un seul fichier, un élément, aucune bibliothèque.
   Usage : <mra-cheer kind="reprise" value="12" aria-label="Belle reprise après 12 jours"></mra-cheer>
   kind : reprise | objectif | cap | serie | semaine | plus-longue | endurance | vitesse | renfo
   value : le chiffre affiché (jours, km, semaines, rang de la sortie) pour reprise, objectif, cap, serie, semaine, plus-longue.
   Joue une fois (~2 s) puis garde l'image finale. Avec « réduire les animations », l'image finale s'affiche directement.
   Taille : 56 × 56 px par défaut ; une autre taille se règle en CSS (width/height), le dessin suit.
   el.replay() rejoue l'animation. Police Barlow Condensed (web/fonts), avec repli. */
(()=>{
if(customElements.get('mra-cheer'))return;
const NS='http://www.w3.org/2000/svg',C='#C6F432',W='#F2F3F0',G='#8B8F96',T='#26292E',BG='#17191C',DUR=2000;
const F="'Barlow Condensed','Arial Narrow',sans-serif";
const cl=t=>Math.max(0,Math.min(1,t)),seg=(t,a,b)=>cl((t-a)/(b-a)),eo=t=>1-(1-t)**3,
 back=t=>{const c=1.7;return 1+(c+1)*(t-1)**3+c*(t-1)**2;},L=(a,b,t)=>a+(b-a)*t,
 pop=t=>t<=0?0:t>=1?1:back(t);
const mk=(svg)=>(tag,a,par)=>{const e=document.createElementNS(NS,tag);for(const k in a)e.setAttribute(k,a[k]);(par||svg).appendChild(e);return e;};
const txt=(s,x,y,size,fill,str,extra)=>{const e=s('text',Object.assign({x,y,'text-anchor':'middle','font-family':F,'font-weight':700,'font-size':size,fill},extra||{}));e.textContent=str;return e;};
const sc=(e,cx,cy,k)=>e.setAttribute('transform',`translate(${cx} ${cy}) scale(${k.toFixed(3)}) translate(${-cx} ${-cy})`);
const num=(v,d)=>{const n=parseInt(v,10);return isFinite(n)&&n>=0?n:d;};

const K={
 // 1 · Reprise : la pause en pointillés gris, puis la trace citron repart.
 reprise(s,v){
  const n=num(v,12);
  const dots=[];for(let i=0;i<5;i++)dots.push(s('circle',{cx:7+i*4.6,cy:36,r:1.7,fill:G}));
  const lab=txt(s,16,27,13,G,n+' J');
  const ring=s('circle',{cx:28,cy:36,r:3,fill:'none',stroke:C,'stroke-width':1.5});
  const line=s('path',{d:'M28 36 L46 36',fill:'none',stroke:C,'stroke-width':3.2,'stroke-linecap':'round'});
  const head=s('path',{d:'M43 30 L50 36 L43 42',fill:'none',stroke:C,'stroke-width':3.2,'stroke-linecap':'round','stroke-linejoin':'round'});
  return t=>{
   dots.forEach((d,i)=>d.setAttribute('opacity',seg(t,.02+i*.04,.12+i*.04)));
   lab.setAttribute('opacity',seg(t,.1,.3));
   const r=seg(t,.28,.62);ring.setAttribute('r',3+9*eo(r));ring.setAttribute('opacity',r>0&&r<1?1-r:0);
   const g=eo(seg(t,.3,.8)),x=L(28,47,g);line.setAttribute('d',`M28 36 L${x.toFixed(1)} 36`);line.setAttribute('opacity',g>0?1:0);
   head.setAttribute('transform',`translate(${(x-47).toFixed(1)} 0)`);head.setAttribute('opacity',g>0?1:0);
  };
 },
 // 2 · Objectif du mois atteint : l'anneau se ferme, coche finale.
 objectif(s,v){
  const n=num(v,90),R=20,P=2*Math.PI*R;
  s('circle',{cx:28,cy:29,r:R,fill:'none',stroke:T,'stroke-width':5});
  const arc=s('circle',{cx:28,cy:29,r:R,fill:'none',stroke:C,'stroke-width':5,'stroke-linecap':'round','stroke-dasharray':P,'stroke-dashoffset':P,transform:'rotate(-90 28 29)'});
  const g=s('g',{});const t1=txt(s,28,35,String(n).length>2?14:17,W,String(n));g.appendChild(t1);
  const b=s('g',{});s('circle',{cx:45,cy:11,r:7,fill:C,stroke:BG,'stroke-width':2},b);s('path',{d:'M41.8 11.2 L44.2 13.6 L48.4 8.8',fill:'none',stroke:BG,'stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round'},b);
  return t=>{
   arc.setAttribute('stroke-dashoffset',(P*(1-eo(seg(t,.05,.7)))).toFixed(2));
   const k=seg(t,.15,.45);t1.setAttribute('opacity',k);
   const p=seg(t,.68,.9);sc(g,28,29,1+.12*Math.sin(Math.PI*p));
   const q=pop(seg(t,.72,.95));sc(b,45,11,q);b.setAttribute('opacity',q>0?1:0);
  };
 },
 // 3 · Cap franchi : le compteur défile jusqu'au cap, il passe en citron et se souligne.
 cap(s,v){
  const n=num(v,100),from=Math.max(0,n-Math.max(9,Math.round(n*.25))),big=String(n).length>3?17:String(n).length>2?22:26;
  const t1=txt(s,28,30,big,W,String(from));
  const u=txt(s,28,48,10,G,'KM',{'letter-spacing':'1'});
  const bar=s('rect',{x:10,y:34,width:0,height:3,rx:1.5,fill:C});
  return t=>{
   const c=eo(seg(t,0,.62));t1.textContent=String(Math.round(L(from,n,c)));
   const done=t>=.62;t1.setAttribute('fill',done?C:W);
   const p=seg(t,.62,.85);sc(t1,28,24,1+.14*Math.sin(Math.PI*p));
   bar.setAttribute('width',(36*eo(seg(t,.66,.92))).toFixed(1));
   u.setAttribute('opacity',seg(t,0,.2));
  };
 },
 // 4 · Série de semaines : les pastilles s'allument une à une, le chiffre suit.
 serie(s,v){
  const n=Math.max(1,num(v,5)),k=Math.min(n,6),gap=3,w=(44-(k-1)*gap)/k;
  const pills=[];for(let i=0;i<k;i++){s('rect',{x:6+i*(w+gap),y:39,width:w,height:9,rx:Math.min(4.5,w/2),fill:T});pills.push(s('rect',{x:6+i*(w+gap),y:39,width:w,height:9,rx:Math.min(4.5,w/2),fill:C}));}
  const t1=txt(s,28,30,24,W,String(n));
  const lab=txt(s,28,9.5,8.5,G,'SEM.',{'letter-spacing':'1'});
  return t=>{
   pills.forEach((p,i)=>{const a=.08+i*(.6/k),q=pop(seg(t,a,a+.2));sc(p,6+i*(w+gap)+w/2,43.5,q);p.setAttribute('opacity',q>0?1:0);});
   let lit=0;for(let i=0;i<k;i++)if(t>=.08+i*(.6/k)+.05)lit++;
   t1.textContent=String(t>=.75||n>6?n:Math.max(1,lit));
   t1.setAttribute('opacity',seg(t,.05,.2));lab.setAttribute('opacity',seg(t,.05,.2));
   const p=seg(t,.75,.95);sc(t1,28,22,1+.12*Math.sin(Math.PI*p));
  };
 },
 // 5 · Ne sortie de la semaine : les sorties de la semaine apparaissent, la dernière en grand.
 semaine(s,v){
  const n=Math.max(2,num(v,3)),k=Math.min(n,5),sp=10,x0=28-(k-1)*sp/2;
  const d=[];for(let i=0;i<k;i++)d.push(s('circle',{cx:x0+i*sp,cy:42,r:i===k-1?4.6:3.6,fill:i===k-1?C:W}));
  const t1=txt(s,28,30,24,W,n+'E');
  return t=>{
   d.forEach((e,i)=>{const a=.05+i*(.5/k),q=pop(seg(t,a,a+.22));sc(e,x0+i*sp,42,q);e.setAttribute('opacity',q>0?1:0);});
   const q=pop(seg(t,.55,.85));sc(t1,28,22,q);t1.setAttribute('opacity',q>0?1:0);
   const p=seg(t,.8,1);d[k-1].setAttribute('r',(4.6+1.6*Math.sin(Math.PI*p)).toFixed(2));
  };
 },
 // 6 · Plus longue sortie du mois : la barre citron dépasse toutes les autres.
 'plus-longue'(s,v){
  const n=num(v,13),base=48,hs=[11,17,9,15],bs=hs.map((h,i)=>s('rect',{x:5+i*8.5,y:base,width:6,height:0,rx:1.5,fill:G}));
  s('line',{x1:4,x2:52,y1:base+.5,y2:base+.5,stroke:T,'stroke-width':1});
  const lb=s('rect',{x:40,y:base,width:9,height:0,rx:2,fill:C});
  const t1=txt(s,44.5,14,12,C,String(n));
  return t=>{
   bs.forEach((b,i)=>{const h=hs[i]*eo(seg(t,i*.05,.25+i*.05));b.setAttribute('y',(base-h).toFixed(1));b.setAttribute('height',h.toFixed(1));});
   const H=29*eo(seg(t,.3,.78));lb.setAttribute('y',(base-H).toFixed(1));lb.setAttribute('height',H.toFixed(1));
   const q=pop(seg(t,.72,.95));sc(t1,44.5,10,q);t1.setAttribute('opacity',q>0?1:0);
  };
 },
 // 7 · Endurance : une longue trace calme qui s'allonge, au rythme tranquille.
 endurance(s){
  s('line',{x1:6,x2:50,y1:44,y2:44,stroke:T,'stroke-width':1.5,'stroke-linecap':'round'});
  const p=s('path',{d:'M6 34 C 13 26, 18 26, 24 32 S 35 38, 41 30 S 48 24, 50 26',fill:'none',stroke:C,'stroke-width':3.2,'stroke-linecap':'round'});
  const dot=s('circle',{r:3.6,fill:W});
  let len=0;
  return t=>{
   if(!len){try{len=p.getTotalLength();}catch(e){len=60;}p.setAttribute('stroke-dasharray',len);}
   const g=L(.02,1,eo(seg(t,.05,.9)));p.setAttribute('stroke-dashoffset',(len*(1-g)).toFixed(2));
   let pt={x:50,y:26};try{pt=p.getPointAtLength(len*g);}catch(e){}
   dot.setAttribute('cx',pt.x.toFixed(1));dot.setAttribute('cy',pt.y.toFixed(1));dot.setAttribute('opacity',seg(t,.03,.12));
  };
 },
 // 8 · Vitesse : traits de vitesse et double chevron qui file.
 vitesse(s){
  const ls=[[18,13],[28,20],[38,11]].map(([y,w])=>({y,w,e:s('line',{x1:0,x2:0,y1:y,y2:y,stroke:G,'stroke-width':2.4,'stroke-linecap':'round'})}));
  const g=s('g',{});
  s('path',{d:'M26 17 L37 28 L26 39',fill:'none',stroke:C,'stroke-width':3.6,'stroke-linecap':'round','stroke-linejoin':'round'},g);
  s('path',{d:'M36 17 L47 28 L36 39',fill:'none',stroke:C,'stroke-width':3.6,'stroke-linecap':'round','stroke-linejoin':'round'},g);
  return t=>{
   const m=seg(t,.08,.66),x=L(-26,0,back(m)),cx=26+x;
   g.setAttribute('transform',`translate(${x.toFixed(1)} 0)`);g.setAttribute('opacity',seg(t,.06,.16));
   ls.forEach((l,i)=>{const a=eo(seg(t,.2+i*.05,.75+i*.05)),x2=Math.max(3,cx-4-(i%2?2:0)),x1=Math.max(2,x2-l.w-16*(1-a));
    l.e.setAttribute('x1',x1.toFixed(1));l.e.setAttribute('x2',x2.toFixed(1));l.e.setAttribute('opacity',x2-x1>1?seg(t,.1,.25):0);});
  };
 },
 // 9 · Renfo, mobilité, yoga : une silhouette pousse la barre au-dessus de sa tête.
 renfo(s){
  s('line',{x1:8,x2:48,y1:51,y2:51,stroke:T,'stroke-width':1.5,'stroke-linecap':'round'});
  const st={'stroke-linecap':'round','stroke-linejoin':'round',fill:'none'};
  s('path',Object.assign({d:'M28 36 L22 50 M28 36 L34 50',stroke:'#9DA2A9','stroke-width':3.2},st));
  s('path',Object.assign({d:'M28 36 L28 23',stroke:W,'stroke-width':3.6},st));
  s('circle',{cx:28,cy:17,r:4.2,fill:W});
  const arms=s('path',Object.assign({stroke:W,'stroke-width':3},st));
  const bar=s('g',{});
  s('line',{x1:9,x2:47,y1:0,y2:0,stroke:C,'stroke-width':3,'stroke-linecap':'round'},bar);
  s('rect',{x:8,y:-5.5,width:4,height:11,rx:1.5,fill:C},bar);s('rect',{x:44,y:-5.5,width:4,height:11,rx:1.5,fill:C},bar);
  const spk=[s('path',Object.assign({d:'M12 -5 L10 -8.5 M28 -6 L28 -9.5 M44 -5 L46 -8.5',stroke:C,'stroke-width':2},st))];
  return t=>{
   const u=eo(seg(t,.12,.6)),dip=Math.sin(Math.PI*seg(t,.6,.8))*1.5,y=L(25,9,u)+dip,hx=L(16,14,u);
   const ex=L(13,17,u),ey=L(30,14,u);
   arms.setAttribute('d',`M28 24 L${ex.toFixed(1)} ${ey.toFixed(1)} L${hx.toFixed(1)} ${y.toFixed(1)} M28 24 L${(56-ex).toFixed(1)} ${ey.toFixed(1)} L${(56-hx).toFixed(1)} ${y.toFixed(1)}`);
   bar.setAttribute('transform',`translate(0 ${y.toFixed(1)})`);
   const q=seg(t,.78,.98);spk[0].setAttribute('opacity',q);spk[0].setAttribute('transform',`translate(0 ${(y+(1-q)*3).toFixed(1)})`);
  };
 }
};

class MraCheer extends HTMLElement{
 static get observedAttributes(){return['kind','value'];}
 connectedCallback(){this.build();}
 attributeChangedCallback(){if(this._b)this.build();}
 disconnectedCallback(){cancelAnimationFrame(this.raf);}
 build(){
  this._b=1;cancelAnimationFrame(this.raf);this.textContent='';
  const st=this.style;if(!st.display)st.display='inline-block';if(!st.width)st.width='56px';if(!st.height)st.height='56px';st.lineHeight='0';
  if(!this.hasAttribute('role'))this.setAttribute('role','img');
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 56 56');svg.setAttribute('width','100%');svg.setAttribute('height','100%');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.style.overflow='visible';
  this.appendChild(svg);
  const f=K[this.getAttribute('kind')]||K.endurance;
  this.draw=f(mk(svg),this.getAttribute('value'));
  this.play();
 }
 play(){
  cancelAnimationFrame(this.raf);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.draw(1);return;}
  this.draw(0);const t0=performance.now();
  const tick=now=>{if(!this.isConnected)return;const t=cl((now-t0)/DUR);this.draw(t);if(t<1)this.raf=requestAnimationFrame(tick);};
  this.raf=requestAnimationFrame(tick);
 }
 replay(){this.play();}
}
customElements.define('mra-cheer',MraCheer);
})();

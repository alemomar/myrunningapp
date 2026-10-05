(()=>{
if(customElements.get('record-man'))return;
const NS='http://www.w3.org/2000/svg',C='#C6F432',W='#F2F3F0',B='#9DA2A9',G='#8B8F96';
const T={inEnd:1.5,raise:1.8,wipeEnd:3.3,step:3.6,writeEnd:5.1,cel:5.3,celEnd:6.9,outEnd:8.5,loop:9.8};
const GR=262,TH=18,SH=17.5,TO=24,UA=14,FA=13,HR=6.5,NY=196;
const R=Math.PI/180,cl=t=>Math.max(0,Math.min(1,t)),ez=t=>t<.5?2*t*t:1-(-2*t+2)**2/2,L=(a,b,t)=>a+(b-a)*t;
let sd=7;const rnd=()=>(sd=(sd*16807)%2147483647)/2147483647;
const CONF=Array.from({length:46},()=>{const a=(-90+(rnd()-.5)*140)*R,sp=170+rnd()*200;return{vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r0:rnd()*360,w:(rnd()-.5)*720,ph:rnd()*6,c:[C,W,'oklch(0.85 0.13 200)','oklch(0.7 0.19 25)',C][Math.floor(rnd()*5)],d:rnd()*.12,h:7+rnd()*5};});
const DUST=Array.from({length:30},(_,i)=>({t:T.raise+.05+(T.wipeEnd-T.raise-.1)*i/30,vx:(rnd()-.5)*36,s:1+rnd()*1.8}));
const SPK=Array.from({length:24},(_,i)=>({t:T.step+.1+(T.writeEnd-T.step-.2)*i/24,vx:(rnd()-.5)*40,vy:-25-rnd()*35}));
function walk(ph){const s=Math.sin(ph),c=Math.cos(ph);return{legs:[[26*s,6+44*Math.max(0,c)],[-26*s,6+44*Math.max(0,-c)]],arms:[[-24*s,-24*s+24],[24*s,24*s+24]],lift:2.5*Math.cos(2*ph),lean:5};}
const stand={legs:[[4,4],[-4,4]],arms:[[6,14],[-6,8]],lift:0,lean:0};
function pose(t){
 let p,x,dir=1,tool=null,vis=true;
 if(t<T.inEnd){x=L(-30,95,t/T.inEnd);p=walk((x+30)*.12);}
 else if(t<T.raise){x=95;const e=ez((t-T.inEnd)/(T.raise-T.inEnd));p={...stand,arms:[[L(6,148,e),L(14,148,e)],stand.arms[1]]};tool='sponge';}
 else if(t<T.wipeEnd){x=L(95,225,(t-T.raise)/(T.wipeEnd-T.raise));const w=walk((x-95)*.12);p={...w,lean:2,arms:[[148,148+32*Math.sin(t*30)],w.arms[1]]};tool='sponge';}
 else if(t<T.step){const u=(t-T.wipeEnd)/(T.step-T.wipeEnd);x=L(225,262,u);const w=walk((x-225)*.12),e=ez(u);p={...w,arms:[[L(148,w.arms[0][0],e),L(148,w.arms[0][1],e)],w.arms[1]]};tool=u<.4?'sponge':'brush';}
 else if(t<T.writeEnd){dir=-1;x=L(262,98,(t-T.step)/(T.writeEnd-T.step));const w=walk((262-x)*.12);p={...w,lean:2,arms:[[142,142+18*Math.sin(t*24)],w.arms[1]]};tool='brush';}
 else if(t<T.cel){x=98;const e=ez((t-T.writeEnd)/(T.cel-T.writeEnd));p={legs:[[L(4,12,e),L(4,44,e)],[L(-4,-8,e),L(4,44,e)]],arms:[[L(30,25,e),L(30,50,e)],[L(-6,-25,e),L(8,10,e)]],lift:0,lean:0};}
 else if(t<T.celEnd){x=98;const k=(((t-T.cel)/(T.celEnd-T.cel))*2)%1,air=Math.sin(Math.PI*k),wv=10*Math.sin(t*16);p={legs:[[L(12,20,air),L(44,60,air)],[L(-8,-2,air),L(44,70,air)]],arms:[[158+wv,168+wv],[-158-wv,-168-wv]],lift:24*air,lean:0};}
 else if(t<T.outEnd){x=L(98,400,(t-T.celEnd)/(T.outEnd-T.celEnd));p=walk((x-98)*.12);}
 else{vis=false;x=500;p=stand;}
 return{...p,x,dir,tool,vis};
}
function geo(p){
 const d=p.dir,v=(a,l)=>[Math.sin(a*R)*l*d,Math.cos(a*R)*l];
 const feet=p.legs.map(([th,kn])=>Math.cos(th*R)*TH+Math.cos((th-kn)*R)*SH);
 const hy=GR-Math.max(...feet)-p.lift,hx=p.x;
 const legs=p.legs.map(([th,kn])=>{const k=v(th,TH),f=v(th-kn,SH);return[[hx,hy],[hx+k[0],hy+k[1]],[hx+k[0]+f[0],hy+k[1]+f[1]]];});
 const sh=[hx+Math.sin(p.lean*R)*TO*d,hy-Math.cos(p.lean*R)*TO];
 const arms=p.arms.map(([ua,fa])=>{const e=v(ua,UA),h=v(fa,FA);return[sh,[sh[0]+e[0],sh[1]+e[1]],[sh[0]+e[0]+h[0],sh[1]+e[1]+h[1]],fa*d];});
 return{hx,hy,sh,legs,arms,head:[sh[0]+Math.sin(p.lean*R)*4*d,sh[1]-3-HR]};
}
let uid=0;
class RecordMan extends HTMLElement{
 connectedCallback(){
  if(this._i){this.start();return;}this._i=1;const id=++uid;
  this.style.cssText+=';display:block;width:100%;height:320px;border-radius:24px;background:#0C0D0F;overflow:hidden;';
  const oldT=this.getAttribute('old')||'28:15',newT=this.getAttribute('new')||'27:41',dist=this.getAttribute('distance')||'5 KM',gain=this.getAttribute('gain')||'−34 s';
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 360 320');svg.setAttribute('width','100%');svg.setAttribute('height','100%');this.appendChild(svg);
  const s=(tag,a,par)=>{const e=document.createElementNS(NS,tag);for(const k in a)e.setAttribute(k,a[k]);(par||svg).appendChild(e);return e;};
  const defs=s('defs',{});
  this.cO=s('rect',{x:0,y:0,width:400,height:320},s('clipPath',{id:'rmO'+id},defs));
  this.cN=s('rect',{x:400,y:0,width:400,height:320},s('clipPath',{id:'rmN'+id},defs));
  const F="'Barlow Condensed',sans-serif";
  this.lab=s('text',{x:180,y:86,'text-anchor':'middle',fill:G,'font-family':'Barlow,sans-serif','font-size':11,'letter-spacing':'1.6'});this.lab.textContent='TON RECORD · '+dist;
  this.cap=s('text',{x:180,y:128,'text-anchor':'middle',fill:G,'font-family':'Barlow,sans-serif','font-size':13,opacity:0});this.cap.textContent='avant '+oldT+' · '+gain;
  const o=s('text',{x:180,y:NY,'text-anchor':'middle',fill:G,'font-family':F,'font-weight':700,'font-size':64,'clip-path':`url(#rmO${id})`});o.textContent=oldT;
  this.nG=s('g',{});const n=s('text',{x:180,y:NY,'text-anchor':'middle',fill:C,'font-family':F,'font-weight':700,'font-size':64,'clip-path':`url(#rmN${id})`},this.nG);n.textContent=newT;
  s('line',{x1:24,x2:336,y1:GR+1,y2:GR+1,stroke:'#26292E','stroke-width':1});
  this.conf=CONF.map(c=>s('rect',{x:-2.5,y:-c.h/2,width:5,height:c.h,rx:1,fill:c.c}));
  this.dust=DUST.map(d=>s('circle',{r:d.s,fill:G}));
  this.spk=SPK.map(()=>s('circle',{r:2,fill:C}));
  const ln=(c,w)=>s('path',{fill:'none',stroke:c,'stroke-width':w,'stroke-linecap':'round','stroke-linejoin':'round'},this.man);
  this.man=s('g',{});
  this.legB=ln(B,4);this.armB=ln(B,3.5);this.torso=ln(W,4.5);this.legF=ln(W,4);this.armF=ln(W,3.5);
  this.head=s('circle',{r:HR,fill:W},this.man);
  this.sponge=s('rect',{x:-5,y:-3.5,width:10,height:7,rx:2,fill:'#6B7078'},this.man);
  this.glow=s('circle',{r:7,fill:C,opacity:.25},this.man);this.brush=s('circle',{r:3,fill:C},this.man);
  const dO=g=>geo(pose(g.t)).arms[0][2];
  DUST.forEach(d=>d.o=dO(d));SPK.forEach(d=>d.o=dO(d));
  this.start();
 }
 start(){
  cancelAnimationFrame(this.raf);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.draw(T.loop-.1);return;}
  const t0=performance.now();
  const tick=now=>{if(!this.isConnected)return;let t=(now-t0)/1000;t=this.hasAttribute('once')?Math.min(t,T.loop-.1):t%T.loop;this.draw(t);this.raf=requestAnimationFrame(tick);};
  this.raf=requestAnimationFrame(tick);
 }
 disconnectedCallback(){cancelAnimationFrame(this.raf);}
 draw(t){
  const p=pose(t),g=geo(p),P=a=>'M'+a.map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join('L');
  this.man.style.display=p.vis?'':'none';
  if(p.vis){
   this.legF.setAttribute('d',P(g.legs[0]));this.legB.setAttribute('d',P(g.legs[1]));
   this.armF.setAttribute('d',P(g.arms[0].slice(0,3)));this.armB.setAttribute('d',P(g.arms[1].slice(0,3)));
   this.torso.setAttribute('d',P([[g.hx,g.hy],g.sh]));
   this.head.setAttribute('cx',g.head[0]);this.head.setAttribute('cy',g.head[1]);
   const h=g.arms[0][2];
   this.sponge.style.display=p.tool==='sponge'?'':'none';this.sponge.setAttribute('transform',`translate(${h[0]},${h[1]}) rotate(${-g.arms[0][3]})`);
   const b=p.tool==='brush'?'':'none';this.brush.style.display=b;this.glow.style.display=b;
   for(const e of[this.brush,this.glow]){e.setAttribute('cx',h[0]);e.setAttribute('cy',h[1]);}
  }
  const ex=t<T.raise?0:t<T.wipeEnd?g.hx+13:400, wx=t<T.step?400:t<T.writeEnd?g.hx-13:0;
  this.cO.setAttribute('x',ex);this.cN.setAttribute('x',wx);
  const done=t>=T.writeEnd;this.lab.textContent=this.lab.textContent.replace(done?'TON RECORD':'NOUVEAU RECORD',done?'NOUVEAU RECORD':'TON RECORD');this.lab.setAttribute('fill',done?C:G);
  this.cap.setAttribute('opacity',cl((t-T.cel-.3)/.4));
  const pu=cl((t-T.cel)/.4),sc=1+.14*Math.sin(Math.PI*pu);this.nG.setAttribute('transform',`translate(180 176) scale(${sc}) translate(-180 -176)`);
  DUST.forEach((d,i)=>{const e=this.dust[i],u=t-d.t;if(u<0||u>.9){e.style.display='none';return;}e.style.display='';e.setAttribute('cx',d.o[0]+d.vx*u);e.setAttribute('cy',d.o[1]+130*u*u);e.setAttribute('opacity',1-u/.9);});
  SPK.forEach((d,i)=>{const e=this.spk[i],u=t-d.t;if(u<0||u>.6){e.style.display='none';return;}e.style.display='';e.setAttribute('cx',d.o[0]+d.vx*u);e.setAttribute('cy',d.o[1]+d.vy*u+40*u*u);e.setAttribute('opacity',1-u/.6);});
  CONF.forEach((c,i)=>{const e=this.conf[i],u=t-T.cel-c.d;if(u<0||u>3.8){e.style.display='none';return;}e.style.display='';const k=2.2,f=(1-Math.exp(-k*u))/k,X=180+c.vx*f+7*Math.sin(u*5+c.ph),Y=170+55*u+(c.vy-55)*f;
   e.setAttribute('transform',`translate(${X.toFixed(1)},${Y.toFixed(1)}) rotate(${(c.r0+c.w*u).toFixed(0)}) scale(${Math.cos(u*8+c.ph).toFixed(2)},1)`);e.setAttribute('opacity',cl((3.8-u)/1));});
 }
}
customElements.define('record-man',RecordMan);
})();

// Vérifie qu'aucun nom utilisé n'a été supprimé par erreur (régression vue en S7 : ZONE_SHORT_LABEL perdue pendant un nettoyage).
// Usage : node docs/banc-captures/verifier-noms.js   (aucun outil à installer)
// Cherche les noms utilisés mais déclarés nulle part (index.html + logic.js). Approximation volontairement large :
// un nom est « déclaré » s'il apparaît dans un contexte de déclaration n'importe où dans le code.
const fs = require("fs");
const root = require("path").join(__dirname, "..", "..", "web") + "/";
const html = fs.readFileSync(root + "index.html", "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const logic = fs.readFileSync(root + "logic.js", "utf8");
const code = logic + "\n" + scripts.join("\n");

// --- lexer
const toks = [];
let i = 0; const n = code.length;
const isIdStart = c => /[A-Za-z_$À-￿]/.test(c), isId = c => /[A-Za-z0-9_$À-￿]/.test(c);
function lexTemplate(){ // i est juste après le ` ouvrant
  while(i < n){
    const c = code[i];
    if(c === "\\"){ i += 2; continue; }
    if(c === "`"){ i++; return; }
    if(c === "$" && code[i+1] === "{"){ i += 2; toks.push("("); lexUntilCloseBrace(); toks.push(")"); continue; }
    i++;
  }
}
function lexUntilCloseBrace(){ let depth = 1; lex(()=>{ return depth; }, (d)=>{ depth = d; }, true); }
let lastSig = "";
function prevAllowsRegex(){
  const p = toks[toks.length-1];
  if(p === undefined) return true;
  if(/^[A-Za-z_$]/.test(p)) return ["return","typeof","case","in","of","delete","void","throw","new","else","do"].includes(p);
  return ["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^", "=>"].includes(p);
}
function lex(getDepth, setDepth, inTemplate){
  let depth = inTemplate ? 1 : 0;
  while(i < n){
    const c = code[i];
    if(/\s/.test(c)){ i++; continue; }
    if(c === "/" && code[i+1] === "/"){ while(i < n && code[i] !== "\n") i++; continue; }
    if(c === "/" && code[i+1] === "*"){ i = code.indexOf("*/", i+2) + 2; continue; }
    if(c === "'" || c === '"'){ const q = c; i++; while(i < n && code[i] !== q){ if(code[i] === "\\") i++; i++; } i++; toks.push('"s"'); continue; }
    if(c === "`"){ i++; toks.push('"s"'); lexTemplate(); continue; }
    if(c === "/" && prevAllowsRegex()){ // regex littérale
      i++; let inClass = false;
      while(i < n){ const d = code[i]; if(d === "\\"){ i += 2; continue; } if(d === "[") inClass = true; else if(d === "]") inClass = false; else if(d === "/" && !inClass) break; i++; }
      i++; while(i < n && isId(code[i])) i++; toks.push('"r"'); continue;
    }
    if(isIdStart(c)){ let j = i; while(j < n && isId(code[j])) j++; toks.push(code.slice(i, j)); i = j; continue; }
    if(/[0-9]/.test(c)){ let j = i; while(j < n && /[0-9A-Za-z_.]/.test(code[j])) j++; toks.push("0"); i = j; continue; }
    if(c === "{"){ depth++; toks.push("{"); i++; continue; }
    if(c === "}"){ if(inTemplate && depth === 1){ i++; return; } depth--; toks.push("}"); i++; continue; }
    if(c === "=" && code[i+1] === ">"){ toks.push("=>"); i += 2; continue; }
    if(c === "." && code[i+1] === "." && code[i+2] === "."){ toks.push("..."); i += 3; continue; }
    if(c === "?" && code[i+1] === "."){ toks.push("."); i += 2; continue; }
    toks.push(c); i++;
  }
}
lex();

// --- déclarations
const declared = new Set();
const KW = new Set("break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set null true false undefined NaN Infinity arguments".split(" "));
const isIdent = t => t && /^[A-Za-z_$À-￿]/.test(t) && !KW.has(t);
function collectGroup(start){ // start : index du ( [ { ouvrant ; ajoute tous les identifiants jusqu'à la fermeture
  const open = toks[start], close = { "(":")", "[":"]", "{":"}" }[open]; let d = 0; let k = start;
  for(; k < toks.length; k++){ const t = toks[k]; if(t === open) d++; else if(t === close){ d--; if(d === 0) break; } else if(isIdent(t)) declared.add(t); }
  return k;
}
for(let k = 0; k < toks.length; k++){
  const t = toks[k], nx = toks[k+1];
  if(t === "function" || t === "class"){ if(isIdent(nx)) declared.add(nx); let m = k+1; if(isIdent(nx) || nx === "*") m = k+2; if(toks[m] === "(") collectGroup(m); }
  if(t === "const" || t === "let" || t === "var"){
    // déclarations multiples : a = 1, b = [..], { c, d } = x ;
    let m = k+1, depth = 0;
    while(m < toks.length){
      const u = toks[m];
      if(depth === 0 && (isIdent(u) && (toks[m-1] === t || toks[m-1] === ","))) declared.add(u);
      if(depth === 0 && (u === "{" || u === "[") && (toks[m-1] === t || toks[m-1] === ",")){ const e = collectGroup(m); m = e+1; continue; }
      if(u === "(" || u === "[" || u === "{") depth++;
      else if(u === ")" || u === "]" || u === "}"){ depth--; if(depth < 0) break; }
      else if(u === ";" && depth === 0) break;
      m++;
    }
  }
  if(t === "catch" && nx === "(") collectGroup(k+1);
  if(t === "=>"){ const p = toks[k-1]; if(isIdent(p)) declared.add(p); else if(p === ")"){ let d = 0, q = k-1; for(; q >= 0; q--){ if(toks[q] === ")") d++; else if(toks[q] === "("){ d--; if(d === 0) break; } } if(q >= 0) collectGroup(q); } }
  // méthodes d'objet / de classe : nom(params){
  if(isIdent(t) && nx === "(" && (toks[k-1] === "{" || toks[k-1] === ",")){ const e = collectGroup(k+1); if(toks[e+1] !== "{") { /* appel de fonction : on retire rien, large */ } }
  // window.X = / globalThis.X =
  if((t === "window" || t === "globalThis") && toks[k+1] === "." && isIdent(toks[k+2]) && toks[k+3] === "=" && toks[k+4] !== "=") declared.add(toks[k+2]);
  // affectation implicite  X = ... en début d'instruction
  if(isIdent(t) && nx === "=" && toks[k+2] !== "=" && [";", "{", "}", undefined].includes(toks[k-1])) declared.add(t);
}
// globales du navigateur et de JavaScript fréquentes
"window document localStorage sessionStorage navigator location history console setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame fetch URL Blob FileReader Image Event CustomEvent IntersectionObserver ResizeObserver MutationObserver getComputedStyle matchMedia performance alert confirm prompt Intl Date Math JSON Promise Map Set WeakMap WeakSet Array Object String Number Boolean Symbol RegExp Error TypeError RangeError parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent atob btoa structuredClone supabase DOMParser HTMLElement Element Node NodeList CSS screen scrollTo scrollBy innerWidth innerHeight devicePixelRatio crypto TextEncoder TextDecoder AbortController Notification Audio FormData Headers Request Response self globalThis queueMicrotask Uint8Array Float32Array Float64Array Int32Array ArrayBuffer DataView Reflect Proxy BigInt escape unescape navigator process module require exports define KeyboardEvent MouseEvent PointerEvent TouchEvent InputEvent ClipboardItem DragEvent Touch DOMRect SVGElement HTMLInputElement HTMLSelectElement File Option Range Selection ServiceWorker caches indexedDB onerror onunhandledrejection event name top parent frames length status".split(" ").forEach(x => declared.add(x));

// --- usages
const uses = new Map();
for(let k = 0; k < toks.length; k++){
  const t = toks[k];
  if(!isIdent(t) || declared.has(t)) continue;
  const p = toks[k-1], nx = toks[k+1];
  if(p === "." || p === "get" || p === "set") continue;       // propriété
  if(nx === ":" && p !== "?") continue;                         // clé d'objet / étiquette
  if(p === "function" || p === "class") continue;
  uses.set(t, (uses.get(t) || 0) + 1);
}
const res = [...uses.entries()].sort((a, b) => b[1] - a[1]);
console.log(res.length + " noms jamais déclarés :");
console.log(res.map(([k, v]) => k + "×" + v).join("  "));

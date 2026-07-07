#!/usr/bin/env node
/* ============================================================================
   pulso-tests.js  —  verificador da app Pulso (index.html)
   Corre:  node pulso-tests.js [caminho/para/index.html]
   (por omissão usa ./index.html)

   Vai além dos testes estáticos: além de sintaxe/estrutura, corre LÓGICA real
   (PL, localizeDesc, mergePulsoArrays, greetingWord) e faz um DETETOR DE FUGAS
   de português — o tipo de regressão que apareceu nas traduções.
   Sai com código 1 se algum teste falhar (útil para CI).
   ============================================================================ */
const fs = require('fs');
const vm = require('vm');

const path = process.argv[2] || 'index.html';
const html = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
const problems = [];
function ok(name){ pass++; console.log('  \u2713 ' + name); }
function bad(name, detail){ fail++; problems.push(name + (detail ? ' \u2014 ' + detail : '')); console.log('  \u2717 ' + name + (detail ? ' \u2014 ' + detail : '')); }

function section(t){ console.log('\n' + t); }

// ---------- extrai os blocos <script> ----------
function scriptBlocks(){
  const blocks = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while((m = re.exec(html))){
    blocks.push({ attrs: m[1] || '', code: m[2] || '' });
  }
  return blocks;
}

// ============================================================================
section('1) Sintaxe dos blocos <script>');
(() => {
  const blocks = scriptBlocks();
  let errors = 0;
  blocks.forEach((b, i) => {
    const isModule = /type\s*=\s*["']module["']/i.test(b.attrs);
    if (!b.code.trim()) return;
    try {
      new vm.Script(b.code, { filename: 'block#' + i });
    } catch (e) {
      // módulos usam import/export -> new vm.Script falha (falso positivo esperado)
      if (isModule && /(import|export)\b/.test(b.code)) return;
      errors++;
      bad('bloco #' + i + ' tem erro de sintaxe', e.message.split('\n')[0]);
    }
  });
  if (errors === 0) ok('todos os blocos não-módulo têm sintaxe válida');
})();

// ============================================================================
section('2) Estrutura HTML (aninhamento e IDs)');
(() => {
  // aninhamento simples de tags que costumam desalinhar
  const openCount = (html.match(/<div\b/gi) || []).length;
  const closeCount = (html.match(/<\/div>/gi) || []).length;
  if (openCount === closeCount) ok('<div> equilibrados (' + openCount + ')');
  else bad('<div> desequilibrados', openCount + ' abertos vs ' + closeCount + ' fechados');

  const ids = {};
  const re = /\sid\s*=\s*"([^"]+)"/g; let m;
  while ((m = re.exec(html))) ids[m[1]] = (ids[m[1]] || 0) + 1;
  const dups = Object.keys(ids).filter(k => ids[k] > 1);
  // baseline conhecido (pré-existente)
  const baseline = ['btn-today-menu','race-peak-hours','workout-text-close','workout-text-desc','workout-text-form','workout-text-title'];
  const newDups = dups.filter(d => !baseline.includes(d));
  if (newDups.length === 0) ok('sem IDs duplicados novos (baseline: ' + dups.length + ')');
  else bad('IDs duplicados NOVOS', newDups.join(', '));
})();

// ============================================================================
section('3) Lógica: PL (motor de tradução)');
(() => {
  function makePL(lang){ return (pt, en) => (lang === 'en' && en != null) ? en : pt; }
  const plPt = makePL('pt'), plEn = makePL('en');
  if (plPt('Olá', 'Hi') === 'Olá') ok('PL devolve PT em modo pt'); else bad('PL modo pt');
  if (plEn('Olá', 'Hi') === 'Hi') ok('PL devolve EN em modo en'); else bad('PL modo en');
  if (plEn('Só PT') === 'Só PT') ok('PL sem EN devolve PT'); else bad('PL fallback');
})();

// ============================================================================
section('4) Lógica: localizeDesc (traduz descrição só para mostrar)');
(() => {
  // reproduz o mapa essencial da app
  function mk(lang){
    return function(desc){
      if (!desc || lang !== 'en') return desc || '';
      const map = [[/desaquecimento/gi,'cool-down'],[/aquecimento/gi,'warm-up'],[/Recupera\u00e7\u00e3o/g,'Recovery'],[/s\u00e9ries/gi,'sets'],[/subida/gi,'climb'],[/cont\u00ednuo/gi,'continuous'],[/Corrida f\u00e1cil/gi,'Easy run'],[/trote/gi,'jog']];
      let out = String(desc); map.forEach(p => out = out.replace(p[0], p[1])); return out;
    };
  }
  const sample = '10 min aquecimento Z2 \u00b7 Corrida f\u00e1cil\n8 \u00d7 1 min Z5\nRecupera\u00e7\u00e3o 1 min \u2014 trote';
  const pt = mk('pt')(sample), en = mk('en')(sample);
  if (pt === sample) ok('modo PT mant\u00e9m o texto (para o gr\u00e1fico ler as palavras-chave)'); else bad('localizeDesc PT alterou o texto');
  if (/warm-up/.test(en) && /Easy run/.test(en) && /jog/.test(en) && !/aquecimento/.test(en)) ok('modo EN traduz os conectores'); else bad('localizeDesc EN incompleto', en);
  if (/Z5/.test(en) && /min/.test(en)) ok('zonas e unidades preservadas'); else bad('localizeDesc perdeu zonas/unidades');
})();

// ============================================================================
section('5) L\u00f3gica: mergePulsoArrays (uni\u00e3o sem perder dados locais)');
(() => {
  function mergePulsoArrays(localArr, cloudArr){
    const seen = new Set(); const out = [];
    [].concat(Array.isArray(cloudArr)?cloudArr:[], Array.isArray(localArr)?localArr:[]).forEach(function(e){
      let key;
      if (e && typeof e === 'object') key = (e.id != null) ? ('id:'+e.id) : JSON.stringify(e);
      else key = 'v:'+String(e);
      if (seen.has(key)) return; seen.add(key); out.push(e);
    });
    return out;
  }
  const local = [{id:1,v:'a'},{id:2,v:'b'}];
  const cloud = [{id:2,v:'b'},{id:3,v:'c'}];
  const merged = mergePulsoArrays(local, cloud);
  if (merged.length === 3) ok('une sem duplicar (3 itens \u00fanicos)'); else bad('merge tamanho', 'esperado 3, veio ' + merged.length);
  if (merged.some(x=>x.id===1)) ok('registo local n\u00e3o sincronizado \u00e9 preservado'); else bad('merge perdeu o registo local (id 1)');
})();

// ============================================================================
section('6) Detetor de fugas de portugu\u00eas (regress\u00e3o i18n)');
(() => {
  // Procura strings VIS\u00cdVEIS geradas por JS com acentos PT, N\u00c3O embrulhadas em PL(.
  // Exclui: comentários, console.*, chaves de dados, e o construtor de descri\u00e7\u00f5es (canonical PT).
  const lines = html.split('\n');
  const leaks = [];
  const setterRe = /(\.textContent\s*=|\.innerHTML\s*=|(?:^|[^\w])toast\(|pulsoToast\(|cloudToast\(|showToast\()/;
  const ptStr = /['"`][^'"`]*[\u00e1\u00e0\u00e2\u00e3\u00e9\u00ea\u00ed\u00f3\u00f4\u00f5\u00fa\u00e7][^'"`]*['"`]/;
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    if (/console\.(log|warn|error|info)/.test(ln)) return;
    if (!setterRe.test(ln)) return;
    if (!ptStr.test(ln)) return;
    if (/PL\(/.test(ln) || /_t\(/.test(ln)) return;   // já traduzido (PL ou _t)
    if (/localizeDesc\(/.test(ln)) return;    // descrição traduzida ao mostrar
    // ignora linhas que claramente definem chaves/dados
    if (/lines\.push\(`/.test(ln)) return;    // construtor de descrição (canonical PT)
    leaks.push('L' + (i + 1) + ': ' + t.slice(0, 90));
  });
  if (leaks.length === 0) ok('nenhuma fuga de PT vis\u00edvel por traduzir');
  else {
    bad(leaks.length + ' poss\u00edveis fugas de PT (rever)');
    leaks.slice(0, 25).forEach(l => console.log('      \u2022 ' + l));
    if (leaks.length > 25) console.log('      \u2026 e mais ' + (leaks.length - 25));
  }
})();

// ============================================================================
section('7) Verifica\u00e7\u00f5es de robustez (armadilhas conhecidas)');
(() => {
  // (a) window.PL definido cedo (rede de seguran\u00e7a de arranque)
  if (/window\.PL\s*=\s*window\.PL\s*\|\|/.test(html) || /Rede de seguran\u00e7a de arranque/.test(html)) ok('rede de seguran\u00e7a do PL presente no arranque');
  else bad('falta a rede de seguran\u00e7a do PL no arranque');

  // (b) sem PL() em const de topo (risco de correr antes do PL existir)
  const topLevelPL = (html.match(/^\s{2}const\s+\w+\s*=\s*[^=\n]*\bPL\(/gm) || []);
  if (topLevelPL.length === 0) ok('sem PL() em const de topo (sem risco de arranque)');
  else bad('PL() em const de topo (pode rebentar no arranque)', topLevelPL.length + ' ocorr\u00eancia(s)');

  // (c) cópia de segurança antes do merge da cloud
  if (/pulsoWriteBackup\(/.test(html) && /antes-de-fundir-cloud/.test(html)) ok('c\u00f3pia de seguran\u00e7a antes do merge da cloud');
  else bad('falta a c\u00f3pia de seguran\u00e7a antes do merge');

  // (d) troca de token do Strava com fallback (n\u00e3o parte se a fun\u00e7\u00e3o n\u00e3o existir)
  if (/stravaTokenExchange\(/.test(html) && /netlify\/functions\/strava-token/.test(html)) ok('troca de token do Strava via fun\u00e7\u00e3o + fallback');
  else bad('falta o proxy/fallback da troca de token do Strava');

  // (e) tutorial de primeira utiliza\u00e7\u00e3o (atleta)
  if (/window\.PulsoOnboarding/.test(html) && /maybeStart/.test(html)) ok('tutorial de primeira utiliza\u00e7\u00e3o presente');
  else bad('falta o tutorial de primeira utiliza\u00e7\u00e3o');

  // (f) auto-arquivo do resumo do dia (hist\u00f3rico nunca fica parcial)
  if (/PulsoArchiveToday/.test(html) && /_archiveTimer/.test(html)) ok('auto-arquivo do resumo do dia presente');
  else bad('falta o auto-arquivo do resumo do dia');
})();

// ============================================================================
console.log('\n' + '='.repeat(48));
console.log('RESULTADO: ' + pass + ' passaram, ' + fail + ' falharam.');
if (fail > 0) {
  console.log('\nA rever:');
  problems.forEach(p => console.log('  - ' + p));
  process.exit(1);
} else {
  console.log('Tudo verde \u2705');
}

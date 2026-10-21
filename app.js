// LocalDub – all processing happens in the browser.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
// [name, whisper code, NLLB code]; BCP-47 for voices = whisper code. Add more rows freely.
const L = [['English','en','eng_Latn'],['Spanish','es','spa_Latn'],['French','fr','fra_Latn'],['German','de','deu_Latn'],['Italian','it','ita_Latn'],['Portuguese','pt','por_Latn'],['Dutch','nl','nld_Latn'],['Russian','ru','rus_Cyrl'],['Ukrainian','uk','ukr_Cyrl'],['Polish','pl','pol_Latn'],['Turkish','tr','tur_Latn'],['Arabic','ar','arb_Arab'],['Hebrew','he','heb_Hebr'],['Hindi','hi','hin_Deva'],['Bengali','bn','ben_Beng'],['Urdu','ur','urd_Arab'],['Persian','fa','pes_Arab'],['Chinese','zh','zho_Hans'],['Japanese','ja','jpn_Jpan'],['Korean','ko','kor_Hang'],['Vietnamese','vi','vie_Latn'],['Thai','th','tha_Thai'],['Indonesian','id','ind_Latn'],['Swahili','sw','swh_Latn'],['Greek','el','ell_Grek'],['Swedish','sv','swe_Latn'],['Czech','cs','ces_Latn'],['Romanian','ro','ron_Latn'],['Tamil','ta','tam_Taml'],['Filipino','tl','tgl_Latn']];
const EMO = {neutral:{r:1,p:1,v:1},happy:{r:1.05,p:1.12,v:1},excited:{r:1.12,p:1.2,v:1},angry:{r:1.05,p:.9,v:1},sad:{r:.9,p:.85,v:.85},whisper:{r:.9,p:1,v:.45}};
const S = {file:null, a16:null, segs:[], spk:[], src:'', tgt:'es', step:0, cps:{}, o:{maxUp:1.6,gap:.15,vol:1,base:.7,duck:.15,policy:'hold'}};
const NAMES = ['Intro','Upload','Transcribe','Translate','Voices','Export'];
const T = ['Upload','Transcribe','Translate','Voices','Export'];
const lang = c => L.find(x => x[1] === c) || [c, c, c];
let worker, voices = [], wake, playing = false;

// ---------- helpers ----------
const fmt = (t, sep = ',') => { const h = t/3600|0, m = t%3600/60|0, s = t%60; return `${String(h).padStart(2,0)}:${String(m).padStart(2,0)}:${s.toFixed(3).padStart(6,0).replace('.', sep)}`; };
const dl = (name, data, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4e3); };
const lock = async on => { try { if (on) wake = await navigator.wakeLock?.request('screen'); else { await wake?.release(); wake = null; } } catch {} };
const base = () => (S.file?.name || 'dub').replace(/\.[^.]+$/, '');
function getWorker(){
  if (worker) return worker;
  worker = new Worker('js/worker.js', {type:'module'});
  worker.onmessage = ({data:d}) => {
    const k = S.step === 1 ? 1 : 2;
    if (d.t === 'progress' && d.p.status === 'progress') { $('#p'+k).hidden = false; $('#p'+k).value = d.p.progress / 100; $('#m'+k).textContent = `Downloading model ${d.p.file?.split('/').pop() || ''} ${Math.round(d.p.progress)}% (cached after first run)`; }
    if (d.t === 'note') $('#m'+k).textContent = d.m;
    if (d.t === 'trp') { $('#p2').hidden = false; $('#p2').value = d.i / d.n; $('#m2').textContent = `Translated ${d.i} of ${d.n}`; }
  };
  return worker;
}
const ask = (msg, ok) => new Promise((res, rej) => { const w = getWorker(), h = e => { if (e.data.t === ok) { w.removeEventListener('message', h); res(e.data); } else if (e.data.t === 'error') { w.removeEventListener('message', h); rej(new Error(e.data.m)); } }; w.addEventListener('message', h); w.postMessage(msg); });

// ---------- steps ----------
function show(n){
  S.step = Math.max(0, Math.min(4, n));
  $$('main section').forEach((s, i) => s.hidden = i !== S.step);
  $('#stage').classList.toggle('show', !!S.file);
  $('#steps').innerHTML = T.map((t, i) => `<button class="${i === S.step ? 'on' : i < S.step ? 'done' : ''}" data-i="${i}">${i+1}. ${t}</button>`).join('');
  $$('#steps button').forEach(b => b.onclick = () => { if (ok(+b.dataset.i)) show(+b.dataset.i); });
  $('#back').disabled = S.step === 0; $('#next').disabled = S.step === 4 || !ok(S.step + 1);
  if (S.step === 3) renderVoices(); render(1); render(2); render(3);
  $('#recHint').textContent = navigator.mediaDevices?.getDisplayMedia ? 'Chrome/Edge desktop: choose “This tab” and tick “Share tab audio”. The dub is recorded in real time.' : 'This browser cannot record tabs (most phones). Use “Play fullscreen” with your phone’s screen recorder, or export subtitles/project and record on a desktop.';
}
const ok = i => i <= 0 || (i === 1 && !!S.file) || (i === 2 && S.segs.length > 0) || (i >= 3 && S.segs.some(s => s.tr));
$('#back').onclick = () => show(S.step - 1); $('#next').onclick = () => show(S.step + 1);

// ---------- 1 upload ----------
async function loadFile(f){
  $('#fileLabel').textContent = 'Reading and decoding ' + f.name + '…'; await lock(true);
  try {
    const ac = new AudioContext(), buf = await ac.decodeAudioData(await f.arrayBuffer()); ac.close();
    const oc = new OfflineAudioContext(1, Math.ceil(buf.duration * 16000), 16000), src = oc.createBufferSource();
    src.buffer = buf; src.connect(oc.destination); src.start();
    S.a16 = (await oc.startRendering()).getChannelData(0); S.file = f;
    $('#v').src = URL.createObjectURL(f); $('#fileLabel').textContent = `${f.name} (${(buf.duration/60).toFixed(1)} min)`;
    show(1);
  } catch (e) { $('#fileLabel').textContent = 'Could not decode this file’s audio (' + e.message + '). Try MP4/WebM/MP3/WAV, or a smaller file on phones.'; }
  lock(false);
}
$('#file').onchange = e => e.target.files[0] && loadFile(e.target.files[0]);
$('#projIn').onchange = async e => { const j = JSON.parse(await e.target.files[0].text()); Object.assign(S, {segs:j.segments, spk:j.speakers, src:j.source, tgt:j.target}); Object.assign(S.o, j.options); fillSel(); $('#fileLabel').textContent = 'Project loaded. Now choose the media file: ' + (j.media || ''); show(ok(3) ? 3 : 0); };
function fillSel(){
  $('#srcSel').innerHTML = '<option value="">Auto-detect</option>' + L.map(l => `<option value="${l[1]}">${l[0]}</option>`).join('');
  $('#tgtSel').innerHTML = L.map(l => `<option value="${l[1]}">${l[0]}</option>`).join('') + '<option value="custom">Other…</option>';
  $('#srcSel').value = S.src || ''; $('#tgtSel').value = L.some(l => l[1] === S.tgt) ? S.tgt : 'es';
}

// ---------- 2 transcribe ----------
$('#goAsr').onclick = async () => {
  $('#goAsr').disabled = true; await lock(true); $('#m1').textContent = 'Loading model…';
  try {
    S.src = $('#srcSel').value;
    const {chunks} = await ask({t:'asr', audio:S.a16, model:$('#model').value, lang:S.src}, 'asr');
    S.segs = chunks.filter(c => c.text.trim()).map((c, i, a) => ({id:i, start:c.timestamp[0], end:c.timestamp[1] ?? Math.min(c.timestamp[0] + 3, a[i+1]?.timestamp[0] ?? 1e9), text:c.text.trim(), tr:'', spk:0, emo:'neutral'}));
    if (!S.src) S.src = 'en';
    S.segs.forEach(s => s.emo = guessEmo(s)); fillSel();
    $('#m1').textContent = `${S.segs.length} segments. Fix any mistakes below, then continue.`; $('#p1').hidden = true;
  } catch (e) { $('#m1').textContent = 'Transcription failed: ' + e.message; }
  $('#goAsr').disabled = false; lock(false); show(1);
};
function guessEmo(s){
  const t = s.text; if (/[!！]{2,}|^[A-Z\s!?]{12,}$/.test(t)) return 'angry'; if (/!/.test(t)) return 'excited';
  if (/\.\.\.|…/.test(t)) return 'sad'; return 'neutral';
}

// ---------- 3 translate ----------
$('#tgtSel').onchange = e => { if (e.target.value === 'custom') { const v = prompt('Enter "NLLB code,voice code" e.g. yor_Latn,yo'); if (v) { const [n, c] = v.split(',').map(x => x.trim()); L.push([n, c, n]); fillSel(); $('#tgtSel').value = c; } else $('#tgtSel').value = 'es'; } };
$('#goTr').onclick = async () => {
  S.src = $('#srcSel').value || S.src || 'en'; S.tgt = $('#tgtSel').value;
  $('#goTr').disabled = true; await lock(true); $('#m2').textContent = 'Loading translation model…';
  try {
    const {out} = await ask({t:'tr', texts:S.segs.map(s => s.text), src:lang(S.src)[2], tgt:lang(S.tgt)[2]}, 'tr');
    S.segs.forEach((s, i) => s.tr = out[i]); $('#m2').textContent = 'Done. Edit any line, then continue.'; $('#p2').hidden = true;
  } catch (e) { $('#m2').textContent = 'Translation failed: ' + e.message; }
  $('#goTr').disabled = false; lock(false); show(2);
};

// ---------- segment lists ----------
function render(k){
  const el = $('#list' + k); if (!el || S.step !== k) return;
  el.innerHTML = S.segs.map((s, i) => `<div class="seg" id="seg${i}"><time>${fmt(s.start, '.').slice(3, 10)}–${fmt(s.end, '.').slice(3, 10)}</time><span>${k === 3 ? '' : ''}</span>
  <textarea data-i="${i}" data-f="${k === 1 ? 'text' : 'tr'}" aria-label="Segment ${i+1}">${(k === 1 ? s.text : k === 2 ? s.tr : s.tr).replace(/</g, '&lt;')}</textarea>
  ${k === 3 ? `<div class="ctl"><select data-i="${i}" data-f="spk">${S.spk.map((p, j) => `<option value="${j}" ${s.spk === j ? 'selected' : ''}>${p.name}</option>`).join('')}</select><select data-i="${i}" data-f="emo">${Object.keys(EMO).map(e => `<option ${s.emo === e ? 'selected' : ''}>${e}</option>`).join('')}</select><button data-say="${i}">Play line</button></div>` : ''}</div>`).join('');
  el.oninput = e => { const t = e.target; if (t.dataset.f === 'text' || (t.dataset.f === 'tr' && t.tagName === 'TEXTAREA')) S.segs[t.dataset.i][t.dataset.f] = t.value; };
  el.onchange = e => { const t = e.target; if (t.tagName === 'SELECT') S.segs[t.dataset.i][t.dataset.f] = t.dataset.f === 'spk' ? +t.value : t.value; };
  el.onclick = e => { if (e.target.dataset.say != null) { speechSynthesis.cancel(); speak(S.segs[e.target.dataset.say], 99, 1.5).catch(() => {}); } };
}

// ---------- 4 voices, speakers, timing ----------
function f0Of(a, s, e){
  const sr = 16000, i0 = Math.floor(s * sr), n = Math.floor((e - s) * sr), w = 640, f = [];
  for (let k = 0; k < 14; k++) {
    const p = i0 + Math.floor(n * (k + .5) / 14 - w / 2); if (p < 0 || p + w + 230 > a.length) continue;
    let r = 0; for (let j = 0; j < w; j++) r += a[p+j] ** 2; r = Math.sqrt(r / w); if (r < .015) continue;
    let best = 0, lag = 0; for (let l = 53; l < 230; l += 1) { let c = 0, d = 0; for (let j = 0; j < w; j += 2) { c += a[p+j] * a[p+j+l]; d += a[p+j+l] ** 2; } c /= Math.sqrt(d * r * r * w / 2 + 1e-9) ; if (c > best) { best = c; lag = l; } }
    if (best > .45) f.push([sr / lag, r]);
  }
  if (!f.length) return {f0:0, rms:0};
  f.sort((x, y) => x[0] - y[0]); return {f0:f[f.length >> 1][0], rms:f.reduce((q, x) => q + x[1], 0) / f.length};
}
$('#detect').onclick = async () => {
  $('#detect').disabled = true; $('#detect').textContent = 'Analyzing…'; await new Promise(r => setTimeout(r, 30));
  const k = Math.max(1, Math.min(6, +$('#nSpk').value || 1)); S.segs.forEach(s => Object.assign(s, f0Of(S.a16, s.start, s.end)));
  const v = S.segs.filter(s => s.f0).map(s => s.f0).sort((a, b) => a - b); let c = Array.from({length:k}, (_, i) => v[Math.floor((i + .5) * v.length / k)] || 150);
  for (let it = 0; it < 20; it++) { const g = c.map(() => []); v.forEach(x => g[c.reduce((b, y, i) => Math.abs(y - x) < Math.abs(c[b] - x) ? i : b, 0)].push(x)); c = g.map((a, i) => a.length ? a.reduce((p, q) => p + q) / a.length : c[i]); }
  const order = c.map((x, i) => i).sort((a, b) => c[a] - c[b]), rmsAll = S.segs.map(s => s.rms).filter(Boolean).sort((a, b) => a - b)[S.segs.length >> 1] || .05;
  S.spk = order.map((o, j) => ({name:'Speaker ' + (j + 1), gender:c[o] < 165 ? 'male' : 'female', voice:'', pitch:1, rate:1}));
  S.segs.forEach(s => { s.spk = s.f0 ? order.indexOf(c.reduce((b, y, i) => Math.abs(y - s.f0) < Math.abs(c[b] - s.f0) ? i : b, 0)) : 0; const r = s.rms / rmsAll; if (s.rms && r > 1.6 && s.emo === 'neutral') s.emo = 'excited'; if (s.rms && r < .55 && s.emo === 'neutral') s.emo = 'sad'; });
  $('#detect').disabled = false; $('#detect').textContent = 'Detect speakers by pitch'; renderVoices(); render(3);
};
const vlist = () => { voices = speechSynthesis.getVoices(); return voices; };
speechSynthesis.onvoiceschanged = () => S.step === 3 && renderVoices();
const FEM = /female|woman|zira|samantha|victoria|karen|susan|hazel|aria|jenny|monica|paulina|helena|sabina|amelie|joana|google/i, MAL = /(?<!fe)male|david|mark|daniel|alex|fred|george|guy|ryan|thomas|jorge|diego|pablo|paul|stefan|jorge|henri|rishi/i;
function pickVoice(p, idx){
  const lc = lang(S.tgt)[1], c = vlist().filter(v => v.lang.toLowerCase().startsWith(lc));
  if (p.voice) { const v = voices.find(v => v.voiceURI === p.voice); if (v) return {v, shift:1}; }
  const m = c.filter(v => (p.gender === 'male' ? MAL : FEM).test(v.name) && !(p.gender === 'male' ? FEM : MAL).test(v.name) || (p.gender === 'female' && /google/i.test(v.name) && !MAL.test(v.name)));
  const pool = m.length ? m : c; return {v:pool[idx % (pool.length || 1)] || null, shift:m.length ? 1 : p.gender === 'male' ? .8 : 1.15};
}
function renderVoices(){
  if (!S.spk.length) S.spk = [{name:'Speaker 1', gender:'female', voice:'', pitch:1, rate:1}, {name:'Speaker 2', gender:'male', voice:'', pitch:1, rate:1}];
  const lc = lang(S.tgt)[1], c = vlist().filter(v => v.lang.toLowerCase().startsWith(lc));
  $('#spkBox').innerHTML = S.spk.map((p, i) => `<div class="spk"><label>Name<input data-s="${i}" data-f="name" value="${p.name}"></label><label>Gender<select data-s="${i}" data-f="gender"><option ${p.gender === 'female' ? 'selected' : ''}>female</option><option ${p.gender === 'male' ? 'selected' : ''}>male</option></select></label><label>Voice<select data-s="${i}" data-f="voice"><option value="">Auto (gender-matched)</option>${c.map(v => `<option value="${v.voiceURI}" ${p.voice === v.voiceURI ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label><label>Pitch<input type="range" min=".6" max="1.5" step=".05" value="${p.pitch}" data-s="${i}" data-f="pitch"></label></div>`).join('') + `<button id="addSpk">Add speaker</button>${c.length ? '' : `<p class="hint">No installed voice for ${lang(S.tgt)[0]}. Install one in your device’s speech settings.</p>`}`;
  $('#spkBox').oninput = $('#spkBox').onchange = e => { const t = e.target, p = S.spk[t.dataset.s]; if (p) { p[t.dataset.f] = t.type === 'range' ? +t.value : t.value; if (t.dataset.f === 'name') render(3); } };
  $('#addSpk').onclick = () => { S.spk.push({name:'Speaker ' + (S.spk.length + 1), gender:'female', voice:'', pitch:1, rate:1}); renderVoices(); render(3); };
  $$('[data-o]').forEach(i => { i.value = S.o[i.dataset.o]; const b = $('#o_' + i.dataset.o + '_v'); if (b) b.textContent = i.value; i.oninput = () => { S.o[i.dataset.o] = i.type === 'range' ? +i.value : i.value; if (b) b.textContent = i.value; }; });
  render(3);
}

// ---------- dubbing engine ----------
let current = null;
function speak(s, window_, forceRate){
  return new Promise((res, rej) => {
    const p = S.spk[s.spk] || S.spk[0] || {gender:'female', pitch:1}, e = EMO[s.emo] || EMO.neutral, {v, shift} = pickVoice(p, S.spk.indexOf(p));
    const u = new SpeechSynthesisUtterance(s.tr); if (v) u.voice = v; u.lang = v?.lang || lang(S.tgt)[1];
    const key = u.lang.slice(0, 2), cps = S.cps[key] || (/zh|ja|ko|th/.test(key) ? 5 : 14), est = s.tr.length / cps;
    const rate = forceRate || Math.min(S.o.maxUp, Math.max(.6, (p.rate || 1) * e.r * Math.max(1, est / Math.max(.4, window_))));
    u.rate = rate; u.pitch = Math.min(2, Math.max(.1, p.pitch * e.p * shift)); u.volume = Math.min(1, S.o.vol * e.v);
    let t0; u.onstart = () => t0 = performance.now(); u.onend = () => { if (t0) S.cps[key] = .6 * cps + .4 * (s.tr.length / ((performance.now() - t0) / 1e3 * rate)); res(); }; u.onerror = e => e.error === 'canceled' || e.error === 'interrupted' ? res() : rej(e);
    speechSynthesis.speak(u);
  });
}
function runDub(){
  const v = $('#v'), segs = S.segs.filter(s => s.tr.trim()); let i = 0, busy = false, held = false, stop = false, vol = S.o.base;
  v.currentTime = 0; v.volume = vol; playing = true;
  return new Promise(done => {
    const end = () => { stop = true; playing = false; speechSynthesis.cancel(); v.pause(); v.volume = 1; current = null; $$('.seg.live').forEach(x => x.classList.remove('live')); done(); };
    current = end;
    const tick = () => {
      if (stop) return;
      const nx = segs[i + (busy ? 1 : 0)];
      if (!busy && segs[i] && v.currentTime >= segs[i].start) {
        busy = true; const s = segs[i], nxt = segs[i + 1], idx = S.segs.indexOf(s);
        $('#seg' + idx)?.classList.add('live'); $('#seg' + idx)?.scrollIntoView({block:'nearest'});
        const win = (nxt ? nxt.start : s.end + 3) - Math.max(s.start, v.currentTime) - S.o.gap;
        speak(s, win).catch(() => {}).then(() => { $('#seg' + idx)?.classList.remove('live'); busy = false; i++; if (held) { held = false; v.play(); } });
      }
      if (busy && S.o.policy === 'hold' && nx && v.currentTime >= nx.start && !v.paused) { held = true; v.pause(); }
      vol += ((busy ? S.o.duck : S.o.base) - vol) * .2; v.volume = Math.min(1, Math.max(0, vol));
      if ((v.ended || v.currentTime >= v.duration - .05) && !busy && i >= segs.length) return end();
      if (v.ended && !busy) return end();
      requestAnimationFrame(tick);
    };
    v.play().then(() => requestAnimationFrame(tick)).catch(end);
  });
}
$('#prev').onclick = () => { current?.(); speechSynthesis.cancel(); runDub(); };
$('#stopPrev').onclick = () => current?.();
$('#full').onclick = async () => { try { await $('#stage').requestFullscreen?.(); } catch {} await runDub(); document.fullscreenElement && document.exitFullscreen(); };

// ---------- 5 export ----------
const cues = (k, vtt) => S.segs.filter(s => s[k]).map((s, i) => `${vtt ? '' : i + 1 + '\n'}${fmt(s.start, vtt ? '.' : ',')} --> ${fmt(s.end, vtt ? '.' : ',')}\n${s[k]}\n`).join('\n');
$$('[data-x]').forEach(b => b.onclick = () => ({
  srcsrt: () => dl(base() + `.${S.src}.srt`, cues('text'), 'text/plain'),
  trsrt: () => dl(base() + `.${S.tgt}.srt`, cues('tr'), 'text/plain'),
  trvtt: () => dl(base() + `.${S.tgt}.vtt`, 'WEBVTT\n\n' + cues('tr', 1), 'text/vtt'),
  json: () => dl(base() + '.dub.json', JSON.stringify({version:1, media:S.file?.name, source:S.src, target:S.tgt, speakers:S.spk, options:S.o, segments:S.segs.map(({id, start, end, text, tr, spk, emo}) => ({id, start, end, text, tr, spk, emo}))}, null, 1), 'application/json'),
})[b.dataset.x]());
$('#rec').onclick = async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) return alert('Tab recording is not supported in this browser.');
  let st; try { st = await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'}, audio:true, preferCurrentTab:true, selfBrowserSurface:'include', systemAudio:'include'}); } catch { return; }
  if (!st.getAudioTracks().length) { st.getTracks().forEach(t => t.stop()); return alert('No tab audio was shared. Tick “Share tab audio” and try again.'); }
  try { if (window.RestrictionTarget) await st.getVideoTracks()[0].restrictTo(await RestrictionTarget.fromElement($('#stage'))); } catch {}
  const mime = ['video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)), ch = [], r = new MediaRecorder(st, {mimeType:mime});
  r.ondataavailable = e => e.data.size && ch.push(e.data); await lock(true); $('#stage').scrollIntoView(); r.start(1000);
  await runDub(); await new Promise(x => setTimeout(x, 600)); r.stop(); await new Promise(x => r.onstop = x); st.getTracks().forEach(t => t.stop()); lock(false);
  dl(`${base()}.${S.tgt}.dub.${mime.includes('mp4') ? 'mp4' : 'webm'}`, new Blob(ch, {type:mime}));
};
fillSel(); show(0);

// Runs Whisper (ASR) and NLLB (translation) off the main thread.
import {pipeline} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.0';
let asr, asrKey, trn;
const progress_callback = p => postMessage({t:'progress', p});
async function load(task, model, o){
  try { return await pipeline(task, model, {...o, device:'webgpu', progress_callback}); }
  catch(e){ postMessage({t:'note', m:'WebGPU unavailable, using CPU (slower).'});
    return pipeline(task, model, {dtype:'q8', device:'wasm', progress_callback}); }
}
onmessage = async ({data:d}) => {
  try {
    if (d.t === 'asr') {
      if (asrKey !== d.model) { asr = await load('automatic-speech-recognition', d.model, {dtype:{encoder_model:'fp32', decoder_model_merged:'q4'}}); asrKey = d.model; }
      const o = await asr(d.audio, {return_timestamps:true, chunk_length_s:30, stride_length_s:5, language:d.lang||null, task:'transcribe'});
      postMessage({t:'asr', chunks:o.chunks});
    } else if (d.t === 'tr') {
      if (!trn) trn = await pipeline('translation', 'Xenova/nllb-200-distilled-600M', {dtype:'q8', device:'wasm', progress_callback});
      const out = [];
      for (let i = 0; i < d.texts.length; i++) {
        const t = d.texts[i].trim();
        out.push(t ? (await trn(t, {src_lang:d.src, tgt_lang:d.tgt, max_length:400}))[0].translation_text : '');
        postMessage({t:'trp', i:i+1, n:d.texts.length});
      }
      postMessage({t:'tr', out});
    }
  } catch (e) { postMessage({t:'error', m:String(e && e.message || e)}); }
};

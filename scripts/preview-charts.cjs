/* global __dirname */
// Browser visual QA using the actual Three.js renderer and synthetic financial values.
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const output = path.resolve(process.argv[2] || '/private/tmp/settler-charts-preview');
fs.mkdirSync(output, { recursive: true });
const root = path.resolve(__dirname, '..');
for (const [source, name] of [
  ['src/utils/chartData.ts', 'chartData.js'],
  ['src/components/charting/ringScene.ts', 'ringScene.js'],
  ['src/components/charting/ringRuntime.ts', 'ringRuntime.js'],
]) {
  const code = babel
    .transformFileSync(path.join(root, source), {
      babelrc: false,
      configFile: false,
      presets: [['@babel/preset-typescript', { allExtensions: true }]],
    })
    .code.replaceAll('../../utils/chartData', './chartData.js')
    .replaceAll("'./ringScene'", "'./ringScene.js'");
  fs.writeFileSync(path.join(output, name), code);
}
const three = path.dirname(require.resolve('three'));
for (const file of ['three.module.js', 'three.core.js'])
  fs.copyFileSync(path.join(three, file), path.join(output, file));
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Settler · chart visual QA</title>
<style>*{box-sizing:border-box}body{margin:0;background:#F3F5F3;color:#202B2B;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif}main{max-width:1180px;padding:40px 28px;margin:auto}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}h1{font-size:28px;letter-spacing:-1px;margin:0 0 8px}p{color:#606D6D;line-height:1.5;margin:0;font-size:13px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}.card{padding:22px;border:1px solid #E3E8EA;border-radius:24px;background:linear-gradient(135deg,#E4EFE9,#FFFFFF 65%);box-shadow:0 6px 0 #E3E8EA}.head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}h2{font-size:17px;margin:0 0 6px}.tag{font-size:10px;font-weight:700;background:white;padding:7px 9px;border-radius:9px;color:#167461;white-space:nowrap}.ring{position:relative;height:230px;background:white;border-radius:18px;margin:18px 0}canvas{width:100%;height:230px;border-radius:18px}.center{position:absolute;inset:0;display:flex;flex-direction:column;gap:5px;align-items:center;justify-content:center;pointer-events:none}.center small{font-size:10px;color:#606D6D;max-width:110px;text-align:center}.amount{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.5px}.row{display:flex;gap:10px;align-items:center;margin:18px 0 7px;font-size:13px}.row span:first-child{width:8px;height:8px;border-radius:3px}.row b:last-child{margin-left:auto}.track{height:6px;background:#E3E8EA;border-radius:8px;overflow:hidden}.track i{display:block;height:100%;border-radius:8px}.metrics{display:flex;gap:14px;margin:18px 0}.metrics div{flex:1}.metrics small{display:block;color:#606D6D;font-size:11px;margin-bottom:8px}.metrics strong{font-size:17px}.foot{margin-top:28px;border-radius:16px;padding:18px;background:#E4EFE9}.status{color:#A33943}.tabs{font-size:11px;font-weight:700;color:#167461;letter-spacing:1px}button{border:1px solid #E3E8EA;padding:10px 15px;border-radius:12px;background:white;color:#167461;font-weight:600;cursor:pointer}body.dark{background:#172020;color:#EFF6F5}.dark .card{background:linear-gradient(135deg,#2B4039,#202B2B 65%);border-color:#30434B;box-shadow:0 6px 0 #30434B}.dark .ring,.dark canvas,.dark .tag{background:#202B2B}.dark p,.dark .center small,.dark .metrics small{color:#A3B5BC}.dark .track{background:#30434B}.dark .foot{background:#2B4039}.dark button{background:#202B2B;color:#83CDBA;border-color:#30434B}@media(max-width:800px){.grid{grid-template-columns:1fr}main{max-width:430px;padding:24px 18px}}</style>
<script type="importmap">{"imports":{"three":"./three.module.js"}}</script></head><body><main><header><div><div class="tabs">SETTLER / CHART STUDIO</div><h1>A clearer view of your money</h1><p>Visual QA · synthetic values · actual Three.js scene and renderer</p></div><button id="theme">Dark theme</button></header><section class="grid">
<article class="card"><div class="head"><div><h2>Spending mix</h2><p>Where your money went</p></div><span class="tag">INSIGHTS</span></div><div class="ring"><canvas id="insights"></canvas><div class="center"><small>TOTAL SPENDING</small><div class="amount">₹12,400</div></div></div><div id="categories"></div></article>
<article class="card"><div class="head"><div><h2>Daily cash flow</h2><p>2026-10-12 · matching your filters</p></div><span class="tag">DAILY</span></div><div class="ring"><canvas id="daily"></canvas><div class="center"><small>NET FLOW</small><div class="amount">₹19,600</div></div></div><div class="metrics"><div><small>Income</small><strong style="color:#216B50">₹32,000</strong></div><div><small>Spent</small><strong style="color:#855B13">₹12,400</strong></div><div><small>Net</small><strong>₹19,600</strong></div></div><p>Ring segments show cash movement. Transfers are excluded from cash flow.</p></article>
<article class="card"><div class="head"><div><h2>October budget</h2><p>Your monthly spending plan</p></div><span class="tag">ON TRACK</span></div><div class="ring"><canvas id="budget"></canvas><div class="center"><small>BUDGET USED</small><div class="amount">62%</div></div></div><div class="metrics"><div><small>Net spending</small><strong>₹12,400</strong></div><div><small>Monthly limit</small><strong>₹20,000</strong></div></div><div class="track"><i style="width:62%;background:#28B69C"></i></div><div class="row"><span></span><b>62.0% used</b><b style="color:#167461">₹7,600 left</b></div></article>
</section><div class="foot"><p>Native screens also include Reanimated bars, line reveals, progress tracks, amount transitions and press feedback. This preview checks the actual 3D renderer; it does not replace phone layout or performance testing.</p><p id="status" class="status"></p></div></main>
<script type="module">import {createRingRuntime} from './ringRuntime.js';import {categoryRingSegments,cashFlowSegments,budgetRingSegments} from './chartData.js';
const categories=[{id:1,name:'Food & dining',amount:620000},{id:2,name:'Transport',amount:310000},{id:3,name:'Shopping',amount:186000},{id:4,name:'Subscriptions',amount:124000}];
const data={insights:categoryRingSegments(categories),daily:cashFlowSegments(3200000,1240000),budget:budgetRingSegments(2000000,1240000,'#28B69C','#E3E8EA')};const runtimes=[];
for(const [id,segments] of Object.entries(data)){try{const canvas=document.getElementById(id);canvas.width=Math.floor(canvas.clientWidth*devicePixelRatio);canvas.height=Math.floor(230*devicePixelRatio);const gl=canvas.getContext('webgl2',{antialias:true});if(!gl)throw Error('WebGL2 unavailable');gl.endFrameEXP=()=>{};const runtime=createRingRuntime(gl,false,()=>{document.getElementById('status').textContent='Renderer failure';});runtime.update(segments,null,'#FFFFFF');runtimes.push({runtime,segments});canvas.addEventListener('click',e=>{runtime.update(segments,runtime.pick(e.offsetX,e.offsetY,canvas.clientWidth,230),'#FFFFFF');});}catch(error){document.getElementById('status').textContent=error.message;}}
document.getElementById('categories').innerHTML=categories.map((row,index)=>'<div class="row"><span style="background:'+data.insights[index].color+'"></span><b>'+row.name+'</b><b>'+new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(row.amount/100)+'</b></div><div class="track"><i style="width:'+(row.amount/1240000*100)+'%;background:'+data.insights[index].color+'"></i></div>').join('');
document.getElementById('theme').onclick=()=>{const dark=document.body.classList.toggle('dark');runtimes.forEach(({runtime,segments})=>runtime.update(segments,null,dark?'#202B2B':'#FFFFFF'));document.getElementById('theme').textContent=dark?'Light theme':'Dark theme';};window.addEventListener('pagehide',()=>runtimes.forEach(({runtime})=>runtime.dispose()));window.__chartPreviewReady=runtimes.length===3;
</script></body></html>`;
fs.writeFileSync(path.join(output, 'index.html'), html);
process.stdout.write(output + '\n');

// Local, opt-in browser measurements. No telemetry is transmitted or persisted.
export function createReviewDiagnostics(enabled) {
  let renderer, state, label='room', intervals=[], previous=0, skip=12, started=0;
  const log=(kind,data)=>{if(enabled)console.info('[library-review] '+JSON.stringify({kind,...data}));};
  return {
    ready(activeRenderer,getState){
      if(!enabled)return;renderer=activeRenderer;state=getState;
      const assets=performance.getEntriesByType('resource').filter(r=>r.name.includes('/carriage-v15/'));
      log('ready',{readyMs:Math.round(performance.now()),viewport:[innerWidth,innerHeight],pixelRatio:renderer.getPixelRatio(),assetTransferBytes:assets.reduce((n,r)=>n+r.transferSize,0),lastAssetMs:Math.round(Math.max(0,...assets.map(r=>r.responseEnd))),state:state()});
    },
    event(name){
      if(!enabled)return;label=name;intervals=[];previous=0;skip=12;started=0;
      log('view',{label,state:state?.()});
    },
    frame(now){
      if(!enabled||!renderer||document.hidden)return;
      if(skip-->0){previous=now;return;}
      if(previous&&now-previous<1000)intervals.push(now-previous);
      previous=now;if(!started)started=now;
      if(intervals.length<90&&now-started<8000)return;
      if(!intervals.length)return;
      const sorted=[...intervals].sort((a,b)=>a-b),sum=intervals.reduce((a,b)=>a+b,0);
      log('frames',{label,samples:intervals.length,fps:+(1000*intervals.length/sum).toFixed(1),medianMs:+sorted[Math.floor(sorted.length*.5)].toFixed(1),p95Ms:+sorted[Math.floor(sorted.length*.95)].toFixed(1),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,state:state()});
      intervals=[];previous=0;started=0;skip=180;
    },
  };
}

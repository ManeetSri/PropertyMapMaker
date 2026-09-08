// Family-page export: a self-contained HTML file the map can be opened from
// on a phone, with no server. Prefers the built single-file viewer (so it
// matches the editor's Canvas) and falls back to a canvas-2d page.

import { migrateDocument } from "../model/document.js";

function downloadHtml(html, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function injectDocument(html, doc) {
  const json = JSON.stringify(doc).replace(/</g, "\\u003c");
  if (/window\.__MAP_DOCUMENT__\s*=\s*null/.test(html)) {
    return html.replace(/window\.__MAP_DOCUMENT__\s*=\s*null/, "window.__MAP_DOCUMENT__=" + json);
  }
  return html.replace("</head>", "<script>window.__MAP_DOCUMENT__=" + json + "</script></head>");
}

export async function exportFamilyPage(doc) {
  const filename = ((doc.title || "property-map") + ".html").replace(/\s+/g, "-").toLowerCase();
  const urls = ["viewer.html", "./viewer.html"];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      // Vite's dev HTML still points at /src/viewer and will not run from disk.
      if (text.includes("/src/viewer")) continue;
      downloadHtml(injectDocument(text, migrateDocument(doc) || doc), filename);
      return;
    } catch {
      /* try the next url, then the fallback */
    }
  }
  downloadHtml(standaloneHtml(migrateDocument(doc) || doc), filename);
}

function standaloneHtml(doc) {
  const payload = JSON.stringify(doc).replace(/</g, "\\u003c");
  const title = String(doc.title || "Property Map").replace(/[<>]/g, "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#eef1f4;color:#17202a}
  header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 12px;background:#fff;border-bottom:1px solid #cbd2d9}
  h1{margin:0;font-size:16px;flex:1}
  button{border:1px solid #b9c2cc;background:#fff;border-radius:7px;padding:7px 10px;font-size:13px}
  #stage{position:relative;height:calc(100vh - 48px)}
  canvas{display:block;background:#dfe3e7;touch-action:none}
  .card{position:absolute;right:10px;top:10px;background:#fff;border:1px solid #ccd3da;border-radius:8px;padding:10px 12px;max-width:240px;box-shadow:0 4px 16px #0002}
  .card h2{margin:0 0 4px;font-size:14px}
  .card p{margin:2px 0;font-size:12px;color:#697580}
  .legend{position:absolute;left:10px;bottom:10px;background:#fffc;border:1px solid #ccd3da;border-radius:8px;padding:8px 10px;font-size:12px}
  .legend div{display:flex;gap:7px;align-items:center;margin:3px 0}
  .sw{width:12px;height:12px;border:1px solid #8a929a;border-radius:2px}
  @media print{header,.card{display:none!important}#stage,canvas{height:auto!important}}
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <button id="print">Print</button>
</header>
<div id="stage">
  <canvas id="c"></canvas>
  <aside class="legend" id="legend"></aside>
  <div class="card" id="card" hidden></div>
</div>
<script type="application/json" id="map-doc">${payload}</script>
<script>
(function(){
  var doc = JSON.parse(document.getElementById("map-doc").textContent);
  var canvas = document.getElementById("c");
  var ctx = canvas.getContext("2d");
  var view = {x:20,y:20,zoom:0.7};
  var selected = null;
  var pan = null;

  function flags(o){
    var layer = (doc.layers||[]).find(function(l){return l.id===o.layer});
    return {visible:o.visible!==false && (!layer || layer.visible!==false)};
  }
  function ownerOf(id){ return (doc.owners||[]).find(function(o){return o.id===id}); }
  function fillOf(o){
    if(!o.owner) return o.fill || "#e9edf1";
    var ow = ownerOf(o.owner);
    return ow ? ow.color : (o.fill || "#e9edf1");
  }
  function area(o){
    if(o.type==="polygon" && o.points && o.points.length>=6){
      var n=Math.floor(o.points.length/2), s=0;
      for(var i=0;i<n;i++){var j=(i+1)%n;s+=o.points[i*2]*o.points[j*2+1]-o.points[j*2]*o.points[i*2+1];}
      return Math.abs(s)/2;
    }
    if(o.w && o.h && o.type!=="text") return Math.abs(o.w*o.h);
    return 0;
  }
  function sqft(units){
    var upf = doc.scale && doc.scale.unitsPerFoot;
    return upf ? units/(upf*upf) : null;
  }
  function hit(wx,wy){
    var list = (doc.objects||[]).slice().reverse();
    for(var i=0;i<list.length;i++){
      var o=list[i];
      if(!flags(o).visible) continue;
      if(o.type==="polygon" && o.points){
        var inside=false, n=Math.floor(o.points.length/2);
        for(var a=0,b=n-1;a<n;b=a++){
          var xi=o.x+o.points[a*2], yi=o.y+o.points[a*2+1];
          var xj=o.x+o.points[b*2], yj=o.y+o.points[b*2+1];
          if((yi>wy)!==(yj>wy) && wx < (xj-xi)*(wy-yi)/((yj-yi)||1e-12)+xi) inside=!inside;
        }
        if(inside) return o;
      } else if(o.w && o.h){
        if(wx>=o.x && wy>=o.y && wx<=o.x+o.w && wy<=o.y+o.h) return o;
      }
    }
    return null;
  }

  function draw(){
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.parentNode.clientWidth, h = canvas.parentNode.clientHeight;
    canvas.width = w*dpr; canvas.height = h*dpr;
    canvas.style.width = w+"px"; canvas.style.height = h+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle="#dfe3e7"; ctx.fillRect(0,0,w,h);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.zoom, view.zoom);
    (doc.objects||[]).forEach(function(o){
      if(!flags(o).visible) return;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate((o.rotation||0)*Math.PI/180);
      ctx.globalAlpha = o.opacity==null?1:o.opacity;
      if(o.type==="text"){
        ctx.fillStyle=o.fill||"#17202a";
        ctx.font=(o.fontSize||16)+"px sans-serif";
        ctx.fillText(o.label||"",0,o.fontSize||16);
      } else if(o.type==="polygon"){
        ctx.beginPath();
        for(var i=0;i<o.points.length;i+=2){
          if(i===0) ctx.moveTo(o.points[i], o.points[i+1]);
          else ctx.lineTo(o.points[i], o.points[i+1]);
        }
        ctx.closePath();
        ctx.fillStyle=fillOf(o); ctx.fill();
        ctx.strokeStyle=o.stroke||"#1268c4"; ctx.lineWidth=o.strokeWidth||2; ctx.stroke();
      } else if(o.type==="dimension" || o.type==="line"){
        ctx.strokeStyle=o.stroke||"#222"; ctx.lineWidth=o.strokeWidth||2;
        ctx.beginPath();
        ctx.moveTo(o.points[0], o.points[1]);
        ctx.lineTo(o.points[2], o.points[3]);
        ctx.stroke();
      } else if(o.w && o.h){
        ctx.fillStyle=fillOf(o);
        ctx.fillRect(0,0,o.w,o.h);
        ctx.strokeStyle=o.stroke||"#1268c4"; ctx.lineWidth=o.strokeWidth||2;
        ctx.strokeRect(0,0,o.w,o.h);
        if(o.showLabel!==false && o.label){
          ctx.fillStyle="#17202a";
          ctx.font=(o.fontSize||16)+"px sans-serif";
          ctx.textAlign="center"; ctx.textBaseline="middle";
          ctx.fillText(o.label, o.w/2, o.h/2, Math.max(10,o.w-12));
        }
      }
      if(selected && selected.id===o.id){
        ctx.strokeStyle="#1677ff"; ctx.setLineDash([6,4]); ctx.lineWidth=2;
        if(o.w) ctx.strokeRect(-2,-2,o.w+4,o.h+4);
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
    ctx.restore();
  }

  function showCard(o){
    var el=document.getElementById("card");
    if(!o){ el.hidden=true; return; }
    var ow=ownerOf(o.owner);
    var a=sqft(area(o));
    el.hidden=false;
    el.innerHTML="<h2>"+(o.label||o.type)+"</h2>"+
      "<p>"+(ow?ow.name:"Unassigned")+"</p>"+
      "<p>"+(a==null?"Set a scale to see area":Math.round(a)+" sq ft")+"</p>";
  }

  function legend(){
    var el=document.getElementById("legend");
    var upf=doc.scale && doc.scale.unitsPerFoot;
    var html="<strong>Legend</strong>";
    (doc.owners||[]).forEach(function(ow){
      var tot=0;
      (doc.objects||[]).forEach(function(o){
        if(o.owner===ow.id && o.id!=="bg-sheet" && o.id!=="bg-plot") tot+=area(o);
      });
      html+="<div><span class='sw' style='background:"+ow.color+"'></span>"+ow.name+
        (upf?" · "+Math.round(tot/(upf*upf))+" sq ft":"")+"</div>";
    });
    el.innerHTML=html;
  }

  canvas.addEventListener("wheel", function(e){
    e.preventDefault();
    var z = Math.max(0.05, Math.min(4, view.zoom * Math.exp(-e.deltaY*0.0025)));
    var r=canvas.getBoundingClientRect();
    var px=e.clientX-r.left, py=e.clientY-r.top;
    var wx=(px-view.x)/view.zoom, wy=(py-view.y)/view.zoom;
    view.zoom=z; view.x=px-wx*z; view.y=py-wy*z; draw();
  }, {passive:false});

  canvas.addEventListener("pointerdown", function(e){
    canvas.setPointerCapture(e.pointerId);
    var r=canvas.getBoundingClientRect();
    var wx=(e.clientX-r.left-view.x)/view.zoom;
    var wy=(e.clientY-r.top-view.y)/view.zoom;
    var hitObj=hit(wx,wy);
    if(hitObj && (e.pointerType==="touch" || e.detail)){
      selected=hitObj; showCard(hitObj); draw();
    }
    pan={x:e.clientX,y:e.clientY,vx:view.x,vy:view.y,moved:false,hit:hitObj};
  });
  canvas.addEventListener("pointermove", function(e){
    if(!pan) return;
    var dx=e.clientX-pan.x, dy=e.clientY-pan.y;
    if(Math.hypot(dx,dy)>4) pan.moved=true;
    if(pan.moved){ view.x=pan.vx+dx; view.y=pan.vy+dy; draw(); }
  });
  canvas.addEventListener("pointerup", function(e){
    if(pan && !pan.moved){
      selected=pan.hit; showCard(pan.hit); draw();
    }
    pan=null;
  });
  document.getElementById("print").onclick=function(){ window.print(); };
  window.addEventListener("resize", draw);
  legend(); draw();
})();
</script>
</body>
</html>`;
}

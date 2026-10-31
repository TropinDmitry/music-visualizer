const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./exportMp4-bElS_cxe.js","./jsx-runtime-DM9IciaU.js"])))=>i.map(i=>d[i]);
import{B as e,C as t,D as n,E as r,F as i,G as a,H as o,I as s,J as c,K as l,M as u,O as d,R as f,S as p,U as ee,V as m,W as h,X as g,Y as _,_ as v,a as y,c as b,f as te,g as x,h as S,i as C,j as w,k as T,n as E,o as D,q as O,r as k,s as A,t as j,w as M,x as N,z as P}from"./jsx-runtime-DM9IciaU.js";var F=g(),I=_(),L=[{id:`16x9`,label:`1920×1080 — YouTube (16:9)`,width:1920,height:1080},{id:`9x16`,label:`1080×1920 — Shorts, Reels, клипы ВК (9:16)`,width:1080,height:1920},{id:`1x1`,label:`1080×1080 — квадрат (1:1)`,width:1080,height:1080}];function ne(e){return L.find(t=>t.id===e)??L[0]}var R=j();function re({settings:e,status:t,canExport:n,onChange:r,onExport:i,onCancel:a}){let o=t.state===`running`,s=t=>r({...e,...t});return(0,R.jsxs)(`section`,{className:`panel`,children:[(0,R.jsx)(`h2`,{children:`Экспорт видео`}),(0,R.jsxs)(`label`,{className:`field`,children:[(0,R.jsx)(`span`,{className:`field-label`,children:`Разрешение`}),(0,R.jsx)(`select`,{value:e.resolutionId,disabled:o,onChange:e=>s({resolutionId:e.target.value}),children:L.map(e=>(0,R.jsx)(`option`,{value:e.id,children:e.label},e.id))})]}),(0,R.jsxs)(`div`,{className:`field-row`,children:[(0,R.jsxs)(`label`,{className:`field`,children:[(0,R.jsx)(`span`,{className:`field-label`,children:`Кадров/с`}),(0,R.jsxs)(`select`,{value:e.fps,disabled:o,onChange:e=>s({fps:Number(e.target.value)===60?60:30}),children:[(0,R.jsx)(`option`,{value:30,children:`30`}),(0,R.jsx)(`option`,{value:60,children:`60`})]})]}),(0,R.jsxs)(`label`,{className:`field`,children:[(0,R.jsx)(`span`,{className:`field-label`,children:`Длина`}),(0,R.jsxs)(`select`,{value:e.length,disabled:o,onChange:e=>s({length:Number(e.target.value)}),children:[(0,R.jsx)(`option`,{value:0,children:`Весь трек`}),(0,R.jsx)(`option`,{value:15,children:`15 с от позиции`}),(0,R.jsx)(`option`,{value:30,children:`30 с от позиции`}),(0,R.jsx)(`option`,{value:60,children:`60 с от позиции`})]})]})]}),(0,R.jsxs)(`label`,{className:`field`,children:[(0,R.jsx)(`span`,{className:`field-label`,children:`Способ кодирования`}),(0,R.jsxs)(`select`,{value:e.method,disabled:o,onChange:e=>s({method:e.target.value===`realtime`?`realtime`:`auto`}),children:[(0,R.jsx)(`option`,{value:`auto`,children:`MP4 через WebCodecs (быстро)`}),(0,R.jsx)(`option`,{value:`realtime`,children:`MediaRecorder (в реальном времени)`})]})]}),(0,R.jsxs)(`label`,{className:`checkbox`,children:[(0,R.jsx)(`input`,{type:`checkbox`,checked:e.watermark,disabled:o,onChange:e=>s({watermark:e.target.checked})}),`Водяной знак`]}),o?(0,R.jsxs)(`div`,{className:`export-running`,children:[(0,R.jsxs)(`div`,{className:`progress`,role:`status`,children:[(0,R.jsxs)(`div`,{className:`progress-label`,children:[`Рендер… `,Math.round(t.progress*100),`%`]}),(0,R.jsx)(`div`,{className:`progress-bar`,children:(0,R.jsx)(`div`,{style:{width:`${Math.round(t.progress*100)}%`}})})]}),(0,R.jsx)(`button`,{className:`secondary-button`,onClick:a,children:`Отменить`})]}):(0,R.jsx)(`button`,{className:`primary-button`,onClick:i,disabled:!n,children:`Экспортировать`}),t.state===`done`&&(0,R.jsxs)(`p`,{className:`export-result`,"data-testid":`export-result`,"data-size":t.size,children:[`Готово за `,t.seconds.toFixed(1),` с: `,f(t.size),(0,R.jsx)(`br`,{}),(0,R.jsx)(`small`,{children:t.description}),(0,R.jsx)(`br`,{}),(0,R.jsxs)(`a`,{className:`primary-button download-button`,href:t.url,download:t.fileName,children:[`Скачать «`,t.fileName,`»`]})]}),t.state===`canceled`&&(0,R.jsx)(`p`,{className:`muted`,children:`Экспорт отменён.`}),t.state===`error`&&(0,R.jsxs)(`p`,{className:`error`,children:[`Ошибка экспорта: `,t.message]})]})}var z=`♫ Music Visualizer`,B=class{scene=new w;camera=new r(-1,1,1,-1,0,1);canvas;texture;material;quad;text={title:``,artist:``,watermark:!1};width=1;height=1;constructor(){this.canvas=document.createElement(`canvas`),this.texture=this.createTexture(),this.material=new M({map:this.texture,transparent:!0,depthTest:!1,depthWrite:!1,toneMapped:!1}),this.quad=new t(new d(2,2),this.material),this.scene.add(this.quad)}get isEmpty(){return!this.text.title&&!this.text.artist&&!this.text.watermark}setText(e){(e.title!==this.text.title||e.artist!==this.text.artist||e.watermark!==this.text.watermark)&&(this.text={...e},this.redraw())}setSize(e,t){(e!==this.width||t!==this.height)&&(this.width=e,this.height=t,this.texture.dispose(),this.texture=this.createTexture(),this.material.map=this.texture,this.redraw())}createTexture(){let e=new b(this.canvas);return e.colorSpace=``,e}redraw(){let{canvas:e,width:t,height:n,text:r}=this;e.width=t,e.height=n;let i=e.getContext(`2d`);if(!i)return;i.clearRect(0,0,t,n);let a=Math.min(t,n),o=a*.06,s=`"Segoe UI", Inter, system-ui, -apple-system, sans-serif`;i.textBaseline=`alphabetic`,i.shadowColor=`rgba(0, 0, 0, 0.6)`,i.shadowBlur=a*.012;let c=n-o;r.title&&(i.font=`700 ${Math.round(a*.05)}px ${s}`,i.fillStyle=`#ffffff`,i.textAlign=`left`,i.fillText(r.title,o,c,t-o*2),c-=a*.065),r.artist&&(i.font=`500 ${Math.round(a*.032)}px ${s}`,i.fillStyle=`rgba(255, 255, 255, 0.75)`,i.textAlign=`left`,i.fillText(r.artist.toUpperCase(),o,c,t-o*2)),r.watermark&&(i.font=`600 ${Math.round(a*.03)}px ${s}`,i.fillStyle=`rgba(255, 255, 255, 0.55)`,i.textAlign=`right`,i.fillText(z,t-o,o+a*.03)),this.texture.needsUpdate=!0}dispose(){this.texture.dispose(),this.material.dispose(),this.quad.geometry.dispose()}},V=class{renderer;overlay=new B;style=null;styleDefinition=null;width=1;height=1;constructor(e,t={}){this.renderer=new y({canvas:e,antialias:!0,preserveDrawingBuffer:t.preserveDrawingBuffer??!1}),this.renderer.outputColorSpace=N,this.renderer.setPixelRatio(1)}setStyle(e){e!==this.styleDefinition&&(this.style?.dispose(),this.style=e.create(),this.styleDefinition=e,this.style.resize(this.width,this.height))}setSize(e,t){e=Math.max(1,Math.round(e)),t=Math.max(1,Math.round(t)),(e!==this.width||t!==this.height)&&(this.width=e,this.height=t,this.renderer.setSize(e,t,!1),this.style?.resize(e,t),this.overlay.setSize(e,t))}setOverlay(e){this.overlay.setText(e)}render(e,t){this.style&&(this.style.update(e,t),this.renderer.autoClear=!0,this.renderer.render(this.style.scene,this.style.camera),this.overlay.isEmpty||(this.renderer.autoClear=!1,this.renderer.render(this.overlay.scene,this.overlay.camera)))}dispose(){this.style?.dispose(),this.overlay.dispose(),this.renderer.dispose()}},H=1920;function ie(e){let t=(0,F.useRef)(null),n=(0,F.useRef)(null),r=(0,F.useRef)(e);return(0,F.useEffect)(()=>{r.current=e}),(0,F.useEffect)(()=>{let e=t.current,i=n.current;if(!e||!i)return;let a=new V(i),o=l(),s=l(),c=0,u=()=>{let{frameWidth:t,frameHeight:n}=r.current,o=t/n,s=e.clientWidth,c=e.clientHeight,l=s,u=s/o;u>c&&(u=c,l=c*o),i.style.width=`${Math.floor(l)}px`,i.style.height=`${Math.floor(u)}px`;let d=Math.min(window.devicePixelRatio||1,H/Math.max(l,u));a.setSize(l*d,u*d)},d=new ResizeObserver(u);d.observe(e);let f=0,p=()=>{let e=r.current,t=e.frameWidth/e.frameHeight;t!==f&&(f=t,u()),a.setStyle(e.style),a.setOverlay(e.overlay);let n=e.analysis?O(e.analysis,e.getTime(),s):ae(o,performance.now()/1e3);a.render(n,e.params),c=requestAnimationFrame(p)};return c=requestAnimationFrame(p),()=>{cancelAnimationFrame(c),d.disconnect(),a.dispose()}},[]),(0,R.jsx)(`div`,{className:`preview-stage`,ref:t,children:(0,R.jsx)(`canvas`,{className:`preview-canvas`,ref:n})})}function ae(e,t){e.time=t,e.bass=.25+.1*Math.sin(t*1.3),e.mid=.2,e.treble=.15,e.rms=.2,e.energy=t*.2,e.beatPulse=0;for(let n=0;n<e.spectrum.length;n++)e.spectrum[n]=.25+.15*Math.sin(t*2+n*.3);return e}var U=[{id:`neon`,name:`Неон`,colors:[`#ff2bd6`,`#2bd2ff`,`#7a5cff`],background:`#07020f`},{id:`sunset`,name:`Закат`,colors:[`#ff6b35`,`#f7c548`,`#d81b60`],background:`#120408`},{id:`ocean`,name:`Океан`,colors:[`#00e5ff`,`#1de9b6`,`#2962ff`],background:`#010a14`},{id:`acid`,name:`Кислота`,colors:[`#b6ff00`,`#00ff9d`,`#faff00`],background:`#040800`},{id:`mono`,name:`Монохром`,colors:[`#ffffff`,`#8a8a8a`,`#d0d0d0`],background:`#050505`}];function oe(e){return U.find(t=>t.id===e)??U[0]}function W(e){let t=parseInt(e.slice(1),16);return new s((t>>16&255)/255,(t>>8&255)/255,(t&255)/255)}function G(e,t){let n=oe(t);e.uColorA.value.copy(W(n.colors[0])),e.uColorB.value.copy(W(n.colors[1])),e.uColorC.value.copy(W(n.colors[2])),e.uBackground&&e.uBackground.value.copy(W(n.background))}function K(){return{uColorA:{value:new s},uColorB:{value:new s},uColorC:{value:new s},uBackground:{value:new s}}}function se(e){let t={};for(let n of e.params)t[n.key]=n.default;return t}function q(e,t,n){let r=e[t];return typeof r==`number`?r:n}function J(e,t,n){let r=e[t];return typeof r==`string`?r:n}var ce=`
  ${C}
  uniform float uAspect;
  uniform float uTravel;
  uniform float uTwist;
  uniform float uDistortion;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uBeat;
  uniform float uIntensity;
  uniform float uFlash;
  uniform float uHue;
  varying vec2 vUv;

  void main() {
    // Координаты с центром в середине кадра; по короткой стороне -1..1
    vec2 p = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0) / min(uAspect, 1.0);
    float angle = atan(p.y, p.x);
    float radius = length(p);

    // Искажение формы: стенки «дышат» волнами по окружности (середина частот)
    radius *= 1.0 + uDistortion * 0.18 * sin(angle * 3.0 + uTravel * 2.0) * (0.3 + uMid);

    float depth = 0.4 / max(radius, 0.001);
    float v = depth + uTravel; // координата вдоль туннеля — по ней мы «летим»

    // Плазма: сумма синусов. У угла только целые множители, чтобы на шве
    // atan (угол ±π) не было разрыва.
    float plasma = sin(angle * 3.0 + v * 2.0 + depth * uTwist)
                 + sin(v * 5.0 - uTravel)
                 + sin(angle * 5.0 - v * 3.0 + depth * uTwist * 0.5)
                 + sin(v * 1.5 + angle * 2.0);
    plasma *= 0.25; // примерно -1..1

    // Цвет — из палитры, яркость — тоже от плазмы: так появляются тёмные
    // «провалы» между светлыми пятнами и картинка не пересвечена
    vec3 color = paletteColor(uHue + plasma * 0.5 + v * 0.03);
    color *= 0.2 + 1.0 * pow(0.5 + 0.5 * plasma, 1.5);

    // Спиральные «рёбра» вдоль стенок — благодаря им читается форма туннеля
    float ribs = pow(abs(sin(angle * 6.0 + depth * uTwist)), 24.0);
    color += paletteColor(uHue + 0.33) * ribs * 0.35;

    // Светящиеся кольца поперёк туннеля — от верхних частот
    float rings = pow(abs(sin(v * 3.14159)), 40.0);
    color += paletteColor(uHue + 0.5) * rings * (0.15 + 1.2 * uTreble) * uIntensity;

    // Глубина: центр (дальний конец) тёмный, на басу туннель ярче
    float fog = smoothstep(0.05, 0.9, radius);
    color *= fog * (0.6 + 0.7 * uBass * uIntensity);

    // Виньетка по краям кадра
    color *= 1.0 - 0.5 * smoothstep(1.0, 2.0, radius);

    // Вспышка на ударе
    color += paletteColor(uHue + 0.2) * uBeat * uFlash * 0.3;

    gl_FragColor = vec4(color, 1.0);
  }
`;function le(){let e=new w,n=new r(-1,1,1,-1,0,1),i={...K(),uAspect:{value:1},uTravel:{value:0},uTwist:{value:1},uDistortion:{value:1},uBass:{value:0},uMid:{value:0},uTreble:{value:0},uBeat:{value:0},uIntensity:{value:1},uFlash:{value:1},uHue:{value:0}},a=new t(new d(2,2),new u({uniforms:i,vertexShader:E,fragmentShader:ce,depthWrite:!1,depthTest:!1}));return a.frustumCulled=!1,e.add(a),{scene:e,camera:n,update(e,t){G(i,J(t,`palette`,`sunset`));let n=q(t,`speed`,1),r=(e.time*.35+e.energy*1.4)*n;i.uTravel.value=r,i.uTwist.value=q(t,`twist`,1),i.uDistortion.value=q(t,`distortion`,1),i.uBass.value=e.bass,i.uMid.value=e.mid,i.uTreble.value=e.treble,i.uBeat.value=e.beatPulse,i.uIntensity.value=q(t,`intensity`,1),i.uFlash.value=q(t,`flash`,1),i.uHue.value=r*.02},resize(e,t){i.uAspect.value=e/t},dispose(){a.geometry.dispose(),a.material.dispose()}}}var ue={id:`plasma-tunnel`,name:`Плазменный туннель`,description:`Полёт по плазменному туннелю: скорость от энергии трека, кольца от верхов.`,params:[{type:`palette`,key:`palette`,label:`Палитра`,default:`sunset`},{type:`number`,key:`intensity`,label:`Интенсивность`,min:0,max:2,step:.05,default:1},{type:`number`,key:`speed`,label:`Скорость`,min:0,max:3,step:.05,default:1},{type:`number`,key:`twist`,label:`Закрутка`,min:-4,max:4,step:.1,default:1},{type:`number`,key:`distortion`,label:`Искажение`,min:0,max:2,step:.05,default:1},{type:`number`,key:`flash`,label:`Вспышки на ударах`,min:0,max:2,step:.05,default:1}],create:le},Y=2500,de=`
  ${C}
  uniform vec3 uBackground;
  uniform float uAspect;
  uniform float uBass;
  uniform float uBeat;
  uniform float uFlash;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float glow = exp(-dot(p, p) * 3.0); // мягкое пятно света в центре
    vec3 color = uBackground + paletteColor(0.66) * glow * (0.12 + 0.25 * uBass);
    color += paletteColor(0.0) * uBeat * uFlash * 0.12;
    gl_FragColor = vec4(color, 1.0);
  }
`,fe=`
  ${k}
  uniform float uPhase;
  uniform float uBass;
  uniform float uMid;
  uniform float uBeat;
  uniform float uIntensity;
  varying vec3 vViewPosition;
  varying float vDisplacement;

  void main() {
    // Крупные «волны» от баса + мелкая рябь от середины + толчок на ударе
    float big = valueNoise(normal * 1.6 + vec3(0.0, 0.0, uPhase));
    float small = valueNoise(normal * 4.5 - vec3(uPhase * 1.3));
    float displacement = big * (0.06 + 0.42 * uBass * uIntensity)
                       + small * 0.1 * uMid * uIntensity
                       + 0.15 * uBeat * uIntensity;
    vDisplacement = displacement;

    vec3 displaced = position * (1.0 + displacement);
    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    vViewPosition = viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`,pe=`
  ${C}
  uniform float uBeat;
  uniform float uFlash;
  uniform float uHue;
  varying vec3 vViewPosition;
  varying float vDisplacement;

  void main() {
    // Нормаль считаем по производным позиции в экранном пространстве (dFdx/dFdy):
    // так освещение учитывает деформацию, и получается «гранёный» вид.
    vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    vec3 viewDir = normalize(-vViewPosition);
    float light = max(dot(normal, normalize(vec3(0.4, 0.8, 0.6))), 0.0);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0); // свечение по краю

    vec3 base = paletteColor(uHue + vDisplacement * 1.5);
    vec3 color = base * (0.2 + 0.8 * light) + paletteColor(uHue + 0.33) * fresnel * 1.3;
    color += vec3(1.0) * uBeat * uFlash * 0.35;
    gl_FragColor = vec4(color, 1.0);
  }
`,me=`
  attribute float aSeed;
  uniform float uPhase;
  uniform float uBass;
  uniform float uTreble;
  uniform float uBeat;
  uniform float uIntensity;
  uniform float uPointScale;
  varying float vSeed;
  varying float vSparkle;

  void main() {
    vSeed = aSeed;
    // Каждая частица вращается вокруг оси Y со своей скоростью
    float angle = uPhase * (0.2 + 0.4 * aSeed);
    float c = cos(angle);
    float s = sin(angle);
    vec3 p = vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z);
    // Разлёт на басу и ударах
    p *= 1.0 + 0.25 * uBass * uIntensity + 0.35 * uBeat * uIntensity;

    // Мерцание от верхних частот: у каждой частицы своя фаза
    vSparkle = 0.5 + 0.5 * sin(uPhase * 20.0 + aSeed * 60.0);
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    float size = 3.0 + 6.0 * uTreble * vSparkle;
    gl_PointSize = size * uPointScale * (6.0 / -viewPosition.z); // дальние — меньше
    gl_Position = projectionMatrix * viewPosition;
  }
`,he=`
  ${C}
  uniform float uOpacity;
  uniform float uTreble;
  varying float vSeed;
  varying float vSparkle;

  void main() {
    // Круглая мягкая точка вместо квадрата
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.0, d);
    vec3 color = paletteColor(vSeed);
    gl_FragColor = vec4(color, alpha * uOpacity * (0.5 + 0.5 * uTreble * vSparkle));
  }
`;function ge(e){let t=e;return()=>(t=t*1664525+1013904223>>>0,t/2**32)}function _e(){let e=ge(7),t=new Float32Array(Y*3),n=new Float32Array(Y);for(let r=0;r<Y;r++){let i=e()*2-1,a=e()*Math.PI*2,o=Math.sqrt(1-i*i),s=1.6+e()*1.8;t[r*3]=o*Math.cos(a)*s,t[r*3+1]=i*s,t[r*3+2]=o*Math.sin(a)*s,n[r]=e()}let r=new A;return r.setAttribute(`position`,new D(t,3)),r.setAttribute(`aSeed`,new D(n,1)),r}function ve(){let e=new w,r=new n(45,1,.1,100),i={...K(),uPhase:{value:0},uBass:{value:0},uMid:{value:0},uTreble:{value:0},uBeat:{value:0},uIntensity:{value:1},uFlash:{value:1},uHue:{value:0},uAspect:{value:1},uPointScale:{value:1},uOpacity:{value:1}},a=new t(new d(2,2),new u({uniforms:i,vertexShader:E,fragmentShader:de,depthWrite:!1,depthTest:!1}));a.frustumCulled=!1,a.renderOrder=-1,e.add(a);let o=new t(new S(1,40),new u({uniforms:i,vertexShader:fe,fragmentShader:pe}));e.add(o);let s=new T(_e(),new u({uniforms:i,vertexShader:me,fragmentShader:he,transparent:!0,depthWrite:!1,blending:2}));return e.add(s),{scene:e,camera:r,update(e,t){let n=q(t,`speed`,1);G(i,J(t,`palette`,`neon`));let r=(e.time*.25+e.energy*.9)*n;i.uPhase.value=r,i.uBass.value=e.bass,i.uMid.value=e.mid,i.uTreble.value=e.treble,i.uBeat.value=e.beatPulse,i.uIntensity.value=q(t,`intensity`,1),i.uFlash.value=q(t,`flash`,1),i.uOpacity.value=q(t,`particles`,1),i.uHue.value=r*.03,o.rotation.y=r*.3,o.rotation.x=Math.sin(r*.2)*.3},resize(e,t){let n=e/t;r.aspect=n;let a=p.degToRad(r.fov/2);r.position.set(0,0,3.1/(Math.tan(a)*Math.min(1,n))),r.lookAt(0,0,0),r.updateProjectionMatrix(),i.uAspect.value=n,i.uPointScale.value=t/1080},dispose(){for(let e of[a,o,s])e.geometry.dispose(),e.material.dispose()}}}var ye={id:`pulse-sphere`,name:`Дышащая сфера`,description:`Сфера «дышит» басом, вспыхивает на ударах, вокруг — облако частиц.`,params:[{type:`palette`,key:`palette`,label:`Палитра`,default:`neon`},{type:`number`,key:`intensity`,label:`Интенсивность`,min:0,max:2,step:.05,default:1},{type:`number`,key:`speed`,label:`Скорость`,min:0,max:3,step:.05,default:1},{type:`number`,key:`flash`,label:`Вспышки на ударах`,min:0,max:2,step:.05,default:1},{type:`number`,key:`particles`,label:`Частицы`,min:0,max:2,step:.05,default:1}],create:ve},X=64,Z=128,be=1.3,xe=`
  attribute float aAngle;
  attribute float aLevel;
  attribute float aBin;
  uniform float uRadius;
  uniform float uLength;
  uniform float uWidth;
  uniform float uRotation;
  varying float vAlong;
  varying float vBin;
  varying float vLevel;

  void main() {
    // position — вершина прямоугольника: x в -0.5..0.5, y в 0..1
    float barLength = 0.015 + aLevel * uLength;
    float r = uRadius + position.y * barLength;
    float angle = aAngle + uRotation;
    vec2 outward = vec2(sin(angle), cos(angle));
    vec2 sideways = vec2(cos(angle), -sin(angle));
    vec2 p = outward * r + sideways * position.x * uWidth;

    vAlong = position.y;
    vBin = aBin;
    vLevel = aLevel;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
  }
`,Se=`
  ${C}
  uniform float uHue;
  varying float vAlong;
  varying float vBin;
  varying float vLevel;

  void main() {
    vec3 color = paletteColor(uHue + vBin / 64.0 * 0.8);
    // К кончику столбик светлее, громкие столбики ярче
    color *= 0.55 + 0.6 * vAlong + 0.4 * vLevel;
    gl_FragColor = vec4(color, 1.0);
  }
`,Ce=`
  ${C}
  uniform vec3 uBackground;
  uniform vec2 uHalfSize;
  uniform float uRadius;
  uniform float uBass;
  uniform float uBeat;
  uniform float uGlow;
  uniform float uHue;
  uniform float uRotation;
  varying vec2 vUv;

  void main() {
    // Те же мировые координаты, что видит ортографическая камера
    vec2 p = (vUv - 0.5) * 2.0 * uHalfSize;
    float d = length(p);
    float angle = atan(p.x, p.y);
    vec3 color = uBackground;

    // Мягкие лучи, медленно вращающиеся вместе с кольцом
    float rays = 0.5 + 0.5 * sin(angle * 12.0 + uRotation * 2.0);
    color += paletteColor(uHue + 0.5) * rays * exp(-d * 1.8) * 0.06 * uGlow;

    // Свечение вокруг кольца — сильнее на басу
    float ringGlow = exp(-pow((d - uRadius) * 6.0, 2.0));
    color += paletteColor(uHue) * ringGlow * (0.15 + 0.5 * uBass) * uGlow;

    // Диск в центре
    float disc = smoothstep(uRadius * 0.92, uRadius * 0.9, d);
    vec3 discColor = mix(uBackground, paletteColor(uHue + 0.33), 0.15 + 0.35 * uBass);
    discColor *= 1.0 - 0.5 * d / uRadius; // к краю диск темнее — видна «глубина»
    color = mix(color, discColor, disc);

    // Кольцо-волна: на ударе рождается у края диска и расходится наружу
    float waveRadius = uRadius + (1.0 - uBeat) * 0.9;
    float wave = exp(-pow((d - waveRadius) * 40.0, 2.0)) * uBeat;
    color += paletteColor(uHue + 0.66) * wave * uGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`;function we(){let e=new d(1,1).translate(0,.5,0),t=new v;t.index=e.index,t.setAttribute(`position`,e.getAttribute(`position`));let n=new Float32Array(Z),r=new Float32Array(Z);for(let e=0;e<Z;e++){let t=e<X,i=t?e:127-e,a=(i+.5)/X*Math.PI;n[e]=t?a:-a,r[e]=i}t.setAttribute(`aAngle`,new x(n,1)),t.setAttribute(`aBin`,new x(r,1));let i=new x(new Float32Array(Z),1);return i.setUsage(te),t.setAttribute(`aLevel`,i),t.instanceCount=Z,t}function Te(){let e=new w,n=new r(-1,1,1,-1,-1,1),a={...K(),uHalfSize:{value:new i(1,1)},uRadius:{value:.5},uLength:{value:.5},uWidth:{value:.02},uRotation:{value:0},uBass:{value:0},uBeat:{value:0},uGlow:{value:1},uHue:{value:0}},o=new t(new d(2,2),new u({uniforms:a,vertexShader:E,fragmentShader:Ce,depthWrite:!1,depthTest:!1}));o.frustumCulled=!1,o.renderOrder=-1,e.add(o);let s=we(),c=new t(s,new u({uniforms:a,vertexShader:xe,fragmentShader:Se}));c.frustumCulled=!1,e.add(c);let l=s.getAttribute(`aLevel`);return{scene:e,camera:n,update(e,t){let n=q(t,`intensity`,1);G(a,J(t,`palette`,`ocean`));for(let t=0;t<Z;t++){let n=t<X?t:127-t;l.array[t]=(e.spectrum[n]??0)**1.6}l.needsUpdate=!0;let r=q(t,`rotation`,.25),i=(e.time*.15+e.energy*.4)*r;a.uRotation.value=i,a.uRadius.value=.5+.07*e.bass*n+.03*e.beatPulse,a.uLength.value=.55*n,a.uWidth.value=2*Math.PI*.5/Z*q(t,`barWidth`,.6),a.uBass.value=e.bass,a.uBeat.value=e.beatPulse,a.uGlow.value=q(t,`glow`,1),a.uHue.value=i*.05},resize(e,t){let r=e/t,i=be/Math.min(1,r),o=i*r;n.left=-o,n.right=o,n.top=i,n.bottom=-i,n.updateProjectionMatrix(),a.uHalfSize.value.set(o,i)},dispose(){for(let e of[o,c])e.geometry.dispose(),e.material.dispose()}}}var Q=[ye,{id:`spectrum-ring`,name:`Кольцевой спектр`,description:`Спектр по кругу, пульсирующий диск в центре и волна на каждом ударе.`,params:[{type:`palette`,key:`palette`,label:`Палитра`,default:`ocean`},{type:`number`,key:`intensity`,label:`Интенсивность`,min:0,max:2,step:.05,default:1},{type:`number`,key:`rotation`,label:`Скорость вращения`,min:0,max:3,step:.05,default:.25},{type:`number`,key:`barWidth`,label:`Ширина столбиков`,min:.15,max:1,step:.05,default:.6},{type:`number`,key:`glow`,label:`Свечение`,min:0,max:2,step:.05,default:1}],create:Te},ue];function Ee(e){return Q.find(t=>t.id===e)??Q[0]}function De({style:e,params:t,onStyleChange:n,onParamChange:r,onReset:i}){return(0,R.jsxs)(`section`,{className:`panel`,children:[(0,R.jsx)(`h2`,{children:`Стиль`}),(0,R.jsx)(`div`,{className:`style-list`,children:Q.map(t=>(0,R.jsxs)(`button`,{className:`style-card ${t.id===e.id?`is-active`:``}`,onClick:()=>n(t.id),children:[(0,R.jsx)(`strong`,{children:t.name}),(0,R.jsx)(`span`,{children:t.description})]},t.id))}),(0,R.jsx)(`div`,{className:`params`,children:e.params.map(e=>{if(e.type===`palette`)return(0,R.jsxs)(`div`,{className:`field`,children:[(0,R.jsx)(`span`,{className:`field-label`,children:e.label}),(0,R.jsx)(`div`,{className:`palette-list`,children:U.map(n=>(0,R.jsx)(`button`,{className:`palette-swatch ${t[e.key]===n.id?`is-active`:``}`,style:{background:`linear-gradient(135deg, ${n.colors[0]}, ${n.colors[1]}, ${n.colors[2]})`},title:n.name,"aria-label":n.name,onClick:()=>r(e.key,n.id)},n.id))})]},e.key);let n=Number(t[e.key]??e.default);return(0,R.jsxs)(`label`,{className:`field`,children:[(0,R.jsxs)(`span`,{className:`field-label`,children:[e.label,(0,R.jsx)(`output`,{children:n.toFixed(2)})]}),(0,R.jsx)(`input`,{type:`range`,min:e.min,max:e.max,step:e.step,value:n,onChange:t=>r(e.key,Number(t.target.value))})]},e.key)})}),(0,R.jsx)(`button`,{className:`link-button`,onClick:i,children:`Сбросить параметры`})]})}function Oe(e){let[t,n]=(0,F.useState)(!1),r=e.loading!==null;return(0,R.jsxs)(`section`,{className:`panel`,children:[(0,R.jsx)(`h2`,{children:`Трек`}),(0,R.jsxs)(`label`,{className:`drop-zone ${t?`is-over`:``} ${r?`is-busy`:``}`,onDragOver:e=>{e.preventDefault(),n(!0)},onDragLeave:()=>n(!1),onDrop:t=>{t.preventDefault(),n(!1);let i=t.dataTransfer.files[0];i&&!r&&e.onFile(i)},children:[(0,R.jsx)(`input`,{type:`file`,accept:`audio/*,.mp3,.wav,.ogg`,disabled:r,"data-testid":`audio-file-input`,onChange:t=>{let n=t.target.files?.[0];n&&e.onFile(n),t.target.value=``}}),e.fileName?(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(`strong`,{className:`file-name`,children:e.fileName}),(0,R.jsxs)(`span`,{children:[P(e.duration),` · ударов найдено: `,e.onsetCount]})]}):(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(`strong`,{children:`Перетащите аудиофайл сюда`}),(0,R.jsx)(`span`,{children:`или нажмите, чтобы выбрать (mp3, wav, ogg)`})]})]}),e.loading&&(0,R.jsxs)(`div`,{className:`progress`,role:`status`,children:[(0,R.jsx)(`div`,{className:`progress-label`,children:e.loading.message}),(0,R.jsx)(`div`,{className:`progress-bar`,children:(0,R.jsx)(`div`,{style:{width:`${Math.round(e.loading.progress*100)}%`}})})]}),e.error&&(0,R.jsx)(`p`,{className:`error`,children:e.error}),(0,R.jsx)(`button`,{className:`link-button`,onClick:e.onDemo,disabled:r,children:`Нет файла под рукой? Включить демо-трек`}),(0,R.jsxs)(`label`,{className:`field`,children:[(0,R.jsx)(`span`,{className:`field-label`,children:`Исполнитель`}),(0,R.jsx)(`input`,{type:`text`,value:e.artist,onChange:t=>e.onArtistChange(t.target.value)})]}),(0,R.jsxs)(`label`,{className:`field`,children:[(0,R.jsx)(`span`,{className:`field-label`,children:`Название`}),(0,R.jsx)(`input`,{type:`text`,value:e.title,onChange:t=>e.onTitleChange(t.target.value)})]})]})}function ke({analysis:e,duration:t,isPlaying:n,disabled:r,getTime:i,onTogglePlay:a,onSeek:o}){let[s,c]=(0,F.useState)(0);(0,F.useEffect)(()=>{let e=0,t=()=>{c(i()),e=requestAnimationFrame(t)};return t(),()=>cancelAnimationFrame(e)},[i]);let l=t>0?s/t*100:0;return(0,R.jsxs)(`div`,{className:`transport`,children:[(0,R.jsx)(`button`,{className:`play-button`,onClick:a,disabled:r,"aria-label":n?`Пауза`:`Играть`,title:`Пробел — играть/пауза`,children:n?`❚❚`:`▶`}),(0,R.jsxs)(`div`,{className:`timeline`,children:[(0,R.jsx)(Ae,{analysis:e}),(0,R.jsx)(`div`,{className:`timeline-progress`,style:{width:`${l}%`}}),(0,R.jsx)(`input`,{type:`range`,className:`timeline-input`,min:0,max:t||1,step:.01,value:s,disabled:r,onChange:e=>o(Number(e.target.value)),"aria-label":`Позиция в треке`})]}),(0,R.jsxs)(`span`,{className:`time`,children:[P(s),` / `,P(t)]})]})}function Ae({analysis:e}){let t=(0,F.useRef)(null);return(0,F.useEffect)(()=>{let n=t.current;if(!n)return;let r=n.width=600,i=n.height=40,a=n.getContext(`2d`);if(!a||(a.clearRect(0,0,r,i),!e))return;let o=e.frameCount/r;a.fillStyle=`rgba(255, 255, 255, 0.22)`;for(let t=0;t<r;t++){let n=0,r=Math.floor(t*o),s=Math.max(r+1,Math.floor((t+1)*o));for(let t=r;t<s&&t<e.frameCount;t++)n=Math.max(n,e.rms[t]);let c=Math.max(1,n*i);a.fillRect(t,(i-c)/2,1,c)}},[e]),(0,R.jsx)(`canvas`,{className:`loudness-strip`,ref:t})}var $=class extends Error{constructor(){super(`Экспорт отменён`),this.name=`ExportCanceledError`}},je=[`video/webm;codecs=vp9,opus`,`video/webm;codecs=vp8,opus`,`video/webm`,`video/mp4`];function Me(){return typeof MediaRecorder<`u`&&`captureStream`in HTMLCanvasElement.prototype}async function Ne(e,t,n){let r=je.find(e=>MediaRecorder.isTypeSupported(e));if(!r)throw Error(`MediaRecorder не поддерживает ни один из видеоформатов`);let i=document.createElement(`canvas`);i.width=e.width,i.height=e.height;let a=new V(i,{preserveDrawingBuffer:!0});a.setSize(e.width,e.height),a.setStyle(e.style),a.setOverlay(e.overlay);let o=new AudioContext({sampleRate:e.audio.sampleRate}),s=o.createMediaStreamDestination(),c=o.createBufferSource();c.buffer=e.audio,c.connect(s);let u=i.captureStream(e.fps),d=new MediaStream([...u.getVideoTracks(),...s.stream.getAudioTracks()]),f=new MediaRecorder(d,{mimeType:r,videoBitsPerSecond:12e6}),p=[];f.ondataavailable=e=>{e.data.size>0&&p.push(e.data)};let ee=new Promise(e=>{f.onstop=()=>e()}),m=l(e.analysis.spectrumBins),h=!1,g=!1;try{await o.resume(),f.start(1e3);let r=o.currentTime+.05;c.start(r,e.startTime,e.duration),g=!0,await new Promise(i=>{let s=()=>{if(n.aborted){h=!0,i();return}let c=Math.max(0,o.currentTime-r);O(e.analysis,e.startTime+c,m),a.render(m,e.params),t(Math.min(1,c/e.duration)),c>=e.duration?i():requestAnimationFrame(s)};requestAnimationFrame(s)}),f.stop(),await ee}finally{g&&c.stop();for(let e of d.getTracks())e.stop();await o.close(),a.dispose()}if(h)throw new $;return t(1),{blob:new Blob(p,{type:r}),fileExtension:r.startsWith(`video/mp4`)?`mp4`:`webm`,description:`${r} · MediaRecorder (в реальном времени)`}}var Pe=`modulepreload`,Fe=function(e,t){return new URL(e,t).href},Ie={},Le=function(e){return e.pathname.endsWith(`.css`)},Re=function(e,t,n){if(t in e)return e[t];let r=n();if(!r){e[t]=void 0;return}let i=r.then(()=>{e[t]=void 0},n=>{throw e[t]=void 0,n});return e[t]=i,i},ze=function(e,t,n){let r=Promise.resolve();if(t&&t.length>0){let e,i=document.querySelector(`meta[property=csp-nonce]`),a=i?.nonce||i?.getAttribute(`nonce`);function o(e){return Promise.all(e.map(e=>Promise.resolve(e).then(e=>({status:`fulfilled`,value:e}),e=>({status:`rejected`,reason:e}))))}function s(e){return import.meta.resolve?new URL(import.meta.resolve(e)):new URL(e,import.meta.url)}r=o(t.map(t=>{t=Fe(t,n);let r=s(t),i=Le(r);return Re(Ie,r.href,()=>{if(e===void 0){e={all:new Set,styles:new Set};let t=document.getElementsByTagName(`link`);for(let n=t.length-1;n>=0;n--){let r=t[n];e.all.add(r.href),r.rel===`stylesheet`&&e.styles.add(r.href)}}if((i?e.styles:e.all).has(r.href))return;let t=document.createElement(`link`);if(t.rel=i?`stylesheet`:Pe,i||(t.as=`script`),t.crossOrigin=``,t.href=r.href,a&&t.setAttribute(`nonce`,a),document.head.appendChild(t),i)return new Promise((e,n)=>{t.addEventListener(`load`,e),t.addEventListener(`error`,()=>n(Error(`Unable to preload CSS for ${r}`)))})})}).filter(e=>e!==void 0))}function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>{for(let e of t||[])e.status===`rejected`&&i(e.reason);return e().catch(i)})};function Be(){let e={};for(let t of Q)e[t.id]=se(t);return e}function Ve(){let[t,n]=(0,F.useState)(null),[r,i]=(0,F.useState)(null),[s,l]=(0,F.useState)(``),[u,d]=(0,F.useState)(``),[f,p]=(0,F.useState)(``),[g,_]=(0,F.useState)(null),[v,y]=(0,F.useState)(``),b=(0,F.useRef)(null),[te,x]=(0,F.useState)(!1),[S,C]=(0,F.useState)(Q[0].id),[w,T]=(0,F.useState)(Be),E=Ee(S),D=w[S],[O,k]=(0,F.useState)({resolutionId:`16x9`,fps:30,length:0,method:`auto`,watermark:!0}),[A,j]=(0,F.useState)({state:`idle`}),M=(0,F.useRef)(null),N=ne(O.resolutionId),P=()=>(b.current||(b.current=new c(new AudioContext),b.current.onEnded=()=>x(!1)),b.current),I=(0,F.useCallback)(()=>b.current?.currentTime??0,[]),L=async e=>{P().load(e),x(!1),i(null),n(e),_({message:`Анализ звука…`,progress:0});let t=await m(o(e),e.sampleRate,e=>_({message:`Анализ звука…`,progress:e}));i(t),_(null)},z=async e=>{y(``),_({message:`Декодирование…`,progress:0});try{let t=await h(e,P().context),n=a(e.name);l(e.name),p(n.artist),d(n.title),await L(t)}catch(e){console.error(e),_(null),y(`Не удалось прочитать файл. Поддерживаются mp3, wav и ogg (зависит от браузера).`)}},B=async()=>{y(``);let e=ee(P().context);l(`Демо-трек (синтезирован в браузере)`),p(`Music Visualizer`),d(`Демо, 120 BPM`),await L(e)},V=(0,F.useCallback)(()=>{let e=b.current;e&&e.duration&&(e.isPlaying?(e.pause(),x(!1)):(e.play(),x(!0)))},[]);(0,F.useEffect)(()=>{let e=e=>{let t=e.target;e.code!==`Space`||t.closest(`input, select, textarea, button`)||(e.preventDefault(),V())};return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[V]);let H=(e,t)=>{T(n=>({...n,[S]:{...n[S],[e]:t}}))},ae=()=>{T(e=>({...e,[S]:se(E)}))},U={title:u,artist:f,watermark:O.watermark},oe=async()=>{let n=b.current;if(!t||!r||!n)return;n.pause(),x(!1);let i=O.length===0?0:n.currentTime,a=O.length===0?t.duration:Math.min(O.length,t.duration-i),o={audio:t,analysis:r,style:E,params:D,overlay:U,width:N.width,height:N.height,fps:O.fps,startTime:i,duration:a},s=new AbortController;M.current=s;let c=performance.now(),l=e=>j({state:`running`,progress:e,startedAt:c});l(0);try{let{exportMp4:t,findMp4Codecs:n}=await ze(async()=>{let{exportMp4:e,findMp4Codecs:t}=await import(`./exportMp4-bElS_cxe.js`);return{exportMp4:e,findMp4Codecs:t}},__vite__mapDeps([0,1]),import.meta.url),r=O.method===`auto`?await n(o):null,i;if(r)i=await t(o,r,l,s.signal);else if(Me())i=await Ne(o,l,s.signal);else throw Error(`Браузер не поддерживает ни WebCodecs, ни MediaRecorder`);let a=`${e([f,u].filter(Boolean).join(` - `)||`visualizer`)} (${N.width}x${N.height}).${i.fileExtension}`,d=URL.createObjectURL(i.blob);j(e=>(e.state===`done`&&URL.revokeObjectURL(e.url),{state:`done`,url:d,fileName:a,size:i.blob.size,description:i.description,seconds:(performance.now()-c)/1e3}))}catch(e){e instanceof $?j({state:`canceled`}):(console.error(e),j({state:`error`,message:e instanceof Error?e.message:String(e)}))}finally{M.current=null}},W=t!==null&&r!==null;return(0,R.jsxs)(`div`,{className:`app`,children:[(0,R.jsxs)(`header`,{className:`app-header`,children:[(0,R.jsx)(`h1`,{children:`Music Visualizer`}),(0,R.jsx)(`p`,{children:`Загрузите трек, выберите стиль — получите видео для YouTube, Shorts и ВК. Всё считается в браузере.`})]}),(0,R.jsxs)(`main`,{className:`workspace`,children:[(0,R.jsxs)(`div`,{className:`preview-column`,children:[(0,R.jsx)(ie,{analysis:r,style:E,params:D,overlay:U,frameWidth:N.width,frameHeight:N.height,getTime:I}),(0,R.jsx)(ke,{analysis:r,duration:t?.duration??0,isPlaying:te,disabled:!W,getTime:I,onTogglePlay:V,onSeek:e=>b.current?.seek(e)})]}),(0,R.jsxs)(`aside`,{className:`sidebar`,children:[(0,R.jsx)(Oe,{fileName:s,duration:t?.duration??0,onsetCount:r?.onsetTimes.length??0,loading:g,error:v,title:u,artist:f,onFile:z,onDemo:B,onTitleChange:d,onArtistChange:p}),(0,R.jsx)(De,{style:E,params:D,onStyleChange:C,onParamChange:H,onReset:ae}),(0,R.jsx)(re,{settings:O,status:A,canExport:W&&A.state!==`running`,onChange:k,onExport:oe,onCancel:()=>M.current?.abort()})]})]})]})}(0,I.createRoot)(document.getElementById(`root`)).render((0,R.jsx)(F.StrictMode,{children:(0,R.jsx)(Ve,{})}));export{V as n,$ as t};
import{B as e,D as t,E as n,F as r,G as i,H as a,I as o,J as s,L as c,M as l,N as u,P as d,R as f,S as p,T as m,U as h,W as g,X as _,Y as v,Z as y,a as b,c as x,d as S,j as ee,k as C,l as w,m as te,n as ne,p as T,q as re,r as ie,t as ae,u as E,v as D,w as O,y as k}from"./jsx-runtime-BC_uw-yA.js";import{o as A,r as oe}from"./game-m8ds1agn.js";var j=y(),se=_(),ce=[{id:`outline`,label:`Неоновый контур`},{id:`duotone`,label:`Зелёный дуотон`},{id:`comic`,label:`Комикс`},{id:`original`,label:`Оригинал`}],M={outline:0,duotone:1,comic:2,original:3},le=`#2fd8cf`,N=[le,le,le],P=`#b84dff`,F=`#ffc933`,ue=[`A`,`S`,`D`],de=[`#3dff9e`,`#2ef2d0`,`#9dffc4`,`#d9fff0`],I=.94,L=-.68,R=.62,z=.05,B=1.9,V=6,fe=.42,H=.6,U=Math.sin(H),pe=.62,me=`#ffffff`,he=`#0d4a48`,ge=`#ffffff`,W=6,_e=.5,G=48,ve=4,ye=2.7,be=.62,xe=.75,K=160,Se=.45,Ce=8,we=.32,Te=`
  ${ie}
  uniform sampler2D uVideo;
  uniform bool uHasVideo;
  uniform int uLook;
  uniform float uViewAspect;
  uniform float uVideoAspect;
  uniform vec2 uTexel;
  uniform float uBass;
  uniform float uBeat;
  uniform float uTrackTime;
  uniform float uEnergy;
  uniform float uDim;
  uniform float uHueShift;
  uniform float uFocus;
  uniform float uTension;
  uniform float uStillness;
  uniform float uStreak;
  uniform float uOverdrive;
  uniform float uSpread;
  uniform float uBundle;
  uniform float uBend;
  uniform float uHitY;
  uniform vec2 uVanish;
  uniform vec3 uTierColor;
  varying vec2 vUv;

  float luma(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  // Поворот оттенка: цвет раскладывается на яркость и две цветовые оси (YIQ),
  // оси поворачиваются на угол, и яркость кадра при этом не меняется
  vec3 rotateHue(vec3 color, float angle) {
    float y = dot(color, vec3(0.299, 0.587, 0.114));
    float i = dot(color, vec3(0.596, -0.274, -0.322));
    float q = dot(color, vec3(0.211, -0.523, 0.312));
    float c = cos(angle);
    float s = sin(angle);
    float rotatedI = i * c - q * s;
    float rotatedQ = i * s + q * c;
    return vec3(
      y + 0.956 * rotatedI + 0.621 * rotatedQ,
      y - 0.272 * rotatedI - 0.647 * rotatedQ,
      y - 1.106 * rotatedI + 1.703 * rotatedQ
    );
  }

  // Кадр заполняет экран без искажений: лишнее обрезается, как у object-fit: cover
  vec2 coverUv(vec2 uv) {
    vec2 scale = uViewAspect > uVideoAspect
      ? vec2(1.0, uVideoAspect / uViewAspect)
      : vec2(uViewAspect / uVideoAspect, 1.0);
    return (uv - 0.5) * scale + 0.5;
  }

  // Оператор Собеля: где яркость резко меняется, там контур предмета
  float edges(vec2 uv) {
    vec2 t = uTexel * 1.5;
    float topLeft = luma(texture2D(uVideo, uv + vec2(-t.x, t.y)).rgb);
    float top = luma(texture2D(uVideo, uv + vec2(0.0, t.y)).rgb);
    float topRight = luma(texture2D(uVideo, uv + vec2(t.x, t.y)).rgb);
    float left = luma(texture2D(uVideo, uv + vec2(-t.x, 0.0)).rgb);
    float right = luma(texture2D(uVideo, uv + vec2(t.x, 0.0)).rgb);
    float bottomLeft = luma(texture2D(uVideo, uv + vec2(-t.x, -t.y)).rgb);
    float bottom = luma(texture2D(uVideo, uv + vec2(0.0, -t.y)).rgb);
    float bottomRight = luma(texture2D(uVideo, uv + vec2(t.x, -t.y)).rgb);
    float gx = topRight + 2.0 * right + bottomRight - topLeft - 2.0 * left - bottomLeft;
    float gy = topLeft + 2.0 * top + topRight - bottomLeft - 2.0 * bottom - bottomRight;
    return length(vec2(gx, gy));
  }

  vec3 styledClip(vec2 uv) {
    vec3 source = texture2D(uVideo, uv).rgb;
    float brightness = luma(source);

    if (uLook == 0) {
      vec3 base = vec3(0.0, 0.06, 0.06) + source * 0.12;
      return base + vec3(0.2, 0.85, 0.6) * smoothstep(0.14, 0.7, edges(uv));
    }
    if (uLook == 1) {
      float steps = floor(brightness * 5.0) / 5.0;
      return mix(vec3(0.0, 0.08, 0.09), vec3(0.45, 1.0, 0.65), steps);
    }
    if (uLook == 2) {
      // Точечный растр, как в печатном комиксе, плюс чёрные контуры
      vec3 flat3 = floor(source * 4.0) / 4.0;
      vec2 grid = fract(gl_FragCoord.xy / 6.0) - 0.5;
      float dots = smoothstep(0.34, 0.3, length(grid)) * (1.0 - brightness);
      return (flat3 * (1.0 - 0.45 * dots)) * (1.0 - smoothstep(0.2, 0.55, edges(uv)));
    }
    return source;
  }

  // Клипа нет: полёт сквозь космос из той же точки, откуда выходят дорожки
  vec3 spaceFlight() {
    vec2 p = (vUv * 2.0 - 1.0) * vec2(uViewAspect, 1.0) - uVanish;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float depth = 1.0 / max(radius, 0.02);
    float travel = uTrackTime * 0.5 + uEnergy * 1.2;

    // Звёзды тянутся лучами: случайная яркость по секторам круга, бегущая к зрителю
    float sector = floor(angle * 40.0);
    float seed = fract(sin(sector * 91.7) * 4375.85);
    float streak = smoothstep(0.82, 1.0, seed) * smoothstep(0.75, 1.0, fract(depth * 0.35 + travel * (0.5 + seed)));

    float cloud = valueNoise(vec3(cos(angle) * 1.5, sin(angle) * 1.5, depth * 0.25 + travel * 0.5));
    vec3 color = mix(vec3(0.0, 0.03, 0.05), vec3(0.03, 0.34, 0.26), smoothstep(-0.2, 0.7, cloud));

    // Кольца на басу бегут от центра к краям кадра
    float rings = pow(0.5 + 0.5 * sin(depth * 2.0 + travel * 6.0), 12.0);
    color += uTierColor * rings * (0.05 + 0.3 * uBass) * smoothstep(0.1, 0.5, radius);
    color += vec3(0.7, 1.0, 0.9) * streak;
    return color * smoothstep(0.0, 0.35, radius + 0.15);
  }

  void main() {
    // Лёгкий наезд камеры на басу и сдвиг каналов на ударе вместо вспышек
    vec2 uv = coverUv(vUv);
    uv = (uv - 0.5) / (1.0 + 0.03 * uBass + 0.07 * uTension) + 0.5;

    vec3 color;
    if (uHasVideo) {
      float shift = 0.002 * uBeat;
      color = vec3(
        styledClip(uv + vec2(shift, 0.0)).r,
        styledClip(uv).g,
        styledClip(uv - vec2(shift, 0.0)).b
      );
    } else {
      color = spaceFlight();
    }
    color = rotateHue(color, uHueShift);

    // Немного снижаем насыщенность: долгая игра не должна утомлять глаза.
    // В паузе песни цвет уходит сильнее, как будто всё замирает.
    color = mix(vec3(luma(color)), color, 0.72 - 0.5 * uStillness);

    // Коридор за дорожками: клип там приглушён, чтобы взгляд оставался на нотах
    vec2 screen = (vUv * 2.0 - 1.0) * vec2(uViewAspect, 1.0);
    float closeness = max((uVanish.y - screen.y) / (uVanish.y - uHitY), 0.0);
    float spacing = uBundle + (uSpread - uBundle) * pow(closeness, uBend);
    float corridor = 1.0 - smoothstep(1.2, 2.6, abs(screen.x) / spacing);
    color *= 1.0 - corridor * uFocus * 0.88;

    // На разгоне края кадра темнеют и внимание стягивается к центру
    float edgeDark = smoothstep(0.5, 1.5, length(screen) / max(uViewAspect, 1.0));
    color *= 1.0 - 0.6 * uTension * edgeDark;
    color *= 1.0 - 0.5 * uStillness;

    // Награда за серию: сверху, из точки схода дорожек, разгорается корона лучей.
    // Она не зависит от яркости клипа: это сигнал игроку, а не часть видео.
    vec2 fromTop = screen - uVanish;
    float crownAngle = atan(fromTop.x, -fromTop.y);
    float crownRays = pow(0.5 + 0.5 * sin(crownAngle * 16.0 + uTrackTime * 1.2), 5.0);
    float crownFade = exp(-length(fromTop) * (2.6 - 1.3 * uStreak));
    vec3 crownColor = mix(vec3(0.62, 0.28, 1.0), vec3(1.0, 0.78, 0.25), uOverdrive);
    vec3 crown = crownColor * crownFade * uStreak * (0.3 + 0.8 * crownRays) * (0.75 + 0.45 * uBeat);

    gl_FragColor = vec4(color * uDim + crown, 1.0);
  }
`,Ee=`
  uniform float uViewAspect;
  uniform float uVanishY;
  uniform float uHitY;
  uniform float uSpread;
  uniform float uContrast;
  uniform float uTrackTime;
  uniform float uBeat;
  uniform vec3 uTierColor;
  uniform vec3 uLaneColors[3];
  uniform float uLaneGlow[3];
  uniform float uLaneBad[3];
  uniform float uBundle;
  uniform float uBend;
  uniform float uTension;
  uniform float uStillness;
  uniform float uStreak;
  uniform float uOverdrive;
  uniform vec3 uBeams[6];
  uniform float uBeamHeld[6];
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * vec2(uViewAspect, 1.0);
    // Близость к игроку: 0 вверху пучка, 1 на линии нажатия
    float closeness = (uVanishY - p.y) / (uVanishY - uHitY);
    if (closeness <= 0.0) discard;

    // Расстояние между дорожками растёт по степени: отсюда плавный изгиб.
    // Деление на него превращает кривой веер в три ровные полосы.
    float spacing = uBundle + (uSpread - uBundle) * pow(closeness, uBend);
    float laneCoord = p.x / spacing + 1.5;
    if (laneCoord < 0.0 || laneCoord > 3.0) discard;
    int lane = int(min(floor(laneCoord), 2.0));
    float fromCenter = abs(fract(laneCoord) - 0.5);

    // Сглаживаем края на ширину пикселя: иначе тонкие линии вверху рябят
    float pixel = fwidth(laneCoord);
    const float TUBE = 0.31;
    float inside = 1.0 - smoothstep(TUBE - pixel, TUBE + pixel, fromCenter);
    float rail = 1.0 - smoothstep(0.012, 0.03 + pixel, abs(fromCenter - TUBE));
    float halo = exp(-max(fromCenter - TUBE, 0.0) * 30.0) * (1.0 - inside);

    // Бегущие блики внутри трубки показывают движение к игроку
    float distanceAway = 1.0 / closeness;
    float pulse = smoothstep(0.8, 1.0, fract(distanceAway * 1.6 + uTrackTime * (1.4 + 2.5 * uTension + 1.5 * uStreak)));

    // В суперрежиме дорожки становятся золотыми: это видно боковым зрением
    vec3 laneColor = mix(uLaneColors[lane], vec3(1.0, 0.78, 0.25), uOverdrive * 0.85);
    float fade = smoothstep(0.0, 0.1, closeness);

    vec3 color = laneColor * (0.06 + 0.1 * uBeat + 0.28 * pulse);
    float alpha = inside * uContrast * 0.85 * fade;

    color = mix(color, laneColor * (0.82 + 0.5 * uTension), rail);
    alpha = max(alpha, rail * fade);
    color = mix(color, laneColor, halo * (1.0 - rail));
    alpha = max(alpha, halo * (0.3 + 0.25 * uBeat + 0.45 * uStreak) * fade);

    // Лучи нот с удержанием: сплошной поток света по оси трубки
    for (int i = 0; i < 6; i++) {
      if (int(uBeams[i].x) != lane) continue;
      if (closeness > uBeams[i].y || closeness < uBeams[i].z) continue;
      float width = 0.2 + 0.05 * sin(distanceAway * 9.0 - uTrackTime * 12.0) * uBeamHeld[i];
      float core = 1.0 - smoothstep(width * 0.3, width, fromCenter);
      // Луч того же цвета, что и обычная нота: это продолжение ноты, а не дорожка
      vec3 beamColor = mix(vec3(0.72, 0.3, 1.0), vec3(1.0), 0.1 + 0.45 * uBeamHeld[i]);
      color = mix(color, beamColor, core);
      alpha = max(alpha, core * (0.75 + 0.25 * uBeamHeld[i]));
    }

    color += laneColor * uLaneGlow[lane] * inside * (0.3 + 0.7 * closeness);
    alpha = max(alpha, uLaneGlow[lane] * 0.7 * inside * fade);
    color = mix(color, vec3(1.0, 0.22, 0.3), uLaneBad[lane] * 0.75 * inside);
    alpha = max(alpha, uLaneBad[lane] * 0.6 * inside * fade);

    gl_FragColor = vec4(color, alpha * (1.0 - 0.6 * uStillness));
  }
`,De=`
  uniform vec3 uColor;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vRadius;

  void main() {
    #ifdef USE_INSTANCING
      mat4 toWorld = modelMatrix * instanceMatrix;
    #else
      mat4 toWorld = modelMatrix;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = uColor;
    #endif
    vNormal = normalize(mat3(toWorld) * normal);
    vRadius = length(position.xz);
    vec4 world = toWorld * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,Oe=`
  uniform float uOpacity;
  uniform float uShimmer;
  uniform float uTime;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vRadius;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDirection = normalize(vec3(-0.25, 0.8, 0.55));
    float light = max(dot(normal, lightDirection), 0.0);
    float shine = pow(light, 30.0);
    float rim = pow(1.0 - max(normal.z, 0.0), 3.0);
    vec3 base = vColor;

    // Перелив: цвет зависит от наклона поверхности и времени, как у перламутра.
    // Оттенок гуляет только в пурпурной гамме, поэтому нота остаётся узнаваемой.
    if (uShimmer > 0.5) {
      float wave = 0.5 + 0.5 * sin(dot(normal, vec3(2.4, 3.2, 1.6)) + vWorld.x * 4.0 + vWorld.y * 3.0 + uTime * 2.2);
      base = mix(vec3(0.5, 0.2, 1.0), vec3(1.0, 0.32, 0.9), wave);
      base = mix(base, vec3(0.35, 0.65, 1.0), smoothstep(0.82, 1.0, wave) * 0.45);
    }

    vec3 color = base * (0.32 + 0.85 * light) + vec3(1.0) * shine * 0.7 + base * rim * 0.4;

    // Затенение в лунке: чем ближе к центру, тем глубже и темнее
    if (uShimmer > 0.5) color *= 0.42 + 0.58 * smoothstep(0.02, 0.36, vRadius);

    gl_FragColor = vec4(color, uOpacity);
  }
`;function q(e,t=!0,n=!1){return new u({uniforms:{uColor:{value:ze(e)},uOpacity:{value:1},uShimmer:{value:+!!n},uTime:{value:0}},vertexShader:De,fragmentShader:Oe,transparent:!0,depthTest:t,depthWrite:t})}function ke(e,t){let n=new T(e,{depth:t,bevelEnabled:!0,bevelSize:.025,bevelThickness:.025,bevelSegments:3});return n.translate(0,0,-t/2),n.rotateX(-Math.PI/2),n}function Ae(){let e=[new o(0,.015),new o(.14,.02),new o(.28,.05),new o(.38,.1),new o(.45,.125),new o(.495,.1),new o(.5,.05),new o(.5,-.1),new o(0,-.1)];return new k(e.reverse(),48)}function je(){let e=document.createElement(`canvas`);e.width=512,e.height=128;let t=e.getContext(`2d`);if(t){let n=t.createLinearGradient(0,0,0,e.height);n.addColorStop(0,`#ffffff`),n.addColorStop(1,`#cfe9ff`),t.fillStyle=n,t.strokeStyle=`#6fb7ff`,t.lineWidth=8,t.beginPath(),t.roundRect(6,6,e.width-12,e.height-12,40),t.fill(),t.stroke(),t.font=`800 72px "Segoe UI", system-ui, sans-serif`,t.textAlign=`center`,t.textBaseline=`middle`,t.fillStyle=`#0d3a5c`,t.fillText(`SPACE`,e.width/2,e.height/2+4)}let n=new x(e);return n.colorSpace=``,n}var Me=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,Ne=`
  uniform sampler2D uMap;
  uniform float uDissolve;
  varying vec2 vUv;

  void main() {
    vec4 texel = texture2D(uMap, vUv);
    // Сумма синусов даёт плавные пятна: плашка тает неравномерно, но без резких краёв
    float cloud = 0.5 + 0.25 * sin(vUv.x * 7.0 + 1.3) + 0.25 * sin(vUv.y * 5.0 + vUv.x * 3.0);
    float fade = 1.0 - smoothstep(cloud - 0.55, cloud + 0.55, uDissolve * 1.6 - 0.3);
    gl_FragColor = vec4(mix(vec3(0.85, 0.95, 1.0), texel.rgb, fade), texel.a * fade);
  }
`;function Pe(){let e=document.createElement(`canvas`);e.width=96,e.height=96;let t=e.getContext(`2d`);if(t){let e=t.createRadialGradient(48,48,96*.2,48,48,48);e.addColorStop(0,`rgba(255,255,255,0.6)`),e.addColorStop(1,`rgba(255,255,255,0)`),t.fillStyle=e,t.fillRect(0,0,96,96)}let n=new x(e);return n.colorSpace=``,n}function Fe(){let e=new d;return e.moveTo(-.46,-.13),e.lineTo(.04,-.13),e.lineTo(.04,-.31),e.lineTo(.46,0),e.lineTo(.04,.31),e.lineTo(.04,.13),e.lineTo(-.46,.13),e.closePath(),ke(e,.14)}function Ie(){let e=new d;for(let t=0;t<10;t++){let n=t%2==0?.5:.23,r=t/10*Math.PI*2+Math.PI/2,i=Math.cos(r)*n,a=Math.sin(r)*n;t===0?e.moveTo(i,a):e.lineTo(i,a)}return e.closePath(),ke(e,.14)}function Le(e){let t=document.createElement(`canvas`);t.width=128,t.height=128;let n=t.getContext(`2d`);n&&(n.font=`700 64px "Segoe UI", system-ui, sans-serif`,n.textAlign=`center`,n.textBaseline=`middle`,n.fillStyle=`#ffffff`,n.fillText(e,64,68));let r=new x(t);return r.colorSpace=``,r}function Re(){let e=[];for(let t=0;t<V;t++)e.push(new c(-1,0,0));return e}function ze(e){let t=parseInt(e.slice(1),16);return new c((t>>16&255)/255,(t>>8&255)/255,(t&255)/255)}var Be=class{renderer;clipScene=new l;scene=new l;screenCamera=new t(-1,1,1,-1,0,1);camera=new t(-1,1,1,-1,-1,1);sharedUniforms={uViewAspect:{value:1},uTrackTime:{value:0},uBeat:{value:0},uTierColor:{value:ze(de[0])},uSpread:{value:R},uBundle:{value:z},uBend:{value:B},uHitY:{value:L},uTension:{value:0},uStillness:{value:0},uStreak:{value:0},uOverdrive:{value:0}};clipUniforms={...this.sharedUniforms,uVideo:{value:null},uHasVideo:{value:!1},uLook:{value:0},uVideoAspect:{value:1},uTexel:{value:new o(1/1280,1/720)},uBass:{value:0},uEnergy:{value:0},uDim:{value:.55},uHueShift:{value:0},uFocus:{value:.85},uVanish:{value:new o(0,I)}};fanUniforms={...this.sharedUniforms,uVanishY:{value:I},uContrast:{value:.75},uLaneColors:{value:N.map(ze)},uLaneGlow:{value:[0,0,0]},uLaneBad:{value:[0,0,0]},uBeams:{value:Re()},uBeamHeld:{value:Array(V).fill(0)}};tapNotes;plainCoins;noteHalos;spaceBars=[];spaceBurst;spaceBurstAt=-1/0;swipeNotes;starNotes;noteShadows;flyingArrows=[];sparkMesh;fanGroup=new te;targets=[];sparks=[];shockwaves=[];helper=new n;color=new E;videoTexture=null;nextSpark=0;nextShockwave=0;nextArrow=0;spread=R;lastRenderAt=0;constructor(e){this.renderer=new b({canvas:e,antialias:!0}),this.renderer.outputColorSpace=p,this.renderer.autoClear=!1,this.clipScene.add(this.createScreenQuad(Te,this.clipUniforms,!1));let t=this.createScreenQuad(Ee,this.fanUniforms,!0);this.fanGroup.add(t),this.scene.add(this.fanGroup);for(let e=0;e<3;e++)this.targets.push(this.createTarget(e));let n=new S(.5,.5,.2,40),r=Fe();this.tapNotes=new D(Ae(),q(`#ffffff`,!0,!0),G),this.plainCoins=new D(n,q(`#ffffff`),G),this.swipeNotes=new D(r,q(`#ffffff`),G),this.starNotes=new D(Ie(),q(`#ffffff`),G),this.noteShadows=new D(new w(.5,32),new m({color:`#000000`,transparent:!0,opacity:.5,depthTest:!1}),96),this.noteShadows.frustumCulled=!1,this.noteShadows.renderOrder=2.5,this.noteShadows.count=0,this.scene.add(this.noteShadows),this.noteHalos=new D(new C(1,1),new m({map:Pe(),transparent:!0,depthTest:!1,depthWrite:!1,blending:2}),G),this.noteHalos.frustumCulled=!1,this.noteHalos.renderOrder=2.6,this.noteHalos.count=0;for(let e=0;e<G;e++)this.noteHalos.setColorAt(e,this.color.set(P));this.scene.add(this.noteHalos);for(let e of[this.tapNotes,this.plainCoins,this.swipeNotes,this.starNotes]){e.frustumCulled=!1,e.renderOrder=3;for(let t=0;t<G;t++)e.setColorAt(t,this.color.set(`#ffffff`));this.scene.add(e)}let i=new m({map:je(),transparent:!0,depthTest:!1,side:2}),a=new C(1,1);this.spaceBurst=new O(new C(1,1),new u({uniforms:{uMap:{value:i.map},uDissolve:{value:0}},vertexShader:Me,fragmentShader:Ne,transparent:!0,depthTest:!1,side:2})),this.spaceBurst.rotation.x=H-Math.PI/2,this.spaceBurst.visible=!1,this.spaceBurst.frustumCulled=!1,this.spaceBurst.renderOrder=6,this.scene.add(this.spaceBurst);for(let e=0;e<ve;e++){let e=new O(a,i);e.rotation.x=H-Math.PI/2,e.visible=!1,e.frustumCulled=!1,e.renderOrder=2.9,this.spaceBars.push(e),this.scene.add(e)}for(let e=0;e<W;e++){let e=new O(r,q(ge));e.rotation.order=`ZXY`,e.visible=!1,e.frustumCulled=!1,e.renderOrder=6,this.flyingArrows.push({mesh:e,bornAt:-1/0,startX:0,direction:1}),this.scene.add(e)}this.sparkMesh=new D(new w(.012,8),new m({transparent:!0,depthTest:!1,blending:2}),K),this.sparkMesh.frustumCulled=!1,this.sparkMesh.renderOrder=5,this.sparkMesh.count=0;for(let e=0;e<K;e++)this.sparkMesh.setColorAt(e,this.color.set(`#ffffff`)),this.sparks.push({x:0,y:0,speedX:0,speedY:0,bornAt:-1/0,color:new E});this.scene.add(this.sparkMesh);for(let e=0;e<Ce;e++){let e=new O(new ee(.88,1,48),new m({transparent:!0,depthTest:!1,side:2}));e.visible=!1,e.renderOrder=4,this.shockwaves.push({mesh:e,bornAt:-1/0}),this.scene.add(e)}}createScreenQuad(e,t,n){let r=new O(new C(2,2),new u({uniforms:t,vertexShader:ne,fragmentShader:e,transparent:n,depthTest:!1,depthWrite:!1}));return r.frustumCulled=!1,r}createTarget(e){let t=new te;t.position.y=L,t.rotation.x=H-Math.PI/2;let n=new O(new w(.19,48),new m({color:`#031311`,transparent:!0,opacity:.9,depthTest:!1})),i=new m({color:N[e],transparent:!0,opacity:.16,depthTest:!1,depthWrite:!1}),a=new O(new w(.15,48),i),o=new O(new r(.175,.04,16,64),q(N[e],!1)),s=new O(new C(.15,.15),new m({map:Le(ue[e]),transparent:!0,depthTest:!1})),c=2;for(let e of[n,a,o,s])e.renderOrder=c,c+=.1,t.add(e);return this.scene.add(t),{group:t,light:i,squash:1,jolt:0}}setSize(e,t){this.renderer.setSize(e,t,!1);let n=e/t;this.camera.left=-n,this.camera.right=n,this.camera.updateProjectionMatrix(),this.spread=Math.min(R,n*.8/1.5),this.sharedUniforms.uSpread.value=this.spread,this.sharedUniforms.uViewAspect.value=n}setVideo(e){this.videoTexture?.dispose(),this.videoTexture=null,e&&(this.videoTexture=new f(e),this.videoTexture.colorSpace=``),this.clipUniforms.uVideo.value=this.videoTexture,this.clipUniforms.uHasVideo.value=e!==null}setHueShift(e){this.clipUniforms.uHueShift.value=e}setMood(e,t){this.sharedUniforms.uTension.value+=(e-this.sharedUniforms.uTension.value)*.15,this.sharedUniforms.uStillness.value+=(t-this.sharedUniforms.uStillness.value)*.25}setStreak(e,t){this.sharedUniforms.uStreak.value+=(e-this.sharedUniforms.uStreak.value)*.06;let n=+!!t;this.sharedUniforms.uOverdrive.value+=(n-this.sharedUniforms.uOverdrive.value)*.1}spaceHitEffect(e){this.spaceBurstAt=e,this.spaceBurst.visible=!0;for(let e=0;e<3;e++)this.targets[e].light.opacity=1,this.pressEffect(e)}spacePressEffect(){for(let e=0;e<3;e++)this.pressEffect(e)}updateSpaceBurst(e){let t=(e-this.spaceBurstAt)/xe;if(t>=1){this.spaceBurst.visible=!1;return}let n=1+.35*(1-(1-t)**2);this.spaceBurst.position.set(0,L+.04*t,0),this.spaceBurst.scale.set(this.spread*ye*n,this.spread*be*n,1),this.spaceBurst.material.uniforms.uDissolve.value=t}impactEffect(e){for(let t=0;t<3;t++)this.addShockwave(t,N[t],e),this.fanUniforms.uLaneGlow.value[t]=.8,this.targets[t].squash=1.2}launchArrow(e,t,n){let r=this.flyingArrows[this.nextArrow];this.nextArrow=(this.nextArrow+1)%W,r.bornAt=n,r.startX=this.laneX(e),r.direction=t,r.mesh.visible=!0}setClipOptions(e,t,n,r){this.clipUniforms.uFocus.value=r,this.clipUniforms.uLook.value=M[e],this.clipUniforms.uDim.value=t,this.fanUniforms.uContrast.value=n}laneX(e){return(e-1)*this.spread}spacingAt(e){return z+(this.spread-z)*e**+B}closenessAt(e,t){return 1/(1+Math.max(e,-t*.1)/t*6)}laneAt(e){return e<-this.spread/2?0:e>this.spread/2?2:1}pressEffect(e){this.targets[e].squash=.8,this.fanUniforms.uLaneGlow.value[e]=Math.max(this.fanUniforms.uLaneGlow.value[e],.45)}hitEffect(e,t,n){this.fanUniforms.uLaneGlow.value[e]=1,this.targets[e].squash=t?1.22:1.12,this.targets[e].light.opacity=1;let r=t?`#ffffff`:P;this.addShockwave(e,r,n),t&&this.addShockwave(e,P,n-.08);let i=t?14:8;for(let r=0;r<i;r++){let i=this.sparks[this.nextSpark];this.nextSpark=(this.nextSpark+1)%K;let a=Math.PI*(.08+.84*Math.random()),o=(t?1.5:1)*(.5+Math.random());i.x=this.laneX(e),i.y=L,i.speedX=Math.cos(a)*o,i.speedY=Math.sin(a)*o,i.bornAt=n,i.color.set(r%3==0?`#ffffff`:P)}}missEffect(e){this.fanUniforms.uLaneBad.value[e]=1,this.targets[e].jolt=1}addShockwave(e,t,n){let r=this.shockwaves[this.nextShockwave];this.nextShockwave=(this.nextShockwave+1)%Ce,r.bornAt=n,r.mesh.position.set(this.laneX(e),L,0),r.mesh.material.color.set(t),r.mesh.visible=!0}render(e,t,n,r,i,a,o,s,c,l,u){let d=Math.min(s-this.lastRenderAt,.1);this.lastRenderAt=s,this.sharedUniforms.uTrackTime.value=e.time,this.sharedUniforms.uBeat.value=e.beatPulse,this.sharedUniforms.uTierColor.value.copy(ze(de[c-1])),this.clipUniforms.uBass.value=e.bass,this.clipUniforms.uEnergy.value=e.energy,t&&t.videoWidth>0&&(this.clipUniforms.uVideoAspect.value=t.videoWidth/t.videoHeight,this.clipUniforms.uTexel.value.set(1/t.videoWidth,1/t.videoHeight)),this.updateLanes(a,e.beatPulse,d,u),this.updateNotes(e.time,n,r,i,o),this.updateBeams(e.time,n,r,i,o,u),this.emitHoldSparks(u,s),this.updateFlyingArrows(s),this.updateSpaceBurst(s),this.updateSparks(s),this.updateShockwaves(s),this.renderer.clear(),this.renderer.render(this.clipScene,this.screenCamera),l&&this.renderer.render(this.scene,this.camera)}updateLanes(e,t,n,r){let i=Math.exp(-n*7),a=1-Math.exp(-n*18);for(let n=0;n<3;n++){let o=r[n]!==null,s=o?.8:e[n]?.35:0;this.fanUniforms.uLaneGlow.value[n]=Math.max(s,this.fanUniforms.uLaneGlow.value[n]*i),this.fanUniforms.uLaneBad.value[n]*=i;let c=this.targets[n],l=e[n]?.86:1+.07*t;c.squash+=(l-c.squash)*a,c.jolt*=i,c.group.position.x=this.laneX(n)+Math.sin(c.jolt*18)*.03*c.jolt,c.group.scale.setScalar(c.squash*(this.spread/R)),c.light.opacity=Math.max(o?.85:e[n]?.5:.16,c.light.opacity*i)}}updateNotes(e,t,n,r,i){let a=0,o=0,s=0,c=0,l=0,u=0,d=0;this.helper.rotation.order=`ZXY`;for(let f=n;f<t.length;f++){let n=t[f],p=n.time-e;if(p>i)break;if(r.has(n.id))continue;let m=this.closenessAt(p,i),h=this.spacingAt(m),g=(n.lane-1)*h,_=I+-1.62*m,v=h/R*fe;if(n.kind===`space`){if(c<ve){let e=this.spaceBars[c];e.position.set(0,_,0),e.scale.set(h*ye,h*be,1),e.visible=!0,c+=1}continue}this.helper.position.set(g,_-v*.1,0),this.helper.rotation.set(0,0,0),this.helper.scale.set(v*1.08,v*1.08*U,1),this.helper.updateMatrix(),this.noteShadows.setMatrixAt(d,this.helper.matrix),d+=1,n.kind!==`swipe`&&(this.helper.position.set(g,_,0),this.helper.rotation.set(0,0,0),this.helper.scale.set(v*1.7,v*1.7*U,1),this.helper.updateMatrix(),this.noteHalos.setMatrixAt(s,this.helper.matrix),this.noteHalos.setColorAt(s,this.color.set(n.kind===`star`?F:P)),s+=1);let y=n.kind===`star`?e*3:0;if(this.helper.position.set(g,_,0),this.helper.rotation.set(H,y,0),this.helper.scale.setScalar(v),this.helper.updateMatrix(),n.kind===`star`?(this.starNotes.setMatrixAt(u,this.helper.matrix),this.starNotes.setColorAt(u,this.color.set(F)),u+=1):n.kind===`swipe`?(this.plainCoins.setMatrixAt(o,this.helper.matrix),this.plainCoins.setColorAt(o,this.color.set(me)),o+=1):(this.tapNotes.setMatrixAt(a,this.helper.matrix),this.tapNotes.setColorAt(a,this.color.set(P)),a+=1),n.kind===`swipe`){let e=v*.13;this.helper.position.set(g,_+e*Math.cos(H),e*Math.sin(H)),this.helper.rotation.set(H,n.direction<0?Math.PI:0,0),this.helper.scale.setScalar(v*pe),this.helper.updateMatrix(),this.swipeNotes.setMatrixAt(l,this.helper.matrix),this.swipeNotes.setColorAt(l,this.color.set(he)),l+=1}if(d>=G)break}for(let e=c;e<ve;e++)this.spaceBars[e].visible=!1;this.tapNotes.count=a,this.plainCoins.count=o,this.noteHalos.count=s,this.noteHalos.instanceMatrix.needsUpdate=!0,this.noteHalos.instanceColor&&(this.noteHalos.instanceColor.needsUpdate=!0),this.tapNotes.material.uniforms.uTime.value=e,this.swipeNotes.count=l,this.starNotes.count=u,this.noteShadows.count=d,this.noteShadows.instanceMatrix.needsUpdate=!0;for(let e of[this.tapNotes,this.plainCoins,this.swipeNotes,this.starNotes])e.instanceMatrix.needsUpdate=!0,e.instanceColor&&(e.instanceColor.needsUpdate=!0);this.helper.rotation.order=`XYZ`}updateBeams(e,t,n,r,i,a){let o=this.fanUniforms.uBeams.value,s=this.fanUniforms.uBeamHeld.value,c=0;for(let t of a){if(!t||c>=V)continue;let n=t.time+(t.duration??0);o[c].set(t.lane,1.05,this.closenessAt(n-e,i)),s[c]=1,c+=1}for(let a=n;a<t.length&&c<V;a++){let n=t[a],l=n.time-e;if(l>i)break;if(n.kind!==`hold`||r.has(n.id))continue;let u=l+(n.duration??0);o[c].set(n.lane,this.closenessAt(l,i),this.closenessAt(u,i)),s[c]=0,c+=1}for(let e=c;e<V;e++)o[e].set(-1,0,0)}emitHoldSparks(e,t){for(let n of e){if(!n)continue;let e=this.sparks[this.nextSpark];this.nextSpark=(this.nextSpark+1)%K;let r=Math.PI*(.2+.6*Math.random());e.x=this.laneX(n.lane),e.y=L,e.speedX=Math.cos(r)*.7,e.speedY=Math.sin(r)*1.1,e.bornAt=t,e.color.set(P)}}updateFlyingArrows(e){for(let t of this.flyingArrows){let n=(e-t.bornAt)/_e;if(n>=1){t.mesh.visible=!1;continue}let r=n*n,i=t.direction<0?Math.PI:0;t.mesh.position.set(t.startX+t.direction*r*3.2,L,.1),t.mesh.rotation.set(H,i,0),t.mesh.scale.setScalar(fe*pe*(this.spread/R)*(1+.9*n)),t.mesh.material.uniforms.uOpacity.value=1-n*n}}updateSparks(e){let t=0;for(let n of this.sparks){let r=e-n.bornAt;if(r>=Se)continue;let i=1-r/Se;this.helper.position.set(n.x+n.speedX*r,n.y+n.speedY*r-.8*r*r,0),this.helper.rotation.set(0,0,0),this.helper.scale.setScalar(.5+1.2*i),this.helper.updateMatrix(),this.sparkMesh.setMatrixAt(t,this.helper.matrix),this.sparkMesh.setColorAt(t,this.color.copy(n.color).multiplyScalar(i)),t+=1}this.sparkMesh.count=t,this.sparkMesh.instanceMatrix.needsUpdate=!0,this.sparkMesh.instanceColor&&(this.sparkMesh.instanceColor.needsUpdate=!0)}updateShockwaves(e){for(let t of this.shockwaves){let n=(e-t.bornAt)/we;if(n>=1||n<0){t.mesh.visible=n<0,t.mesh.material.opacity=0;continue}let r=(.17+.3*n)*(this.spread/R);t.mesh.scale.set(r,r*U,1),t.mesh.material.opacity=1-n}}dispose(){this.videoTexture?.dispose();for(let e of[this.scene,this.clipScene])e.traverse(e=>{if(e instanceof O){e.geometry.dispose();let t=e.material;t.uniforms===void 0&&t.map&&t.map.dispose(),t.dispose()}});this.renderer.dispose()}};function Ve(e,t){if(e.length===0)return 0;let n=Float32Array.from(e).sort();return n[Math.min(n.length-1,Math.floor(t*(n.length-1)))]}var He=.75,Ue=1.45,We=.4,Ge=8,Ke=.22,qe=4,Je=.3,Ye=.3,Xe=1,Ze=8,Qe=2.5,$e=1.06,J=2,et=.2,tt=5,nt=4,rt=8,it=.33,at=1,ot=1.3,st=.6,ct=.1,lt=1.5,Y=8,ut=.025,dt=.9,ft=.55,pt=1.7,mt=4;function ht(e){let t=e.frameCount,n=new Float64Array(t+1);for(let r=0;r<t;r++)n[r+1]=n[r]+(e.bass[r]+e.mid[r]+e.treble[r])/3;let r=Math.round(tt/2*e.fps),i=new Float32Array(t);for(let e=0;e<t;e++){let a=Math.max(0,e-r),o=Math.min(t,e+r);i[e]=(n[o]-n[a])/(o-a)}let a=Ve(i,.1),o=Ve(i,.9),s=Math.max(o-a,.001),c=new Float32Array(t);for(let e=0;e<t;e++)c[e]=Math.min(1,Math.max(0,(i[e]-a)/s));return c}function gt(e){let t=vt(e),n=Math.round(nt*e.fps),r=Math.round(rt*e.fps),i=Math.round(it*e.fps),a=Math.round(at*e.fps),o=[],s=[];for(let c=0;c<e.frameCount;c+=n){let n=Math.max(0,Math.min(c-Math.round(r/2),e.frameCount-r)),l=Math.min(e.frameCount,n+r),u=new Float32Array(a+1);for(let e=i;e<=a;e++)for(let r=n;r+e<l;r++)u[e]+=t[r]*t[r+e];o.push(u),s.push(n)}let c=new Float32Array(a+2);for(let e of o)c[_t(e,i,a)]+=1;let l=_t(c,i,a),u=[];for(let n=0;n<o.length;n++){let c=o[n],d=_t(c,i,a),f=_t(c,Math.max(i,l-1),Math.min(a,l+1)),p=c[f]>=c[d]*st?f:d,m=0;for(let e=i;e<=a;e++)m+=c[e];let h=m/(a-i+1),g=s[n],_=Math.min(e.frameCount,g+r),v=g,y=-1;for(let e=0;e<p;e++){let n=0;for(let r=g+e;r<_;r+=p)n+=t[r];n>y&&(y=n,v=g+e)}u.push({beatFrames:p,phaseFrame:v,confidence:h>0?c[p]/h:1})}return{windows:u,stepFrames:n}}function _t(e,t,n){let r=t;for(let i=t;i<=n;i++)e[i]>e[r]&&(r=i);return r}function vt(e){let t=new Float32Array(e.frameCount);for(let n=0;n<e.frameCount;n++){if(e.onsets[n]!==1)continue;let r=e.onsetStrength[n]+yt(e,n);for(let i=Math.max(0,n-2);i<=Math.min(e.frameCount-1,n+2);i++)t[i]=Math.max(t[i],r)}return t}function yt(e,t){return e.bass[Math.min(t+4,e.frameCount-1)]}function bt(e,t){let n=Math.min(e.windows.length-1,Math.round(t/e.stepFrames)),r=e.windows[n];if(r.confidence<ot)return t;let i=r.beatFrames/2;return Math.round(r.phaseFrame+Math.round((t-r.phaseFrame)/i)*i)}function xt(e,t){let n=Math.min(e.windows.length-1,Math.round(t/e.stepFrames));return e.windows[n].confidence>=ot}function St(e){let t=Ct(e),n=new Float64Array(t.length+1);for(let e=0;e<t.length;e++)n[e+1]=n[e]+t[e];let r=(r,i)=>{let a=Math.max(0,Math.round(r*e.fps)),o=Math.min(t.length,Math.round(i*e.fps));return o<=a?0:(n[o]-n[a])/(o-a)},i=Tt(e,t,r,Je);Et(e,i),i.sort((e,t)=>e.start-t.start);let a=Ot(e,r,i);kt(e,a),a.sort((e,t)=>e.start-t.start);let o=Mt([...i,...a],jt(e)),s=[...i,...a,...o];return s.sort((e,t)=>e.start-t.start),s}function Ct(e){return wt(e.raw.rms,e)}function wt(e,t){let n=Math.max(Ve(e,.95),.01),r=Math.round(et*t.fps),i=new Float32Array(t.frameCount);for(let t=0;t<i.length;t++){let a=0,o=Math.min(i.length-1,t+r);for(let n=Math.max(0,t-r);n<=o;n++)a=Math.max(a,e[n]);i[t]=Math.min(1,a/n)}return i}function Tt(e,t,n,r){let i=[],a=e.fps,o=Math.round(J*a),s=Math.round((e.duration-J)*a);for(;o<s;){let c=o/a,l=n(c-Xe,c);if(!(l>=Ye&&t[o]<l*r)){o+=1;continue}let u=o;for(;u<s&&t[u]<l*Math.min(r+.2,.8);)u+=1;let d=(u-o)/a,f=d+et*2>=Dt(e,c)*pt;d>=Ke&&d<=qe&&u<s&&f&&i.push({kind:`pause`,start:c,end:u/a}),o=u+1}return i}function Et(e,t){let n=wt(e.raw.bass,e),r=new Float64Array(n.length+1);for(let e=0;e<n.length;e++)r[e+1]=r[e]+n[e];let i=(t,i)=>{let a=Math.max(0,Math.round(t*e.fps)),o=Math.min(n.length,Math.round(i*e.fps));return o<=a?0:(r[o]-r[a])/(o-a)};for(let r of Tt(e,n,i,ft)){let e=!1;for(let n of t)r.start<n.end&&r.end>n.start&&(e=!0);e||t.push(r)}}function Dt(e,t){let n=[],r=-1;for(let i of e.onsetTimes){if(i>t)break;i<t-mt||(r>=0&&n.push(i-r),r=i)}return n.length===0?0:(n.sort((e,t)=>e-t),n[Math.floor(n.length/2)])}function Ot(e,t,n){let r=[];for(let t of n){let n=Pt(e,t.end);r.push({kind:`impact`,start:n,end:n})}let i=-1,a=0,o=()=>{if(i<0)return;let t=!0;for(let e of r)Math.abs(e.start-i)<Ge&&(t=!1);if(t){let t=Pt(e,i);r.push({kind:`impact`,start:t,end:t})}i=-1,a=0};for(let n=J;n<e.duration-J;n+=.1){let e=t(n-He,n),r=t(n,n+He),s=r/Math.max(e,.05);s>=Ue&&r>=We?s>a&&(a=s,i=n):o()}return o(),r.sort((e,t)=>e.start-t.start),r}function kt(e,t){let n=At(e),r=Math.round(lt/ct),i=new Float32Array(n.length);for(let e=r;e<n.length-r;e++){let t=0;for(let i=0;i<Y;i++){let a=0,o=0;for(let t=1;t<=r;t++)a+=n[e-t][i],o+=n[e+t-1][i];t+=Math.abs(o-a)/r}i[e]=t/Y}let a=Math.max(ut,Ve(i,dt)),o=[];for(let e=r;e<i.length-r;e++)i[e]>=a&&i[e]>=i[e-1]&&i[e]>i[e+1]&&o.push(e);o.sort((e,t)=>i[t]-i[e]);for(let n of o){let r=n*ct;if(r<J||r>e.duration-J)continue;let i=!0;for(let e of t)Math.abs(e.start-r)<Ge&&(i=!1);if(i){let n=Pt(e,r);t.push({kind:`impact`,start:n,end:n})}}}function At(e){let t=e.spectrumBins,n=Math.max(1,Math.round(ct*e.fps)),r=Math.floor(t/Y),i=Math.floor(e.frameCount/n),a=[];for(let o=0;o<i;o++){let i=new Float32Array(Y);for(let a=o*n;a<(o+1)*n;a++)for(let n=0;n<Y;n++)for(let o=0;o<r;o++)i[n]+=e.spectrum[a*t+n*r+o];for(let e=0;e<Y;e++)i[e]/=n*r;a.push(i)}return a}function jt(e){let t=new Float64Array(e.frameCount+1);for(let n=0;n<e.frameCount;n++){let r=0;for(let t=0;t<e.spectrumBins;t++)r+=e.spectrum[n*e.spectrumBins+t];t[n+1]=t[n]+r/e.spectrumBins}return(n,r)=>{let i=Math.max(0,Math.round(n*e.fps)),a=Math.min(e.frameCount,Math.round(r*e.fps));return a<=i?0:(t[a]-t[i])/(a-i)}}function Mt(e,t){let n=[];for(let r of e){if(r.kind===`impact`&&Nt(r,e))continue;let i=r.start,a=i;for(;i-a<Ze&&a-1>=J;){let e=t(a-1,a);if(t(a-2,a-1)>e*1.02)break;--a}i-a>=Qe&&t(i-1,i)>t(a,a+1)*$e&&n.push({kind:`buildup`,start:a,end:i})}return n}function Nt(e,t){for(let n of t)if(n.kind===`pause`&&Math.abs(n.end-e.start)<.5)return!0;return!1}function Pt(e,t){let n=t,r=.25;for(let i of e.onsetTimes){let e=Math.abs(i-t);e<r&&(r=e,n=i)}return n}var Ft=[{id:`auto`,label:`Авто`},{id:`voice`,label:`По голосу`},{id:`beat`,label:`По ритму`}],It=[{id:`easy`,label:`Лёгкая`,minGapSec:.45,arrowEvery:3,pairEvery:0,canFail:!1},{id:`normal`,label:`Средняя`,minGapSec:.3,arrowEvery:2,pairEvery:11,canFail:!0},{id:`hard`,label:`Сложная`,minGapSec:.18,arrowEvery:2,pairEvery:7,canFail:!0}],Lt=17,Rt=14,zt=.9,Bt=3,Vt=.1,Ht=2.5,Ut=.6,Wt=[0,1,2,1],Gt=.2,Kt=1.9,qt=.7,Jt=.55,Yt=3,Xt=1.2,Zt=.45,Qt=5,$t=1.5,en=15,tn=.45,nn=.55;function rn(e){for(let t of It)if(t.id===e)return t;return It[0]}function an(e,t,n=`auto`){let r=St(e),i=ht(e),a=pn(e,t,r,i,n),o=xn(e,a),s=[],c=1,l=0,u=0;for(let n=0;n<a.length;n++){let d=a[n]/e.fps,f=(n===0||d-a[n-1]/e.fps>=nn)&&(n===a.length-1||a[n+1]/e.fps-d>=nn)&&i[a[n]]<=tn&&!X(d,r);f&&(u+=1);let p=f&&u%t.arrowEvery===0,m=!p&&(n+1)%Lt===0;p&&(c=-c);let h=o[n];X(d,r)&&(h=Wt[l%Wt.length],l+=1);let g=`tap`;p&&(g=`swipe`),m&&(g=`star`),s.push({id:n,time:d,lane:h,kind:g,direction:p?c:0})}return hn(s,r),gn(vn(fn(s,t,e,i),t,r),r)}function on(e,t,n){return t*(Kt+-1.2*n[e])}function sn(e,t,n,r){let i=e.vocalOnsets[t]===1;if(n===`voice`&&i)return Yt+e.vocalStrength[t];let a=!xt(r,t)||Math.abs(bt(r,t)-t)<=Qt,o=oe(e,t);return n===`auto`&&i&&a&&(o+=Xt),a?o:o*Zt}function cn(e,t){let n=A(e,t.minGapSec*qt*.8),r=e.frameCount-en;for(let t=Math.round($t*e.fps);t<r;t++)e.vocalOnsets[t]===1&&n.push(t);return n}function ln(e,t,n,r){let i=gt(e),a=cn(e,t),o=new Map;for(let t of a)o.set(t,sn(e,t,r,i));a.sort((e,t)=>(o.get(t)??0)-(o.get(e)??0));let s=[];for(let r of a){let i=on(r,t.minGapSec,n)*e.fps,a=!0;for(let e of s)Math.abs(e-r)<i&&(a=!1);a&&s.push(r)}return s.sort((e,t)=>e-t),dn(r===`voice`?s:un(s,i),e,t,n)}function un(e,t){let n=[];for(let r of e){let e=bt(t,r),i=Math.abs(e-r)<=Qt?e:r;n[n.length-1]!==i&&n.push(i)}return n}function dn(e,t,n,r){let i=[...e];for(let a=0;a+1<e.length;a++){let o=Math.round((e[a]+e[a+1])/2),s=on(o,n.minGapSec,r)*t.fps,c=e[a+1]-e[a]>=s*2;r[o]>=Jt&&c&&i.push(o)}return i.sort((e,t)=>e-t),i}function fn(e,t,n,r){if(t.pairEvery===0)return e;let i=[],a=0;for(let o of e)r[Math.min(Math.round(o.time*n.fps),r.length-1)]>=Jt&&(a+=1),o.kind===`tap`&&a>=t.pairEvery?(a=0,i.push({...o,kind:`accent`}),i.push({...o,kind:`accent`,lane:(o.lane+1+i.length%2)%3})):i.push(o);return i}function pn(e,t,n,r,i){let a=ln(e,t,r,i),o=A(e,t.minGapSec*Ut),s=[];for(let t of a)mn(t/e.fps,n)&&s.push(t);let c=t.minGapSec*Ut*e.fps;for(let t of o){let r=t/e.fps;if(!X(r,n)||!mn(r,n))continue;let i=!0;for(let e of s)Math.abs(e-t)<c&&(i=!1);i&&s.push(t)}return s.sort((e,t)=>e-t),s}function mn(e,t){for(let n of t)if(n.kind===`pause`&&e>n.start-.05&&e<n.end+Gt||n.kind===`impact`&&Math.abs(e-n.start)<Gt)return!1;return!0}function X(e,t){for(let n of t)if(n.kind===`buildup`&&e<n.end&&e>=n.end-Ht)return!0;return!1}function hn(e,t){for(let n of t)if(n.kind===`pause`){for(let t=e.length-1;t>=0;t--)if(!(e[t].time>n.start)){e[t].kind===`tap`&&(e[t].kind=`star`);break}}}function gn(e,t){let n=[...e],r=0;for(let e of t){if(e.kind!==`impact`)continue;let i=r%2==0||_n(e,t);r+=1,i?n.push({id:0,time:e.start,lane:1,kind:`space`,direction:0}):(n.push({id:0,time:e.start,lane:0,kind:`accent`,direction:0}),n.push({id:0,time:e.start,lane:2,kind:`accent`,direction:0}))}n.sort((e,t)=>e.time-t.time);for(let e=0;e<n.length;e++)n[e]={...n[e],id:e};return n}function _n(e,t){for(let n of t)if(n.kind===`pause`&&Math.abs(n.end-e.start)<.5)return!0;return!1}function vn(e,t,n){let r=[],i=0,a=0;for(;a<e.length;){let o=e[a];i+=1;let s=i>=Rt&&o.kind===`tap`&&!X(o.time,n)?yn(e,a,n):-1;if(s===-1){r.push({...o,id:r.length}),a+=1;continue}let c=e[s].time-o.time-Vt;if(r.push({...o,id:r.length,kind:`hold`,duration:c}),t.id===`hard`)for(let t=a+1;t<s;t++)e[t].lane!==o.lane&&r.push({...e[t],id:r.length});i=0,a=s}return r}function yn(e,t,n){for(let r=t+1;r<e.length;r++){let i=e[r].time-e[t].time;if(i>Bt)return-1;if(i>=zt)return bn(e[t].time,e[r].time,n)?-1:r}return-1}function bn(e,t,n){for(let r of n)if(r.kind!==`buildup`&&r.start<t+Gt&&r.end>e)return!0;return!1}function xn(e,t){let n=[];for(let r of t)n.push(Sn(e,r));let r=[...n].sort((e,t)=>e-t),i=r[Math.floor(r.length/3)],a=r[Math.floor(r.length*2/3)],o=[];for(let e=0;e<n.length;e++){let t=1;n[e]<i&&(t=0),n[e]>=a&&(t=2),e>=2&&o[e-1]===t&&o[e-2]===t&&(t=(t+1)%3),o.push(t)}return o}function Sn(e,t){let n=Math.min(t+3,e.frameCount-1)*e.spectrumBins,r=0,i=0;for(let t=0;t<e.spectrumBins;t++){let a=e.spectrum[n+t];r+=t*a,i+=a}return i===0?0:r/i}var Cn=class{context;output;noise;constructor(e){this.context=e,this.noise=wn(e);let t=e.createBiquadFilter();t.type=`lowpass`,t.frequency.value=3200,this.output=e.createGain(),this.output.connect(t),t.connect(e.destination)}setVolume(e){this.output.gain.value=e}arrow(e){let t=this.context.currentTime,n=this.context.createBufferSource();n.buffer=this.noise;let r=this.context.createBiquadFilter();r.type=`bandpass`,r.Q.value=.8,r.frequency.setValueAtTime(350,t),r.frequency.exponentialRampToValueAtTime(1600,t+.2);let i=this.context.createGain();i.gain.setValueAtTime(1e-4,t),i.gain.exponentialRampToValueAtTime(.9,t+.06),i.gain.exponentialRampToValueAtTime(1e-4,t+.3);let a=this.context.createStereoPanner();a.pan.setValueAtTime(0,t),a.pan.linearRampToValueAtTime(e*.8,t+.28),n.connect(r),r.connect(i),i.connect(a),a.connect(this.output),n.start(t),n.stop(t+.32)}space(){let e=this.context.currentTime;this.arrow(0),this.pluck(e,130.8,.6,.2),this.pluck(e,392,.45,.1)}star(){let e=this.context.currentTime;this.pluck(e,659.3,.45,.16),this.pluck(e+.07,880,.55,.16)}holdDone(){this.pluck(this.context.currentTime,523.3,.5,.14)}impact(){let e=this.context.currentTime;this.pluck(e,98,.5,.2),this.pluck(e,146.8,.4,.12)}multiplierUp(e){this.pluck(this.context.currentTime,330*2**((e-2)/6),.5,.14)}milestone(){let e=this.context.currentTime,t=[261.6,329.6,392,523.3];for(let n=0;n<t.length;n++)this.pluck(e+n*.04,t[n],.7,.1)}miss(){this.pluck(this.context.currentTime,110,.12,.08)}warning(){let e=this.context.currentTime;this.pluck(e,196,.35,.16),this.pluck(e+.18,164.8,.4,.16)}pluck(e,t,n,r){let i=this.context.createOscillator();i.type=`sine`,i.frequency.value=t;let a=this.context.createGain();a.gain.setValueAtTime(1e-4,e),a.gain.exponentialRampToValueAtTime(r,e+.008),a.gain.exponentialRampToValueAtTime(1e-4,e+n),i.connect(a),a.connect(this.output),i.start(e),i.stop(e+n+.02)}};function wn(e){let t=e.createBuffer(1,e.sampleRate,e.sampleRate),n=t.getChannelData(0);for(let e=0;e<n.length;e++)n[e]=Math.random()*2-1;return t}var Tn=.05,En=100,Dn=250,On=2,kn=8,An=2,jn=.1,Mn=15,Nn=200,Pn=.15,Fn=4,In=10,Ln=.012,Rn=[10,25,50,75,100,150,200,300,500],Z=[{from:0,name:``},{from:10,name:`Разогрев`},{from:25,name:`В ударе`},{from:50,name:`В потоке`},{from:100,name:`Легенда`}];function zn(e,t){return{notes:e,difficulty:t,firstNote:0,judged:new Set,holds:[null,null,null],score:0,combo:0,maxCombo:0,perfects:0,goods:0,misses:0,missStreak:0,energy:1,failed:!1,starCharge:0,overdriveUntil:-1/0}}function Bn(e,t){let n=[];for(;e.firstNote<e.notes.length;){let r=e.notes[e.firstNote];if(!e.judged.has(r.id)){if(t<=r.time+.12)break;e.judged.add(r.id),e.combo=0,e.misses+=1,e.missStreak+=1,rr(e,-.07),n.push({type:`miss`,lane:r.lane,kind:r.kind,direction:r.direction,points:0,milestone:0,warning:e.missStreak===3,noteTime:r.time})}e.firstNote+=1}for(let r=0;r<e.holds.length;r++){let i=e.holds[r];i&&(Hn(e,i,t),t>=Vn(i)&&n.push(Un(e,r,i)))}return n}function Vn(e){return e.note.time+(e.note.duration??0)}function Hn(e,t,n){let r=Math.min(n,Vn(t)),i=Math.floor((r-t.scoredUntil)/jn);i<=0||(e.score+=i*Mn*Q(e),t.scoredUntil+=i*jn)}function Un(e,t,n){e.holds[t]=null;let r=Nn*Q(e);return e.score+=r,e.combo+=1,e.maxCombo=Math.max(e.maxCombo,e.combo),{type:`holdDone`,lane:t,kind:`hold`,direction:0,points:r,milestone:Rn.includes(e.combo)?e.combo:0,warning:!1,noteTime:n.note.time}}function Wn(e,t,n){let r=e.holds[n];return r?(Hn(e,r,t),t>=Vn(r)-Pn?Un(e,n,r):(e.holds[n]=null,e.combo=0,rr(e,-.05),{type:`holdBroken`,lane:n,kind:`hold`,direction:0,points:0,milestone:0,warning:!1,noteTime:r.note.time})):null}function Gn(e,t,n){return Jn(e,t,e=>e.kind!==`swipe`&&e.kind!==`space`&&e.lane===n)}function Kn(e,t){return Jn(e,t,e=>e.kind===`space`)}function qn(e,t,n){return Jn(e,t,e=>e.kind===`swipe`&&e.direction===n)}function Jn(e,t,n){let r=null,i=1/0;for(let a=e.firstNote;a<e.notes.length;a++){let o=e.notes[a];if(o.time-t>.12)break;if(e.judged.has(o.id)||!n(o))continue;let s=Math.abs(o.time-t);s<=.12&&s<i&&(r=o,i=s)}if(!r)return null;e.judged.add(r.id),r.kind===`hold`&&(e.holds[r.lane]={note:r,scoredUntil:r.time});let a=i<=Tn,o=r.kind===`star`||r.kind===`accent`||r.kind===`space`,s=Yn(e,r.time)?An:1,c=(a?Dn:En)*Q(e)*(o?On:1)*s,l=!1;return r.kind===`star`&&(e.starCharge+=1,e.starCharge>=3&&(e.starCharge=0,e.overdriveUntil=r.time+kn,l=!0)),e.score+=c,e.combo+=1,e.maxCombo=Math.max(e.maxCombo,e.combo),e.missStreak=0,a?e.perfects+=1:e.goods+=1,rr(e,Ln),{type:a?`perfect`:`good`,lane:r.lane,kind:r.kind,direction:r.direction,points:c,milestone:Rn.includes(e.combo)?e.combo:0,warning:!1,noteTime:r.time,startedOverdrive:l}}function Yn(e,t){return t<e.overdriveUntil}function Xn(e){let t=0;for(let n=0;n<Z.length;n++)e>=Z[n].from&&(t=n);return t}function Zn(e){let t=Xn(e);if(t===Z.length-1)return 1;let n=Z[t].from;return(e-n)/(Z[t+1].from-n)}function Qn(e,t){let n=[];for(let r=e.firstNote;r<e.notes.length;r++){let i=e.notes[r];if(i.time>t)break;if(e.judged.has(i.id))continue;let a=i.kind===`swipe`?qn(e,i.time,i.direction):i.kind===`space`?Kn(e,i.time):Gn(e,i.time,i.lane);a&&n.push(a)}return n}function Q(e){return Math.min(Fn,1+Math.floor(e.combo/In))}function $n(e){return Q(e)===Fn?1:e.combo%In/In}function er(e){let t=e.perfects+e.goods,n=t+e.misses;return n===0?0:t/n}function tr(e){let t=er(e);return t>=.95?3:t>=.85?2:+(t>=.7)}function nr(e){let t=er(e);return t>=.95?`S`:t>=.85?`A`:t>=.7?`B`:`C`}function rr(e,t){e.energy=Math.min(1,Math.max(0,e.energy+t)),e.energy===0&&e.difficulty.canFail&&(e.failed=!0)}var $=ae(),ir={score:0,combo:0,multiplier:1,multiplierFill:0,energy:1,time:0,accuracyPercent:100,isInDanger:!1,streakTier:0,streakFill:0,starCharge:0,isOverdrive:!1},ar={KeyA:0,KeyS:1,KeyD:2,Digit1:0,Digit2:1,Digit3:2},or=new Set,sr=[null,null,null],cr=.15,lr=.3,ur=35,dr=.5,fr=2,pr=31,mr={10:`РАЗОГРЕВ`,25:`В УДАРЕ`,50:`В ПОТОКЕ`,75:`НЕ ОСТАНАВЛИВАЙТЕСЬ`,100:`ЛЕГЕНДА`,150:`БЕЗ ЕДИНОЙ ОШИБКИ?`,200:`ВЫ МАШИНА`,300:`ЗА ГРАНЬЮ`,500:`АБСОЛЮТ`};function hr(e){try{return Number(localStorage.getItem(e))||0}catch{return 0}}function gr(e,t){try{localStorage.setItem(e,String(t))}catch{}}function _r(e){return e.type===`miss`?`мимо`:e.type===`holdBroken`?`луч оборван`:e.kind===`space`?`SPACE! +${e.points}`:`${e.kind===`star`?`★ `:``}+${e.points}`}function vr(e){return e.failed?`Энергия закончилась`:e.misses===0?`Без единого промаха!`:e.rank===`S`||e.rank===`A`?`Отличная партия`:`Трек пройден`}function yr(){let t=(0,j.useRef)(null),n=(0,j.useRef)(null),r=(0,j.useRef)(null),o=(0,j.useRef)(null),c=(0,j.useRef)(null),l=(0,j.useRef)([!1,!1,!1]),u=(0,j.useRef)(1),d=(0,j.useRef)(null),f=(0,j.useRef)(1),p=(0,j.useRef)(new Map),m=(0,j.useRef)([]),_=(0,j.useRef)(new Set),y=(0,j.useRef)(()=>{}),[b,x]=(0,j.useState)(`menu`),[S,ee]=(0,j.useState)(null),[C,w]=(0,j.useState)(``),[te,ne]=(0,j.useState)(``),[T,ie]=(0,j.useState)(``),[ae,E]=(0,j.useState)(``),[D,O]=(0,j.useState)(ir),[k,A]=(0,j.useState)(null),[oe,se]=(0,j.useState)([]),[M,le]=(0,j.useState)(null),[N,P]=(0,j.useState)({difficulty:`normal`,focus:`auto`,approachSec:1.6,volume:.8,effectsVolume:.5,colorDrift:!0,offsetMs:0,look:`outline`,clipBrightness:.55,clipFocus:.85,laneContrast:.75,autopilot:!1}),F=(0,j.useRef)({screen:b,analysis:S,settings:N});(0,j.useEffect)(()=>{F.current={screen:b,analysis:S,settings:N}});let ue=()=>(o.current||(o.current=new v(new AudioContext),d.current=new Cn(o.current.context)),o.current),de=`triada-best:${C}:${N.difficulty}`,I=()=>{let e=c.current;if(!e)return;o.current?.pause(),n.current?.pause();let t=hr(de),r=e.score>t;r&&gr(de,e.score),le({failed:e.failed,rank:nr(e),stars:tr(e),score:e.score,bestScore:Math.max(t,e.score),isNewBest:r,accuracyPercent:Math.round(er(e)*100),maxCombo:e.maxCombo,perfects:e.perfects,goods:e.goods,misses:e.misses}),x(`results`)},L=(0,j.useRef)(I);(0,j.useEffect)(()=>{L.current=I}),(0,j.useEffect)(()=>{let e=t.current;if(!e)return;let i=new Be(e);r.current=i;let a=re(),p=0,h=0,g=()=>{let t=Math.min(window.devicePixelRatio||1,2);e.width=e.clientWidth*t,e.height=e.clientHeight*t,i.setSize(e.width,e.height)},v=new ResizeObserver(g);v.observe(e),g();let b=(e,t,n)=>{u.current+=1,A({id:u.current,text:e,detail:t,isWarning:n})},x=e=>{if(!e)return;let t=performance.now()/1e3,n=d.current;e.type===`miss`||e.type===`holdBroken`?(i.missEffect(e.lane),n?.miss()):(i.hitEffect(e.lane,e.type===`perfect`||e.type===`holdDone`,t),e.kind===`space`&&(i.spaceHitEffect(t),n?.space()),e.type===`holdDone`&&n?.holdDone(),e.kind===`swipe`&&(i.launchArrow(e.lane,e.direction,t),n?.arrow(e.direction)),e.kind===`star`&&(i.hitEffect(e.lane,!0,t),n?.star())),e.milestone&&(b(mr[e.milestone],`${e.milestone} подряд`,!1),n?.milestone()),e.startedOverdrive&&(b(`СУПЕРРЕЖИМ`,`очки ×2 на 8 секунд`,!1),n?.milestone()),e.warning&&(b(`СОБЕРИТЕСЬ!`,`3 промаха подряд`,!0),n?.warning());let r=c.current;if(r){let e=Q(r);e>f.current&&n?.multiplierUp(e),f.current=e}u.current+=1;let a={id:u.current,lane:e.lane,type:e.type,text:_r(e)};se(e=>[...e,a].slice(-6))};y.current=x;let S=(e,t)=>{let n=0,r=0;for(let a of m.current){let o=e>=a.start&&e<a.end;a.kind===`buildup`&&o&&(n=(e-a.start)/(a.end-a.start)),a.kind===`pause`&&o&&(r=1),a.kind===`impact`&&e>=a.start&&!_.current.has(a)&&(_.current.add(a),i.impactEffect(t),d.current?.impact())}i.setMood(n,r)},ee=e=>{let t=n.current;t&&t.src&&(t.paused&&t.play().catch(()=>{}),Math.abs(t.currentTime-e)>cr&&(t.currentTime=e))},C=()=>{let e=performance.now()/1e3,{screen:t,analysis:r,settings:u}=F.current,f=c.current,m=o.current,g=t===`playing`&&f!==null&&m!==null&&r!==null,_=e*.3;if(g){_=m.currentTime+u.offsetMs/1e3,ee(m.currentTime),u.autopilot&&Qn(f,_).forEach(x),Bn(f,_).forEach(x),s(r,_,a),d.current?.setVolume(u.effectsVolume);let t=Math.min(1,_/r.duration);i.setHueShift(u.colorDrift?t*fr:0),S(_,e);let n=Z.length-1;i.setStreak((Xn(f.combo)+Zn(f.combo)*.5)/n,Yn(f,_));let o=performance.now();if(o-h>80){h=o;let e=f.perfects+f.goods+f.misses>0;O({score:f.score,combo:f.combo,multiplier:Q(f),multiplierFill:$n(f),energy:f.energy,time:_,accuracyPercent:e?Math.round(er(f)*100):100,isInDanger:f.energy<lr||f.missStreak>=3,streakTier:Xn(f.combo),streakFill:Zn(f.combo),starCharge:f.starCharge,isOverdrive:Yn(f,_)})}(f.failed||!m.isPlaying)&&L.current()}else t===`menu`&&(a.time=_,a.energy=_*.3,a.bass=.3+.15*Math.sin(e*1.5),a.beatPulse=0,i.setHueShift(0));g||(i.setMood(0,0),i.setStreak(0,!1)),i.setClipOptions(u.look,u.clipBrightness,u.laneContrast,u.clipFocus);let v=t===`menu`;i.render(a,n.current,f&&!v?f.notes:[],f?f.firstNote:0,f?f.judged:or,l.current,u.approachSec,e,f?Q(f):1,!v,f&&!v?f.holds.map(e=>e?e.note:null):sr),p=requestAnimationFrame(C)};return p=requestAnimationFrame(C),()=>{cancelAnimationFrame(p),v.disconnect(),i.dispose(),r.current=null}},[]);let R=()=>{let e=o.current;b===`playing`?(e?.pause(),n.current?.pause(),x(`paused`)):b===`paused`&&(e?.play(),x(`playing`))},z=(0,j.useRef)(R);(0,j.useEffect)(()=>{z.current=R});let B=()=>{let e=o.current,{screen:t,settings:n}=F.current;return!e||!c.current||t!==`playing`?null:e.currentTime+n.offsetMs/1e3},V=(0,j.useRef)({lane(e){let t=B(),n=c.current;r.current?.pressEffect(e),t!==null&&n&&y.current(Gn(n,t,e))},swipe(e){let t=B(),n=c.current;t!==null&&n&&y.current(qn(n,t,e))},space(){let e=B(),t=c.current;r.current?.spacePressEffect(),e!==null&&t&&y.current(Kn(t,e))},release(e){let t=B(),n=c.current;t!==null&&n&&y.current(Wn(n,t,e))}});(0,j.useEffect)(()=>{let e=e=>{if(e.code===`Escape`&&z.current(),F.current.screen!==`playing`||e.repeat)return;let t=ar[e.code];t!==void 0&&(l.current[t]=!0,V.current.lane(t)),e.code===`ArrowLeft`&&V.current.swipe(-1),e.code===`ArrowRight`&&V.current.swipe(1),e.code===`Space`&&(e.preventDefault(),V.current.space())},t=e=>{let t=ar[e.code];t!==void 0&&(l.current[t]=!1,V.current.release(t))},n=()=>{document.hidden&&F.current.screen===`playing`&&z.current()};return window.addEventListener(`keydown`,e),window.addEventListener(`keyup`,t),document.addEventListener(`visibilitychange`,n),()=>{window.removeEventListener(`keydown`,e),window.removeEventListener(`keyup`,t),document.removeEventListener(`visibilitychange`,n)}},[]);let fe=e=>{let n=t.current,i=r.current;if(!n||!i||b!==`playing`)return;let a=n.getBoundingClientRect();if(e.pointerType===`touch`&&e.clientY-a.top<a.height*dr){V.current.space();return}let o=(e.clientX-(a.left+a.width/2))/(a.height/2),s=i.laneAt(o);p.current.set(e.pointerId,{lane:s,startX:e.clientX,hasSwiped:!1}),l.current[s]=!0,V.current.lane(s)},H=e=>{let t=p.current.get(e.pointerId);if(!t||t.hasSwiped)return;let n=e.clientX-t.startX;Math.abs(n)<ur||(t.hasSwiped=!0,V.current.swipe(Math.sign(n)))},U=e=>{let t=p.current.get(e.pointerId);if(!t)return;p.current.delete(e.pointerId);let n=!1;for(let e of p.current.values())e.lane===t.lane&&(n=!0);n||(l.current[t.lane]=!1,V.current.release(t.lane))},pe=e=>{T&&URL.revokeObjectURL(T),ie(URL.createObjectURL(e)),ne(e.name)};(0,j.useEffect)(()=>{let e=n.current;if(!e||!T)return;let t=()=>r.current?.setVideo(e);return e.addEventListener(`loadeddata`,t),()=>e.removeEventListener(`loadeddata`,t)},[T]);let me=async(e,t)=>{ue().load(e),ee(null),w(t),E(`Строим уровень…`);let n=await a(h(e),e.sampleRate,e=>E(`Строим уровень… ${Math.round(e*100)}%`));m.current=St(n),ee(n),E(``)},he=async e=>{E(`Читаем файл…`);try{await me(await i(e,ue().context),e.name),e.type.startsWith(`video/`)&&pe(e)}catch(e){console.error(e),E(`Не удалось прочитать звук из файла. Попробуйте mp3, wav, ogg или mp4.`)}},ge=()=>{let e=o.current;if(!S||!e)return;let t=rn(N.difficulty);c.current=zn(an(S,t,N.focus),t),f.current=1,_.current=new Set,O(ir),A(null),se([]),e.setVolume(N.volume),e.seek(0),n.current&&T&&(n.current.currentTime=0),e.play(),x(`playing`)},W=e=>P({...N,...e}),_e=S?.duration??0,G=_e>0?Math.min(1,D.time/_e):0;return(0,$.jsxs)(`div`,{className:`game`,onPointerDown:fe,onPointerMove:H,onPointerUp:U,onPointerCancel:U,children:[(0,$.jsx)(`canvas`,{className:`game-canvas`,ref:t}),(0,$.jsx)(`video`,{ref:n,src:T||void 0,muted:!0,playsInline:!0,preload:`auto`,hidden:!0}),(b===`playing`||b===`paused`)&&(0,$.jsxs)(`div`,{className:`hud tier-${D.multiplier} streak-${D.streakTier} ${D.isInDanger?`is-danger`:``} ${D.isOverdrive?`is-overdrive`:``}`,children:[(0,$.jsxs)(`div`,{className:`score-bar`,children:[(0,$.jsx)(`strong`,{className:`score-value`,children:D.score.toLocaleString(`ru-RU`)}),(0,$.jsx)(`div`,{className:`track-progress`,children:(0,$.jsx)(`div`,{style:{width:`${G*100}%`}})}),(0,$.jsxs)(`span`,{className:`score-time`,children:[e(D.time),` / `,e(_e)]}),D.streakTier>0&&(0,$.jsxs)(`div`,{className:`streak-meter`,children:[(0,$.jsx)(`strong`,{children:Z[D.streakTier].name}),(0,$.jsx)(`div`,{className:`streak-bar`,children:(0,$.jsx)(`div`,{style:{width:`${D.streakFill*100}%`}})})]},D.streakTier)]}),(0,$.jsxs)(`div`,{className:`side-pill side-left`,children:[(0,$.jsxs)(`strong`,{className:`pill-main`,children:[`×`,D.multiplier]},`multiplier-${D.multiplier}`),(0,$.jsxs)(`span`,{className:`pill-note`,children:[D.combo,` подряд`]},`combo-${D.combo}`),(0,$.jsx)(`div`,{className:`multiplier-bar`,children:(0,$.jsx)(`div`,{style:{width:`${D.multiplierFill*100}%`}})}),(0,$.jsx)(`div`,{className:`star-pips`,"aria-label":`Звёзд до суперрежима: ${D.starCharge} из 3`,children:Array.from({length:3},(e,t)=>(0,$.jsx)(`span`,{className:t<D.starCharge?`is-earned`:``,children:`★`},t))})]}),(0,$.jsxs)(`div`,{className:`side-pill side-right`,children:[(0,$.jsxs)(`strong`,{className:`pill-main`,children:[D.accuracyPercent,`%`]}),(0,$.jsx)(`span`,{className:`pill-note`,children:`энергия`}),(0,$.jsx)(`div`,{className:`multiplier-bar energy-bar`,children:(0,$.jsx)(`div`,{style:{width:`${D.energy*100}%`}})})]}),k&&(0,$.jsxs)(`div`,{className:`banner ${k.isWarning?`is-warning`:``}`,children:[(0,$.jsx)(`strong`,{children:k.text}),(0,$.jsx)(`span`,{children:k.detail})]},k.id),oe.map(e=>(0,$.jsx)(`span`,{className:`score-popup is-${e.type}`,style:{left:`calc(50% + ${(e.lane-1)*pr}vh)`},onAnimationEnd:()=>se(t=>t.filter(t=>t.id!==e.id)),children:e.text},e.id)),(0,$.jsx)(`div`,{className:`hud-hint`,children:`A S D — круги · ← → — стрелки · пробел — SPACE · Esc — пауза`})]}),b===`menu`&&(0,$.jsxs)(`main`,{className:`menu`,children:[(0,$.jsxs)(`header`,{children:[(0,$.jsx)(`h1`,{children:`ТРИАДА`}),(0,$.jsx)(`p`,{children:`Три дорожки, ваша музыка и ваш клип, переработанный на весь экран.`})]}),(0,$.jsxs)(`section`,{className:`menu-card`,children:[(0,$.jsx)(`h2`,{children:`Трек и клип`}),(0,$.jsxs)(`label`,{className:`file-button`,children:[(0,$.jsx)(`input`,{type:`file`,accept:`audio/*,video/*,.mp3,.wav,.ogg,.mp4,.webm`,"data-testid":`track-input`,onChange:e=>{let t=e.target.files?.[0];t&&he(t),e.target.value=``}}),`Загрузить песню или клип целиком`]}),(0,$.jsxs)(`label`,{className:`file-button is-secondary`,children:[(0,$.jsx)(`input`,{type:`file`,accept:`video/*,.mp4,.webm`,"data-testid":`clip-input`,onChange:e=>{let t=e.target.files?.[0];t&&pe(t),e.target.value=``}}),`Добавить отдельный видеофон`]}),(0,$.jsx)(`button`,{className:`text-button`,onClick:()=>void me(g(ue().context),`Демо-трек`),children:`Или взять демо-трек`}),(0,$.jsxs)(`p`,{className:`track-name`,"data-testid":`track-status`,children:[ae||C||`Файлы остаются у вас: на сервер ничего не загружается.`,te&&!ae?` · клип: ${te}`:``]})]}),(0,$.jsxs)(`section`,{className:`menu-card`,children:[(0,$.jsx)(`h2`,{children:`Настройки`}),(0,$.jsx)(`div`,{className:`segmented`,children:It.map(e=>(0,$.jsx)(`button`,{className:e.id===N.difficulty?`is-active`:``,onClick:()=>W({difficulty:e.id}),children:e.label},e.id))}),(0,$.jsx)(`div`,{className:`segmented`,"aria-label":`На что ориентируются ноты`,children:Ft.map(e=>(0,$.jsx)(`button`,{className:e.id===N.focus?`is-active`:``,onClick:()=>W({focus:e.id}),children:e.label},e.id))}),(0,$.jsx)(`div`,{className:`segmented look-list`,children:ce.map(e=>(0,$.jsx)(`button`,{className:e.id===N.look?`is-active`:``,onClick:()=>W({look:e.id}),children:e.label},e.id))}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Яркость клипа `,(0,$.jsxs)(`output`,{children:[Math.round(N.clipBrightness*100),`%`]})]}),(0,$.jsx)(`input`,{type:`range`,min:.2,max:1,step:.05,value:N.clipBrightness,onChange:e=>W({clipBrightness:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Приглушить клип за дорожками `,(0,$.jsxs)(`output`,{children:[Math.round(N.clipFocus*100),`%`]})]}),(0,$.jsx)(`input`,{type:`range`,min:0,max:1,step:.05,value:N.clipFocus,onChange:e=>W({clipFocus:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Контраст дорожек `,(0,$.jsxs)(`output`,{children:[Math.round(N.laneContrast*100),`%`]})]}),(0,$.jsx)(`input`,{type:`range`,min:0,max:1,step:.05,value:N.laneContrast,onChange:e=>W({laneContrast:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Скорость нот `,(0,$.jsxs)(`output`,{children:[N.approachSec.toFixed(1),` с`]})]}),(0,$.jsx)(`input`,{type:`range`,min:.8,max:2.6,step:.1,value:N.approachSec,onChange:e=>W({approachSec:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Громкость `,(0,$.jsxs)(`output`,{children:[Math.round(N.volume*100),`%`]})]}),(0,$.jsx)(`input`,{type:`range`,min:0,max:1,step:.05,value:N.volume,onChange:e=>W({volume:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Звуковые эффекты `,(0,$.jsxs)(`output`,{children:[Math.round(N.effectsVolume*100),`%`]})]}),(0,$.jsx)(`input`,{type:`range`,min:0,max:1,step:.05,value:N.effectsVolume,onChange:e=>W({effectsVolume:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Поправка на задержку `,(0,$.jsxs)(`output`,{children:[N.offsetMs,` мс`]})]}),(0,$.jsx)(`input`,{type:`range`,min:-200,max:200,step:10,value:N.offsetMs,onChange:e=>W({offsetMs:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`toggle`,children:[(0,$.jsx)(`input`,{type:`checkbox`,"data-testid":`color-drift`,checked:N.colorDrift,onChange:e=>W({colorDrift:e.target.checked})}),`Цвет клипа меняется по ходу песни`]}),(0,$.jsxs)(`label`,{className:`toggle`,children:[(0,$.jsx)(`input`,{type:`checkbox`,"data-testid":`autopilot`,checked:N.autopilot,onChange:e=>W({autopilot:e.target.checked})}),`Автопилот`]})]}),(0,$.jsx)(`button`,{className:`start-button`,disabled:!S,onClick:ge,children:`Старт`}),(0,$.jsxs)(`ul`,{className:`legend`,children:[(0,$.jsx)(`li`,{children:`Пурпурный круг: клавиша A, S, D или нажатие на дорожку`}),(0,$.jsx)(`li`,{children:`Белый круг со стрелкой: ← или → либо смахивание, только в спокойных местах`}),(0,$.jsx)(`li`,{children:`Золотая звезда: три звезды включают суперрежим, очки ×2 на 8 секунд`}),(0,$.jsx)(`li`,{children:`Пурпурный круг с лучом: зажмите и держите до конца`}),(0,$.jsx)(`li`,{children:`Парная нота: две клавиши сразу`}),(0,$.jsx)(`li`,{children:`Белая плашка SPACE: пробел, на телефоне касание верха экрана`})]})]}),b===`paused`&&(0,$.jsxs)(`div`,{className:`overlay`,children:[(0,$.jsx)(`h2`,{children:`Пауза`}),(0,$.jsx)(`button`,{className:`start-button`,onClick:R,children:`Продолжить`}),(0,$.jsx)(`button`,{className:`text-button`,onClick:ge,children:`Начать заново`}),(0,$.jsx)(`button`,{className:`text-button`,onClick:()=>x(`menu`),children:`В меню`})]}),b===`results`&&M&&(0,$.jsxs)(`div`,{className:`overlay`,"data-testid":`results`,children:[(0,$.jsx)(`h2`,{children:vr(M)}),(0,$.jsxs)(`div`,{className:`stars`,"aria-label":`Звёзд: ${M.stars} из 3`,children:[(0,$.jsx)(`span`,{className:M.stars>=1?`is-earned`:``,children:`★`}),(0,$.jsx)(`span`,{className:M.stars>=2?`is-earned`:``,children:`★`}),(0,$.jsx)(`span`,{className:M.stars>=3?`is-earned`:``,children:`★`})]}),M.isNewBest&&(0,$.jsx)(`div`,{className:`new-best`,children:`Новый рекорд!`}),(0,$.jsxs)(`dl`,{className:`stats`,children:[(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Очки`}),(0,$.jsx)(`dd`,{children:M.score.toLocaleString(`ru-RU`)})]}),(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Рекорд`}),(0,$.jsx)(`dd`,{children:M.bestScore.toLocaleString(`ru-RU`)})]}),(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Точность`}),(0,$.jsxs)(`dd`,{children:[M.accuracyPercent,`%`]})]}),(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Лучшее комбо`}),(0,$.jsx)(`dd`,{children:M.maxCombo})]}),(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Точно / хорошо`}),(0,$.jsxs)(`dd`,{children:[M.perfects,` / `,M.goods]})]}),(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Промахи`}),(0,$.jsx)(`dd`,{children:M.misses})]})]}),(0,$.jsx)(`button`,{className:`start-button`,onClick:ge,children:`Ещё раз`}),(0,$.jsx)(`button`,{className:`text-button`,onClick:()=>x(`menu`),children:`В меню`})]})]})}(0,se.createRoot)(document.getElementById(`root`)).render((0,$.jsx)(j.StrictMode,{children:(0,$.jsx)(yr,{})}));
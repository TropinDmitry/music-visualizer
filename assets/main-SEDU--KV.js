import{A as e,C as t,E as n,F as r,H as i,I as a,J as o,K as s,L as c,M as l,N as u,O as d,P as f,T as p,U as m,V as h,W as g,X as _,Y as v,a as y,c as b,d as x,j as S,l as C,m as w,n as ee,p as te,q as ne,r as T,t as re,u as E,v as D,w as O,x as ie,z as ae}from"./jsx-runtime-DM9IciaU.js";import{a as k}from"./game-DDiAxp0X.js";var A=_(),oe=v(),se=[{id:`outline`,label:`Неоновый контур`},{id:`duotone`,label:`Зелёный дуотон`},{id:`comic`,label:`Комикс`},{id:`original`,label:`Оригинал`}],ce={outline:0,duotone:1,comic:2,original:3},j=[`#3dff9e`,`#2ef2d0`,`#c6ff3a`],M=[`A`,`S`,`D`],le=[`#3dff9e`,`#2ef2d0`,`#9dffc4`,`#d9fff0`],N=.94,P=-.68,F=.62,I=.05,L=1.9,R=6,z=.42,B=.6,V=Math.sin(B),H=.62,U=`#ffc933`,ue=`#ffe14d`,de=`#4a3200`,fe=`#fff3a8`,W=6,pe=.5,G=48,K=160,q=.45,J=8,me=.32,he=`
  ${T}
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

    gl_FragColor = vec4(color * uDim, 1.0);
  }
`,ge=`
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
    float pulse = smoothstep(0.8, 1.0, fract(distanceAway * 1.6 + uTrackTime * (1.4 + 2.5 * uTension)));

    vec3 laneColor = mix(uLaneColors[lane], uTierColor, 0.3);
    float fade = smoothstep(0.0, 0.1, closeness);

    vec3 color = laneColor * (0.06 + 0.1 * uBeat + 0.28 * pulse);
    float alpha = inside * uContrast * 0.85 * fade;

    color = mix(color, laneColor * (0.82 + 0.5 * uTension), rail);
    alpha = max(alpha, rail * fade);
    color = mix(color, laneColor, halo * (1.0 - rail));
    alpha = max(alpha, halo * (0.3 + 0.25 * uBeat) * fade);

    // Лучи нот с удержанием: сплошной поток света по оси трубки
    for (int i = 0; i < 6; i++) {
      if (int(uBeams[i].x) != lane) continue;
      if (closeness > uBeams[i].y || closeness < uBeams[i].z) continue;
      float width = 0.2 + 0.05 * sin(distanceAway * 9.0 - uTrackTime * 12.0) * uBeamHeld[i];
      float core = 1.0 - smoothstep(width * 0.3, width, fromCenter);
      vec3 beamColor = mix(laneColor, vec3(1.0), 0.35 + 0.5 * uBeamHeld[i]);
      color = mix(color, beamColor, core);
      alpha = max(alpha, core * (0.75 + 0.25 * uBeamHeld[i]));
    }

    color += laneColor * uLaneGlow[lane] * inside * (0.3 + 0.7 * closeness);
    alpha = max(alpha, uLaneGlow[lane] * 0.7 * inside * fade);
    color = mix(color, vec3(1.0, 0.22, 0.3), uLaneBad[lane] * 0.75 * inside);
    alpha = max(alpha, uLaneBad[lane] * 0.6 * inside * fade);

    gl_FragColor = vec4(color, alpha * (1.0 - 0.6 * uStillness));
  }
`,_e=`
  uniform vec3 uColor;
  varying vec3 vColor;
  varying vec3 vNormal;

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
    gl_Position = projectionMatrix * viewMatrix * toWorld * vec4(position, 1.0);
  }
`,ve=`
  uniform float uOpacity;
  varying vec3 vColor;
  varying vec3 vNormal;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDirection = normalize(vec3(-0.25, 0.8, 0.55));
    float light = max(dot(normal, lightDirection), 0.0);
    float shine = pow(light, 30.0);
    float rim = pow(1.0 - max(normal.z, 0.0), 3.0);
    vec3 color = vColor * (0.32 + 0.85 * light) + vec3(1.0) * shine * 0.7 + vColor * rim * 0.4;
    gl_FragColor = vec4(color, uOpacity);
  }
`;function Y(e,t=!0){return new l({uniforms:{uColor:{value:we(e)},uOpacity:{value:1}},vertexShader:_e,fragmentShader:ve,transparent:!0,depthTest:t,depthWrite:t})}function ye(e,t){let n=new te(e,{depth:t,bevelEnabled:!0,bevelSize:.025,bevelThickness:.025,bevelSegments:3});return n.translate(0,0,-t/2),n.rotateX(-Math.PI/2),n}function be(){let e=new u;return e.moveTo(-.46,-.13),e.lineTo(.04,-.13),e.lineTo(.04,-.31),e.lineTo(.46,0),e.lineTo(.04,.31),e.lineTo(.04,.13),e.lineTo(-.46,.13),e.closePath(),ye(e,.14)}function xe(){let e=new u;for(let t=0;t<10;t++){let n=t%2==0?.5:.23,r=t/10*Math.PI*2+Math.PI/2,i=Math.cos(r)*n,a=Math.sin(r)*n;t===0?e.moveTo(i,a):e.lineTo(i,a)}return e.closePath(),ye(e,.14)}function Se(e){let t=document.createElement(`canvas`);t.width=128,t.height=128;let n=t.getContext(`2d`);n&&(n.font=`700 64px "Segoe UI", system-ui, sans-serif`,n.textAlign=`center`,n.textBaseline=`middle`,n.fillStyle=`#ffffff`,n.fillText(e,64,68));let r=new b(t);return r.colorSpace=``,r}function Ce(){let e=[];for(let t=0;t<R;t++)e.push(new a(-1,0,0));return e}function we(e){let t=parseInt(e.slice(1),16);return new a((t>>16&255)/255,(t>>8&255)/255,(t&255)/255)}var Te=class{renderer;clipScene=new S;scene=new S;screenCamera=new n(-1,1,1,-1,0,1);camera=new n(-1,1,1,-1,-1,1);sharedUniforms={uViewAspect:{value:1},uTrackTime:{value:0},uBeat:{value:0},uTierColor:{value:we(le[0])},uSpread:{value:F},uBundle:{value:I},uBend:{value:L},uHitY:{value:P},uTension:{value:0},uStillness:{value:0}};clipUniforms={...this.sharedUniforms,uVideo:{value:null},uHasVideo:{value:!1},uLook:{value:0},uVideoAspect:{value:1},uTexel:{value:new r(1/1280,1/720)},uBass:{value:0},uEnergy:{value:0},uDim:{value:.55},uHueShift:{value:0},uFocus:{value:.85},uVanish:{value:new r(0,N)}};fanUniforms={...this.sharedUniforms,uVanishY:{value:N},uContrast:{value:.75},uLaneColors:{value:j.map(we)},uLaneGlow:{value:[0,0,0]},uLaneBad:{value:[0,0,0]},uBeams:{value:Ce()},uBeamHeld:{value:Array(R).fill(0)}};tapNotes;swipeNotes;starNotes;noteShadows;flyingArrows=[];sparkMesh;fanGroup=new w;targets=[];sparks=[];shockwaves=[];helper=new p;color=new E;videoTexture=null;nextSpark=0;nextShockwave=0;nextArrow=0;spread=F;lastRenderAt=0;constructor(n){this.renderer=new y({canvas:n,antialias:!0}),this.renderer.outputColorSpace=ie,this.renderer.autoClear=!1,this.clipScene.add(this.createScreenQuad(he,this.clipUniforms,!1));let r=this.createScreenQuad(ge,this.fanUniforms,!0);this.fanGroup.add(r),this.scene.add(this.fanGroup);for(let e=0;e<3;e++)this.targets.push(this.createTarget(e));let i=new x(.5,.5,.2,40),a=be();this.tapNotes=new D(i,Y(`#ffffff`),G),this.swipeNotes=new D(a,Y(`#ffffff`),G),this.starNotes=new D(xe(),Y(`#ffffff`),G),this.noteShadows=new D(new C(.5,32),new O({color:`#000000`,transparent:!0,opacity:.5,depthTest:!1}),96),this.noteShadows.frustumCulled=!1,this.noteShadows.renderOrder=2.5,this.noteShadows.count=0,this.scene.add(this.noteShadows);for(let e of[this.tapNotes,this.swipeNotes,this.starNotes]){e.frustumCulled=!1,e.renderOrder=3;for(let t=0;t<G;t++)e.setColorAt(t,this.color.set(`#ffffff`));this.scene.add(e)}for(let e=0;e<W;e++){let e=new t(a,Y(fe));e.rotation.order=`ZXY`,e.visible=!1,e.frustumCulled=!1,e.renderOrder=6,this.flyingArrows.push({mesh:e,bornAt:-1/0,startX:0,direction:1}),this.scene.add(e)}this.sparkMesh=new D(new C(.012,8),new O({transparent:!0,depthTest:!1,blending:2}),K),this.sparkMesh.frustumCulled=!1,this.sparkMesh.renderOrder=5,this.sparkMesh.count=0;for(let e=0;e<K;e++)this.sparkMesh.setColorAt(e,this.color.set(`#ffffff`)),this.sparks.push({x:0,y:0,speedX:0,speedY:0,bornAt:-1/0,color:new E});this.scene.add(this.sparkMesh);for(let n=0;n<J;n++){let n=new t(new e(.88,1,48),new O({transparent:!0,depthTest:!1,side:2}));n.visible=!1,n.renderOrder=4,this.shockwaves.push({mesh:n,bornAt:-1/0}),this.scene.add(n)}}createScreenQuad(e,n,r){let i=new t(new d(2,2),new l({uniforms:n,vertexShader:ee,fragmentShader:e,transparent:r,depthTest:!1,depthWrite:!1}));return i.frustumCulled=!1,i}createTarget(e){let n=new w;n.position.y=P,n.rotation.x=B-Math.PI/2;let r=new t(new C(.19,48),new O({color:`#031311`,transparent:!0,opacity:.9,depthTest:!1})),i=new O({color:j[e],transparent:!0,opacity:.16,depthTest:!1,depthWrite:!1}),a=new t(new C(.15,48),i),o=new t(new f(.175,.04,16,64),Y(j[e],!1)),s=new t(new d(.15,.15),new O({map:Se(M[e]),transparent:!0,depthTest:!1})),c=2;for(let e of[r,a,o,s])e.renderOrder=c,c+=.1,n.add(e);return this.scene.add(n),{group:n,light:i,squash:1,jolt:0}}setSize(e,t){this.renderer.setSize(e,t,!1);let n=e/t;this.camera.left=-n,this.camera.right=n,this.camera.updateProjectionMatrix(),this.spread=Math.min(F,n*.8/1.5),this.sharedUniforms.uSpread.value=this.spread,this.sharedUniforms.uViewAspect.value=n}setVideo(e){this.videoTexture?.dispose(),this.videoTexture=null,e&&(this.videoTexture=new c(e),this.videoTexture.colorSpace=``),this.clipUniforms.uVideo.value=this.videoTexture,this.clipUniforms.uHasVideo.value=e!==null}setHueShift(e){this.clipUniforms.uHueShift.value=e}setMood(e,t){this.sharedUniforms.uTension.value+=(e-this.sharedUniforms.uTension.value)*.15,this.sharedUniforms.uStillness.value+=(t-this.sharedUniforms.uStillness.value)*.25}impactEffect(e){for(let t=0;t<3;t++)this.addShockwave(t,j[t],e),this.fanUniforms.uLaneGlow.value[t]=.8,this.targets[t].squash=1.2}launchArrow(e,t,n){let r=this.flyingArrows[this.nextArrow];this.nextArrow=(this.nextArrow+1)%W,r.bornAt=n,r.startX=this.laneX(e),r.direction=t,r.mesh.visible=!0}setClipOptions(e,t,n,r){this.clipUniforms.uFocus.value=r,this.clipUniforms.uLook.value=ce[e],this.clipUniforms.uDim.value=t,this.fanUniforms.uContrast.value=n}laneX(e){return(e-1)*this.spread}spacingAt(e){return I+(this.spread-I)*e**+L}closenessAt(e,t){return 1/(1+Math.max(e,-t*.1)/t*6)}laneAt(e){return e<-this.spread/2?0:e>this.spread/2?2:1}pressEffect(e){this.targets[e].squash=.8,this.fanUniforms.uLaneGlow.value[e]=Math.max(this.fanUniforms.uLaneGlow.value[e],.45)}hitEffect(e,t,n){this.fanUniforms.uLaneGlow.value[e]=1,this.targets[e].squash=t?1.22:1.12,this.targets[e].light.opacity=1;let r=t?`#ffffff`:j[e];this.addShockwave(e,r,n),t&&this.addShockwave(e,j[e],n-.08);let i=t?14:8;for(let r=0;r<i;r++){let i=this.sparks[this.nextSpark];this.nextSpark=(this.nextSpark+1)%K;let a=Math.PI*(.08+.84*Math.random()),o=(t?1.5:1)*(.5+Math.random());i.x=this.laneX(e),i.y=P,i.speedX=Math.cos(a)*o,i.speedY=Math.sin(a)*o,i.bornAt=n,i.color.set(r%3==0?`#ffffff`:j[e])}}missEffect(e){this.fanUniforms.uLaneBad.value[e]=1,this.targets[e].jolt=1}addShockwave(e,t,n){let r=this.shockwaves[this.nextShockwave];this.nextShockwave=(this.nextShockwave+1)%J,r.bornAt=n,r.mesh.position.set(this.laneX(e),P,0),r.mesh.material.color.set(t),r.mesh.visible=!0}render(e,t,n,r,i,a,o,s,c,l,u){let d=Math.min(s-this.lastRenderAt,.1);this.lastRenderAt=s,this.sharedUniforms.uTrackTime.value=e.time,this.sharedUniforms.uBeat.value=e.beatPulse,this.sharedUniforms.uTierColor.value.copy(we(le[c-1])),this.clipUniforms.uBass.value=e.bass,this.clipUniforms.uEnergy.value=e.energy,t&&t.videoWidth>0&&(this.clipUniforms.uVideoAspect.value=t.videoWidth/t.videoHeight,this.clipUniforms.uTexel.value.set(1/t.videoWidth,1/t.videoHeight)),this.updateLanes(a,e.beatPulse,d,u),this.updateNotes(e.time,n,r,i,o),this.updateBeams(e.time,n,r,i,o,u),this.emitHoldSparks(u,s),this.updateFlyingArrows(s),this.updateSparks(s),this.updateShockwaves(s),this.renderer.clear(),this.renderer.render(this.clipScene,this.screenCamera),l&&this.renderer.render(this.scene,this.camera)}updateLanes(e,t,n,r){let i=Math.exp(-n*7),a=1-Math.exp(-n*18);for(let n=0;n<3;n++){let o=r[n]!==null,s=o?.8:e[n]?.35:0;this.fanUniforms.uLaneGlow.value[n]=Math.max(s,this.fanUniforms.uLaneGlow.value[n]*i),this.fanUniforms.uLaneBad.value[n]*=i;let c=this.targets[n],l=e[n]?.86:1+.07*t;c.squash+=(l-c.squash)*a,c.jolt*=i,c.group.position.x=this.laneX(n)+Math.sin(c.jolt*18)*.03*c.jolt,c.group.scale.setScalar(c.squash*(this.spread/F)),c.light.opacity=Math.max(o?.85:e[n]?.5:.16,c.light.opacity*i)}}updateNotes(e,t,n,r,i){let a=0,o=0,s=0,c=0;this.helper.rotation.order=`ZXY`;for(let l=n;l<t.length;l++){let n=t[l],u=n.time-e;if(u>i)break;if(r.has(n.id))continue;let d=this.closenessAt(u,i),f=this.spacingAt(d),p=(n.lane-1)*f,m=N+-1.62*d,h=f/F*z;this.helper.position.set(p,m-h*.1,0),this.helper.rotation.set(0,0,0),this.helper.scale.set(h*1.08,h*1.08*V,1),this.helper.updateMatrix(),this.noteShadows.setMatrixAt(c,this.helper.matrix),c+=1;let g=n.kind===`star`?e*3:0;if(this.helper.position.set(p,m,0),this.helper.rotation.set(B,g,0),this.helper.scale.setScalar(h),this.helper.updateMatrix(),n.kind===`star`)this.starNotes.setMatrixAt(s,this.helper.matrix),this.starNotes.setColorAt(s,this.color.set(U)),s+=1;else{let e=j[n.lane];n.kind===`swipe`&&(e=ue),n.kind===`accent`&&(e=`#ffffff`),this.tapNotes.setMatrixAt(a,this.helper.matrix),this.tapNotes.setColorAt(a,this.color.set(e)),a+=1}if(n.kind===`swipe`){let e=h*.13;this.helper.position.set(p,m+e*Math.cos(B),e*Math.sin(B)),this.helper.rotation.set(B,n.direction<0?Math.PI:0,0),this.helper.scale.setScalar(h*H),this.helper.updateMatrix(),this.swipeNotes.setMatrixAt(o,this.helper.matrix),this.swipeNotes.setColorAt(o,this.color.set(de)),o+=1}if(c>=G)break}this.tapNotes.count=a,this.swipeNotes.count=o,this.starNotes.count=s,this.noteShadows.count=c,this.noteShadows.instanceMatrix.needsUpdate=!0;for(let e of[this.tapNotes,this.swipeNotes,this.starNotes])e.instanceMatrix.needsUpdate=!0,e.instanceColor&&(e.instanceColor.needsUpdate=!0);this.helper.rotation.order=`XYZ`}updateBeams(e,t,n,r,i,a){let o=this.fanUniforms.uBeams.value,s=this.fanUniforms.uBeamHeld.value,c=0;for(let t of a){if(!t||c>=R)continue;let n=t.time+(t.duration??0);o[c].set(t.lane,1.05,this.closenessAt(n-e,i)),s[c]=1,c+=1}for(let a=n;a<t.length&&c<R;a++){let n=t[a],l=n.time-e;if(l>i)break;if(n.kind!==`hold`||r.has(n.id))continue;let u=l+(n.duration??0);o[c].set(n.lane,this.closenessAt(l,i),this.closenessAt(u,i)),s[c]=0,c+=1}for(let e=c;e<R;e++)o[e].set(-1,0,0)}emitHoldSparks(e,t){for(let n of e){if(!n)continue;let e=this.sparks[this.nextSpark];this.nextSpark=(this.nextSpark+1)%K;let r=Math.PI*(.2+.6*Math.random());e.x=this.laneX(n.lane),e.y=P,e.speedX=Math.cos(r)*.7,e.speedY=Math.sin(r)*1.1,e.bornAt=t,e.color.set(j[n.lane])}}updateFlyingArrows(e){for(let t of this.flyingArrows){let n=(e-t.bornAt)/pe;if(n>=1){t.mesh.visible=!1;continue}let r=n*n,i=t.direction<0?Math.PI:0;t.mesh.position.set(t.startX+t.direction*r*3.2,P,.1),t.mesh.rotation.set(B,i,0),t.mesh.scale.setScalar(z*H*(this.spread/F)*(1+.9*n)),t.mesh.material.uniforms.uOpacity.value=1-n*n}}updateSparks(e){let t=0;for(let n of this.sparks){let r=e-n.bornAt;if(r>=q)continue;let i=1-r/q;this.helper.position.set(n.x+n.speedX*r,n.y+n.speedY*r-.8*r*r,0),this.helper.rotation.set(0,0,0),this.helper.scale.setScalar(.5+1.2*i),this.helper.updateMatrix(),this.sparkMesh.setMatrixAt(t,this.helper.matrix),this.sparkMesh.setColorAt(t,this.color.copy(n.color).multiplyScalar(i)),t+=1}this.sparkMesh.count=t,this.sparkMesh.instanceMatrix.needsUpdate=!0,this.sparkMesh.instanceColor&&(this.sparkMesh.instanceColor.needsUpdate=!0)}updateShockwaves(e){for(let t of this.shockwaves){let n=(e-t.bornAt)/me;if(n>=1||n<0){t.mesh.visible=n<0,t.mesh.material.opacity=0;continue}let r=(.17+.3*n)*(this.spread/F);t.mesh.scale.set(r,r*V,1),t.mesh.material.opacity=1-n}}dispose(){this.videoTexture?.dispose();for(let e of[this.scene,this.clipScene])e.traverse(e=>{if(e instanceof t){e.geometry.dispose();let t=e.material;t.uniforms===void 0&&t.map&&t.map.dispose(),t.dispose()}});this.renderer.dispose()}};function Ee(e,t){if(e.length===0)return 0;let n=Float32Array.from(e).sort();return n[Math.min(n.length-1,Math.floor(t*(n.length-1)))]}var De=.75,Oe=1.45,ke=.4,Ae=8,je=.22,Me=4,Ne=.3,Pe=.3,Fe=1,Ie=8,Le=2.5,Re=1.06,X=2,ze=.2,Be=.1,Ve=1.5,Z=8,He=.025,Ue=.9,We=.55,Ge=1.7,Ke=4;function qe(e){let t=Je(e),n=new Float64Array(t.length+1);for(let e=0;e<t.length;e++)n[e+1]=n[e]+t[e];let r=(r,i)=>{let a=Math.max(0,Math.round(r*e.fps)),o=Math.min(t.length,Math.round(i*e.fps));return o<=a?0:(n[o]-n[a])/(o-a)},i=Xe(e,t,r,Ne);Ze(e,i),i.sort((e,t)=>e.start-t.start);let a=$e(e,r,i);et(e,a),a.sort((e,t)=>e.start-t.start);let o=rt([...i,...a],nt(e)),s=[...i,...a,...o];return s.sort((e,t)=>e.start-t.start),s}function Je(e){return Ye(e.raw.rms,e)}function Ye(e,t){let n=Math.max(Ee(e,.95),.01),r=Math.round(ze*t.fps),i=new Float32Array(t.frameCount);for(let t=0;t<i.length;t++){let a=0,o=Math.min(i.length-1,t+r);for(let n=Math.max(0,t-r);n<=o;n++)a=Math.max(a,e[n]);i[t]=Math.min(1,a/n)}return i}function Xe(e,t,n,r){let i=[],a=e.fps,o=Math.round(X*a),s=Math.round((e.duration-X)*a);for(;o<s;){let c=o/a,l=n(c-Fe,c);if(!(l>=Pe&&t[o]<l*r)){o+=1;continue}let u=o;for(;u<s&&t[u]<l*Math.min(r+.2,.8);)u+=1;let d=(u-o)/a,f=d+ze*2>=Qe(e,c)*Ge;d>=je&&d<=Me&&u<s&&f&&i.push({kind:`pause`,start:c,end:u/a}),o=u+1}return i}function Ze(e,t){let n=Ye(e.raw.bass,e),r=new Float64Array(n.length+1);for(let e=0;e<n.length;e++)r[e+1]=r[e]+n[e];let i=(t,i)=>{let a=Math.max(0,Math.round(t*e.fps)),o=Math.min(n.length,Math.round(i*e.fps));return o<=a?0:(r[o]-r[a])/(o-a)};for(let r of Xe(e,n,i,We)){let e=!1;for(let n of t)r.start<n.end&&r.end>n.start&&(e=!0);e||t.push(r)}}function Qe(e,t){let n=[],r=-1;for(let i of e.onsetTimes){if(i>t)break;i<t-Ke||(r>=0&&n.push(i-r),r=i)}return n.length===0?0:(n.sort((e,t)=>e-t),n[Math.floor(n.length/2)])}function $e(e,t,n){let r=[];for(let t of n){let n=at(e,t.end);r.push({kind:`impact`,start:n,end:n})}let i=-1,a=0,o=()=>{if(i<0)return;let t=!0;for(let e of r)Math.abs(e.start-i)<Ae&&(t=!1);if(t){let t=at(e,i);r.push({kind:`impact`,start:t,end:t})}i=-1,a=0};for(let n=X;n<e.duration-X;n+=.1){let e=t(n-De,n),r=t(n,n+De),s=r/Math.max(e,.05);s>=Oe&&r>=ke?s>a&&(a=s,i=n):o()}return o(),r.sort((e,t)=>e.start-t.start),r}function et(e,t){let n=tt(e),r=Math.round(Ve/Be),i=new Float32Array(n.length);for(let e=r;e<n.length-r;e++){let t=0;for(let i=0;i<Z;i++){let a=0,o=0;for(let t=1;t<=r;t++)a+=n[e-t][i],o+=n[e+t-1][i];t+=Math.abs(o-a)/r}i[e]=t/Z}let a=Math.max(He,Ee(i,Ue)),o=[];for(let e=r;e<i.length-r;e++)i[e]>=a&&i[e]>=i[e-1]&&i[e]>i[e+1]&&o.push(e);o.sort((e,t)=>i[t]-i[e]);for(let n of o){let r=n*Be;if(r<X||r>e.duration-X)continue;let i=!0;for(let e of t)Math.abs(e.start-r)<Ae&&(i=!1);if(i){let n=at(e,r);t.push({kind:`impact`,start:n,end:n})}}}function tt(e){let t=e.spectrumBins,n=Math.max(1,Math.round(Be*e.fps)),r=Math.floor(t/Z),i=Math.floor(e.frameCount/n),a=[];for(let o=0;o<i;o++){let i=new Float32Array(Z);for(let a=o*n;a<(o+1)*n;a++)for(let n=0;n<Z;n++)for(let o=0;o<r;o++)i[n]+=e.spectrum[a*t+n*r+o];for(let e=0;e<Z;e++)i[e]/=n*r;a.push(i)}return a}function nt(e){let t=new Float64Array(e.frameCount+1);for(let n=0;n<e.frameCount;n++){let r=0;for(let t=0;t<e.spectrumBins;t++)r+=e.spectrum[n*e.spectrumBins+t];t[n+1]=t[n]+r/e.spectrumBins}return(n,r)=>{let i=Math.max(0,Math.round(n*e.fps)),a=Math.min(e.frameCount,Math.round(r*e.fps));return a<=i?0:(t[a]-t[i])/(a-i)}}function rt(e,t){let n=[];for(let r of e){if(r.kind===`impact`&&it(r,e))continue;let i=r.start,a=i;for(;i-a<Ie&&a-1>=X;){let e=t(a-1,a);if(t(a-2,a-1)>e*1.02)break;--a}i-a>=Le&&t(i-1,i)>t(a,a+1)*Re&&n.push({kind:`buildup`,start:a,end:i})}return n}function it(e,t){for(let n of t)if(n.kind===`pause`&&Math.abs(n.end-e.start)<.5)return!0;return!1}function at(e,t){let n=t,r=.25;for(let i of e.onsetTimes){let e=Math.abs(i-t);e<r&&(r=e,n=i)}return n}var ot=[{id:`easy`,label:`Лёгкая`,minGapSec:.45,swipeEvery:12,canFail:!1},{id:`normal`,label:`Средняя`,minGapSec:.3,swipeEvery:8,canFail:!0},{id:`hard`,label:`Сложная`,minGapSec:.18,swipeEvery:6,canFail:!0}],st=17,ct=14,lt=.9,ut=3,dt=.1,ft=2.5,pt=.6,mt=[0,1,2,1],ht=.2;function gt(e){for(let t of ot)if(t.id===e)return t;return ot[0]}function _t(e,t){let n=qe(e),r=vt(e,t,n),i=Et(e,r),a=[],o=1,s=0;for(let c=0;c<r.length;c++){let l=r[c]/e.fps,u=(c+1)%t.swipeEvery===0,d=!u&&(c+1)%st===0;u&&(o=-o);let f=i[c];bt(l,n)&&(f=mt[s%mt.length],s+=1);let p=`tap`;u&&(p=`swipe`),d&&(p=`star`),a.push({id:c,time:l,lane:f,kind:p,direction:u?o:0})}return xt(a,n),St(Ct(a,t,n),n)}function vt(e,t,n){let r=k(e,t.minGapSec),i=k(e,t.minGapSec*pt),a=[];for(let t of r)yt(t/e.fps,n)&&a.push(t);let o=t.minGapSec*pt*e.fps;for(let t of i){let r=t/e.fps;if(!bt(r,n)||!yt(r,n))continue;let i=!0;for(let e of a)Math.abs(e-t)<o&&(i=!1);i&&a.push(t)}return a.sort((e,t)=>e-t),a}function yt(e,t){for(let n of t)if(n.kind===`pause`&&e>n.start-.05&&e<n.end+ht||n.kind===`impact`&&Math.abs(e-n.start)<ht)return!1;return!0}function bt(e,t){for(let n of t)if(n.kind===`buildup`&&e<n.end&&e>=n.end-ft)return!0;return!1}function xt(e,t){for(let n of t)if(n.kind===`pause`){for(let t=e.length-1;t>=0;t--)if(!(e[t].time>n.start)){e[t].kind===`tap`&&(e[t].kind=`star`);break}}}function St(e,t){let n=[...e];for(let e of t)e.kind===`impact`&&(n.push({id:0,time:e.start,lane:0,kind:`accent`,direction:0}),n.push({id:0,time:e.start,lane:2,kind:`accent`,direction:0}));n.sort((e,t)=>e.time-t.time);for(let e=0;e<n.length;e++)n[e]={...n[e],id:e};return n}function Ct(e,t,n){let r=[],i=0,a=0;for(;a<e.length;){let o=e[a];i+=1;let s=i>=ct&&o.kind===`tap`&&!bt(o.time,n)?wt(e,a,n):-1;if(s===-1){r.push({...o,id:r.length}),a+=1;continue}let c=e[s].time-o.time-dt;if(r.push({...o,id:r.length,kind:`hold`,duration:c}),t.id===`hard`)for(let t=a+1;t<s;t++)e[t].lane!==o.lane&&r.push({...e[t],id:r.length});i=0,a=s}return r}function wt(e,t,n){for(let r=t+1;r<e.length;r++){let i=e[r].time-e[t].time;if(i>ut)return-1;if(i>=lt)return Tt(e[t].time,e[r].time,n)?-1:r}return-1}function Tt(e,t,n){for(let r of n)if(r.kind!==`buildup`&&r.start<t+ht&&r.end>e)return!0;return!1}function Et(e,t){let n=[];for(let r of t)n.push(Dt(e,r));let r=[...n].sort((e,t)=>e-t),i=r[Math.floor(r.length/3)],a=r[Math.floor(r.length*2/3)],o=[];for(let e=0;e<n.length;e++){let t=1;n[e]<i&&(t=0),n[e]>=a&&(t=2),e>=2&&o[e-1]===t&&o[e-2]===t&&(t=(t+1)%3),o.push(t)}return o}function Dt(e,t){let n=Math.min(t+3,e.frameCount-1)*e.spectrumBins,r=0,i=0;for(let t=0;t<e.spectrumBins;t++){let a=e.spectrum[n+t];r+=t*a,i+=a}return i===0?0:r/i}var Ot=class{context;output;noise;constructor(e){this.context=e,this.noise=kt(e);let t=e.createBiquadFilter();t.type=`lowpass`,t.frequency.value=3200,this.output=e.createGain(),this.output.connect(t),t.connect(e.destination)}setVolume(e){this.output.gain.value=e}arrow(e){let t=this.context.currentTime,n=this.context.createBufferSource();n.buffer=this.noise;let r=this.context.createBiquadFilter();r.type=`bandpass`,r.Q.value=.8,r.frequency.setValueAtTime(350,t),r.frequency.exponentialRampToValueAtTime(1600,t+.2);let i=this.context.createGain();i.gain.setValueAtTime(1e-4,t),i.gain.exponentialRampToValueAtTime(.9,t+.06),i.gain.exponentialRampToValueAtTime(1e-4,t+.3);let a=this.context.createStereoPanner();a.pan.setValueAtTime(0,t),a.pan.linearRampToValueAtTime(e*.8,t+.28),n.connect(r),r.connect(i),i.connect(a),a.connect(this.output),n.start(t),n.stop(t+.32)}star(){let e=this.context.currentTime;this.pluck(e,659.3,.45,.16),this.pluck(e+.07,880,.55,.16)}holdDone(){this.pluck(this.context.currentTime,523.3,.5,.14)}impact(){let e=this.context.currentTime;this.pluck(e,98,.5,.2),this.pluck(e,146.8,.4,.12)}multiplierUp(e){this.pluck(this.context.currentTime,330*2**((e-2)/6),.5,.14)}milestone(){let e=this.context.currentTime,t=[261.6,329.6,392,523.3];for(let n=0;n<t.length;n++)this.pluck(e+n*.04,t[n],.7,.1)}miss(){this.pluck(this.context.currentTime,110,.12,.08)}warning(){let e=this.context.currentTime;this.pluck(e,196,.35,.16),this.pluck(e+.18,164.8,.4,.16)}pluck(e,t,n,r){let i=this.context.createOscillator();i.type=`sine`,i.frequency.value=t;let a=this.context.createGain();a.gain.setValueAtTime(1e-4,e),a.gain.exponentialRampToValueAtTime(r,e+.008),a.gain.exponentialRampToValueAtTime(1e-4,e+n),i.connect(a),a.connect(this.output),i.start(e),i.stop(e+n+.02)}};function kt(e){let t=e.createBuffer(1,e.sampleRate,e.sampleRate),n=t.getChannelData(0);for(let e=0;e<n.length;e++)n[e]=Math.random()*2-1;return t}var At=.05,jt=100,Mt=250,Nt=2,Pt=.1,Ft=15,It=200,Lt=.15,Rt=4,zt=10,Bt=.012,Vt=[10,25,50,75,100,150,200,300,500];function Ht(e,t){return{notes:e,difficulty:t,firstNote:0,judged:new Set,holds:[null,null,null],score:0,combo:0,maxCombo:0,perfects:0,goods:0,misses:0,missStreak:0,energy:1,failed:!1}}function Ut(e,t){let n=[];for(;e.firstNote<e.notes.length;){let r=e.notes[e.firstNote];if(!e.judged.has(r.id)){if(t<=r.time+.12)break;e.judged.add(r.id),e.combo=0,e.misses+=1,e.missStreak+=1,nn(e,-.07),n.push({type:`miss`,lane:r.lane,kind:r.kind,direction:r.direction,points:0,milestone:0,warning:e.missStreak===3,noteTime:r.time})}e.firstNote+=1}for(let r=0;r<e.holds.length;r++){let i=e.holds[r];i&&(Gt(e,i,t),t>=Wt(i)&&n.push(Kt(e,r,i)))}return n}function Wt(e){return e.note.time+(e.note.duration??0)}function Gt(e,t,n){let r=Math.min(n,Wt(t)),i=Math.floor((r-t.scoredUntil)/Pt);i<=0||(e.score+=i*Ft*Q(e),t.scoredUntil+=i*Pt)}function Kt(e,t,n){e.holds[t]=null;let r=It*Q(e);return e.score+=r,e.combo+=1,e.maxCombo=Math.max(e.maxCombo,e.combo),{type:`holdDone`,lane:t,kind:`hold`,direction:0,points:r,milestone:Vt.includes(e.combo)?e.combo:0,warning:!1,noteTime:n.note.time}}function qt(e,t,n){let r=e.holds[n];return r?(Gt(e,r,t),t>=Wt(r)-Lt?Kt(e,n,r):(e.holds[n]=null,e.combo=0,nn(e,-.05),{type:`holdBroken`,lane:n,kind:`hold`,direction:0,points:0,milestone:0,warning:!1,noteTime:r.note.time})):null}function Jt(e,t,n){return Xt(e,t,e=>e.kind!==`swipe`&&e.lane===n)}function Yt(e,t,n){return Xt(e,t,e=>e.kind===`swipe`&&e.direction===n)}function Xt(e,t,n){let r=null,i=1/0;for(let a=e.firstNote;a<e.notes.length;a++){let o=e.notes[a];if(o.time-t>.12)break;if(e.judged.has(o.id)||!n(o))continue;let s=Math.abs(o.time-t);s<=.12&&s<i&&(r=o,i=s)}if(!r)return null;e.judged.add(r.id),r.kind===`hold`&&(e.holds[r.lane]={note:r,scoredUntil:r.time});let a=i<=At,o=r.kind===`star`||r.kind===`accent`?Nt:1,s=(a?Mt:jt)*Q(e)*o;return e.score+=s,e.combo+=1,e.maxCombo=Math.max(e.maxCombo,e.combo),e.missStreak=0,a?e.perfects+=1:e.goods+=1,nn(e,Bt),{type:a?`perfect`:`good`,lane:r.lane,kind:r.kind,direction:r.direction,points:s,milestone:Vt.includes(e.combo)?e.combo:0,warning:!1,noteTime:r.time}}function Zt(e,t){let n=[];for(let r=e.firstNote;r<e.notes.length;r++){let i=e.notes[r];if(i.time>t)break;if(e.judged.has(i.id))continue;let a=i.kind===`swipe`?Yt(e,i.time,i.direction):Jt(e,i.time,i.lane);a&&n.push(a)}return n}function Q(e){return Math.min(Rt,1+Math.floor(e.combo/zt))}function Qt(e){return Q(e)===Rt?1:e.combo%zt/zt}function $t(e){let t=e.perfects+e.goods,n=t+e.misses;return n===0?0:t/n}function en(e){let t=$t(e);return t>=.95?3:t>=.85?2:+(t>=.7)}function tn(e){let t=$t(e);return t>=.95?`S`:t>=.85?`A`:t>=.7?`B`:`C`}function nn(e,t){e.energy=Math.min(1,Math.max(0,e.energy+t)),e.energy===0&&e.difficulty.canFail&&(e.failed=!0)}var $=re(),rn={score:0,combo:0,multiplier:1,multiplierFill:0,energy:1,time:0,accuracyPercent:100,isInDanger:!1},an={KeyA:0,KeyS:1,KeyD:2,Digit1:0,Digit2:1,Digit3:2},on=new Set,sn=[null,null,null],cn=.15,ln=.3,un=35,dn=2,fn=31,pn={10:`РАЗОГРЕВ`,25:`ОТЛИЧНО!`,50:`НЕУДЕРЖИМО!`,75:`В ПОТОКЕ!`,100:`ЛЕГЕНДА!`,150:`БЕЗ ЕДИНОЙ ОШИБКИ?`,200:`ВЫ МАШИНА!`,300:`ЗА ГРАНЬЮ!`,500:`АБСОЛЮТ!`};function mn(e){try{return Number(localStorage.getItem(e))||0}catch{return 0}}function hn(e,t){try{localStorage.setItem(e,String(t))}catch{}}function gn(e){return e.type===`miss`?`мимо`:e.type===`holdBroken`?`луч оборван`:`${e.kind===`star`?`★ `:``}+${e.points}`}function _n(e){return e.failed?`Энергия закончилась`:e.misses===0?`Без единого промаха!`:e.rank===`S`||e.rank===`A`?`Отличная партия`:`Трек пройден`}function vn(){let e=(0,A.useRef)(null),t=(0,A.useRef)(null),n=(0,A.useRef)(null),r=(0,A.useRef)(null),a=(0,A.useRef)(null),c=(0,A.useRef)([!1,!1,!1]),l=(0,A.useRef)(1),u=(0,A.useRef)(null),d=(0,A.useRef)(1),f=(0,A.useRef)(new Map),p=(0,A.useRef)([]),_=(0,A.useRef)(new Set),v=(0,A.useRef)(()=>{}),[y,b]=(0,A.useState)(`menu`),[x,S]=(0,A.useState)(null),[C,w]=(0,A.useState)(``),[ee,te]=(0,A.useState)(``),[T,re]=(0,A.useState)(``),[E,D]=(0,A.useState)(``),[O,ie]=(0,A.useState)(rn),[k,oe]=(0,A.useState)(null),[ce,j]=(0,A.useState)([]),[M,le]=(0,A.useState)(null),[N,P]=(0,A.useState)({difficulty:`normal`,approachSec:1.6,volume:.8,effectsVolume:.5,colorDrift:!0,offsetMs:0,look:`outline`,clipBrightness:.55,clipFocus:.85,laneContrast:.75,autopilot:!1}),F=(0,A.useRef)({screen:y,analysis:x,settings:N});(0,A.useEffect)(()=>{F.current={screen:y,analysis:x,settings:N}});let I=()=>(r.current||(r.current=new o(new AudioContext),u.current=new Ot(r.current.context)),r.current),L=`triada-best:${C}:${N.difficulty}`,R=()=>{let e=a.current;if(!e)return;r.current?.pause(),t.current?.pause();let n=mn(L),i=e.score>n;i&&hn(L,e.score),le({failed:e.failed,rank:tn(e),stars:en(e),score:e.score,bestScore:Math.max(n,e.score),isNewBest:i,accuracyPercent:Math.round($t(e)*100),maxCombo:e.maxCombo,perfects:e.perfects,goods:e.goods,misses:e.misses}),b(`results`)},z=(0,A.useRef)(R);(0,A.useEffect)(()=>{z.current=R}),(0,A.useEffect)(()=>{let i=e.current;if(!i)return;let o=new Te(i);n.current=o;let f=s(),m=0,h=0,g=()=>{let e=Math.min(window.devicePixelRatio||1,2);i.width=i.clientWidth*e,i.height=i.clientHeight*e,o.setSize(i.width,i.height)},y=new ResizeObserver(g);y.observe(i),g();let b=(e,t,n)=>{l.current+=1,oe({id:l.current,text:e,detail:t,isWarning:n})},x=e=>{if(!e)return;let t=performance.now()/1e3,n=u.current;e.type===`miss`||e.type===`holdBroken`?(o.missEffect(e.lane),n?.miss()):(o.hitEffect(e.lane,e.type===`perfect`||e.type===`holdDone`,t),e.type===`holdDone`&&n?.holdDone(),e.kind===`swipe`&&(o.launchArrow(e.lane,e.direction,t),n?.arrow(e.direction)),e.kind===`star`&&(o.hitEffect(e.lane,!0,t),n?.star())),e.milestone&&(b(pn[e.milestone],`${e.milestone} подряд`,!1),n?.milestone()),e.warning&&(b(`СОБЕРИТЕСЬ!`,`3 промаха подряд`,!0),n?.warning());let r=a.current;if(r){let e=Q(r);e>d.current&&n?.multiplierUp(e),d.current=e}l.current+=1;let i={id:l.current,lane:e.lane,type:e.type,text:gn(e)};j(e=>[...e,i].slice(-6))};v.current=x;let S=(e,t)=>{let n=0,r=0;for(let i of p.current){let a=e>=i.start&&e<i.end;i.kind===`buildup`&&a&&(n=(e-i.start)/(i.end-i.start)),i.kind===`pause`&&a&&(r=1),i.kind===`impact`&&e>=i.start&&!_.current.has(i)&&(_.current.add(i),o.impactEffect(t),u.current?.impact())}o.setMood(n,r)},C=e=>{let n=t.current;n&&n.src&&(n.paused&&n.play().catch(()=>{}),Math.abs(n.currentTime-e)>cn&&(n.currentTime=e))},w=()=>{let e=performance.now()/1e3,{screen:n,analysis:i,settings:s}=F.current,l=a.current,d=r.current,p=n===`playing`&&l!==null&&d!==null&&i!==null,g=e*.3;if(p){g=d.currentTime+s.offsetMs/1e3,C(d.currentTime),s.autopilot&&Zt(l,g).forEach(x),Ut(l,g).forEach(x),ne(i,g,f),u.current?.setVolume(s.effectsVolume);let t=Math.min(1,g/i.duration);o.setHueShift(s.colorDrift?t*dn:0),S(g,e);let n=performance.now();if(n-h>80){h=n;let e=l.perfects+l.goods+l.misses>0;ie({score:l.score,combo:l.combo,multiplier:Q(l),multiplierFill:Qt(l),energy:l.energy,time:g,accuracyPercent:e?Math.round($t(l)*100):100,isInDanger:l.energy<ln||l.missStreak>=3})}(l.failed||!d.isPlaying)&&z.current()}else n===`menu`&&(f.time=g,f.energy=g*.3,f.bass=.3+.15*Math.sin(e*1.5),f.beatPulse=0,o.setHueShift(0));p||o.setMood(0,0),o.setClipOptions(s.look,s.clipBrightness,s.laneContrast,s.clipFocus);let _=n===`menu`;o.render(f,t.current,l&&!_?l.notes:[],l?l.firstNote:0,l?l.judged:on,c.current,s.approachSec,e,l?Q(l):1,!_,l&&!_?l.holds.map(e=>e?e.note:null):sn),m=requestAnimationFrame(w)};return m=requestAnimationFrame(w),()=>{cancelAnimationFrame(m),y.disconnect(),o.dispose(),n.current=null}},[]);let B=()=>{let e=r.current;y===`playing`?(e?.pause(),t.current?.pause(),b(`paused`)):y===`paused`&&(e?.play(),b(`playing`))},V=(0,A.useRef)(B);(0,A.useEffect)(()=>{V.current=B});let H=()=>{let e=r.current,{screen:t,settings:n}=F.current;return!e||!a.current||t!==`playing`?null:e.currentTime+n.offsetMs/1e3},U=(0,A.useRef)({lane(e){let t=H(),r=a.current;n.current?.pressEffect(e),t!==null&&r&&v.current(Jt(r,t,e))},swipe(e){let t=H(),n=a.current;t!==null&&n&&v.current(Yt(n,t,e))},release(e){let t=H(),n=a.current;t!==null&&n&&v.current(qt(n,t,e))}});(0,A.useEffect)(()=>{let e=e=>{if(e.code===`Escape`&&V.current(),F.current.screen!==`playing`||e.repeat)return;let t=an[e.code];t!==void 0&&(c.current[t]=!0,U.current.lane(t)),e.code===`ArrowLeft`&&U.current.swipe(-1),e.code===`ArrowRight`&&U.current.swipe(1)},t=e=>{let t=an[e.code];t!==void 0&&(c.current[t]=!1,U.current.release(t))},n=()=>{document.hidden&&F.current.screen===`playing`&&V.current()};return window.addEventListener(`keydown`,e),window.addEventListener(`keyup`,t),document.addEventListener(`visibilitychange`,n),()=>{window.removeEventListener(`keydown`,e),window.removeEventListener(`keyup`,t),document.removeEventListener(`visibilitychange`,n)}},[]);let ue=t=>{let r=e.current,i=n.current;if(!r||!i||y!==`playing`)return;let a=r.getBoundingClientRect(),o=(t.clientX-(a.left+a.width/2))/(a.height/2),s=i.laneAt(o);f.current.set(t.pointerId,{lane:s,startX:t.clientX,hasSwiped:!1}),c.current[s]=!0,U.current.lane(s)},de=e=>{let t=f.current.get(e.pointerId);if(!t||t.hasSwiped)return;let n=e.clientX-t.startX;Math.abs(n)<un||(t.hasSwiped=!0,U.current.swipe(Math.sign(n)))},fe=e=>{let t=f.current.get(e.pointerId);if(!t)return;f.current.delete(e.pointerId);let n=!1;for(let e of f.current.values())e.lane===t.lane&&(n=!0);n||(c.current[t.lane]=!1,U.current.release(t.lane))},W=e=>{T&&URL.revokeObjectURL(T),re(URL.createObjectURL(e)),te(e.name)};(0,A.useEffect)(()=>{let e=t.current;if(!e||!T)return;let r=()=>n.current?.setVideo(e);return e.addEventListener(`loadeddata`,r),()=>e.removeEventListener(`loadeddata`,r)},[T]);let pe=async(e,t)=>{I().load(e),S(null),w(t),D(`Строим уровень…`);let n=await h(i(e),e.sampleRate,e=>D(`Строим уровень… ${Math.round(e*100)}%`));p.current=qe(n),S(n),D(``)},G=async e=>{D(`Читаем файл…`);try{await pe(await g(e,I().context),e.name),e.type.startsWith(`video/`)&&W(e)}catch(e){console.error(e),D(`Не удалось прочитать звук из файла. Попробуйте mp3, wav, ogg или mp4.`)}},K=()=>{let e=r.current;if(!x||!e)return;let n=gt(N.difficulty);a.current=Ht(_t(x,n),n),d.current=1,_.current=new Set,ie(rn),oe(null),j([]),e.setVolume(N.volume),e.seek(0),t.current&&T&&(t.current.currentTime=0),e.play(),b(`playing`)},q=e=>P({...N,...e}),J=x?.duration??0,me=J>0?Math.min(1,O.time/J):0;return(0,$.jsxs)(`div`,{className:`game`,onPointerDown:ue,onPointerMove:de,onPointerUp:fe,onPointerCancel:fe,children:[(0,$.jsx)(`canvas`,{className:`game-canvas`,ref:e}),(0,$.jsx)(`video`,{ref:t,src:T||void 0,muted:!0,playsInline:!0,preload:`auto`,hidden:!0}),(y===`playing`||y===`paused`)&&(0,$.jsxs)(`div`,{className:`hud tier-${O.multiplier} ${O.isInDanger?`is-danger`:``}`,children:[(0,$.jsxs)(`div`,{className:`score-bar`,children:[(0,$.jsx)(`strong`,{className:`score-value`,children:O.score.toLocaleString(`ru-RU`)}),(0,$.jsx)(`div`,{className:`track-progress`,children:(0,$.jsx)(`div`,{style:{width:`${me*100}%`}})}),(0,$.jsxs)(`span`,{className:`score-time`,children:[ae(O.time),` / `,ae(J)]})]}),(0,$.jsxs)(`div`,{className:`side-pill side-left`,children:[(0,$.jsxs)(`strong`,{className:`pill-main`,children:[`×`,O.multiplier]},`multiplier-${O.multiplier}`),(0,$.jsxs)(`span`,{className:`pill-note`,children:[O.combo,` подряд`]},`combo-${O.combo}`),(0,$.jsx)(`div`,{className:`multiplier-bar`,children:(0,$.jsx)(`div`,{style:{width:`${O.multiplierFill*100}%`}})})]}),(0,$.jsxs)(`div`,{className:`side-pill side-right`,children:[(0,$.jsxs)(`strong`,{className:`pill-main`,children:[O.accuracyPercent,`%`]}),(0,$.jsx)(`span`,{className:`pill-note`,children:`энергия`}),(0,$.jsx)(`div`,{className:`multiplier-bar energy-bar`,children:(0,$.jsx)(`div`,{style:{width:`${O.energy*100}%`}})})]}),k&&(0,$.jsxs)(`div`,{className:`banner ${k.isWarning?`is-warning`:``}`,children:[(0,$.jsx)(`strong`,{children:k.text}),(0,$.jsx)(`span`,{children:k.detail})]},k.id),ce.map(e=>(0,$.jsx)(`span`,{className:`score-popup is-${e.type}`,style:{left:`calc(50% + ${(e.lane-1)*fn}vh)`},onAnimationEnd:()=>j(t=>t.filter(t=>t.id!==e.id)),children:e.text},e.id)),(0,$.jsx)(`div`,{className:`hud-hint`,children:`A S D или нажатие на дорожку · ← → или смахивание — стрелки · Esc — пауза`})]}),y===`menu`&&(0,$.jsxs)(`main`,{className:`menu`,children:[(0,$.jsxs)(`header`,{children:[(0,$.jsx)(`h1`,{children:`ТРИАДА`}),(0,$.jsx)(`p`,{children:`Три дорожки, ваша музыка и ваш клип, переработанный на весь экран.`})]}),(0,$.jsxs)(`section`,{className:`menu-card`,children:[(0,$.jsx)(`h2`,{children:`Трек и клип`}),(0,$.jsxs)(`label`,{className:`file-button`,children:[(0,$.jsx)(`input`,{type:`file`,accept:`audio/*,video/*,.mp3,.wav,.ogg,.mp4,.webm`,"data-testid":`track-input`,onChange:e=>{let t=e.target.files?.[0];t&&G(t),e.target.value=``}}),`Загрузить песню или клип целиком`]}),(0,$.jsxs)(`label`,{className:`file-button is-secondary`,children:[(0,$.jsx)(`input`,{type:`file`,accept:`video/*,.mp4,.webm`,"data-testid":`clip-input`,onChange:e=>{let t=e.target.files?.[0];t&&W(t),e.target.value=``}}),`Добавить отдельный видеофон`]}),(0,$.jsx)(`button`,{className:`text-button`,onClick:()=>void pe(m(I().context),`Демо-трек`),children:`Или взять демо-трек`}),(0,$.jsxs)(`p`,{className:`track-name`,"data-testid":`track-status`,children:[E||C||`Файлы остаются у вас: на сервер ничего не загружается.`,ee&&!E?` · клип: ${ee}`:``]})]}),(0,$.jsxs)(`section`,{className:`menu-card`,children:[(0,$.jsx)(`h2`,{children:`Настройки`}),(0,$.jsx)(`div`,{className:`segmented`,children:ot.map(e=>(0,$.jsx)(`button`,{className:e.id===N.difficulty?`is-active`:``,onClick:()=>q({difficulty:e.id}),children:e.label},e.id))}),(0,$.jsx)(`div`,{className:`segmented look-list`,children:se.map(e=>(0,$.jsx)(`button`,{className:e.id===N.look?`is-active`:``,onClick:()=>q({look:e.id}),children:e.label},e.id))}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Яркость клипа `,(0,$.jsxs)(`output`,{children:[Math.round(N.clipBrightness*100),`%`]})]}),(0,$.jsx)(`input`,{type:`range`,min:.2,max:1,step:.05,value:N.clipBrightness,onChange:e=>q({clipBrightness:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Приглушить клип за дорожками `,(0,$.jsxs)(`output`,{children:[Math.round(N.clipFocus*100),`%`]})]}),(0,$.jsx)(`input`,{type:`range`,min:0,max:1,step:.05,value:N.clipFocus,onChange:e=>q({clipFocus:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Контраст дорожек `,(0,$.jsxs)(`output`,{children:[Math.round(N.laneContrast*100),`%`]})]}),(0,$.jsx)(`input`,{type:`range`,min:0,max:1,step:.05,value:N.laneContrast,onChange:e=>q({laneContrast:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Скорость нот `,(0,$.jsxs)(`output`,{children:[N.approachSec.toFixed(1),` с`]})]}),(0,$.jsx)(`input`,{type:`range`,min:.8,max:2.6,step:.1,value:N.approachSec,onChange:e=>q({approachSec:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Громкость `,(0,$.jsxs)(`output`,{children:[Math.round(N.volume*100),`%`]})]}),(0,$.jsx)(`input`,{type:`range`,min:0,max:1,step:.05,value:N.volume,onChange:e=>q({volume:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Звуковые эффекты `,(0,$.jsxs)(`output`,{children:[Math.round(N.effectsVolume*100),`%`]})]}),(0,$.jsx)(`input`,{type:`range`,min:0,max:1,step:.05,value:N.effectsVolume,onChange:e=>q({effectsVolume:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`slider`,children:[(0,$.jsxs)(`span`,{children:[`Поправка на задержку `,(0,$.jsxs)(`output`,{children:[N.offsetMs,` мс`]})]}),(0,$.jsx)(`input`,{type:`range`,min:-200,max:200,step:10,value:N.offsetMs,onChange:e=>q({offsetMs:Number(e.target.value)})})]}),(0,$.jsxs)(`label`,{className:`toggle`,children:[(0,$.jsx)(`input`,{type:`checkbox`,"data-testid":`color-drift`,checked:N.colorDrift,onChange:e=>q({colorDrift:e.target.checked})}),`Цвет клипа меняется по ходу песни`]}),(0,$.jsxs)(`label`,{className:`toggle`,children:[(0,$.jsx)(`input`,{type:`checkbox`,"data-testid":`autopilot`,checked:N.autopilot,onChange:e=>q({autopilot:e.target.checked})}),`Автопилот`]})]}),(0,$.jsx)(`button`,{className:`start-button`,disabled:!x,onClick:K,children:`Старт`}),(0,$.jsxs)(`ul`,{className:`legend`,children:[(0,$.jsx)(`li`,{children:`Круг: клавиша A, S, D или нажатие на дорожку`}),(0,$.jsx)(`li`,{children:`Жёлтая стрелка: ← или → либо смахивание в ту же сторону`}),(0,$.jsx)(`li`,{children:`Золотая звезда: как круг, очки ×2`}),(0,$.jsx)(`li`,{children:`Круг с лучом: зажмите и держите до конца`}),(0,$.jsx)(`li`,{children:`Белая пара: две клавиши сразу на взрыве песни`})]})]}),y===`paused`&&(0,$.jsxs)(`div`,{className:`overlay`,children:[(0,$.jsx)(`h2`,{children:`Пауза`}),(0,$.jsx)(`button`,{className:`start-button`,onClick:B,children:`Продолжить`}),(0,$.jsx)(`button`,{className:`text-button`,onClick:K,children:`Начать заново`}),(0,$.jsx)(`button`,{className:`text-button`,onClick:()=>b(`menu`),children:`В меню`})]}),y===`results`&&M&&(0,$.jsxs)(`div`,{className:`overlay`,"data-testid":`results`,children:[(0,$.jsx)(`h2`,{children:_n(M)}),(0,$.jsxs)(`div`,{className:`stars`,"aria-label":`Звёзд: ${M.stars} из 3`,children:[(0,$.jsx)(`span`,{className:M.stars>=1?`is-earned`:``,children:`★`}),(0,$.jsx)(`span`,{className:M.stars>=2?`is-earned`:``,children:`★`}),(0,$.jsx)(`span`,{className:M.stars>=3?`is-earned`:``,children:`★`})]}),M.isNewBest&&(0,$.jsx)(`div`,{className:`new-best`,children:`Новый рекорд!`}),(0,$.jsxs)(`dl`,{className:`stats`,children:[(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Очки`}),(0,$.jsx)(`dd`,{children:M.score.toLocaleString(`ru-RU`)})]}),(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Рекорд`}),(0,$.jsx)(`dd`,{children:M.bestScore.toLocaleString(`ru-RU`)})]}),(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Точность`}),(0,$.jsxs)(`dd`,{children:[M.accuracyPercent,`%`]})]}),(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Лучшее комбо`}),(0,$.jsx)(`dd`,{children:M.maxCombo})]}),(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Точно / хорошо`}),(0,$.jsxs)(`dd`,{children:[M.perfects,` / `,M.goods]})]}),(0,$.jsxs)(`div`,{children:[(0,$.jsx)(`dt`,{children:`Промахи`}),(0,$.jsx)(`dd`,{children:M.misses})]})]}),(0,$.jsx)(`button`,{className:`start-button`,onClick:K,children:`Ещё раз`}),(0,$.jsx)(`button`,{className:`text-button`,onClick:()=>b(`menu`),children:`В меню`})]})]})}(0,oe.createRoot)(document.getElementById(`root`)).render((0,$.jsx)(A.StrictMode,{children:(0,$.jsx)(vn,{})}));
import * as THREE from 'three'
import type { FrameFeatures } from '../audio/frameFeatures.ts'
import { FULLSCREEN_VERTEX, NOISE_GLSL } from '../render/glsl.ts'
import type { LaneNote } from './level.ts'

/**
 * Графика игры: клип на весь экран, поверх него веер из трёх дорожек,
 * ноты и эффекты попаданий. Логики здесь нет, сцена только рисует.
 *
 * Дорожки идут тугим пучком сверху и плавным изгибом расходятся к низу экрана.
 * Положение на дорожке задаёт число «близость»: 0 — верх пучка,
 * 1 — линия нажатия. Формула близость = 1 / (1 + расстояние) даёт ощущение
 * глубины: вдали нота ползёт медленно, а у кнопки резко ускоряется и растёт.
 */

export type ClipLook = 'outline' | 'duotone' | 'comic' | 'original'

export const CLIP_LOOKS: { id: ClipLook; label: string }[] = [
  { id: 'outline', label: 'Неоновый контур' },
  { id: 'duotone', label: 'Зелёный дуотон' },
  { id: 'comic', label: 'Комикс' },
  { id: 'original', label: 'Оригинал' },
]

const LOOK_NUMBERS: Record<ClipLook, number> = { outline: 0, duotone: 1, comic: 2, original: 3 }
/**
 * Дорожки и кольца одного спокойного цвета: это рамка, а не сигнал.
 * Яркими остаются только ноты, поэтому взгляд сразу находит, что нажимать.
 */
const TRACK_COLOR = '#2fd8cf'
const LANE_COLORS = [TRACK_COLOR, TRACK_COLOR, TRACK_COLOR]
const TAP_COLOR = '#b84dff'
const SPECIAL_COLOR = '#ffc933'
const LANE_KEYS = ['A', 'S', 'D']
/** Цвет дорожек на множителях ×1…×4: игра явно меняется, пока серия растёт. */
const TIER_COLORS = ['#3dff9e', '#2ef2d0', '#9dffc4', '#d9fff0']

/** Точка схода дорожек и линия нажатия, по вертикали экрана (-1 низ, 1 верх). */
const VANISH_Y = 0.94
const HIT_Y = -0.68
/** Расстояние между центрами дорожек на линии нажатия. */
const LANE_SPREAD = 0.62
/** Расстояние между дорожками в пучке наверху. */
const LANE_BUNDLE = 0.05
/** Степень изгиба: чем больше, тем дольше дорожки идут вместе. */
const LANE_BEND = 1.9
const MAX_BEAMS = 6
/** Во сколько раз нота вдали меньше, чем у линии нажатия. */
const DEPTH = 7
const NOTE_SIZE = 0.42
/**
 * Все ноты, цели и волны лежат в одной плоскости дорожки, поэтому наклон у них
 * общий и не зависит от дорожки. Круг в такой плоскости выглядит эллипсом.
 */
const NOTE_TILT = 0.6
const PLANE_SQUASH = Math.sin(NOTE_TILT)
/** Стрелка лежит внутри круга и занимает меньше его ширины. */
const ARROW_IN_COIN = 0.62
const COIN_WITH_ARROW_COLOR = '#ffffff'
const ARROW_ON_COIN_COLOR = '#0d4a48'
const FLYING_ARROW_COLOR = '#ffffff'
const MAX_FLYING_ARROWS = 6
const ARROW_FLIGHT_SEC = 0.5
const MAX_NOTES = 48
const MAX_SPACE_BARS = 4
/** Длинная нота шире всех трёх дорожек, в долях расстояния между ними. */
const SPACE_BAR_WIDTH = 2.7
const SPACE_BAR_DEPTH = 0.62
const SPACE_BURST_SEC = 0.75
const MAX_SPARKS = 160
const SPARK_LIFETIME_SEC = 0.45
const MAX_SHOCKWAVES = 8
const SHOCKWAVE_LIFETIME_SEC = 0.32

const clipFragment = /* glsl */ `
  ${NOISE_GLSL}
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
`

const fanFragment = /* glsl */ `
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
`

/**
 * Объёмные ноты. Свет считается по нормалям поверхности: верх фишки светлый,
 * бок темнее, край подсвечен. Шейдер один для инстансов и для улетающих стрелок,
 * поэтому у обычного объекта цвет берётся из uniform-а.
 */
const noteVertex = /* glsl */ `
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
`

const noteFragment = /* glsl */ `
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
`

function createNoteMaterial(color: string, useDepth = true, shimmer = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: colorVector(color) },
      uOpacity: { value: 1 },
      uShimmer: { value: shimmer ? 1 : 0 },
      uTime: { value: 0 },
    },
    vertexShader: noteVertex,
    fragmentShader: noteFragment,
    // Прозрачный список рисуется по renderOrder, поэтому ноты лягут поверх дорожек
    transparent: true,
    depthTest: useDepth,
    depthWrite: useDepth,
  })
}

/** Выдавливает плоскую фигуру в толщину и кладёт её лицом вверх, как круглую фишку. */
function extrudeFlat(shape: THREE.Shape, thickness: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    bevelSegments: 3,
  })
  geometry.translate(0, 0, -thickness / 2)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/**
 * Круг с лункой: профиль от центра к краю вращается вокруг оси. Центр ниже
 * края, поэтому нота выглядит вогнутой, как тарелка, а свет ложится по кромке.
 */
/**
 * Шестигранная платформа: низкое основание, скошенный борт и утопленная площадка.
 * Шесть граней вместо круга дают чёткие блики, а отдельные нормали на гранях
 * делают рёбра резкими, как у металлической детали.
 */
function createPlatformGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0, 0.05),
    new THREE.Vector2(0.14, 0.05),
    new THREE.Vector2(0.155, 0.085),
    new THREE.Vector2(0.19, 0.085),
    new THREE.Vector2(0.235, 0.035),
    new THREE.Vector2(0.235, -0.04),
    new THREE.Vector2(0, -0.04),
  ]
  const geometry = new THREE.LatheGeometry(profile.reverse(), 6).toNonIndexed()
  geometry.computeVertexNormals()
  // Поворот на 30 градусов ставит шестигранник острым углом вбок, а не вверх
  geometry.rotateY(Math.PI / 6)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

function createDishedCoinGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0, 0.015),
    new THREE.Vector2(0.14, 0.02),
    new THREE.Vector2(0.28, 0.05),
    new THREE.Vector2(0.38, 0.1),
    new THREE.Vector2(0.45, 0.125),
    new THREE.Vector2(0.495, 0.1),
    new THREE.Vector2(0.5, 0.05),
    new THREE.Vector2(0.5, -0.1),
    new THREE.Vector2(0, -0.1),
  ]
  return new THREE.LatheGeometry(profile.reverse(), 48)
}

/** Рисунок длинной ноты: почти белая плашка с надписью. */
function createSpaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(1, '#cfe9ff')
    ctx.fillStyle = gradient
    ctx.strokeStyle = '#6fb7ff'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 40)
    ctx.fill()
    ctx.stroke()
    ctx.font = '800 72px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#0d3a5c'
    ctx.fillText('SPACE', canvas.width / 2, canvas.height / 2 + 4)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

/** Нажатая плашка мягко тает: крупные плавные пятна, никаких мелких осколков. */
const spaceBurstVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const spaceBurstFragment = /* glsl */ `
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
`

/** Мягкое пятно света для ореола вокруг ноты. */
function createHaloTexture(): THREE.CanvasTexture {
  const size = 96
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,0.6)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

function createArrowGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(-0.46, -0.13)
  shape.lineTo(0.04, -0.13)
  shape.lineTo(0.04, -0.31)
  shape.lineTo(0.46, 0)
  shape.lineTo(0.04, 0.31)
  shape.lineTo(0.04, 0.13)
  shape.lineTo(-0.46, 0.13)
  shape.closePath()
  return extrudeFlat(shape, 0.14)
}

function createStarGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? 0.5 : 0.23
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return extrudeFlat(shape, 0.14)
}

/** Буква клавиши внутри круга-цели. */
function createKeyTexture(letter: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = '700 64px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(letter, 64, 68)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

/** Лучи передаются в шейдер как (дорожка, ближний край, дальний край); -1 — луча нет. */
function createEmptyBeams(): THREE.Vector3[] {
  const beams: THREE.Vector3[] = []
  for (let i = 0; i < MAX_BEAMS; i++) beams.push(new THREE.Vector3(-1, 0, 0))
  return beams
}

function colorVector(hex: string): THREE.Vector3 {
  const value = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255)
}

interface Target {
  group: THREE.Group
  /** Свечение в середине кнопки: вспыхивает на попадании. */
  light: THREE.MeshBasicMaterial
  /** Текущий масштаб: на нажатии падает и пружинит обратно к 1. */
  squash: number
  /** Сдвиг в сторону на промахе: круг вздрагивает. */
  jolt: number
}

interface Spark {
  x: number
  y: number
  speedX: number
  speedY: number
  bornAt: number
  color: THREE.Color
}

/** Стрелка, которую отбили: летит в свою сторону, вращаясь и исчезая. */
interface FlyingArrow {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  bornAt: number
  startX: number
  direction: number
}

interface Shockwave {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  bornAt: number
}

export class LaneScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly clipScene = new THREE.Scene()
  private readonly scene = new THREE.Scene()
  private readonly screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)
  private readonly sharedUniforms = {
    uViewAspect: { value: 1 },
    uTrackTime: { value: 0 },
    uBeat: { value: 0 },
    uTierColor: { value: colorVector(TIER_COLORS[0]) },
    uSpread: { value: LANE_SPREAD },
    uBundle: { value: LANE_BUNDLE },
    uBend: { value: LANE_BEND },
    uHitY: { value: HIT_Y },
    uTension: { value: 0 },
    uStillness: { value: 0 },
    uStreak: { value: 0 },
    uOverdrive: { value: 0 },
  }
  private readonly clipUniforms = {
    ...this.sharedUniforms,
    uVideo: { value: null as THREE.Texture | null },
    uHasVideo: { value: false },
    uLook: { value: 0 },
    uVideoAspect: { value: 1 },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uBass: { value: 0 },
    uEnergy: { value: 0 },
    uDim: { value: 0.55 },
    uHueShift: { value: 0 },
    uFocus: { value: 0.85 },
    uVanish: { value: new THREE.Vector2(0, VANISH_Y) },
  }
  private readonly fanUniforms = {
    ...this.sharedUniforms,
    uVanishY: { value: VANISH_Y },
    uContrast: { value: 0.75 },
    uLaneColors: { value: LANE_COLORS.map(colorVector) },
    uLaneGlow: { value: [0, 0, 0] },
    uLaneBad: { value: [0, 0, 0] },
    uBeams: { value: createEmptyBeams() },
    uBeamHeld: { value: new Array(MAX_BEAMS).fill(0) },
  }
  /** Текущий цвет дорожек и колец: плавно идёт к цвету новой части песни. */
  private readonly trackColor = colorVector(TRACK_COLOR)
  private readonly ringColors: THREE.Vector3[] = []
  private readonly tapNotes: THREE.InstancedMesh
  private readonly plainCoins: THREE.InstancedMesh
  private readonly noteHalos: THREE.InstancedMesh
  private readonly spaceBars: THREE.Mesh[] = []
  private readonly spaceBurst: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private spaceBurstAt = -Infinity
  private readonly swipeNotes: THREE.InstancedMesh
  private readonly starNotes: THREE.InstancedMesh
  private readonly noteShadows: THREE.InstancedMesh
  private readonly flyingArrows: FlyingArrow[] = []
  private readonly sparkMesh: THREE.InstancedMesh
  private readonly fanGroup = new THREE.Group()
  private readonly targets: Target[] = []
  private readonly sparks: Spark[] = []
  private readonly shockwaves: Shockwave[] = []
  private readonly helper = new THREE.Object3D()
  private readonly color = new THREE.Color()
  private videoTexture: THREE.VideoTexture | null = null
  private nextSpark = 0
  private nextShockwave = 0
  private nextArrow = 0
  private spread = LANE_SPREAD
  private lastRenderAt = 0

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    // Шейдеры сразу выдают цвета для экрана, перекодировать их не нужно
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    this.renderer.autoClear = false

    this.clipScene.add(this.createScreenQuad(clipFragment, this.clipUniforms, false))
    const fan = this.createScreenQuad(fanFragment, this.fanUniforms, true)
    this.fanGroup.add(fan)
    this.scene.add(this.fanGroup)

    for (let lane = 0; lane < 3; lane++) this.targets.push(this.createTarget(lane))

    // Круг — низкий цилиндр, поэтому у него виден и верх, и бок
    const coinGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 40)
    const arrowGeometry = createArrowGeometry()
    this.tapNotes = new THREE.InstancedMesh(
      createDishedCoinGeometry(),
      createNoteMaterial('#ffffff', true, true),
      MAX_NOTES,
    )
    this.plainCoins = new THREE.InstancedMesh(coinGeometry, createNoteMaterial('#ffffff'), MAX_NOTES)
    this.swipeNotes = new THREE.InstancedMesh(arrowGeometry, createNoteMaterial('#ffffff'), MAX_NOTES)
    this.starNotes = new THREE.InstancedMesh(createStarGeometry(), createNoteMaterial('#ffffff'), MAX_NOTES)

    // Тень под нотой: именно она создаёт ощущение, что нота лежит на дорожке
    this.noteShadows = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.5, 32),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.5, depthTest: false }),
      MAX_NOTES * 2,
    )
    this.noteShadows.frustumCulled = false
    this.noteShadows.renderOrder = 2.5
    this.noteShadows.count = 0
    this.scene.add(this.noteShadows)

    // Лёгкое свечение под нотой: складывается со светом сцены и не перекрывает её
    this.noteHalos = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: createHaloTexture(),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      MAX_NOTES,
    )
    this.noteHalos.frustumCulled = false
    this.noteHalos.renderOrder = 2.6
    this.noteHalos.count = 0
    for (let i = 0; i < MAX_NOTES; i++) this.noteHalos.setColorAt(i, this.color.set(TAP_COLOR))
    this.scene.add(this.noteHalos)

    for (const mesh of [this.tapNotes, this.plainCoins, this.swipeNotes, this.starNotes]) {
      mesh.frustumCulled = false
      mesh.renderOrder = 3
      // Без начального вызова setColorAt буфер цветов появится слишком поздно
      for (let i = 0; i < MAX_NOTES; i++) mesh.setColorAt(i, this.color.set('#ffffff'))
      this.scene.add(mesh)
    }

    const spaceMaterial = new THREE.MeshBasicMaterial({
      map: createSpaceTexture(),
      transparent: true,
      depthTest: false,
      side: THREE.DoubleSide,
    })
    const spaceGeometry = new THREE.PlaneGeometry(1, 1)
    this.spaceBurst = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: spaceMaterial.map }, uDissolve: { value: 0 } },
        vertexShader: spaceBurstVertex,
        fragmentShader: spaceBurstFragment,
        transparent: true,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    )
    this.spaceBurst.rotation.x = NOTE_TILT - Math.PI / 2
    this.spaceBurst.visible = false
    this.spaceBurst.frustumCulled = false
    this.spaceBurst.renderOrder = 6
    this.scene.add(this.spaceBurst)
    for (let i = 0; i < MAX_SPACE_BARS; i++) {
      const bar = new THREE.Mesh(spaceGeometry, spaceMaterial)
      // Лежит в плоскости дорожки, как и всё остальное
      bar.rotation.x = NOTE_TILT - Math.PI / 2
      bar.visible = false
      bar.frustumCulled = false
      bar.renderOrder = 2.9
      this.spaceBars.push(bar)
      this.scene.add(bar)
    }

    for (let i = 0; i < MAX_FLYING_ARROWS; i++) {
      const mesh = new THREE.Mesh(arrowGeometry, createNoteMaterial(FLYING_ARROW_COLOR))
      mesh.rotation.order = 'ZXY'
      mesh.visible = false
      mesh.frustumCulled = false
      mesh.renderOrder = 6
      this.flyingArrows.push({ mesh, bornAt: -Infinity, startX: 0, direction: 1 })
      this.scene.add(mesh)
    }

    this.sparkMesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.012, 8),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, blending: THREE.AdditiveBlending }),
      MAX_SPARKS,
    )
    this.sparkMesh.frustumCulled = false
    this.sparkMesh.renderOrder = 5
    this.sparkMesh.count = 0
    for (let i = 0; i < MAX_SPARKS; i++) {
      this.sparkMesh.setColorAt(i, this.color.set('#ffffff'))
      this.sparks.push({ x: 0, y: 0, speedX: 0, speedY: 0, bornAt: -Infinity, color: new THREE.Color() })
    }
    this.scene.add(this.sparkMesh)

    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.88, 1, 48),
        new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, side: THREE.DoubleSide }),
      )
      mesh.visible = false
      mesh.renderOrder = 4
      this.shockwaves.push({ mesh, bornAt: -Infinity })
      this.scene.add(mesh)
    }
  }

  private createScreenQuad(
    fragmentShader: string,
    uniforms: Record<string, THREE.IUniform>,
    transparent: boolean,
  ): THREE.Mesh {
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader,
        transparent,
        depthTest: false,
        depthWrite: false,
      }),
    )
    quad.frustumCulled = false
    return quad
  }

  /**
   * Кнопка внизу дорожки: объёмная шестигранная платформа, светящаяся середина и
   * буква клавиши. Вся группа наклонена так же, как ноты, поэтому лежит в той
   * же плоскости.
   */
  private createTarget(lane: number): Target {
    const group = new THREE.Group()
    group.position.y = HIT_Y
    group.rotation.x = NOTE_TILT - Math.PI / 2

    const light = new THREE.MeshBasicMaterial({
      color: LANE_COLORS[lane],
      transparent: true,
      opacity: 0.16,
      depthTest: false,
      depthWrite: false,
    })
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.15, 6, Math.PI / 6), light)
    glow.position.z = 0.06
    const ringMaterial = createNoteMaterial(LANE_COLORS[lane])
    this.ringColors.push(ringMaterial.uniforms.uColor.value)
    const ring = new THREE.Mesh(createPlatformGeometry(), ringMaterial)
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.15),
      new THREE.MeshBasicMaterial({ map: createKeyTexture(LANE_KEYS[lane]), transparent: true, depthTest: false }),
    )
    label.position.z = 0.07
    let order = 2
    for (const mesh of [ring, glow, label]) {
      mesh.renderOrder = order
      order += 0.1
      group.add(mesh)
    }
    this.scene.add(group)
    return { group, light, squash: 1, jolt: 0 }
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    const aspect = width / height
    this.camera.left = -aspect
    this.camera.right = aspect
    this.camera.updateProjectionMatrix()
    // В узком окне веер сужается, чтобы крайние дорожки не уходили за экран
    this.spread = Math.min(LANE_SPREAD, (aspect * 0.8) / 1.5)
    this.sharedUniforms.uSpread.value = this.spread
    this.sharedUniforms.uViewAspect.value = aspect
  }

  /** Подключает клип как текстуру. null убирает его и возвращает полёт сквозь космос. */
  setVideo(video: HTMLVideoElement | null): void {
    this.videoTexture?.dispose()
    this.videoTexture = null
    if (video) {
      this.videoTexture = new THREE.VideoTexture(video)
      this.videoTexture.colorSpace = THREE.NoColorSpace
    }
    this.clipUniforms.uVideo.value = this.videoTexture
    this.clipUniforms.uHasVideo.value = video !== null
  }

  /** Поворот оттенка всего фона в радианах: так клип меняет цвет по ходу песни. */
  setHueShift(angle: number): void {
    this.clipUniforms.uHueShift.value = angle
  }

  /** Настроение момента песни: tension на разгоне, stillness в паузе, оба 0..1. */
  setMood(tension: number, stillness: number): void {
    // Плавно, чтобы пауза не обрывала картинку рывком
    this.sharedUniforms.uTension.value += (tension - this.sharedUniforms.uTension.value) * 0.15
    this.sharedUniforms.uStillness.value += (stillness - this.sharedUniforms.uStillness.value) * 0.25
  }

  /** Плавно ведёт дорожки и кольца к цвету текущей части песни. */
  setTrackColor(hex: string): void {
    this.trackColor.lerp(colorVector(hex), 0.04)
    for (const color of this.fanUniforms.uLaneColors.value) color.copy(this.trackColor)
    for (const color of this.ringColors) color.copy(this.trackColor)
  }

  /** Сила серии 0..1 и суперрежим. Меняются плавно, чтобы награда разгоралась и гасла. */
  setStreak(streak: number, isOverdrive: boolean): void {
    this.sharedUniforms.uStreak.value += (streak - this.sharedUniforms.uStreak.value) * 0.06
    const overdrive = isOverdrive ? 1 : 0
    this.sharedUniforms.uOverdrive.value += (overdrive - this.sharedUniforms.uOverdrive.value) * 0.1
  }

  /** Пробел попал: плашка плавно растёт и тает, кнопки мягко подсвечиваются. */
  spaceHitEffect(clockTime: number): void {
    this.spaceBurstAt = clockTime
    this.spaceBurst.visible = true
    for (let lane = 0; lane < 3; lane++) {
      this.targets[lane].light.opacity = 1
      this.pressEffect(lane)
    }
  }

  /** Пробел нажат без ноты: кнопки слегка отзываются, чтобы нажатие было видно. */
  spacePressEffect(): void {
    for (let lane = 0; lane < 3; lane++) this.pressEffect(lane)
  }

  private updateSpaceBurst(clockTime: number): void {
    const age = (clockTime - this.spaceBurstAt) / SPACE_BURST_SEC
    if (age >= 1) {
      this.spaceBurst.visible = false
      return
    }
    // Спокойное плавное увеличение без рывка в начале
    const growth = 1 + 0.35 * (1 - Math.pow(1 - age, 2))
    this.spaceBurst.position.set(0, HIT_Y + 0.04 * age, 0)
    this.spaceBurst.scale.set(this.spread * SPACE_BAR_WIDTH * growth, this.spread * SPACE_BAR_DEPTH * growth, 1)
    this.spaceBurst.material.uniforms.uDissolve.value = age
  }

  /** Взрыв песни: волны сразу от всех кнопок. Клип при этом не вспыхивает. */
  impactEffect(clockTime: number): void {
    for (let lane = 0; lane < 3; lane++) {
      this.addShockwave(lane, LANE_COLORS[lane], clockTime)
      this.fanUniforms.uLaneGlow.value[lane] = 0.8
      this.targets[lane].squash = 1.2
    }
  }

  /** Стрелку отбили: она улетает в свою сторону от цели. */
  launchArrow(lane: number, direction: number, clockTime: number): void {
    const arrow = this.flyingArrows[this.nextArrow]
    this.nextArrow = (this.nextArrow + 1) % MAX_FLYING_ARROWS
    arrow.bornAt = clockTime
    arrow.startX = this.laneX(lane)
    arrow.direction = direction
    arrow.mesh.visible = true
  }

  setClipOptions(look: ClipLook, brightness: number, laneContrast: number, focus: number): void {
    this.clipUniforms.uFocus.value = focus
    this.clipUniforms.uLook.value = LOOK_NUMBERS[look]
    this.clipUniforms.uDim.value = brightness
    this.fanUniforms.uContrast.value = laneContrast
  }

  private laneX(lane: number): number {
    return (lane - 1) * this.spread
  }

  /** Расстояние между дорожками на этой глубине: та же формула, что в шейдере. */
  private spacingAt(closeness: number): number {
    return LANE_BUNDLE + (this.spread - LANE_BUNDLE) * Math.pow(closeness, LANE_BEND)
  }

  private closenessAt(remaining: number, approachSec: number): number {
    return 1 / (1 + (Math.max(remaining, -approachSec * 0.1) / approachSec) * (DEPTH - 1))
  }

  /** Какая дорожка под курсором. x в экранных единицах: 0 — центр, половина высоты — 1. */
  laneAt(x: number): number {
    if (x < -this.spread / 2) return 0
    return x > this.spread / 2 ? 2 : 1
  }

  /** Нажатие клавиши: круг сжимается, дорожка подсвечивается, даже если ноты нет. */
  pressEffect(lane: number): void {
    this.targets[lane].squash = 0.8
    this.fanUniforms.uLaneGlow.value[lane] = Math.max(this.fanUniforms.uLaneGlow.value[lane], 0.45)
  }

  /** Попадание: луч по дорожке, волна и искры. Точное попадание заметно сильнее. */
  hitEffect(lane: number, isPerfect: boolean, clockTime: number): void {
    this.fanUniforms.uLaneGlow.value[lane] = 1
    this.targets[lane].squash = isPerfect ? 1.22 : 1.12
    this.targets[lane].light.opacity = 1
    const color = isPerfect ? '#ffffff' : TAP_COLOR
    this.addShockwave(lane, color, clockTime)
    if (isPerfect) this.addShockwave(lane, TAP_COLOR, clockTime - 0.08)

    const count = isPerfect ? 14 : 8
    for (let i = 0; i < count; i++) {
      const spark = this.sparks[this.nextSpark]
      this.nextSpark = (this.nextSpark + 1) % MAX_SPARKS
      // Искры летят веером вверх: к дорожке, а не в сторону счёта
      const angle = Math.PI * (0.08 + 0.84 * Math.random())
      const speed = (isPerfect ? 1.5 : 1) * (0.5 + Math.random())
      spark.x = this.laneX(lane)
      spark.y = HIT_Y
      spark.speedX = Math.cos(angle) * speed
      spark.speedY = Math.sin(angle) * speed
      spark.bornAt = clockTime
      spark.color.set(i % 3 === 0 ? '#ffffff' : TAP_COLOR)
    }
  }

  /** Промах: дорожка вспыхивает красным только в своей полосе, круг вздрагивает. */
  missEffect(lane: number): void {
    this.fanUniforms.uLaneBad.value[lane] = 1
    this.targets[lane].jolt = 1
  }

  private addShockwave(lane: number, color: string, bornAt: number): void {
    const wave = this.shockwaves[this.nextShockwave]
    this.nextShockwave = (this.nextShockwave + 1) % MAX_SHOCKWAVES
    wave.bornAt = bornAt
    wave.mesh.position.set(this.laneX(lane), HIT_Y, 0)
    wave.mesh.material.color.set(color)
    wave.mesh.visible = true
  }

  render(
    features: FrameFeatures,
    video: HTMLVideoElement | null,
    notes: LaneNote[],
    firstNote: number,
    judged: Set<number>,
    pressedLanes: boolean[],
    approachSec: number,
    clockTime: number,
    multiplier: number,
    showLanes: boolean,
    holdingNotes: (LaneNote | null)[],
  ): void {
    const seconds = Math.min(clockTime - this.lastRenderAt, 0.1)
    this.lastRenderAt = clockTime

    this.sharedUniforms.uTrackTime.value = features.time
    this.sharedUniforms.uBeat.value = features.beatPulse
    this.sharedUniforms.uTierColor.value.copy(colorVector(TIER_COLORS[multiplier - 1]))
    this.clipUniforms.uBass.value = features.bass
    this.clipUniforms.uEnergy.value = features.energy
    if (video && video.videoWidth > 0) {
      this.clipUniforms.uVideoAspect.value = video.videoWidth / video.videoHeight
      this.clipUniforms.uTexel.value.set(1 / video.videoWidth, 1 / video.videoHeight)
    }

    this.updateLanes(pressedLanes, features.beatPulse, seconds, holdingNotes)
    this.updateNotes(features.time, notes, firstNote, judged, approachSec)
    this.updateBeams(features.time, notes, firstNote, judged, approachSec, holdingNotes)
    this.emitHoldSparks(holdingNotes, clockTime)
    this.updateFlyingArrows(clockTime)
    this.updateSpaceBurst(clockTime)
    this.updateSparks(clockTime)
    this.updateShockwaves(clockTime)

    this.renderer.clear()
    this.renderer.render(this.clipScene, this.screenCamera)
    if (showLanes) this.renderer.render(this.scene, this.camera)
  }

  private updateLanes(
    pressedLanes: boolean[],
    beat: number,
    seconds: number,
    holdingNotes: (LaneNote | null)[],
  ): void {
    // Плавное затухание, не зависящее от частоты кадров
    const fade = Math.exp(-seconds * 7)
    const spring = 1 - Math.exp(-seconds * 18)

    for (let lane = 0; lane < 3; lane++) {
      const isHolding = holdingNotes[lane] !== null
      const held = isHolding ? 0.8 : pressedLanes[lane] ? 0.35 : 0
      this.fanUniforms.uLaneGlow.value[lane] = Math.max(held, this.fanUniforms.uLaneGlow.value[lane] * fade)
      this.fanUniforms.uLaneBad.value[lane] *= fade

      const target = this.targets[lane]
      const restScale = pressedLanes[lane] ? 0.86 : 1 + 0.07 * beat // цели дышат в такт
      target.squash += (restScale - target.squash) * spring
      target.jolt *= fade
      target.group.position.x = this.laneX(lane) + Math.sin(target.jolt * 18) * 0.03 * target.jolt
      target.group.scale.setScalar(target.squash * (this.spread / LANE_SPREAD))
      target.light.opacity = Math.max(isHolding ? 0.85 : pressedLanes[lane] ? 0.5 : 0.16, target.light.opacity * fade)
    }
  }

  private updateNotes(
    time: number,
    notes: LaneNote[],
    firstNote: number,
    judged: Set<number>,
    approachSec: number,
  ): void {
    let tapCount = 0
    let plainCount = 0
    let haloCount = 0
    let spaceCount = 0
    let swipeCount = 0
    let starCount = 0
    let shadowCount = 0
    this.helper.rotation.order = 'ZXY'

    for (let i = firstNote; i < notes.length; i++) {
      const note = notes[i]
      const remaining = note.time - time
      if (remaining > approachSec) break
      if (judged.has(note.id)) continue

      const closeness = this.closenessAt(remaining, approachSec)
      const spacing = this.spacingAt(closeness)
      const x = (note.lane - 1) * spacing
      const y = VANISH_Y + (HIT_Y - VANISH_Y) * closeness
      // Размер зависит от расстояния между дорожками, поэтому в узком окне ноты меньше
      const size = NOTE_SIZE * (spacing / LANE_SPREAD)

      if (note.kind === 'space') {
        if (spaceCount < MAX_SPACE_BARS) {
          const bar = this.spaceBars[spaceCount]
          bar.position.set(0, y, 0)
          bar.scale.set(spacing * SPACE_BAR_WIDTH, spacing * SPACE_BAR_DEPTH, 1)
          bar.visible = true
          spaceCount += 1
        }
        continue
      }

      // Тень лежит на дорожке чуть ниже ноты и сплющена так же, как сама нота
      this.helper.position.set(x, y - size * 0.1, 0)
      this.helper.rotation.set(0, 0, 0)
      this.helper.scale.set(size * 1.08, size * 1.08 * PLANE_SQUASH, 1)
      this.helper.updateMatrix()
      this.noteShadows.setMatrixAt(shadowCount, this.helper.matrix)
      shadowCount += 1

      // Ореол только у круглых цветных нот: стрелка читается и без него
      if (note.kind !== 'swipe') {
        this.helper.position.set(x, y, 0)
        this.helper.rotation.set(0, 0, 0)
        this.helper.scale.set(size * 1.7, size * 1.7 * PLANE_SQUASH, 1)
        this.helper.updateMatrix()
        this.noteHalos.setMatrixAt(haloCount, this.helper.matrix)
        this.noteHalos.setColorAt(haloCount, this.color.set(note.kind === 'star' ? SPECIAL_COLOR : TAP_COLOR))
        haloCount += 1
      }

      const spin = note.kind === 'star' ? time * 3 : 0
      this.helper.position.set(x, y, 0)
      this.helper.rotation.set(NOTE_TILT, spin, 0)
      this.helper.scale.setScalar(size)
      this.helper.updateMatrix()

      if (note.kind === 'star') {
        this.starNotes.setMatrixAt(starCount, this.helper.matrix)
        this.starNotes.setColorAt(starCount, this.color.set(SPECIAL_COLOR))
        starCount += 1
      } else {
        if (note.kind === 'swipe') {
          this.plainCoins.setMatrixAt(plainCount, this.helper.matrix)
          this.plainCoins.setColorAt(plainCount, this.color.set(COIN_WITH_ARROW_COLOR))
          plainCount += 1
        } else {
          // Цвет такой ноты задаёт перелив в шейдере
          this.tapNotes.setMatrixAt(tapCount, this.helper.matrix)
          this.tapNotes.setColorAt(tapCount, this.color.set(TAP_COLOR))
          tapCount += 1
        }
      }

      if (note.kind === 'swipe') {
        // Стрелка приподнята над верхом круга, чтобы лежать на нём, а не внутри
        const lift = size * 0.13
        this.helper.position.set(x, y + lift * Math.cos(NOTE_TILT), lift * Math.sin(NOTE_TILT))
        this.helper.rotation.set(NOTE_TILT, note.direction < 0 ? Math.PI : 0, 0)
        this.helper.scale.setScalar(size * ARROW_IN_COIN)
        this.helper.updateMatrix()
        this.swipeNotes.setMatrixAt(swipeCount, this.helper.matrix)
        this.swipeNotes.setColorAt(swipeCount, this.color.set(ARROW_ON_COIN_COLOR))
        swipeCount += 1
      }
      if (shadowCount >= MAX_NOTES) break
    }

    for (let i = spaceCount; i < MAX_SPACE_BARS; i++) this.spaceBars[i].visible = false
    this.tapNotes.count = tapCount
    this.plainCoins.count = plainCount
    this.noteHalos.count = haloCount
    this.noteHalos.instanceMatrix.needsUpdate = true
    if (this.noteHalos.instanceColor) this.noteHalos.instanceColor.needsUpdate = true
    ;(this.tapNotes.material as THREE.ShaderMaterial).uniforms.uTime.value = time
    this.swipeNotes.count = swipeCount
    this.starNotes.count = starCount
    this.noteShadows.count = shadowCount
    this.noteShadows.instanceMatrix.needsUpdate = true
    for (const mesh of [this.tapNotes, this.plainCoins, this.swipeNotes, this.starNotes]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    this.helper.rotation.order = 'XYZ' // искры и волны ждут обычный порядок поворотов
  }

  /** Передаёт в шейдер дорожек лучи видимых нот с удержанием. */
  private updateBeams(
    time: number,
    notes: LaneNote[],
    firstNote: number,
    judged: Set<number>,
    approachSec: number,
    holdingNotes: (LaneNote | null)[],
  ): void {
    const beams = this.fanUniforms.uBeams.value
    const heldFlags = this.fanUniforms.uBeamHeld.value
    let count = 0

    for (const note of holdingNotes) {
      if (!note || count >= MAX_BEAMS) continue
      const end = note.time + (note.duration ?? 0)
      beams[count].set(note.lane, 1.05, this.closenessAt(end - time, approachSec))
      heldFlags[count] = 1
      count += 1
    }

    for (let i = firstNote; i < notes.length && count < MAX_BEAMS; i++) {
      const note = notes[i]
      const remaining = note.time - time
      if (remaining > approachSec) break
      if (note.kind !== 'hold' || judged.has(note.id)) continue
      const end = remaining + (note.duration ?? 0)
      beams[count].set(note.lane, this.closenessAt(remaining, approachSec), this.closenessAt(end, approachSec))
      heldFlags[count] = 0
      count += 1
    }

    for (let i = count; i < MAX_BEAMS; i++) beams[i].set(-1, 0, 0)
  }

  /** Пока луч зажат, из кнопки непрерывно бьют искры. */
  private emitHoldSparks(holdingNotes: (LaneNote | null)[], clockTime: number): void {
    for (const note of holdingNotes) {
      if (!note) continue
      const spark = this.sparks[this.nextSpark]
      this.nextSpark = (this.nextSpark + 1) % MAX_SPARKS
      const angle = Math.PI * (0.2 + 0.6 * Math.random())
      spark.x = this.laneX(note.lane)
      spark.y = HIT_Y
      spark.speedX = Math.cos(angle) * 0.7
      spark.speedY = Math.sin(angle) * 1.1
      spark.bornAt = clockTime
      spark.color.set(TAP_COLOR)
    }
  }

  private updateFlyingArrows(clockTime: number): void {
    for (const arrow of this.flyingArrows) {
      const age = (clockTime - arrow.bornAt) / ARROW_FLIGHT_SEC
      if (age >= 1) {
        arrow.mesh.visible = false
        continue
      }
      // Квадрат даёт разгон: стрелка срывается с места и уходит за край экрана
      const flight = age * age
      const heading = arrow.direction < 0 ? Math.PI : 0
      arrow.mesh.position.set(arrow.startX + arrow.direction * flight * 3.2, HIT_Y, 0.1)
      arrow.mesh.rotation.set(NOTE_TILT, heading, 0)
      arrow.mesh.scale.setScalar(NOTE_SIZE * ARROW_IN_COIN * (this.spread / LANE_SPREAD) * (1 + 0.9 * age))
      arrow.mesh.material.uniforms.uOpacity.value = 1 - age * age
    }
  }

  private updateSparks(clockTime: number): void {
    let count = 0
    for (const spark of this.sparks) {
      const age = clockTime - spark.bornAt
      if (age >= SPARK_LIFETIME_SEC) continue
      const life = 1 - age / SPARK_LIFETIME_SEC
      // Положение считается по возрасту, поэтому не зависит от частоты кадров
      this.helper.position.set(
        spark.x + spark.speedX * age,
        spark.y + spark.speedY * age - 0.8 * age * age,
        0,
      )
      this.helper.rotation.set(0, 0, 0)
      this.helper.scale.setScalar(0.5 + 1.2 * life)
      this.helper.updateMatrix()
      this.sparkMesh.setMatrixAt(count, this.helper.matrix)
      this.sparkMesh.setColorAt(count, this.color.copy(spark.color).multiplyScalar(life))
      count += 1
    }
    this.sparkMesh.count = count
    this.sparkMesh.instanceMatrix.needsUpdate = true
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true
  }

  private updateShockwaves(clockTime: number): void {
    for (const wave of this.shockwaves) {
      const age = (clockTime - wave.bornAt) / SHOCKWAVE_LIFETIME_SEC
      if (age >= 1 || age < 0) {
        wave.mesh.visible = age < 0
        wave.mesh.material.opacity = 0
        continue
      }
      const waveSize = (0.17 + 0.3 * age) * (this.spread / LANE_SPREAD)
      wave.mesh.scale.set(waveSize, waveSize * PLANE_SQUASH, 1)
      wave.mesh.material.opacity = 1 - age
    }
  }

  dispose(): void {
    this.videoTexture?.dispose()
    for (const root of [this.scene, this.clipScene]) {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const material = object.material
          if (material.uniforms === undefined && material.map) material.map.dispose()
          material.dispose()
        }
      })
    }
    this.renderer.dispose()
  }
}

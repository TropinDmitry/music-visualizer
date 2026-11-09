import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import type { SoundEffects } from "./sounds.ts";

const FIRST_STAR_MS = 550;
const STAR_STEP_MS = 480;
/** Салют за идеальную партию: частые крупные хлопки, первый сразу с третьей звездой. */
const BURST_STEP_MS = 230;
const BURST_COUNT = 8;
const SPARKS_PER_BURST = 30;
const BURST_HUES = [48, 186, 316, 268, 48, 140, 316, 186];

interface Burst {
  x: number;
  y: number;
  hue: number;
  sparks: { angle: number; distance: number }[];
}

/**
 * Звёзды итогов появляются по одной, каждая со своей нотой выше прошлой.
 * Если звёзд три, на третьей все три вспыхивают вместе и звенит аккорд.
 * За партию без промахов поверх хлопает громкий салют.
 */
export function ResultStars({
  stars,
  isFlawless,
  sounds,
  label,
}: {
  stars: number;
  isFlawless: boolean;
  /** Ссылка, а не сами эффекты: они создаются на первом касании и могут появиться позже. */
  sounds: RefObject<SoundEffects | null>;
  label: string;
}) {
  const [shown, setShown] = useState(0);
  const [burstCount, setBurstCount] = useState(0);
  const [bursts] = useState(createBursts);

  useEffect(() => {
    const timers: number[] = [];
    for (let index = 0; index < 3; index++) {
      timers.push(
        window.setTimeout(
          () => {
            setShown(index + 1);
            if (index < stars)
              sounds.current?.resultStar(index, stars === 3 && index === 2);
          },
          FIRST_STAR_MS + index * STAR_STEP_MS,
        ),
      );
    }
    if (isFlawless) {
      const fireworksAt = FIRST_STAR_MS + 2 * STAR_STEP_MS + 120;
      for (let index = 0; index < BURST_COUNT; index++) {
        timers.push(
          window.setTimeout(
            () => {
              setBurstCount(index + 1);
              sounds.current?.firework();
            },
            fireworksAt + index * BURST_STEP_MS,
          ),
        );
      }
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [stars, isFlawless, sounds]);

  return (
    <div className="result-stars">
      <div className="stars" aria-label={label}>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={[
              index < shown ? "is-shown" : "",
              index < shown && index < stars ? "is-earned" : "",
              // Три звезды из трёх: светятся все, когда легла последняя
              stars === 3 && shown === 3 ? "is-flawless" : "",
            ].join(" ")}
          >
            ★
          </span>
        ))}
      </div>
      <div className="fireworks">
        {bursts.slice(0, burstCount).map((burst, index) => (
          <div
            key={index}
            className="firework"
            style={
              {
                left: `${burst.x}%`,
                top: `${burst.y}%`,
                "--hue": burst.hue,
              } as CSSProperties
            }
          >
            {burst.sparks.map((spark, sparkIndex) => (
              <i
                key={sparkIndex}
                style={
                  {
                    "--angle": `${spark.angle}deg`,
                    "--distance": `${spark.distance}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function createBursts(): Burst[] {
  const bursts: Burst[] = [];
  for (let index = 0; index < BURST_COUNT; index++) {
    const sparks = [];
    for (let spark = 0; spark < SPARKS_PER_BURST; spark++) {
      sparks.push({
        angle: (spark / SPARKS_PER_BURST) * 360 + Math.random() * 10,
        distance: 110 + Math.random() * 110,
      });
    }
    // Хлопки по сторонам от звёзд, чтобы не закрывать их
    const side = index % 2 === 0 ? -1 : 1;
    bursts.push({
      x: 50 + side * (16 + Math.random() * 30),
      y: 5 + Math.random() * 60,
      hue: BURST_HUES[index],
      sparks,
    });
  }
  return bursts;
}

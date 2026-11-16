// @ts-check
// Mission data. The prototype has one mission, the range from chapter 0 of the 2D game.
// Positions are metres: x right, y up, z toward the shooter (downrange is -z).

/**
 * @typedef {{ lane: number, dist: number, x: number }} PaperTargetDef
 * @typedef {{ at: number, text: string }} RadioLine
 */

export const RANGE = {
  id: 'range',
  title: 'Cold Range',
  location: 'Varenne Rifle Club, 06:30',
  briefing:
    'The club opens at eight. Until then the range is yours. Ten paper targets from eighty to four hundred metres. Learn how far the bullet falls before you need to know it.',
  objectives: ['Knock down all ten paper targets', 'Do not shoot the range keeper'],
  /** Shooter's eye, seated at the bench. */
  eye: { x: 0, y: 1.25, z: 0 },
  /** Base crosswind in m/s (positive blows right) and how far gusts swing it. */
  wind: { base: 1, gust: 0.8 },
  /** @type {PaperTargetDef[]} */
  targets: [
    { lane: 1, dist: 80, x: -6 },
    { lane: 2, dist: 100, x: 10 },
    { lane: 3, dist: 120, x: -15 },
    { lane: 4, dist: 160, x: 4 },
    { lane: 5, dist: 200, x: 18 },
    { lane: 6, dist: 250, x: -21 },
    { lane: 7, dist: 300, x: 8 },
    { lane: 8, dist: 350, x: -10 },
    { lane: 9, dist: 375, x: 23 },
    { lane: 10, dist: 400, x: -1 }
  ],
  /** Distance boards on the left side of the range. */
  boards: [80, 100, 120, 160, 200, 250, 300, 350, 375, 400],
  boardX: -36,
  /** Teodor Pell walks between his hut and the 150 m line along the right side. */
  keeper: {
    name: 'Teodor Pell',
    hut: { x: 42, z: -58 },
    path: [
      { x: 38, z: -64 },
      { x: 33, z: -150 },
      { x: 33, z: -210 }
    ],
    speed: 1.2,
    pause: 6
  },
  /** @type {RadioLine[]} */
  radio: [
    { at: 1, text: 'Morning, Crane. The range is yours until the club opens.' },
    { at: 6, text: 'Ten paper men, from eighty to four hundred metres. The boards on the left tell you the range.' },
    { at: 13, text: 'Watch the drop grow. At a hundred it is nothing. At four hundred it is a full metre.' },
    { at: 21, text: 'The hash marks under the cross are one mil apart. At four hundred, put the target two and a half marks below the cross.' },
    { at: 30, text: 'Wind is light, one metre. The flags show it. It nudges you right at long range.' },
    { at: 39, text: "And don't shoot Teodor. He makes the only decent coffee in Port Varenne." }
  ]
};

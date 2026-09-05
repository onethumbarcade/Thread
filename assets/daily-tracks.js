// Stable daily rules shared by the menu, archive, and game.
(() => {
  const shapeNames = ["SQUARE", "CIRCLE", "DIAMOND", "TRIANGLE"];
  const rotations = [
    [0, 1, 2, 3],
    [1, 0, 3, 2],
    [3],
    [2, 3, 0, 1],
    [1],
    [3, 2, 1, 0],
    [2],
    [0],
  ];
  const plurals = ["squares", "circles", "diamonds", "triangles"];

  function getTrack(number) {
    const parsed = Number(number);
    const id = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
    const shapes = rotations[(id - 1) % rotations.length].slice();
    const fixed = shapes.length === 1;
    return {
      id,
      shapes,
      startingShape: shapes[0],
      startingShapeName: shapeNames[shapes[0]],
      musicIndex: (id - 1) % 7,
      description: fixed
        ? `All ${plurals[shapes[0]]}, every level. Same course for everyone.`
        : `${shapes.map(shape => shapeNames[shape].toLowerCase()).map(name => name[0].toUpperCase() + name.slice(1)).join(" → ")}. A new shape each level.`,
      archiveLabel: fixed ? `${shapeNames[shapes[0]]} ONLY` : `${shapeNames[shapes[0]]} START`,
    };
  }

  globalThis.ThreadDaily = { getTrack };
})();
